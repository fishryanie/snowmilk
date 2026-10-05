import mongoose, { Schema } from "mongoose";

const ReceiptImportSchema = new Schema({
  _id: { type: String, required: true },
  requestHash: { type: String, required: true },
  purchaseIds: [{ type: Schema.Types.ObjectId, ref: "Purchase" }],
}, { timestamps: true, versionKey: false });

export const ReceiptImport = mongoose.models.ReceiptImport
  ?? mongoose.model("ReceiptImport", ReceiptImportSchema);
