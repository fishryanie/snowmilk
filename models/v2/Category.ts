import mongoose, { Schema } from "mongoose";
import {
  activeField,
  ActorSchema,
  type V2HookDocument,
  v2SchemaOptions,
  versionField,
  V2_COLLECTIONS,
} from "./helpers";

const CategorySchema = new Schema(
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
    parentId: { type: Schema.Types.ObjectId, ref: "V2Category", default: null },
    pathCodes: {
      type: [{ type: String, trim: true, uppercase: true }],
      required: true,
      default: [],
    },
    depth: { type: Number, required: true, min: 0, default: 0 },
    sortOrder: { type: Number, required: true, min: 0, default: 0 },
    isActive: activeField,
    version: versionField,
    actor: { type: ActorSchema, required: true },
  },
  v2SchemaOptions(V2_COLLECTIONS.categories),
);

CategorySchema.index(
  { organizationId: 1, code: 1 },
  { unique: true, name: "uq_category_org_code" },
);
CategorySchema.index(
  { organizationId: 1, parentId: 1, sortOrder: 1 },
  { name: "ix_category_tree" },
);

CategorySchema.pre("validate", function () {
  const doc = this as V2HookDocument;
  if (doc.parentId && doc._id.equals(doc.parentId)) {
    doc.invalidate("parentId", "Category không thể là cha của chính nó.");
  }
  if (doc.depth !== doc.pathCodes.length) {
    doc.invalidate("depth", "depth phải bằng số phần tử trong pathCodes.");
  }
  if (doc.pathCodes.includes(doc.code)) {
    doc.invalidate("pathCodes", "pathCodes chỉ chứa mã tổ tiên.");
  }
});

export const Category =
  mongoose.models.V2Category ?? mongoose.model("V2Category", CategorySchema);
