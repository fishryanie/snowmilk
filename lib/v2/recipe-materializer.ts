import { Decimal128 } from "mongodb";
import { sha256Canonical } from "./canonical";
import { MIGRATION_VERSION } from "./constants";

type MigrationActor = {
  userId: string;
  displayName?: string;
  source: "migration";
  requestId?: string;
};

type LogicalRecipe = {
  code: unknown;
  name: unknown;
  legacySourceId: unknown;
  note: unknown;
  isActive: unknown;
};

type LogicalRecipeVersionLine = {
  inventoryItemCode: unknown;
  itemName: unknown;
  quantity?: unknown;
  inputQuantity?: unknown;
  unit: unknown;
  expectedYieldPercent?: unknown;
  estimatedUnitCostVnd?: unknown;
  preparationNote?: unknown;
};

type LogicalRecipeVersion = {
  recipeCode: unknown;
  versionNumber: unknown;
  name: unknown;
  outputQuantity: unknown;
  outputUnit: unknown;
  finishedSpec: unknown;
  components: unknown;
  status: unknown;
  releasedAt: unknown;
  shelfLifeHours: unknown;
  releaseIdempotencyKey: unknown;
  costDataQuality: unknown;
  legacySourceId: unknown;
  legacyCostSnapshot: unknown;
  isActive: unknown;
};

export type RecipeMaterializerReferences = {
  organizationId: unknown;
  recipeId: unknown;
  skuId: unknown;
  outputInventoryItemId: unknown;
  inventoryItemIds: ReadonlyMap<string, unknown>;
  actor: MigrationActor;
};

function requiredText(value: unknown, label: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label} bị thiếu.`);
  }
  return value.trim();
}

function resolvedInventoryItemId(
  references: RecipeMaterializerReferences,
  itemCode: string,
) {
  const id = references.inventoryItemIds.get(itemCode);
  if (!id) throw new Error(`Không resolve được inventory item ${itemCode}.`);
  return id;
}

function decimal(value: unknown, label: string) {
  return Decimal128.fromString(requiredText(value, label));
}

function source(sourceId: string) {
  return {
    sourceCollection: "recipes",
    sourceId,
    migrationVersion: MIGRATION_VERSION,
  };
}

export function materializeLegacyRecipe(
  logical: LogicalRecipe,
  references: Omit<RecipeMaterializerReferences, "recipeId" | "inventoryItemIds"> & {
    currentVersionId?: unknown;
  },
) {
  const legacySourceId = requiredText(logical.legacySourceId, "legacySourceId");
  return {
    organizationId: references.organizationId,
    code: requiredText(logical.code, "recipe.code"),
    name: requiredText(logical.name, "recipe.name"),
    skuId: references.skuId,
    outputInventoryItemId: references.outputInventoryItemId,
    ...(references.currentVersionId === undefined
      ? {}
      : { currentVersionId: references.currentVersionId }),
    legacySource: source(legacySourceId),
    note: typeof logical.note === "string" ? logical.note : "",
    isActive: logical.isActive !== false,
    version: 1,
    actor: references.actor,
  };
}

export function materializeLegacyRecipeVersion(
  logical: LogicalRecipeVersion,
  references: RecipeMaterializerReferences,
) {
  if (!Array.isArray(logical.finishedSpec) || !Array.isArray(logical.components)) {
    throw new Error("Recipe version thiếu finishedSpec/components.");
  }
  const legacySourceId = requiredText(logical.legacySourceId, "legacySourceId");
  const status = requiredText(logical.status, "status");
  if (status !== "released") {
    throw new Error("Legacy recipe version phải ở trạng thái released.");
  }
  const finishedSpec = (logical.finishedSpec as LogicalRecipeVersionLine[]).map(
    (line) => {
      const itemCode = requiredText(line.inventoryItemCode, "finishedSpec.itemCode");
      return {
        inventoryItemId: resolvedInventoryItemId(references, itemCode),
        itemCode,
        itemName: requiredText(line.itemName, "finishedSpec.itemName"),
        quantity: decimal(line.quantity, "finishedSpec.quantity"),
        unit: requiredText(line.unit, "finishedSpec.unit"),
        preparationNote:
          typeof line.preparationNote === "string" ? line.preparationNote : "",
      };
    },
  );
  const components = (logical.components as LogicalRecipeVersionLine[]).map(
    (line) => {
      const itemCode = requiredText(line.inventoryItemCode, "component.itemCode");
      return {
        inventoryItemId: resolvedInventoryItemId(references, itemCode),
        itemCode,
        itemName: requiredText(line.itemName, "component.itemName"),
        inputQuantity: decimal(line.inputQuantity, "component.inputQuantity"),
        unit: requiredText(line.unit, "component.unit"),
        ...(line.expectedYieldPercent == null
          ? {}
          : {
              expectedYieldPercent: decimal(
                line.expectedYieldPercent,
                "component.expectedYieldPercent",
              ),
            }),
        estimatedUnitCostVnd: decimal(
          line.estimatedUnitCostVnd,
          "component.estimatedUnitCostVnd",
        ),
        preparationNote:
          typeof line.preparationNote === "string" ? line.preparationNote : "",
      };
    },
  );
  const versionNumber = Number(logical.versionNumber);
  if (!Number.isSafeInteger(versionNumber) || versionNumber < 1) {
    throw new Error("versionNumber không hợp lệ.");
  }
  const shelfLifeHours =
    logical.shelfLifeHours == null ? null : Number(logical.shelfLifeHours);
  return {
    organizationId: references.organizationId,
    recipeCode: requiredText(logical.recipeCode, "recipeCode"),
    recipeId: references.recipeId,
    versionNumber,
    name: requiredText(logical.name, "name"),
    skuId: references.skuId,
    outputInventoryItemId: references.outputInventoryItemId,
    outputQuantity: decimal(logical.outputQuantity, "outputQuantity"),
    outputUnit: requiredText(logical.outputUnit, "outputUnit"),
    finishedSpec,
    components,
    status,
    releasedAt: new Date(requiredText(logical.releasedAt, "releasedAt")),
    shelfLifeHours,
    configurationIdempotencyKey: null,
    configurationRequestHash: null,
    releaseIdempotencyKey: requiredText(
      logical.releaseIdempotencyKey,
      "releaseIdempotencyKey",
    ),
    contentHash: sha256Canonical(logical),
    costDataQuality: requiredText(logical.costDataQuality, "costDataQuality"),
    legacySource: source(legacySourceId),
    legacyCostSnapshot: logical.legacyCostSnapshot,
    isActive: logical.isActive !== false,
    version: 1,
    actor: references.actor,
  };
}
