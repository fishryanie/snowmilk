import mongoose, { Schema } from "mongoose";
import {
  activeField,
  ActorSchema,
  v2SchemaOptions,
  versionField,
  V2_COLLECTIONS,
} from "./helpers";

const BrandColorsSchema = new Schema(
  {
    cream: { type: String, trim: true, default: "#EEF7FA" },
    terracotta: { type: String, trim: true, default: "#287F96" },
    green: { type: String, trim: true, default: "#25845D" },
    ink: { type: String, trim: true, default: "#17323A" },
  },
  { _id: false },
);

const OrganizationProfileSchema = new Schema(
  {
    displayName: { type: String, required: true, trim: true },
    tagline: { type: String, trim: true },
    wordmark: { type: String, trim: true },
    logoUrl: { type: String, trim: true },
    brandColors: { type: BrandColorsSchema, default: () => ({}) },
    legalName: { type: String, trim: true },
    timezone: {
      type: String,
      required: true,
      trim: true,
      default: "Asia/Ho_Chi_Minh",
    },
    currency: { type: String, enum: ["VND"], required: true, default: "VND" },
    locale: { type: String, required: true, default: "vi-VN", trim: true },
  },
  { _id: false },
);

const OrganizationSchema = new Schema(
  {
    code: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      match: /^[A-Z0-9][A-Z0-9_-]*$/,
    },
    profile: { type: OrganizationProfileSchema, required: true },
    isActive: activeField,
    version: versionField,
    actor: { type: ActorSchema, required: true },
  },
  v2SchemaOptions(V2_COLLECTIONS.organizations),
);

OrganizationSchema.index({ code: 1 }, { unique: true, name: "uq_org_code" });

export const Organization =
  mongoose.models.V2Organization ??
  mongoose.model("V2Organization", OrganizationSchema);
