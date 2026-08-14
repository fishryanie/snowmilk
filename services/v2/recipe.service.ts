import "server-only";

import { createHash } from "node:crypto";
import { connectMongo } from "@/lib/mongodb";
import { sha256Canonical } from "@/lib/v2/canonical";
import type {
  CreateRecipeVersionInput,
  ReleaseRecipeVersionInput,
} from "@/lib/validators/v2/recipes";
import { AuditLog } from "@/models/v2/AuditLog";
import { Recipe } from "@/models/v2/Recipe";
import { RecipeVersion } from "@/models/v2/RecipeVersion";
import { Sku } from "@/models/v2/Sku";
import { id, type V2Context } from "@/services/v2/context";
import { DomainError, duplicateKey } from "@/services/v2/errors";
import {
  assertRecipeConfigurationReplay,
  recipeConfigurationRequestHash,
} from "@/services/v2/recipe-invariants";
import { decimalString } from "@/services/v2/serialize";

// Mongoose documents are structurally dynamic at this repository boundary.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Plain = Record<string, any>;

function serializeVersion(version: Plain) {
  return {
    id: String(version._id),
    version: Number(version.version),
    versionNumber: Number(version.versionNumber),
    status: String(version.status),
    shelfLifeHours:
      version.shelfLifeHours == null ? null : Number(version.shelfLifeHours),
    finishedSpec: (version.finishedSpec ?? []).map((line: Plain) => ({
      inventoryItemId: line.inventoryItemId ? String(line.inventoryItemId) : null,
      itemCode: String(line.itemCode),
      itemName: String(line.itemName),
      quantity: decimalString(line.quantity),
      unit: String(line.unit),
    })),
    components: (version.components ?? []).map((component: Plain) => ({
      inventoryItemId: String(component.inventoryItemId),
      itemCode: String(component.itemCode),
      itemName: String(component.itemName),
      inputQuantity:
        component.inputQuantity == null
          ? null
          : decimalString(component.inputQuantity),
      unit: String(component.unit),
      expectedYieldPercent:
        component.expectedYieldPercent == null
          ? null
          : decimalString(component.expectedYieldPercent),
    })),
    costDataQuality: String(version.costDataQuality),
    releasedAt: version.releasedAt ?? null,
  };
}

export async function listRecipes(context: V2Context, skuCode?: string) {
  await connectMongo();
  const skuFilter: Record<string, unknown> = {
    organizationId: context.organizationId,
    ...(skuCode ? { code: skuCode.trim().toUpperCase() } : {}),
  };
  const skus = (await Sku.find(skuFilter).lean()) as Plain[];
  const skuIds = skus.map((sku) => sku._id);
  const recipes = (await Recipe.find({
    organizationId: context.organizationId,
    skuId: { $in: skuIds },
    isActive: true,
  })
    .sort({ name: 1 })
    .lean()) as Plain[];
  const versions = (await RecipeVersion.find({
    organizationId: context.organizationId,
    recipeId: { $in: recipes.map((recipe) => recipe._id) },
    isActive: true,
  })
    .sort({ versionNumber: -1 })
    .lean()) as Plain[];
  const skuById = new Map(skus.map((sku) => [String(sku._id), sku]));
  return {
    recipes: recipes.map((recipe) => {
      const sku = skuById.get(String(recipe.skuId));
      const recipeVersions = versions.filter(
        (version) => String(version.recipeId) === String(recipe._id),
      );
      return {
        id: String(recipe._id),
        version: Number(recipe.version),
        code: String(recipe.code),
        name: String(recipe.name),
        sku: sku
          ? { id: String(sku._id), code: String(sku.code), name: String(sku.name) }
          : null,
        currentVersionId: recipe.currentVersionId
          ? String(recipe.currentVersionId)
          : null,
        versions: recipeVersions.map(serializeVersion),
      };
    }),
  };
}

function configuredContentHash(
  recipeId: unknown,
  base: Plain,
  input: CreateRecipeVersionInput,
) {
  return sha256Canonical({
    recipeId: String(recipeId),
    baseVersionId: String(base._id),
    finishedSpec: base.finishedSpec,
    components: input.components,
    shelfLifeHours: input.shelfLifeHours,
  });
}

export async function createConfiguredRecipeVersion(
  context: V2Context,
  recipeId: string,
  input: CreateRecipeVersionInput,
) {
  const recipeObjectId = id(recipeId, "recipeId");
  const canonicalRecipeId = String(recipeObjectId);
  const mongoose = await connectMongo();
  const session = await mongoose.startSession();
  let output: Plain | null = null;
  try {
    await session.withTransaction(async () => {
      const requestHash = recipeConfigurationRequestHash(canonicalRecipeId, input);
      const replay = (await RecipeVersion.findOne({
        organizationId: context.organizationId,
        configurationIdempotencyKey: input.idempotencyKey,
      })
        .session(session)
        .lean()) as Plain | null;
      if (replay) {
        assertRecipeConfigurationReplay(
          String(replay.configurationRequestHash ?? replay.contentHash),
          requestHash,
        );
        output = replay;
        return;
      }
      const recipe = (await Recipe.findOne({
        _id: recipeObjectId,
        organizationId: context.organizationId,
        isActive: true,
      }).session(session)) as Plain | null;
      if (!recipe) throw new DomainError("Không tìm thấy công thức.", 404, "NOT_FOUND");
      const base = (await RecipeVersion.findOne({
        _id: id(input.baseVersionId, "baseVersionId"),
        organizationId: context.organizationId,
        recipeId: recipe._id,
      }).session(session)) as Plain | null;
      if (!base) {
        throw new DomainError("Phiên bản gốc không thuộc công thức.", 422);
      }
      if (Number(base.version) !== input.baseVersion) {
        throw new DomainError(
          "Phiên bản công thức đã thay đổi. Hãy tải lại.",
          409,
          "VERSION_CONFLICT",
        );
      }
      const baseIds = new Set(
        (base.components as Plain[]).map((component) =>
          String(component.inventoryItemId),
        ),
      );
      const configuredById = new Map(
        input.components.map((component) => [component.inventoryItemId, component]),
      );
      if (
        configuredById.size !== baseIds.size ||
        [...configuredById.keys()].some((componentId) => !baseIds.has(componentId))
      ) {
        throw new DomainError(
          "Cần cấu hình đủ và đúng danh sách nguyên liệu của công thức.",
          422,
          "RECIPE_COMPONENT_MISMATCH",
        );
      }
      const contentHash = configuredContentHash(recipe._id, base, input);
      const repeated = await RecipeVersion.findOne({
        organizationId: context.organizationId,
        contentHash,
      })
        .session(session)
        .lean();
      if (repeated) {
        throw new DomainError(
          "Nội dung công thức này đã tồn tại ở một phiên bản khác.",
          409,
          "RECIPE_VERSION_ALREADY_EXISTS",
          { recipeVersionId: String(repeated._id) },
        );
      }
      const latest = (await RecipeVersion.findOne({
        organizationId: context.organizationId,
        recipeId: recipe._id,
      })
        .sort({ versionNumber: -1 })
        .session(session)
        .lean()) as Plain | null;
      const configuredComponents = (base.components as Plain[]).map(
        (component) => {
          const configured = configuredById.get(String(component.inventoryItemId))!;
          return {
            inventoryItemId: component.inventoryItemId,
            itemCode: component.itemCode,
            itemName: component.itemName,
            inputQuantity: configured.inputQuantity,
            unit: component.unit,
            expectedYieldPercent: configured.expectedYieldPercent,
            estimatedUnitCostVnd: component.estimatedUnitCostVnd ?? null,
            preparationNote: component.preparationNote,
          };
        },
      );
      const created = await RecipeVersion.create(
        [
          {
            organizationId: context.organizationId,
            recipeCode: recipe.code,
            recipeId: recipe._id,
            versionNumber: Number(latest?.versionNumber ?? 0) + 1,
            name: recipe.name,
            skuId: recipe.skuId,
            outputInventoryItemId: recipe.outputInventoryItemId,
            outputQuantity: base.outputQuantity,
            outputUnit: base.outputUnit,
            finishedSpec: base.finishedSpec,
            components: configuredComponents,
            shelfLifeHours: input.shelfLifeHours,
            status: "draft",
            releasedAt: null,
            contentHash,
            configurationIdempotencyKey: input.idempotencyKey,
            configurationRequestHash: requestHash,
            costDataQuality: "missing_cost",
            isActive: true,
            version: 1,
            actor: context.actor,
          },
        ],
        { session },
      );
      output = created[0].toObject();
    });
  } catch (error) {
    if (!duplicateKey(error)) throw error;
    const repeated = (await RecipeVersion.findOne({
      organizationId: context.organizationId,
      configurationIdempotencyKey: input.idempotencyKey,
    }).lean()) as Plain | null;
    if (repeated) {
      assertRecipeConfigurationReplay(
        String(repeated.configurationRequestHash ?? repeated.contentHash),
        recipeConfigurationRequestHash(canonicalRecipeId, input),
      );
      output = repeated;
    } else {
      const requestHash = createHash("sha256")
        .update(`${recipeId}:${input.idempotencyKey}`)
        .digest("hex");
      throw new DomainError(
        "Có người vừa tạo phiên bản công thức khác. Hãy tải lại.",
        409,
        "VERSION_CONFLICT",
        { requestHash: requestHash.slice(0, 12) },
      );
    }
  } finally {
    await session.endSession();
  }
  if (!output) throw new DomainError("Không thể tạo phiên bản công thức.", 503);
  return serializeVersion(output);
}

export async function releaseRecipeVersion(
  context: V2Context,
  rawVersionId: string,
  input: ReleaseRecipeVersionInput,
) {
  const versionId = id(rawVersionId, "recipeVersionId");
  const mongoose = await connectMongo();
  const session = await mongoose.startSession();
  let output: Plain | null = null;
  try {
    await session.withTransaction(async () => {
      const releaseReplay = (await RecipeVersion.findOne({
        organizationId: context.organizationId,
        releaseIdempotencyKey: input.idempotencyKey,
      })
        .session(session)
        .lean()) as Plain | null;
      if (releaseReplay) {
        if (String(releaseReplay._id) !== String(versionId)) {
          throw new DomainError(
            "Idempotency key phát hành đã được dùng cho phiên bản khác.",
            409,
            "IDEMPOTENCY_KEY_REUSED",
          );
        }
        output = releaseReplay;
        return;
      }
      const version = (await RecipeVersion.findOne({
        _id: versionId,
        organizationId: context.organizationId,
      }).session(session)) as Plain | null;
      if (!version) throw new DomainError("Không tìm thấy phiên bản.", 404, "NOT_FOUND");
      if (version.status === "released") {
        if (version.releaseIdempotencyKey !== input.idempotencyKey) {
          throw new DomainError("Phiên bản đã được phát hành.", 409, "ALREADY_RELEASED");
        }
        output = version.toObject();
        return;
      }
      if (version.status !== "draft" || Number(version.version) !== input.version) {
        throw new DomainError(
          "Phiên bản đã thay đổi hoặc không còn là bản nháp.",
          409,
          "VERSION_CONFLICT",
        );
      }
      if (!version.recipeId || !version.shelfLifeHours) {
        throw new DomainError(
          "Cần cấu hình đầy đủ định lượng, yield và hạn dùng trước khi phát hành.",
          422,
          "RECIPE_CONFIGURATION_INCOMPLETE",
        );
      }
      version.status = "released";
      version.releasedAt = new Date();
      version.releaseIdempotencyKey = input.idempotencyKey;
      version.version = Number(version.version) + 1;
      version.actor = context.actor;
      await version.save({ session });
      const linkedRecipeBefore = (await Recipe.findOne({
        _id: version.recipeId,
        organizationId: context.organizationId,
        skuId: version.skuId,
        isActive: true,
      })
        .session(session)
        .lean()) as Plain | null;
      if (!linkedRecipeBefore) {
        throw new DomainError(
          "Không thể phát hành vì recipe liên kết không còn hoạt động.",
          409,
          "RECIPE_LINK_CONFLICT",
        );
      }
      const retired = await RecipeVersion.updateMany(
        {
          organizationId: context.organizationId,
          recipeId: version.recipeId,
          _id: { $ne: version._id },
          status: "released",
        },
        {
          $set: { status: "retired", isActive: false, actor: context.actor },
          $inc: { version: 1 },
        },
        { session },
      );
      if (!retired.acknowledged) {
        throw new DomainError(
          "Không thể khóa phiên bản công thức cũ.",
          503,
          "RECIPE_RETIRE_FAILED",
        );
      }
      const [updatedRecipe, updatedSku] = await Promise.all([
        Recipe.findOneAndUpdate(
          {
            _id: version.recipeId,
            organizationId: context.organizationId,
            skuId: version.skuId,
            isActive: true,
          },
          {
            $set: { currentVersionId: version._id, actor: context.actor },
            $inc: { version: 1 },
          },
          { new: true, session },
        ),
        Sku.findOneAndUpdate(
          {
            _id: version.skuId,
            organizationId: context.organizationId,
            isActive: true,
          },
          {
            $set: { currentRecipeVersionId: version._id, actor: context.actor },
            $inc: { version: 1 },
          },
          { new: true, session },
        ),
      ]);
      if (!updatedRecipe || !updatedSku) {
        throw new DomainError(
          "Không thể phát hành vì recipe hoặc SKU liên kết không còn hoạt động.",
          409,
          "RECIPE_LINK_CONFLICT",
        );
      }
      await AuditLog.create(
        [
          {
            organizationId: context.organizationId,
            locationId: context.locationId,
            action: "release",
            resourceType: "recipe_version",
            resourceId: String(version._id),
            resourceVersion: Number(version.version),
            requestId: input.idempotencyKey,
            idempotencyKey: input.idempotencyKey,
            occurredAt: version.releasedAt,
            changes: [
              { path: "status", before: "draft", after: "released" },
              {
                path: "recipe.currentVersionId",
                before: linkedRecipeBefore.currentVersionId
                  ? String(linkedRecipeBefore.currentVersionId)
                  : null,
                after: String(version._id),
              },
            ],
            metadata: {
              recipeId: String(version.recipeId),
              skuId: String(version.skuId),
              retiredVersionCount: retired.modifiedCount,
            },
            actor: context.actor,
          },
        ],
        { session },
      );
      output = version.toObject();
    });
  } catch (error) {
    if (!duplicateKey(error)) throw error;
    const repeated = (await RecipeVersion.findOne({
      organizationId: context.organizationId,
      releaseIdempotencyKey: input.idempotencyKey,
    }).lean()) as Plain | null;
    if (!repeated || String(repeated._id) !== String(versionId)) {
      throw new DomainError(
        "Idempotency key phát hành đã được dùng cho phiên bản khác.",
        409,
        "IDEMPOTENCY_KEY_REUSED",
      );
    }
    output = repeated;
  } finally {
    await session.endSession();
  }
  if (!output) throw new DomainError("Không thể phát hành công thức.", 503);
  return serializeVersion(output);
}
