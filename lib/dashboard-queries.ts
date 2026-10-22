import type { PipelineStage } from "mongoose";

type DateRange = { $gte: Date; $lte: Date };

export type FinanceSummary = {
  total: number;
  salesFundedTotal: number;
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
};

export const emptyFinanceSummary: FinanceSummary = {
  total: 0,
  salesFundedTotal: 0,
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
    },
  }];
}

// One collection scan replaces separate period, total and funding reads.
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

// Revenue is derived when read, never duplicated in daily closing documents.
export const cumulativeSalesPipeline: PipelineStage[] = [{
  $group: {
    _id: null,
    totalRevenue: { $sum: { $add: ["$cashReceived", "$bankTransferReceived"] } },
  },
}];
