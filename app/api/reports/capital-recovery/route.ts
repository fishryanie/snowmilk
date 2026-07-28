import { apiError, apiSuccess, errorMessage } from "@/lib/api-response";
import { calculateCapitalRecovery } from "@/lib/calculations/capital-recovery";
import { calculateOwnerInvestmentTotal } from "@/lib/investment-total";
import { connectMongo } from "@/lib/mongodb";
import { Divestment } from "@/models/Divestment";
import { Equipment } from "@/models/Equipment";
import { Purchase } from "@/models/Purchase";

export async function GET() {
  try {
    await connectMongo();
    const [equipment, purchases, divestments] = await Promise.all([
      Equipment.find({})
        .select("_id totalAmount fundingSource")
        .lean(),
      Purchase.find({})
        .select("_id totalAmount fundingSource")
        .lean(),
      Divestment.find({})
        .select("amount claims.sourceId claims.sourceType claims.amount")
        .lean(),
    ]);
    const investmentTotal = calculateOwnerInvestmentTotal({
      purchases: purchases.map((purchase) => ({
        id: String(purchase._id),
        amount: Number(purchase.totalAmount ?? 0),
        fundingSource: purchase.fundingSource,
      })),
      equipment: equipment.map((item) => ({
        id: String(item._id),
        amount: Number(item.totalAmount ?? 0),
        fundingSource: item.fundingSource,
      })),
      claims: divestments.flatMap((divestment) =>
        (divestment.claims ?? []).map((claim: {
          sourceId?: unknown;
          sourceType?: unknown;
          amount?: unknown;
        }) => ({
          sourceId: String(claim.sourceId ?? ""),
          sourceType:
            claim.sourceType === "equipment"
              ? ("equipment" as const)
              : ("purchase" as const),
          amount: Number(claim.amount ?? 0),
        })),
      ),
    });
    const withdrawnTotal = divestments.reduce(
      (sum, divestment) => sum + Number(divestment.amount ?? 0),
      0,
    );

    return apiSuccess(
      calculateCapitalRecovery(investmentTotal, withdrawnTotal),
    );
  } catch (error) {
    return apiError(errorMessage(error), 503);
  }
}
