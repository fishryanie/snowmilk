import { apiError, apiSuccess, errorMessage } from "@/lib/api-response";
import {
  buildDailySaleAssumptionsFromProducts,
  calculateDailySaleEstimateFromRevenue,
  deriveDailyRevenueSplit,
  isSnowMilkRevenueEstimateProduct,
} from "@/lib/calculations/daily-sales";
import { calculateDailyCountedProducts } from "@/lib/calculations/daily-counted-products";
import { findFreshMilkBottleProduct } from "@/lib/fresh-milk-product";
import { connectMongo } from "@/lib/mongodb";
import { normalizeProductGroupName } from "@/lib/product-groups";
import { Equipment } from "@/models/Equipment";
import { MilkBatch } from "@/models/MilkBatch";
import { Product } from "@/models/Product";
import { Sale } from "@/models/Sale";
import { Setting } from "@/models/Setting";
import { vietnamDayBoundary } from "@/lib/vietnam-date";
import { dailySaleSchema } from "@/lib/validators/sales";

const DAILY_PAYMENT_METHOD = "Khác";

async function dailySaleContext(selectedBatchId?: string) {
  const [products, settings, depreciation, batches] = await Promise.all([
    Product.find({ isActive: true })
      .select(
        "code name groupName productMode sizeName sellingPrice milkMl milkCost toppingCost packagingCost allocatedFixedCost fullCost hasCostWarning",
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
  const freshMilkBottleProduct = findFreshMilkBottleProduct(products);
  const countedProducts = products.flatMap((product) =>
    ["recipe", "composed"].includes(String(product.productMode ?? "")) &&
    String(product._id) !== String(freshMilkBottleProduct?._id ?? "")
      ? [
          {
            id: String(product._id),
            code: String(product.code),
            name: String(product.name),
            groupName: normalizeProductGroupName(product.groupName),
            sellingPrice: Number(product.sellingPrice ?? 0),
            fullCost: Number(product.fullCost ?? 0),
            allocatedFixedCost: Number(product.allocatedFixedCost ?? 0),
          },
        ]
      : [],
  );
  const assumptions = buildDailySaleAssumptionsFromProducts(
    products.flatMap((product) =>
      isSnowMilkRevenueEstimateProduct(product) &&
      String(product._id) !== String(freshMilkBottleProduct?._id ?? "")
        ? [
            {
              milkMl: Number(product.milkMl ?? 0),
              sellingPrice: Number(product.sellingPrice ?? 0),
              milkCost: Number(product.milkCost ?? 0),
              toppingCost: Number(product.toppingCost ?? 0),
              packagingCost: Number(product.packagingCost ?? 0),
              hasCostWarning: product.hasCostWarning,
            },
          ]
        : [],
    ),
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
    freshMilkProduct: freshMilkBottleProduct
      ? {
          id: String(freshMilkBottleProduct._id),
          code: freshMilkBottleProduct.code,
          name: freshMilkBottleProduct.name,
          sellingPrice: Number(freshMilkBottleProduct.sellingPrice ?? 0),
        }
      : null,
    countedProducts,
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
      productQuantities,
      cashReceived,
      bankTransferReceived,
      ...input
    } = parsed.data;
    const totalRevenue = cashReceived + bankTransferReceived;
    const context = await dailySaleContext(batchId);
    const freshMilkBottleUnitPrice = Number(
      context.freshMilkProduct?.sellingPrice ?? 0,
    );
    const unknownProduct = productQuantities.find(
      ({ productId }) =>
        !context.countedProducts.some((product) => product.id === productId),
    );
    if (unknownProduct) {
      return apiError(
        "Danh sách món đã thay đổi. Hãy tải lại trang rồi chốt ngày lần nữa.",
        409,
      );
    }
    const countedProductSales = calculateDailyCountedProducts(
      context.countedProducts,
      productQuantities,
    );
    if (freshMilkBottleCount > 0 && freshMilkBottleUnitPrice <= 0) {
      return apiError(
        "Chưa tìm thấy sản phẩm sữa tươi đóng chai đang hoạt động có giá bán hợp lệ.",
        422,
      );
    }
    const { freshMilkRevenue } = deriveDailyRevenueSplit(
      totalRevenue,
      freshMilkBottleCount,
      freshMilkBottleUnitPrice,
    );
    const snowMilkRevenue =
      totalRevenue - freshMilkRevenue - countedProductSales.revenue;
    if (snowMilkRevenue < 0) {
      return apiError(
        "Doanh thu theo số lượng sản phẩm đang lớn hơn tổng tiền cuối ngày.",
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
    if (snowMilkRevenue > 0 && assumptions.length === 0) {
      return apiError(
        "Danh mục sữa tuyết chưa có dung tích và giá bán hợp lệ để ước tính từ doanh thu.",
        422,
      );
    }
    const totals = calculateDailySaleEstimateFromRevenue(
      snowMilkRevenue,
      assumptions,
    );
    const estimatedProfit = totals.estimatedProfit + countedProductSales.profit;
    // Keep the legacy two-way revenue split balanced for existing dashboard and
    // migration consumers; item detail below preserves the counted-product share.
    const legacySnowMilkRevenue =
      snowMilkRevenue + countedProductSales.revenue;
    const combinedTotals = {
      ...totals,
      totalVariableCost:
        totals.totalVariableCost + countedProductSales.variableCost,
      contributionProfit:
        totals.contributionProfit + countedProductSales.contributionProfit,
      allocatedFixedCost:
        totals.allocatedFixedCost + countedProductSales.allocatedFixedCost,
      estimatedProfit,
      estimatedProfitLow:
        totals.estimatedProfitLow + countedProductSales.profit,
      estimatedProfitHigh:
        totals.estimatedProfitHigh + countedProductSales.profit,
      estimatedMargin: netRevenue > 0 ? estimatedProfit / netRevenue : 0,
    };
    const missingCost = totals.sizeSummaries.find(
      (summary) => summary.quantity > 0 && summary.sampleCount === 0,
    );
    if (missingCost) {
      return apiError(
        `Chưa có sản phẩm quy cách ${missingCost.sizeName} với cost hợp lệ để ước tính.`,
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
          batchName: costBasis?.name ?? "Không bán sữa tuyết",
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
            : { batchName: "Không bán sữa tuyết" }),
          paymentMethod: DAILY_PAYMENT_METHOD,
          items: countedProductSales.items.map((item) => ({
            productId: item.productId,
            productCode: item.productCode,
            productName: item.productName,
            groupName: item.groupName,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            unitVariableCost: item.unitVariableCost,
            revenue: item.revenue,
            variableCost: item.variableCost,
            contributionProfit: item.contributionProfit,
          })),
          ...combinedTotals,
          grossRevenue: netRevenue,
          netRevenue,
          snowMilkRevenue: legacySnowMilkRevenue,
          freshMilkRevenue,
          freshMilkBottleCount,
          freshMilkBottleUnitPrice,
          cashReceived,
          bankTransferReceived,
          cupCountSource: "estimated",
          estimationMethod:
            snowMilkRevenue > 0 && costBasis
              ? `Doanh thu sữa tươi và các món nhập số lượng được tách theo giá bán. Phần còn lại là doanh thu sữa tuyết kiểu cũ; số ly theo dung tích và lượng sữa nền được ước tính theo mẻ ${costBasis.code} - ${costBasis.name}.`
              : "Ngày không bán sữa tuyết; doanh thu được tách theo số lượng sản phẩm và giá bán hiện tại.",
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
