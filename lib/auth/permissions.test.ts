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
    expect(roleCan("staff", "purchases:write")).toBe(true);
    expect(roleCan("staff", "finance:write")).toBe(false);
    expect(roleCan("staff", "sales:close")).toBe(true);
    expect(roleCan("staff", "sales:reopen")).toBe(false);
    expect(roleCan("staff", "catalog:write")).toBe(false);
  });

  test("owner can manage every permission", () => {
    expect(roleCan("owner", "team:manage")).toBe(true);
  });

  test("route policy protects high-risk transitions", () => {
    expect(
      permissionForRequest("/api/v2/sales-days/2026-08-12/reopen", "POST"),
    ).toBe("sales:reopen");
    expect(
      permissionForRequest("/api/v2/purchase-receipts", "POST"),
    ).toBe("purchases:write");
    expect(permissionForRequest("/api/purchases", "POST")).toBe(
      "purchases:write",
    );
    expect(permissionForRequest("/api/expenses", "POST")).toBe(
      "finance:write",
    );
  });
});


test("simple daily closing follows sales permissions", () => {
  expect(permissionForRequest("/api/sales", "GET")).toBe("sales:read");
  expect(permissionForRequest("/api/sales", "POST")).toBe("sales:close");
  expect(roleCan("staff", "sales:close")).toBe(true);
  expect(roleCan("viewer", "sales:close")).toBe(false);
});
