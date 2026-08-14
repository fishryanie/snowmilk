import { DomainError } from "@/services/v2/errors";

export function areV2OperationsEnabled(
  env: Readonly<Record<string, string | undefined>> = process.env,
) {
  return env.V2_OPERATIONS_ENABLED?.trim().toLowerCase() === "enabled";
}

export function assertV2OperationsEnabled(
  env: Readonly<Record<string, string | undefined>> = process.env,
) {
  if (!areV2OperationsEnabled(env)) {
    throw new DomainError(
      "Vận hành v2 chưa được cutover. Luồng hiện tại vẫn dùng dữ liệu legacy.",
      503,
      "V2_OPERATIONS_DISABLED",
    );
  }
}
