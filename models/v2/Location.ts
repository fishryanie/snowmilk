import mongoose, { Schema } from "mongoose";
import {
  activeField,
  ActorSchema,
  v2SchemaOptions,
  versionField,
  V2_COLLECTIONS,
} from "./helpers";

const AddressSchema = new Schema(
  {
    line1: { type: String, trim: true },
    ward: { type: String, trim: true },
    district: { type: String, trim: true },
    province: { type: String, trim: true },
    countryCode: { type: String, trim: true, uppercase: true, default: "VN" },
  },
  { _id: false },
);

const LocationSchema = new Schema(
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
      match: /^[A-Z0-9][A-Z0-9_-]*$/,
    },
    name: { type: String, required: true, trim: true },
    timezone: {
      type: String,
      required: true,
      trim: true,
      default: "Asia/Ho_Chi_Minh",
    },
    address: { type: AddressSchema },
    isDefault: { type: Boolean, required: true, default: false },
    isActive: activeField,
    version: versionField,
    actor: { type: ActorSchema, required: true },
  },
  v2SchemaOptions(V2_COLLECTIONS.locations),
);

LocationSchema.index(
  { organizationId: 1, code: 1 },
  { unique: true, name: "uq_location_org_code" },
);
LocationSchema.index(
  { organizationId: 1, isActive: 1, name: 1 },
  { name: "ix_location_active_name" },
);
LocationSchema.index(
  { organizationId: 1, isDefault: 1 },
  {
    unique: true,
    partialFilterExpression: { isDefault: true },
    name: "uq_location_default_per_org",
  },
);

export const Location =
  mongoose.models.V2Location ?? mongoose.model("V2Location", LocationSchema);
