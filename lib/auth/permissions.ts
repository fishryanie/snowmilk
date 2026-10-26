export const ROLES = ["owner", "staff", "viewer"] as const;
export type Role = (typeof ROLES)[number];

export const PERMISSIONS = [
  "catalog:read",
  "catalog:write",
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
  if (pathname.startsWith("/api/zalo-admin/")) {
    if (isReadMethod(normalizedMethod)) return "sales:read";
    return pathname.endsWith("/settings") || pathname.endsWith("/images") ? "settings:manage" : "sales:write";
  }
  if (pathname.startsWith("/api/storefront-admin/")) {
    const read = isReadMethod(normalizedMethod);
    if (pathname.includes("/orders") || pathname.includes("/receipt")) return read ? "sales:read" : "sales:write";
    if (pathname.endsWith("/settings")) return read ? "catalog:read" : "settings:manage";
    return read ? "catalog:read" : "catalog:write";
  }

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
    if (pathname.includes("/purchases") || pathname.includes("/purchase-receipts") || pathname.includes("/purchase-items")) return "purchases:read";
    if (pathname.includes("/sales")) return "sales:read";
    return "catalog:read";
  }

  if (pathname === "/api/sales") return "sales:close";
  if (pathname.endsWith("/reopen")) return "sales:reopen";
  if (pathname.endsWith("/close")) return "sales:close";
  if (pathname.includes("/sales-days")) return "sales:write";
  if (pathname.includes("/purchases") || pathname.includes("/purchase-receipts")) return "purchases:write";
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
