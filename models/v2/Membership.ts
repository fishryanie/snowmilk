import mongoose, { Schema } from "mongoose";
import {
  activeField,
  ActorSchema,
  type V2HookDocument,
  v2SchemaOptions,
  versionField,
  V2_COLLECTIONS,
} from "./helpers";

export const MEMBERSHIP_ROLES = ["owner", "staff", "viewer"] as const;
export const MEMBERSHIP_STATUSES = [
  "active",
  "suspended",
  "revoked",
] as const;

const MembershipSchema = new Schema(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: "V2Organization",
      required: true,
      immutable: true,
    },
    userId: { type: String, required: true, trim: true, immutable: true },
    locationIds: {
      type: [{ type: Schema.Types.ObjectId, ref: "V2Location" }],
      default: [],
    },
    role: { type: String, enum: MEMBERSHIP_ROLES, required: true },
    status: {
      type: String,
      enum: MEMBERSHIP_STATUSES,
      required: true,
      default: "active",
    },
    isActive: activeField,
    version: versionField,
    actor: { type: ActorSchema, required: true },
  },
  v2SchemaOptions(V2_COLLECTIONS.memberships),
);

MembershipSchema.index(
  { organizationId: 1, userId: 1 },
  { unique: true, name: "uq_membership_org_user" },
);
MembershipSchema.index(
  { userId: 1, status: 1, isActive: 1 },
  { name: "ix_membership_user_status" },
);

MembershipSchema.pre("validate", function () {
  const doc = this as V2HookDocument;
  if (doc.status !== "active" && doc.isActive) {
    doc.invalidate("isActive", "Membership không active phải được vô hiệu hóa.");
  }
});

export const Membership =
  mongoose.models.V2Membership ??
  mongoose.model("V2Membership", MembershipSchema);
