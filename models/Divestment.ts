import mongoose, { Schema } from "mongoose";
import { DIVESTMENT_CLAIM_SOURCE_TYPES } from "@/lib/divestment-claims";
import { schemaOptions, traceFields } from "./helpers";

const DivestmentClaimSchema = new Schema(
  {
    sourceKey: { type: String, required: true, trim: true },
    sourceType: {
      type: String,
      enum: DIVESTMENT_CLAIM_SOURCE_TYPES,
      required: true,
    },
    sourceId: { type: String, required: true, trim: true },
    sourceCode: { type: String, trim: true },
    sourceName: { type: String, required: true, trim: true },
    sourceCategory: { type: String, trim: true },
    sourceDate: { type: Date, required: true },
    amount: { type: Number, min: 1, required: true },
  },
  { _id: false },
);

const DivestmentSchema = new Schema(
  {
    withdrawalDate: { type: Date, required: true, index: true },
    amount: { type: Number, min: 1, required: true },
    claims: { type: [DivestmentClaimSchema], default: [] },
    note: { type: String, trim: true },
    ...traceFields,
  },
  schemaOptions,
);

DivestmentSchema.index(
  { "claims.sourceKey": 1 },
  { unique: true, sparse: true },
);

const cachedDivestmentModel = mongoose.models.Divestment;

if (
  process.env.NODE_ENV !== "production" &&
  cachedDivestmentModel &&
  !cachedDivestmentModel.schema.path("claims")
) {
  mongoose.deleteModel("Divestment");
}

export const Divestment =
  mongoose.models.Divestment ??
  mongoose.model("Divestment", DivestmentSchema);
