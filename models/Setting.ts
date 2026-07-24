import mongoose, { Schema } from "mongoose";
import { schemaOptions, traceFields } from "./helpers";

const SettingSchema = new Schema(
  {
    key: { type: String, required: true, unique: true, trim: true },
    label: { type: String, required: true, trim: true },
    value: { type: Schema.Types.Mixed, required: true },
    unit: String,
    description: String,
    ...traceFields,
  },
  schemaOptions,
);

export const Setting =
  mongoose.models.Setting ?? mongoose.model("Setting", SettingSchema);
