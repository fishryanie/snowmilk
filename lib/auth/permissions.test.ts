import { describe, expect, test } from "bun:test";
import {
  permissionForRequest,
  roleCan,
} from "@/lib/auth/permissions";

describe("RBAC", () => {
  test("viewer is read-only", () => {
    expect(roleCan("viewer", "reports:read")).toBe(true);
    expect(roleCan("viewer", "sales:close")).toBe(false);
  });

  test("staff can operate but cannot reopen or change catalog", () => {
    expect(roleCan("staff", "production:write")).toBe(true);
    expect(roleCan("staff", "inventory:count")).toBe(true);
    expect(roleCan("staff", "inventory:adjust")).toBe(false);
    expect(roleCan("staff", "purchases:write")).toBe(true);
    expect(roleCan("staff", "finance:write")).toBe(false);
    expect(roleCan("staff", "sales:close")).toBe(true);
    expect(roleCan("staff", "sales:reopen")).toBe(false);
    expect(roleCan("staff", "catalog:write")).toBe(false);
  });

  test("owner can manage every permission", () => {
    expect(roleCan("owner", "team:manage")).toBe(true);
    expect(roleCan("owner", "inventory:adjust")).toBe(true);
  });

  test("route policy protects high-risk transitions", () => {
    expect(
      permissionForRequest("/api/v2/sales-days/2026-08-12/reopen", "POST"),
    ).toBe("sales:reopen");
    expect(
      permissionForRequest("/api/v2/stock-counts", "POST"),
    ).toBe("inventory:count");
    expect(permissionForRequest("/api/purchases", "POST")).toBe(
      "purchases:write",
    );
    expect(permissionForRequest("/api/expenses", "POST")).toBe(
      "finance:write",
    );
  });
});
