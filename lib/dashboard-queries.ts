import type { PipelineStage } from "mongoose";

type DateRange = { $gte: Date; $lte: Date };

export type FinanceSummary = {
  total: number;
  salesFundedTotal: number;
  missingFunding: number;
};

export type InvestmentFacet = {
  period: Array<{ purchaseDate: Date; totalAmount: number }>;
  investments: Array<{
    _id: unknown;
    totalAmount: number;
    fundingSource?: string | null;
  }>;
  summary: FinanceSummary[];
};

export type ExpenseFacet = {
  period: Array<{
    expenseDate: Date;
    amount: number;
    paymentStatus?: string | null;
    accountingTreatment?: string;
  }>;
  summary: FinanceSummary[];
};

export type CumulativeSalesSummary = {
  totalRevenue: number;
  paymentMismatchCount: number;
  lastSaleDate: Date | null;
};

export const emptyFinanceSummary: FinanceSummary = {
  total: 0,
  salesFundedTotal: 0,
  missingFunding: 0,
};

// Null and absent paymentStatus both mean paid for legacy records.
const paidExpense = {
  $eq: [{ $ifNull: ["$paymentStatus", "paid"] }, "paid"],
};

function financeSummary(amount: string, paid: boolean): PipelineStage.FacetPipelineStage[] {
  const amountExpression = paid
    ? { $cond: [paidExpense, { $ifNull: [amount, 0] }, 0] }
    : { $ifNull: [amount, 0] };
  return [{
    $group: {
      _id: null,
      total: { $sum: amountExpression },
      salesFundedTotal: {
        $sum: {
          $cond: [
            { $eq: ["$fundingSource", "sales_revenue"] },
            amountExpression,
            0,
          ],
        },
      },
      missingFunding: {
        $sum: {
          $cond: [{ $eq: [{ $ifNull: ["$fundingSource", null] }, null] }, 1, 0],
        },
      },
    },
  }];
}

// One collection scan replaces separate period, total, funding and health reads.
export function investmentFacetPipeline(dateRange: DateRange): PipelineStage[] {
  return [{
    $facet: {
      period: [
        { $match: { purchaseDate: dateRange } },
        { $project: { _id: 0, purchaseDate: 1, totalAmount: 1 } },
      ],
      summary: financeSummary("$totalAmount", false),
      investments: [
        // The capital recovery calculation only needs current owner-funded
        // sources. Claims on other/deleted sources retain their snapshot amount.
        { $match: { fundingSource: { $in: ["owner_capital", null] } } },
        { $project: { _id: 1, totalAmount: 1, fundingSource: 1 } },
      ],
    },
  }];
}

export function expenseFacetPipeline(dateRange: DateRange): PipelineStage[] {
  return [{
    $facet: {
      period: [
        { $match: { expenseDate: dateRange } },
        { $project: {
          _id: 0, expenseDate: 1, amount: 1, paymentStatus: 1, accountingTreatment: 1,
        } },
      ],
      summary: financeSummary("$amount", true),
    },
  }];
}

// Keep daily-summary precedence over itemized rows on the same Vietnam day.
// Return just totals/health instead of transferring the entire sales history.
export const cumulativeSalesPipeline: PipelineStage[] = [
  {
    $group: {
      _id: { $dateToString: {
        date: "$saleDate", format: "%Y-%m-%d", timezone: "Asia/Ho_Chi_Minh",
      } },
      hasDailySummary: {
        $max: { $cond: [{ $eq: ["$entryMode", "daily-summary"] }, 1, 0] },
      },
      dailyRevenue: { $sum: {
        $cond: [{ $eq: ["$entryMode", "daily-summary"] }, { $ifNull: ["$netRevenue", 0] }, 0],
      } },
      itemizedRevenue: { $sum: {
        $cond: [{ $eq: ["$entryMode", "daily-summary"] }, 0, { $ifNull: ["$netRevenue", 0] }],
      } },
      lastSaleDate: { $max: "$saleDate" },
      paymentMismatchCount: { $sum: {
        $cond: [{ $and: [
          { $eq: ["$entryMode", "daily-summary"] },
          { $ne: [
            { $add: [{ $ifNull: ["$cashReceived", 0] }, { $ifNull: ["$bankTransferReceived", 0] }] },
            { $ifNull: ["$netRevenue", 0] },
          ] },
        ] }, 1, 0],
      } },
    },
  },
  {
    $group: {
      _id: null,
      totalRevenue: { $sum: {
        $cond: [{ $eq: ["$hasDailySummary", 1] }, "$dailyRevenue", "$itemizedRevenue"],
      } },
      paymentMismatchCount: { $sum: "$paymentMismatchCount" },
      lastSaleDate: { $max: "$lastSaleDate" },
    },
  },
];
