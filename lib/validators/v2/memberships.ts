import { z } from "zod";
import { objectIdSchema, versionSchema } from "./common";

const managedRoleSchema = z.enum(["owner", "staff", "viewer"]);
const membershipStatusSchema = z.enum(["active", "suspended", "revoked"]);

export const createMembershipSchema = z.strictObject({
  email: z
    .string()
    .trim()
    .pipe(z.email())
    .transform((value) => value.toLowerCase()),
  name: z.string().trim().min(2).max(100),
  password: z.string().min(10).max(128),
  role: z.enum(["staff", "viewer"]),
  locationIds: z.array(objectIdSchema).max(100).default([]),
});

export const updateMembershipSchema = z.strictObject({
  version: versionSchema,
  role: managedRoleSchema,
  status: membershipStatusSchema,
  locationIds: z.array(objectIdSchema).max(100).default([]),
});

export type CreateMembershipInput = z.infer<typeof createMembershipSchema>;
export type UpdateMembershipInput = z.infer<typeof updateMembershipSchema>;
