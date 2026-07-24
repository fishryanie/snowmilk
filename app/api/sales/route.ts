import { z } from "zod";
import { apiError, apiSuccess, errorMessage } from "@/lib/api-response";
import {
  buildEstimatedSizeMix,
  buildDailySaleAssumptions,
  calculateDailySaleEstimate,
  calculateDailySaleEstimateFromMilk,
  calculateDailySaleEstimateFromTotalCups,
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
    milkLitersSold: z.coerce.number().positive(),
    netRevenue: z.coerce.number().min(0),
    cashReceived: z.coerce.number().int().min(0).nullable().default(null),
    bankTransferReceived: z.coerce
      .number()
      .int()
      .min(0)
      .nullable()
      .default(null),
    actualSizeQuantities: z
      .object({
        M: z.coerce.number().int().min(0),
        L: z.coerce.number().int().min(0),
      })
      .refine(({ M, L }) => M + L > 0, {
        message: "Tổng số ly thực tế phải lớn hơn 0",
      })
      .optional(),
    actualTotalCups: z.coerce.number().int().positive().optional(),
    note: z.string().trim().optional().default(""),
    overwrite: z.boolean().optional().default(false),
  })
  .superRefine(
    (
      {
        cashReceived,
        bankTransferReceived,
        netRevenue,
        actualSizeQuantities,
        actualTotalCups,
      },
      context,
    ) => {
      const hasPaymentBreakdown =
        cashReceived !== null || bankTransferReceived !== null;
      const paymentTotal =
        (cashReceived ?? 0) + (bankTransferReceived ?? 0);

      if (hasPaymentBreakdown && paymentTotal !== netRevenue) {
        context.addIssue({
          code: "custom",
          path: ["netRevenue"],
          message:
            "Tổng doanh thu phải bằng tiền mặt đã nhận cộng tiền chuyển khoản",
        });
      }
      if (
        actualSizeQuantities &&
        actualTotalCups !== undefined &&
        actualSizeQuantities.M + actualSizeQuantities.L !== actualTotalCups
      ) {
        context.addIssue({
          code: "custom",
          path: ["actualTotalCups"],
          message:
            "Tổng số ly thực tế phải bằng số ly Size M cộng Size L",
        });
      }
    },
  )
  .strict();

async function dailySaleContext(selectedBatchId?: string) {
  const [
    sizes,
    products,
    settings,
    depreciation,
    batches,
    actualSizeHistory,
  ] = await Promise.all([
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
    Sale.find({
      entryMode: "daily-summary",
      cupCountSource: "actual",
    })
      .select("cupCountSource sizeSummaries.sizeCode sizeSummaries.quantity")
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
  const estimatedSizeMix = buildEstimatedSizeMix(
    actualSizeHistory.map((sale) => ({
      cupCountSource: sale.cupCountSource,
      sizeSummaries: sale.sizeSummaries.map(
        (summary: { sizeCode: string; quantity?: number }) => ({
          sizeCode: summary.sizeCode,
          quantity: Number(summary.quantity ?? 0),
        }),
      ),
    })),
    ["M", "L"],
  );

  return {
    batches: availableBatches,
    estimatedSizeMix,
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
      milkLitersSold,
      netRevenue,
      cashReceived,
      bankTransferReceived,
      actualSizeQuantities,
      actualTotalCups,
      ...input
    } = parsed.data;
    const {
      assumptions,
      costBasis,
      estimatedSizeMix,
    } = await dailySaleContext(batchId);
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
    const totals = actualSizeQuantities
      ? calculateDailySaleEstimate(
          actualSizeQuantities,
          netRevenue,
          assumptions,
          milkLitersSold,
        )
      : actualTotalCups !== undefined
        ? calculateDailySaleEstimateFromTotalCups(
            actualTotalCups,
            milkLitersSold,
            netRevenue,
            assumptions,
            estimatedSizeMix.shares,
          )
        : calculateDailySaleEstimateFromMilk(
          milkLitersSold,
          netRevenue,
          assumptions,
          estimatedSizeMix.shares,
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
        "Không thể quy đổi lượng sữa thành số ly ước tính.",
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
          cupCountSource: actualSizeQuantities
            ? "actual"
            : actualTotalCups !== undefined
              ? "actual-total"
              : "estimated",
          estimationMethod:
            actualSizeQuantities
              ? `Số ly Size M và Size L do người dùng nhập thực tế; cost sữa nền tính trực tiếp theo số lít và mẻ ${costBasis.code} - ${costBasis.name}; topping dùng trung vị và khoảng thấp nhất–cao nhất.`
              : actualTotalCups !== undefined
                ? `Tổng ${actualTotalCups} ly do người dùng nhập thực tế; cơ cấu Size M/L chỉ được ước tính từ tổng doanh thu và giá bán tham chiếu, không dùng số lít sữa; cost sữa nền vẫn tính trực tiếp theo số lít và mẻ ${costBasis.code} - ${costBasis.name}; topping dùng trung vị và khoảng thấp nhất–cao nhất.`
              : estimatedSizeMix.source === "actual-history"
                ? `Cơ cấu size dùng tỷ lệ từ ${estimatedSizeMix.actualSampleCups} ly đã nhập thực tế trước đây; tổng số ly được ước tính từ tổng lít sữa, doanh thu, định mức ml/ly và giá tham chiếu; cost sữa nền tính trực tiếp theo số lít và mẻ ${costBasis.code} - ${costBasis.name}; topping dùng trung vị và khoảng thấp nhất–cao nhất.`
                : `Chưa có lịch sử số ly thực tế nên cơ cấu size tạm chia đều; tổng số ly được ước tính từ tổng lít sữa, doanh thu, định mức ml/ly và giá tham chiếu; cost sữa nền tính trực tiếp theo số lít và mẻ ${costBasis.code} - ${costBasis.name}; topping dùng trung vị và khoảng thấp nhất–cao nhất.`,
          note: input.note,
        },
      },
      { upsert: true, new: true, runValidators: true },
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
