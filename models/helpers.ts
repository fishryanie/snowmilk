import type { SchemaDefinition } from "mongoose";

export const traceFields: SchemaDefinition = {
  sourceSheet: { type: String, trim: true },
  sourceRow: { type: Number, min: 1 },
  legacyId: { type: String, trim: true, index: true, sparse: true },
};

export const schemaOptions = {
  timestamps: true as const,
  versionKey: false as const,
  toJSON: {
    virtuals: true,
    transform: (_document: unknown, returned: Record<string, unknown>) => {
      returned.id = String(returned._id);
      delete returned._id;
    },
  },
};
