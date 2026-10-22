import mongoose, { Schema } from "mongoose";

// Daily closing stores only the date and the two amounts entered by the shop.
const SaleSchema = new Schema(
  {
    saleDate: { type: Date, required: true, unique: true },
    cashReceived: { type: Number, required: true, min: 0 },
    bankTransferReceived: { type: Number, required: true, min: 0 },
  },
  { versionKey: false },
);

const cached = mongoose.models.Sale;
if (cached && (cached.schema.path("entryMode") || cached.schema.options.timestamps)) {
  mongoose.deleteModel("Sale");
}

export const Sale = mongoose.models.Sale ?? mongoose.model("Sale", SaleSchema);
