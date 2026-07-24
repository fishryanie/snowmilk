import { calculateCapitalRecovery } from "@/lib/calculations/capital-recovery";
import {
  calculateBusinessCashBalance,
  divestmentClaimKey,
  resolveClaimSelection,
  type ClaimableInvestment,
  type DivestmentClaimSnapshot,
} from "@/lib/divestment-claims";
import { connectMongo } from "@/lib/mongodb";
import {
  DEFAULT_LEGACY_PURCHASE_FUNDING_SOURCE,
  ownerCapitalPurchaseFilter,
} from "@/lib/purchase-funding";
import { vietnamDateKey } from "@/lib/vietnam-date";
import { Divestment } from "@/models/Divestment";
import { Equipment } from "@/models/Equipment";
import { Purchase } from "@/models/Purchase";
import { Sale } from "@/models/Sale";

type ClaimInput = {
  withdrawalDate: Date;
  sourceKeys: string[];
  note?: string;
};

type SaleRecord = {
  saleDate: Date;
  entryMode?: string;
  netRevenue?: number;
};

type PurchaseRecord = {
  _id: unknown;
  purchaseDate: Date;
  itemCode?: string;
  itemName?: string;
  category?: string;
  totalAmount?: number;
  fundingSource?: string | null;
};

type EquipmentRecord = {
  _id: unknown;
  purchaseDate: Date;
  code?: string;
  name?: string;
  category?: string;
  totalAmount?: number;
};

type DivestmentRecord = {
  _id: unknown;
  withdrawalDate: Date;
  amount?: number;
  note?: string;
  claims?: Array<{
    sourceKey?: string;
    sourceType?: "equipment" | "purchase";
    sourceId?: string;
    sourceCode?: string;
    sourceName?: string;
    sourceCategory?: string;
    sourceDate?: Date;
    amount?: number;
  }>;
  createdAt?: Date;
};

function isOwnerFundedPurchase(purchase: PurchaseRecord) {
  return (
    (purchase.fundingSource ??
      DEFAULT_LEGACY_PURCHASE_FUNDING_SOURCE) === "owner_capital"
  );
}

function safeAmount(value: unknown) {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount) ? Math.max(0, amount) : 0;
}

function dateIso(value: Date | string) {
  return new Date(value).toISOString();
}

async function buildClaimContext() {
  await connectMongo();
  const [sales, purchases, equipment, divestments] =
    await Promise.all([
      Sale.find({})
        .select("saleDate entryMode netRevenue")
        .lean<SaleRecord[]>(),
      Purchase.find({})
        .select(
          "purchaseDate itemCode itemName category totalAmount fundingSource",
        )
        .lean<PurchaseRecord[]>(),
      Equipment.find({})
        .select("purchaseDate code name category totalAmount")
        .lean<EquipmentRecord[]>(),
      Divestment.find({})
        .sort({ withdrawalDate: -1, createdAt: -1 })
        .lean<DivestmentRecord[]>(),
    ]);

  const dailySummaryDates = new Set(
    sales
      .filter((sale) => sale.entryMode === "daily-summary")
      .map((sale) => vietnamDateKey(new Date(sale.saleDate))),
  );
  const effectiveSales = sales.filter((sale) => {
    const day = vietnamDateKey(new Date(sale.saleDate));
    return (
      sale.entryMode === "daily-summary" || !dailySummaryDates.has(day)
    );
  });
  const claimedSourceKeys = new Set(
    divestments.flatMap((divestment) =>
      (divestment.claims ?? [])
        .map((claim) => claim.sourceKey)
        .filter((key): key is string => Boolean(key)),
    ),
  );
  const purchasesById = new Map(
    purchases.map((purchase) => [String(purchase._id), purchase]),
  );
  const claimedPurchaseInvestment = divestments.reduce(
    (sum, divestment) =>
      sum +
      (divestment.claims ?? []).reduce((claimSum, claim) => {
        if (claim.sourceType !== "purchase") return claimSum;
        const purchase = purchasesById.get(String(claim.sourceId ?? ""));
        return purchase && isOwnerFundedPurchase(purchase)
          ? claimSum
          : claimSum + safeAmount(claim.amount);
      }, 0),
    0,
  );
  const withdrawnTotal = divestments.reduce(
    (sum, divestment) => sum + safeAmount(divestment.amount),
    0,
  );
  const investmentTotal =
    equipment.reduce(
      (sum, item) => sum + safeAmount(item.totalAmount),
      0,
    ) +
    purchases
      .filter(isOwnerFundedPurchase)
      .reduce(
        (sum, purchase) => sum + safeAmount(purchase.totalAmount),
        0,
      ) +
    claimedPurchaseInvestment;
  const summary = calculateCapitalRecovery(
    investmentTotal,
    withdrawnTotal,
  );
  const totalRevenue = effectiveSales.reduce(
    (sum, sale) => sum + safeAmount(sale.netRevenue),
    0,
  );
  const salesFundedPurchaseTotal = purchases
    .filter((purchase) => purchase.fundingSource === "sales_revenue")
    .reduce(
      (sum, purchase) => sum + safeAmount(purchase.totalAmount),
      0,
    );
  const businessCash = calculateBusinessCashBalance(
    totalRevenue,
    salesFundedPurchaseTotal,
  );
  const purchaseItems: ClaimableInvestment[] = purchases
    .filter(isOwnerFundedPurchase)
    .map((purchase) => {
      const sourceId = String(purchase._id);
      return {
        key: divestmentClaimKey("purchase", sourceId),
        sourceType: "purchase",
        sourceId,
        code: String(purchase.itemCode ?? ""),
        name: String(purchase.itemName ?? "Phiếu nhập hàng"),
        category: String(purchase.category ?? ""),
        purchaseDate: dateIso(purchase.purchaseDate),
        amount: safeAmount(purchase.totalAmount),
      };
    });
  const unclaimedItems = purchaseItems
    .filter(
      (item) => item.amount > 0 && !claimedSourceKeys.has(item.key),
    )
    .toSorted(
      (left, right) =>
        left.amount - right.amount ||
        left.purchaseDate.localeCompare(right.purchaseDate),
    );
  const withdrawalLimit = Math.max(0, businessCash.remainingBalance);
  const eligibleItems = unclaimedItems.filter(
    (item) => item.amount < withdrawalLimit,
  );

  return {
    summary,
    businessCash,
    withdrawalLimit,
    eligibleItems,
    unavailableItemCount: unclaimedItems.length - eligibleItems.length,
    unclaimedItems,
    divestments: divestments.map((divestment) => ({
      id: String(divestment._id),
      withdrawalDate: dateIso(divestment.withdrawalDate),
      amount: safeAmount(divestment.amount),
      note: String(divestment.note ?? ""),
      claims: (divestment.claims ?? []).map((claim) => ({
        sourceKey: String(claim.sourceKey ?? ""),
        sourceType: claim.sourceType ?? "purchase",
        sourceId: String(claim.sourceId ?? ""),
        sourceCode: String(claim.sourceCode ?? ""),
        sourceName: String(claim.sourceName ?? ""),
        sourceCategory: String(claim.sourceCategory ?? ""),
        sourceDate: claim.sourceDate
          ? dateIso(claim.sourceDate)
          : dateIso(divestment.withdrawalDate),
        amount: safeAmount(claim.amount),
      })),
    })),
  };
}

export async function getDivestmentClaimContext() {
  const context = await buildClaimContext();
  return {
    summary: context.summary,
    businessCash: context.businessCash,
    withdrawalLimit: context.withdrawalLimit,
    eligibleItems: context.eligibleItems,
    unavailableItemCount: context.unavailableItemCount,
    divestments: context.divestments,
  };
}

export async function createDivestmentClaim(input: ClaimInput) {
  const context = await buildClaimContext();
  const { selectedItems, total } = resolveClaimSelection(
    context.unclaimedItems,
    input.sourceKeys,
    context.withdrawalLimit,
  );
  const withdrawalDate = new Date(input.withdrawalDate);
  const latestSourceDate = selectedItems.reduce(
    (latest, item) =>
      Math.max(latest, new Date(item.purchaseDate).getTime()),
    0,
  );
  if (withdrawalDate.getTime() < latestSourceDate) {
    throw new Error(
      "Ngày rút vốn không thể sớm hơn ngày mua của khoản đã chọn.",
    );
  }
  const claims: DivestmentClaimSnapshot[] = selectedItems.map((item) => ({
    sourceKey: item.key,
    sourceType: item.sourceType,
    sourceId: item.sourceId,
    sourceCode: item.code,
    sourceName: item.name,
    sourceCategory: item.category,
    sourceDate: item.purchaseDate,
    amount: item.amount,
  }));
  const purchaseIds = selectedItems.map((item) => item.sourceId);

  let createdClaimId: unknown;
  let changedPurchaseIds: string[] = [];
  try {
    const divestment = await Divestment.create({
      withdrawalDate,
      amount: total,
      claims,
      note: input.note?.trim() ?? "",
    });
    createdClaimId = divestment._id;

    const updateResults = await Promise.allSettled(
      purchaseIds.map((purchaseId) =>
        Purchase.findOneAndUpdate(
          {
            _id: purchaseId,
            ...ownerCapitalPurchaseFilter(),
          },
          { $set: { fundingSource: "sales_revenue" } },
        )
          .select("_id")
          .lean(),
      ),
    );
    changedPurchaseIds = updateResults.flatMap((result) =>
      result.status === "fulfilled" && result.value
        ? [String(result.value._id)]
        : [],
    );
    const failedUpdate = updateResults.find(
      (result) => result.status === "rejected",
    );
    if (failedUpdate?.status === "rejected") throw failedUpdate.reason;
    if (changedPurchaseIds.length !== selectedItems.length) {
      throw new Error(
        "Có phiếu nhập vừa đổi nguồn tiền ở thao tác khác. Hãy tải lại danh sách.",
      );
    }

    return divestment;
  } catch (error) {
    if (createdClaimId) {
      const rollback = await Divestment.deleteOne({
        _id: createdClaimId,
      }).catch(() => null);
      if (rollback?.deletedCount) {
        await Purchase.updateMany(
          {
            _id: { $in: changedPurchaseIds },
            fundingSource: "sales_revenue",
          },
          { $set: { fundingSource: "owner_capital" } },
        ).catch(() => undefined);
      }
    }
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === 11000
    ) {
      throw new Error(
        "Một khoản vừa được thu hồi ở thao tác khác. Hãy tải lại danh sách.",
      );
    }
    throw error;
  }
}

export async function deleteDivestmentClaim(id: string) {
  await connectMongo();
  const divestment = await Divestment.findById(id).lean<DivestmentRecord>();
  if (!divestment) return null;

  const purchaseIds = (divestment.claims ?? [])
    .filter((claim) => claim.sourceType === "purchase" && claim.sourceId)
    .map((claim) => String(claim.sourceId));
  const purchasesToRestore =
    purchaseIds.length > 0
      ? await Purchase.find({
          _id: { $in: purchaseIds },
          fundingSource: "sales_revenue",
        })
          .select("_id")
          .lean()
      : [];
  const restoredPurchaseIds = purchasesToRestore.map((purchase) =>
    String(purchase._id),
  );

  if (restoredPurchaseIds.length > 0) {
    await Purchase.updateMany(
      {
        _id: { $in: restoredPurchaseIds },
        fundingSource: "sales_revenue",
      },
      { $set: { fundingSource: "owner_capital" } },
    );
  }

  try {
    return await Divestment.findByIdAndDelete(id);
  } catch (error) {
    if (restoredPurchaseIds.length > 0) {
      await Purchase.updateMany(
        {
          _id: { $in: restoredPurchaseIds },
          fundingSource: "owner_capital",
        },
        { $set: { fundingSource: "sales_revenue" } },
      ).catch(() => undefined);
    }
    throw error;
  }
}
