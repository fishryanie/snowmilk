import { z } from "zod";
import { apiError, apiSuccess, errorMessage } from "@/lib/api-response";
import {
  buildDailySaleAssumptions,
  calculateDailySaleEstimateFromRevenue,
} from "@/lib/calculations/daily-sales";
import { connectMongo } from "@/lib/mongodb";
import { Equipment } from "@/models/Equipment";
import { MilkBatch } from "@/models/MilkBatch";
import { Product } from "@/models/Product";
import { Sale } from "@/models/Sale";
import { Setting } from "@/models/Setting";
import { ProductSize } from "@/models/Size";
import {
  isVietnamDateKey,
  vietnamDayBoundary,
} from "@/lib/vietnam-date";

const DAILY_PAYMENT_METHOD = "Khác";

const dailySaleSchema = z
  .object({
    saleDate: z
      .string()
      .refine(isVietnamDateKey, "Ngày bán không hợp lệ"),
    batchId: z
      .string()
      .regex(/^[a-f\d]{24}$/i, "Mẻ sữa không hợp lệ"),
    netRevenue: z.coerce.number().int().positive(),
    cashReceived: z.coerce.number().int().min(0),
    bankTransferReceived: z.coerce.number().int().min(0),
    note: z.string().trim().optional().default(""),
    overwrite: z.boolean().optional().default(false),
  })
  .superRefine(
    ({ cashReceived, bankTransferReceived, netRevenue }, context) => {
      if (cashReceived + bankTransferReceived !== netRevenue) {
        context.addIssue({
          code: "custom",
          path: ["netRevenue"],
          message:
            "Tổng doanh thu phải bằng tiền mặt đã nhận cộng tiền chuyển khoản",
        });
      }
    },
  )
  .strict();

async function dailySaleContext(selectedBatchId?: string) {
  const [sizes, products, settings, depreciation, batches] = await Promise.all([
    ProductSize.find({
      code: { $in: ["M", "L"] },
      isActive: true,
    })
      .select("code name milkMl sellingPrice")
      .lean(),
    Product.find({ isActive: true })
      .select(
        "sizeName milkCost toppingCost packagingCost hasCostWarning",
      )
      .lean(),
    Setting.find({
      key: {
        $in: [
          "overhead_bien_doi",
          "so_ly_du_kien_thang",
          "chi_phi_co_dinh_thang_d",
        ],
      },
    }).lean(),
    Equipment.aggregate<{ value: number }>([
      { $match: { isActive: true } },
      { $group: { _id: null, value: { $sum: "$monthlyDepreciation" } } },
    ]),
    MilkBatch.find()
      .sort({ cookedAt: -1, createdAt: -1 })
      .select("_id code name actualLiters cookedAt costPerLiter costPerMl")
      .lean(),
  ]);
  const settingsByKey = new Map(
    settings.map((setting) => [setting.key, Number(setting.value ?? 0)]),
  );
  const expectedCups =
    settingsByKey.get("so_ly_du_kien_thang") ?? 1_000;
  const monthlyFixedCost =
    settingsByKey.get("chi_phi_co_dinh_thang_d") ?? 0;
  const monthlyDepreciation = depreciation[0]?.value ?? 0;
  const fixedCostPerCup =
    expectedCups > 0
      ? (monthlyFixedCost + monthlyDepreciation) / expectedCups
      : 0;
  const orderedSizes = ["M", "L"].flatMap((code) => {
    const size = sizes.find((item) => item.code === code);
    return size
      ? [
          {
            code: size.code,
            name: size.name,
            milkMl: Number(size.milkMl ?? 0),
            sellingPrice: Number(size.sellingPrice ?? 0),
          },
        ]
      : [];
  });

  const assumptions = buildDailySaleAssumptions(
    orderedSizes,
    products.map((product) => ({
      sizeName: product.sizeName,
      milkCost: Number(product.milkCost ?? 0),
      toppingCost: Number(product.toppingCost ?? 0),
      packagingCost: Number(product.packagingCost ?? 0),
      hasCostWarning: product.hasCostWarning,
    })),
    settingsByKey.get("overhead_bien_doi") ?? 0.05,
    fixedCostPerCup,
  );
  const selectedBatch = selectedBatchId
    ? batches.find((batch) => String(batch._id) === selectedBatchId)
    : undefined;
  const batchCostPerMl = Number(selectedBatch?.costPerMl ?? 0);
  const availableBatches = batches.map((batch) => ({
    id: String(batch._id),
    code: batch.code,
    name: batch.name,
    actualLiters: Number(batch.actualLiters ?? 0),
    cookedAt: batch.cookedAt,
    costPerLiter: Number(batch.costPerLiter ?? 0),
    costPerMl: Number(batch.costPerMl ?? 0),
  }));
  return {
    batches: availableBatches,
    assumptions:
      selectedBatch
        ? assumptions.map((assumption) => ({
            ...assumption,
            milkCostPerCup: assumption.milkMl * batchCostPerMl,
          }))
        : assumptions,
    costBasis: selectedBatch
      ? {
          id: String(selectedBatch._id),
          code: selectedBatch.code,
          name: selectedBatch.name,
          costPerLiter: Number(selectedBatch.costPerLiter ?? 0),
          costPerMl: batchCostPerMl,
        }
      : null,
  };
}

export async function GET() {
  try {
    await connectMongo();
    const [history, context] = await Promise.all([
      Sale.find({ entryMode: "daily-summary" })
        .sort({ saleDate: -1 })
        .limit(250)
        .lean(),
      dailySaleContext(),
    ]);
    return apiSuccess({ history, ...context });
  } catch (error) {
    return apiError(errorMessage(error), 503);
  }
}

export async function POST(request: Request) {
  try {
    const parsed = dailySaleSchema.safeParse(await request.json());
    if (!parsed.success) {
      return apiError(
        "Dữ liệu chốt bán hàng không hợp lệ",
        422,
        parsed.error.flatten(),
      );
    }
    await connectMongo();
    const {
      overwrite,
      batchId,
      netRevenue,
      cashReceived,
      bankTransferReceived,
      ...input
    } = parsed.data;
    const { assumptions, costBasis } = await dailySaleContext(batchId);
    if (!costBasis) {
      return apiError(
        "Mẻ sữa đã chọn không còn tồn tại. Hãy tải lại và chọn mẻ khác.",
        422,
      );
    }
    if (costBasis.costPerMl <= 0) {
      return apiError(
        "Mẻ sữa đã chọn chưa có giá vốn hợp lệ. Hãy cập nhật lại mẻ sữa.",
        422,
      );
    }
    if (assumptions.length !== 2) {
      return apiError(
        "Chưa có đủ Size M và Size L đang hoạt động trong danh mục Size.",
        422,
      );
    }
    const totals = calculateDailySaleEstimateFromRevenue(
      netRevenue,
      assumptions,
    );
    const missingCost = totals.sizeSummaries.find(
      (summary) => summary.quantity > 0 && summary.sampleCount === 0,
    );
    if (missingCost) {
      return apiError(
        `Chưa có sản phẩm ${missingCost.sizeName} với cost hợp lệ để ước tính.`,
        422,
      );
    }
    if (totals.totalCups <= 0) {
      return apiError(
        "Không thể quy đổi doanh thu thành số ly ước tính.",
        422,
      );
    }

    const saleDate = vietnamDayBoundary(input.saleDate);
    const existing = await Sale.findOne({
      saleDate,
      entryMode: "daily-summary",
    });
    if (existing && !overwrite) {
      return apiError(
        "Ngày này đã được chốt. Xác nhận ghi đè để cập nhật số cuối ngày.",
        409,
        { existingId: existing.id },
      );
    }
    const query = existing
      ? { _id: existing._id }
      : {
          saleDate,
          batchName: costBasis.name,
          paymentMethod: DAILY_PAYMENT_METHOD,
        };

    const data = await Sale.findOneAndUpdate(
      query,
      {
        $set: {
          saleDate,
          entryMode: "daily-summary",
          batchId: costBasis.id,
          batchCode: costBasis.code,
          batchName: costBasis.name,
          paymentMethod: DAILY_PAYMENT_METHOD,
          items: [],
          ...totals,
          cashReceived,
          bankTransferReceived,
          cupCountSource: "estimated",
          estimationMethod: `Số ly Size M/L và lượng sữa nền đều được ước tính chỉ từ doanh thu thực nhận, giá tham chiếu và giả định M/L cân bằng; giá vốn dùng mẻ ${costBasis.code} - ${costBasis.name}; topping dùng trung vị và khoảng thấp nhất–cao nhất.`,
          note: input.note,
        },
      },
      { upsert: true, returnDocument: "after", runValidators: true },
    );
    return apiSuccess(
      data,
      existing ? "Đã cập nhật chốt ngày" : "Đã chốt bán hàng cuối ngày",
      201,
    );
  } catch (error) {
    return apiError(errorMessage(error), 500);
  }
}
