import { describe, expect, test } from "bun:test";
import {
  createMembershipSchema,
  updateMembershipSchema,
} from "./memberships";

const locationId = "507f1f77bcf86cd799439011";

describe("v2 membership validators", () => {
  test("normalizes an owner-created staff account", () => {
    expect(
      createMembershipSchema.parse({
        email: "  NhanVien@Example.com ",
        name: "Nhân viên Bếp",
        password: "temporary-password",
        role: "staff",
        locationIds: [locationId],
      }).email,
    ).toBe("nhanvien@example.com");
  });

  test("does not allow creating another owner through the onboarding form", () => {
    expect(
      createMembershipSchema.safeParse({
        email: "owner@example.com",
        name: "Owner khác",
        password: "temporary-password",
        role: "owner",
        locationIds: [],
      }).success,
    ).toBe(false);
  });

  test("requires optimistic version when changing access", () => {
    expect(
      updateMembershipSchema.safeParse({
        role: "viewer",
        status: "suspended",
        locationIds: [],
      }).success,
    ).toBe(false);
  });
});
