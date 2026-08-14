import type { CreateRecipeVersionInput } from "@/lib/validators/v2/recipes";
import { sha256Canonical } from "@/lib/v2/canonical";
import { DomainError } from "@/services/v2/errors";

export function recipeConfigurationRequestHash(
  recipeId: string,
  input: CreateRecipeVersionInput,
) {
  return sha256Canonical({
    recipeId,
    baseVersionId: input.baseVersionId,
    baseVersion: input.baseVersion,
    shelfLifeHours: input.shelfLifeHours,
    components: [...input.components]
      .map((component) => ({
        inventoryItemId: component.inventoryItemId,
        inputQuantity: component.inputQuantity,
        expectedYieldPercent: component.expectedYieldPercent,
      }))
      .sort((left, right) =>
        left.inventoryItemId.localeCompare(right.inventoryItemId),
      ),
  });
}

export function assertRecipeConfigurationReplay(
  existingRequestHash: string,
  expectedRequestHash: string,
) {
  if (existingRequestHash !== expectedRequestHash) {
    throw new DomainError(
      "Idempotency key này đã được dùng với nội dung công thức khác.",
      409,
      "IDEMPOTENCY_KEY_REUSED",
    );
  }
}
