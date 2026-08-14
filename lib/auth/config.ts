export const AUTH_ENFORCEMENT_VALUES = ["disabled", "enabled"] as const;
export type AuthEnforcement = (typeof AUTH_ENFORCEMENT_VALUES)[number];

export function authEnforcement(
  env: Readonly<Record<string, string | undefined>> = process.env,
): AuthEnforcement {
  return env.AUTH_ENFORCEMENT?.trim().toLowerCase() === "enabled"
    ? "enabled"
    : "disabled";
}

export function isAuthEnforced(
  env: Readonly<Record<string, string | undefined>> = process.env,
) {
  return authEnforcement(env) === "enabled";
}

export function assertAuthEnvironment(
  env: Readonly<Record<string, string | undefined>> = process.env,
) {
  const secret = env.BETTER_AUTH_SECRET?.trim();
  if (!secret || secret.length < 32) {
    throw new Error(
      "BETTER_AUTH_SECRET phải có ít nhất 32 ký tự trước khi bật AUTH_ENFORCEMENT=enabled.",
    );
  }
  return secret;
}

export function bootstrapTokenMatches(
  suppliedToken: string | null,
  env: Readonly<Record<string, string | undefined>> = process.env,
) {
  const expected = env.AUTH_BOOTSTRAP_TOKEN?.trim();
  if (!expected || expected.length < 24 || !suppliedToken) return false;

  const left = new TextEncoder().encode(expected);
  const right = new TextEncoder().encode(suppliedToken);
  if (left.length !== right.length) return false;

  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left[index] ^ right[index];
  }
  return difference === 0;
}
