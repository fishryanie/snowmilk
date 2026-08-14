import mongoose, { Schema, type SchemaDefinitionProperty } from "mongoose";

// Mongoose infers `unknown` for hooks on dynamically defined schemas. Keeping
// this bridge in one place lets validators stay readable without weakening the
// public model types.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type V2HookDocument = Record<string, any>;

type ExactDecimal = { coefficient: bigint; scale: number };

function parseExactDecimal(value: unknown): ExactDecimal {
  const source =
    value != null && typeof value === "object" && "toString" in value
      ? String(value)
      : typeof value === "string" || typeof value === "number"
        ? String(value)
        : "";
  const match = source
    .trim()
    .match(/^([+-]?)(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/);
  if (!match) throw new RangeError("Giá trị Decimal128 không hợp lệ.");

  const fraction = match[3] ?? "";
  const exponent = BigInt(match[4] ?? "0");
  let scaleValue = BigInt(fraction.length) - exponent;
  // Decimal128 itself is bounded to a much smaller exponent range. This guard
  // also keeps the exact validator safe when called directly with raw input.
  if (scaleValue > BigInt(10_000) || scaleValue < BigInt(-10_000)) {
    throw new RangeError("Số mũ Decimal128 nằm ngoài phạm vi hỗ trợ.");
  }
  let coefficient = BigInt(`${match[2]}${fraction}`);
  if (match[1] === "-") coefficient = -coefficient;
  if (scaleValue < BigInt(0)) {
    coefficient *= BigInt(10) ** -scaleValue;
    scaleValue = BigInt(0);
  }
  let scale = Number(scaleValue);
  while (
    scale > 0 &&
    coefficient !== BigInt(0) &&
    coefficient % BigInt(10) === BigInt(0)
  ) {
    coefficient /= BigInt(10);
    scale -= 1;
  }
  return { coefficient, scale };
}

function alignExactDecimals(left: ExactDecimal, right: ExactDecimal) {
  const scale = Math.max(left.scale, right.scale);
  return {
    left:
      left.coefficient * BigInt(10) ** BigInt(scale - left.scale),
    right:
      right.coefficient * BigInt(10) ** BigInt(scale - right.scale),
    scale,
  };
}

function formatExactDecimal(coefficient: bigint, scale: number) {
  if (coefficient === BigInt(0)) return "0";
  const sign = coefficient < BigInt(0) ? "-" : "";
  const absolute = coefficient < BigInt(0) ? -coefficient : coefficient;
  let digits = absolute.toString();
  if (scale === 0) return `${sign}${digits}`;
  digits = digits.padStart(scale + 1, "0");
  const whole = digits.slice(0, -scale);
  const fraction = digits.slice(-scale).replace(/0+$/, "");
  return `${sign}${whole}${fraction ? `.${fraction}` : ""}`;
}

export function compareDecimalStringsExact(left: unknown, right: unknown) {
  const aligned = alignExactDecimals(
    parseExactDecimal(left),
    parseExactDecimal(right),
  );
  if (aligned.left === aligned.right) return 0;
  return aligned.left < aligned.right ? -1 : 1;
}

export function decimalStringsEqual(left: string, right: string) {
  return compareDecimalStringsExact(left, right) === 0;
}

export function decimalDifferenceExact(left: string, right: string) {
  const aligned = alignExactDecimals(
    parseExactDecimal(left),
    parseExactDecimal(right),
  );
  return formatExactDecimal(aligned.left - aligned.right, aligned.scale);
}

export const V2_COLLECTIONS = {
  organizations: "v2_organizations",
  locations: "v2_locations",
  memberships: "v2_memberships",
  businessLines: "v2_business_lines",
  categories: "v2_categories",
  catalogProducts: "v2_catalog_products",
  skus: "v2_skus",
  skuPrices: "v2_sku_prices",
  inventoryItems: "v2_inventory_items",
  inventoryLots: "v2_inventory_lots",
  recipes: "v2_recipes",
  recipeVersions: "v2_recipe_versions",
  productionBatches: "v2_production_batches",
  stockMovements: "v2_stock_movements",
  inventoryBalances: "v2_inventory_balances",
  stockCounts: "v2_stock_counts",
  salesDays: "v2_sales_days",
  revenueEntries: "v2_revenue_entries",
  dailyRevenueFacts: "v2_daily_revenue_facts",
  auditLogs: "v2_audit_logs",
  migrationRuns: "v2_migration_runs",
  purchaseReceipts: "v2_purchase_receipts",
} as const;

export const UNIT_VALUES = ["g", "ml", "each"] as const;
export const SALES_UNIT_VALUES = [
  "box",
  "cup",
  "bottle",
  "portion",
  "each",
] as const;
export const DATA_QUALITY_VALUES = [
  "complete",
  "missing_cost",
  "estimated",
  "legacy",
] as const;

export const ActorSchema = new Schema(
  {
    userId: { type: String, required: true, trim: true, immutable: true },
    displayName: { type: String, trim: true, immutable: true },
    source: {
      type: String,
      enum: ["user", "system", "migration"],
      required: true,
      immutable: true,
    },
    requestId: { type: String, trim: true, immutable: true },
  },
  { _id: false },
);

export const LegacySourceSchema = new Schema(
  {
    sourceCollection: {
      type: String,
      required: true,
      trim: true,
      immutable: true,
    },
    sourceId: { type: String, required: true, trim: true, immutable: true },
    migrationVersion: {
      type: String,
      required: true,
      trim: true,
      immutable: true,
    },
  },
  { _id: false },
);

export function v2SchemaOptions(collection: string) {
  return {
    collection,
    timestamps: true as const,
    versionKey: false as const,
    strict: "throw" as const,
    minimize: false,
    toJSON: {
      virtuals: true,
      transform: (_document: unknown, returned: Record<string, unknown>) => {
        returned.id = String(returned._id);
        delete returned._id;
      },
    },
  };
}

type VndFieldOptions = {
  required?: boolean;
  default?: number | null;
  signed?: boolean;
  immutable?: boolean;
};

export function vndField({
  required = true,
  default: defaultValue,
  signed = false,
  immutable = false,
}: VndFieldOptions = {}) {
  return {
    type: Number,
    required,
    ...(defaultValue === undefined ? {} : { default: defaultValue }),
    ...(signed ? {} : { min: 0 }),
    immutable,
    validate: {
      validator: (value: unknown) =>
        value == null ||
        (typeof value === "number" && Number.isSafeInteger(value)),
      message: "Giá trị VND phải là số nguyên an toàn.",
    },
  };
}

type DecimalFieldOptions = {
  required?: boolean;
  default?: string | null;
  signed?: boolean;
  positive?: boolean;
  immutable?: boolean;
};

export function decimalField({
  required = true,
  default: defaultValue,
  signed = false,
  positive = false,
  immutable = false,
}: DecimalFieldOptions = {}) {
  return {
    type: Schema.Types.Decimal128,
    required,
    ...(defaultValue === undefined ? {} : { default: defaultValue }),
    immutable,
    validate: {
      validator: (value: unknown) => {
        if (value == null) return !required;
        try {
          const comparison = compareDecimalStringsExact(value, "0");
          if (positive) return comparison > 0;
          return signed || comparison >= 0;
        } catch {
          return false;
        }
      },
      message: positive
        ? "Số lượng phải lớn hơn 0."
        : "Giá trị thập phân không hợp lệ.",
    },
  };
}

export const businessDateField = {
  type: String,
  required: true,
  trim: true,
  match: /^\d{4}-(0[1-9]|1[0-2])-([0-2]\d|3[01])$/,
} as const;

export const versionField = {
  type: Number,
  required: true,
  min: 1,
  default: 1,
} as const;

export const activeField = {
  type: Boolean,
  required: true,
  default: true,
  index: true,
} as const;

export function rejectAppendOnlyMutations(schema: Schema, label: string) {
  const reject = function () {
    throw new Error(
      `${label} là sổ append-only; hãy tạo bản ghi đảo thay vì sửa hoặc xóa.`,
    );
  };

  schema.pre("updateOne", reject);
  schema.pre("updateMany", reject);
  schema.pre("findOneAndUpdate", reject);
  schema.pre("replaceOne", reject);
  schema.pre("deleteOne", { document: false, query: true }, reject);
  schema.pre("deleteOne", { document: true, query: false }, reject);
  schema.pre("deleteMany", reject);
  schema.pre("findOneAndDelete", reject);
  schema.pre("save", function () {
    if (!this.isNew) reject();
  });
}

export function getV2Model(
  modelName: string,
  schema: Schema,
): mongoose.Model<unknown> {
  return mongoose.models[modelName] ?? mongoose.model(modelName, schema);
}

export type V2SchemaField = SchemaDefinitionProperty<unknown>;
