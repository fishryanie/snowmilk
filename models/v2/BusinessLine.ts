import mongoose, { Schema } from "mongoose";
import {
  activeField,
  ActorSchema,
  type V2HookDocument,
  v2SchemaOptions,
  versionField,
  V2_COLLECTIONS,
} from "./helpers";

const BusinessLineSchema = new Schema(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: "V2Organization",
      required: true,
      immutable: true,
    },
    code: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      match: /^[A-Z][A-Z0-9_]*$/,
      immutable: true,
    },
    name: { type: String, required: true, trim: true },
    parentId: { type: Schema.Types.ObjectId, ref: "V2BusinessLine", default: null },
    pathCodes: {
      type: [{ type: String, trim: true, uppercase: true }],
      required: true,
      default: [],
    },
    depth: { type: Number, required: true, min: 0, default: 0 },
    isPosting: { type: Boolean, required: true, default: true },
    sortOrder: { type: Number, required: true, min: 0, default: 0 },
    isActive: activeField,
    version: versionField,
    actor: { type: ActorSchema, required: true },
  },
  v2SchemaOptions(V2_COLLECTIONS.businessLines),
);

BusinessLineSchema.index(
  { organizationId: 1, code: 1 },
  { unique: true, name: "uq_business_line_org_code" },
);
BusinessLineSchema.index(
  { organizationId: 1, parentId: 1, sortOrder: 1 },
  { name: "ix_business_line_tree" },
);

BusinessLineSchema.pre("validate", function () {
  const doc = this as V2HookDocument;
  if (doc.parentId && doc._id.equals(doc.parentId)) {
    doc.invalidate("parentId", "Business line không thể là cha của chính nó.");
  }
  const expectedDepth = doc.pathCodes.length;
  if (doc.depth !== expectedDepth) {
    doc.invalidate("depth", "depth phải bằng số phần tử trong pathCodes.");
  }
  if (doc.pathCodes.includes(doc.code)) {
    doc.invalidate("pathCodes", "pathCodes chỉ chứa mã tổ tiên.");
  }
});

export const BusinessLine =
  mongoose.models.V2BusinessLine ??
  mongoose.model("V2BusinessLine", BusinessLineSchema);
