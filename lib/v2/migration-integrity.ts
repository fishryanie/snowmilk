import { canonicalJson } from "./canonical";

export function assertUpsertedDocumentMatches(
  actual: Record<string, unknown>,
  expectedInsertBody: Record<string, unknown>,
  label: string,
) {
  const mismatches = Object.keys(expectedInsertBody).filter(
    (key) => canonicalJson(actual[key]) !== canonicalJson(expectedInsertBody[key]),
  );
  if (mismatches.length > 0) {
    throw new Error(
      `${label} đã tồn tại nhưng khác migration plan tại field: ${mismatches.join(", ")}.`,
    );
  }
}
