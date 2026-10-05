import mongoose, { Schema } from "mongoose";

const schema = new Schema({
  _id: { type: String, required: true },
  count: { type: Number, required: true, default: 0 },
  expiresAt: { type: Date, required: true, expires: 0 },
}, { versionKey: false });

export const ReceiptScanBudget = mongoose.models.ReceiptScanBudget
  ?? mongoose.model("ReceiptScanBudget", schema);
