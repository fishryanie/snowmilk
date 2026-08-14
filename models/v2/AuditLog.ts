import mongoose, { Schema } from "mongoose";
import {
  ActorSchema,
  rejectAppendOnlyMutations,
  v2SchemaOptions,
  versionField,
  V2_COLLECTIONS,
} from "./helpers";

const AuditChangeSchema = new Schema(
  {
    path: { type: String, required: true, trim: true, immutable: true },
    before: { type: Schema.Types.Mixed, immutable: true },
    after: { type: Schema.Types.Mixed, immutable: true },
  },
  { _id: false },
);

const AuditLogSchema = new Schema(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: "V2Organization",
      required: true,
      immutable: true,
    },
    locationId: {
      type: Schema.Types.ObjectId,
      ref: "V2Location",
      default: null,
      immutable: true,
    },
    action: {
      type: String,
      enum: [
        "create",
        "update",
        "deactivate",
        "close",
        "reopen",
        "post",
        "complete",
        "void",
        "migrate",
        "release",
        "reverse",
        "login",
        "logout",
      ],
      required: true,
      immutable: true,
    },
    resourceType: { type: String, required: true, trim: true, immutable: true },
    resourceId: { type: String, required: true, trim: true, immutable: true },
    resourceVersion: { type: Number, min: 1, immutable: true },
    requestId: { type: String, required: true, trim: true, immutable: true },
    idempotencyKey: { type: String, trim: true, immutable: true },
    requestHash: { type: String, trim: true, immutable: true },
    occurredAt: { type: Date, required: true, immutable: true },
    reason: { type: String, trim: true, immutable: true },
    changes: { type: [AuditChangeSchema], required: true, default: [], immutable: true },
    metadata: { type: Schema.Types.Mixed, immutable: true },
    version: { ...versionField, immutable: true },
    actor: { type: ActorSchema, required: true, immutable: true },
  },
  v2SchemaOptions(V2_COLLECTIONS.auditLogs),
);

AuditLogSchema.index(
  { organizationId: 1, resourceType: 1, resourceId: 1, occurredAt: -1 },
  { name: "ix_audit_resource_timeline" },
);
AuditLogSchema.index(
  { organizationId: 1, "actor.userId": 1, occurredAt: -1 },
  { name: "ix_audit_actor_timeline" },
);
AuditLogSchema.index(
  { organizationId: 1, requestId: 1, action: 1, resourceType: 1, resourceId: 1 },
  { unique: true, name: "uq_audit_request_action_resource" },
);

rejectAppendOnlyMutations(AuditLogSchema, "AuditLog");

export const AuditLog =
  mongoose.models.V2AuditLog ?? mongoose.model("V2AuditLog", AuditLogSchema);
