export const ROLES = ["owner", "staff", "viewer"] as const;
export type Role = (typeof ROLES)[number];

export const PERMISSIONS = [
  "catalog:read",
  "catalog:write",
  "production:read",
  "production:write",
  "inventory:read",
  "inventory:write",
  "inventory:count",
  "inventory:adjust",
  "sales:read",
  "sales:write",
  "sales:close",
  "sales:reopen",
  "reports:read",
  "finance:read",
  "purchases:read",
  "purchases:write",
  "finance:write",
  "team:manage",
  "settings:manage",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const READ_PERMISSIONS = PERMISSIONS.filter((permission) =>
  permission.endsWith(":read"),
);

const ROLE_PERMISSIONS: Readonly<Record<Role, ReadonlySet<Permission>>> = {
  owner: new Set(PERMISSIONS),
  staff: new Set([
    ...READ_PERMISSIONS,
    "production:write",
    "inventory:write",
    "inventory:count",
    "sales:write",
    "sales:close",
    "purchases:write",
  ]),
  viewer: new Set(READ_PERMISSIONS),
};

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && ROLES.includes(value as Role);
}

export function roleCan(role: Role, permission: Permission) {
  return ROLE_PERMISSIONS[role].has(permission);
}

export function permissionsForRole(role: Role): Permission[] {
  return [...ROLE_PERMISSIONS[role]];
}

function isReadMethod(method: string) {
  return method === "GET" || method === "HEAD" || method === "OPTIONS";
}

/** Central policy for legacy and v2 Route Handlers. */
export function permissionForRequest(
  pathname: string,
  method: string,
): Permission {
  const normalizedMethod = method.toUpperCase();

  if (isReadMethod(normalizedMethod)) {
    if (
      pathname.includes("/reports/") ||
      pathname.includes("/dashboard") ||
      pathname.includes("/export/")
    ) {
      return "reports:read";
    }
    if (pathname.includes("/payroll") || pathname.includes("/expenses")) {
      return "finance:read";
    }
    if (
      pathname.includes("/inventory") ||
      pathname.includes("/stock-counts")
    ) {
      return "inventory:read";
    }
    if (pathname.includes("/production-batches")) return "production:read";
    if (pathname.includes("/sales")) return "sales:read";
    return "catalog:read";
  }

  if (pathname.endsWith("/reopen")) return "sales:reopen";
  if (pathname.endsWith("/close")) return "sales:close";
  if (pathname.includes("/sales-days")) return "sales:write";
  if (pathname.includes("/production-batches")) return "production:write";
  if (pathname.includes("/stock-counts")) return "inventory:count";
  if (pathname.includes("/inventory")) return "inventory:write";
  if (pathname.includes("/purchases")) return "purchases:write";
  if (
    pathname.includes("/payroll") ||
    pathname.includes("/expenses") ||
    pathname.includes("/divestment")
  ) {
    return "finance:write";
  }
  if (pathname.includes("/settings")) return "settings:manage";
  if (pathname.includes("/memberships") || pathname.includes("/employees")) {
    return "team:manage";
  }
  return "catalog:write";
}
