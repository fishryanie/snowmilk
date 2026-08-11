import { apiError, apiSuccess, errorMessage } from "@/lib/api-response";
import {
  buildDailySaleAssumptions,
  calculateDailySaleEstimateFromRevenue,
  deriveDailyRevenueSplit,
} from "@/lib/calculations/daily-sales";
import { findFreshMilkBottleProduct } from "@/lib/fresh-milk-product";
import { connectMongo } from "@/lib/mongodb";
import { Equipment } from "@/models/Equipment";
import { MilkBatch } from "@/models/MilkBatch";
import { Product } from "@/models/Product";
import { Sale } from "@/models/Sale";
import { Setting } from "@/models/Setting";
import { ProductSize } from "@/models/Size";
import { vietnamDayBoundary } from "@/lib/vietnam-date";
import { dailySaleSchema } from "@/lib/validators/sales";

const DAILY_PAYMENT_METHOD = "Khác";

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
        "code name productMode sizeName sellingPrice milkCost toppingCost packagingCost hasCostWarning",
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
  const freshMilkBottleProduct = findFreshMilkBottleProduct(products);
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
    freshMilkProduct: freshMilkBottleProduct
      ? {
          id: String(freshMilkBottleProduct._id),
          code: freshMilkBottleProduct.code,
          name: freshMilkBottleProduct.name,
          sellingPrice: Number(freshMilkBottleProduct.sellingPrice ?? 0),
        }
      : null,
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
      freshMilkBottleCount,
      cashReceived,
      bankTransferReceived,
      ...input
    } = parsed.data;
    const totalRevenue = cashReceived + bankTransferReceived;
    const context = await dailySaleContext(batchId);
    const freshMilkBottleUnitPrice = Number(
      context.freshMilkProduct?.sellingPrice ?? 0,
    );
    if (freshMilkBottleCount > 0 && freshMilkBottleUnitPrice <= 0) {
      return apiError(
        "Chưa tìm thấy sản phẩm sữa tươi đóng chai đang hoạt động có giá bán hợp lệ.",
        422,
      );
    }
    const {
      snowMilkRevenue,
      freshMilkRevenue,
    } = deriveDailyRevenueSplit(
      totalRevenue,
      freshMilkBottleCount,
      freshMilkBottleUnitPrice,
    );
    if (snowMilkRevenue < 0) {
      return apiError(
        `Tiền bán ${freshMilkBottleCount} chai (${freshMilkBottleCount} × ${freshMilkBottleUnitPrice.toLocaleString("vi-VN")}đ) đang lớn hơn tổng tiền cuối ngày.`,
        422,
      );
    }
    if (snowMilkRevenue > 0 && !batchId) {
      return apiError("Hãy chọn mẻ sữa tuyết đã bán.", 422);
    }
    const costBasis = snowMilkRevenue > 0 ? context.costBasis : null;
    const { assumptions } = context;
    const netRevenue = totalRevenue;
    if (snowMilkRevenue > 0 && !costBasis) {
      return apiError(
        "Mẻ sữa đã chọn không còn tồn tại. Hãy tải lại và chọn mẻ khác.",
        422,
      );
    }
    if (snowMilkRevenue > 0 && (costBasis?.costPerMl ?? 0) <= 0) {
      return apiError(
        "Mẻ sữa đã chọn chưa có giá vốn hợp lệ. Hãy cập nhật lại mẻ sữa.",
        422,
      );
    }
    if (snowMilkRevenue > 0 && assumptions.length !== 2) {
      return apiError(
        "Chưa có đủ Size M và Size L đang hoạt động trong danh mục Size.",
        422,
      );
    }
    const totals = calculateDailySaleEstimateFromRevenue(
      snowMilkRevenue,
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
    if (snowMilkRevenue > 0 && totals.totalCups <= 0) {
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
          batchName: costBasis?.name ?? "Chỉ bán sữa tươi",
          paymentMethod: DAILY_PAYMENT_METHOD,
        };

    const data = await Sale.findOneAndUpdate(
      query,
      {
        $set: {
          saleDate,
          entryMode: "daily-summary",
          ...(costBasis
            ? {
                batchId: costBasis.id,
                batchCode: costBasis.code,
                batchName: costBasis.name,
              }
            : { batchName: "Chỉ bán sữa tươi" }),
          paymentMethod: DAILY_PAYMENT_METHOD,
          items: [],
          ...totals,
          grossRevenue: netRevenue,
          netRevenue,
          snowMilkRevenue,
          freshMilkRevenue,
          freshMilkBottleCount,
          freshMilkBottleUnitPrice,
          cashReceived,
          bankTransferReceived,
          cupCountSource: "estimated",
          estimationMethod:
            snowMilkRevenue > 0 && costBasis
              ? `Doanh thu sữa tươi được tính tự động: ${freshMilkBottleCount} chai × ${freshMilkBottleUnitPrice.toLocaleString("vi-VN")}đ. Phần còn lại là doanh thu sữa tuyết; số ly Size M/L và lượng sữa nền được ước tính theo mẻ ${costBasis.code} - ${costBasis.name}.`
              : `Ngày chỉ bán sữa tươi; doanh thu được tính tự động từ ${freshMilkBottleCount} chai × ${freshMilkBottleUnitPrice.toLocaleString("vi-VN")}đ.`,
          note: input.note,
        },
        ...(costBasis
          ? {}
          : { $unset: { batchId: 1, batchCode: 1 } }),
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
