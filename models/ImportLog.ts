import mongoose, { Schema } from "mongoose";
import { schemaOptions } from "./helpers";

const ImportLogSchema = new Schema(
  {
    fileName: { type: String, required: true },
    fileHash: { type: String, required: true, index: true },
    importedAt: { type: Date, default: Date.now },
    dryRun: { type: Boolean, default: false },
    sheets: [
      {
        sheetName: String,
        totalRows: Number,
        successRows: Number,
        failedRows: Number,
        rowErrors: [
          {
            row: Number,
            column: String,
            message: String,
          },
        ],
      },
    ],
    totals: {
      totalRows: Number,
      successRows: Number,
      failedRows: Number,
    },
  },
  schemaOptions,
);

export const ImportLog =
  mongoose.models.ImportLog ?? mongoose.model("ImportLog", ImportLogSchema);
