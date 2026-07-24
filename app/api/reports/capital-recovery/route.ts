import { apiError, apiSuccess, errorMessage } from "@/lib/api-response";
import { calculateCapitalRecovery } from "@/lib/calculations/capital-recovery";
import { connectMongo } from "@/lib/mongodb";
import { ownerCapitalPurchaseFilter } from "@/lib/purchase-funding";
import { Divestment } from "@/models/Divestment";
import { Equipment } from "@/models/Equipment";
import { Purchase } from "@/models/Purchase";

export async function GET() {
  try {
    await connectMongo();
    const [equipmentInvestment, purchaseInvestment, withdrawn] =
      await Promise.all([
        Equipment.aggregate([
          { $group: { _id: null, total: { $sum: "$totalAmount" } } },
        ]),
        Purchase.aggregate([
          { $match: ownerCapitalPurchaseFilter() },
          { $group: { _id: null, total: { $sum: "$totalAmount" } } },
        ]),
        Divestment.aggregate([
          { $group: { _id: null, total: { $sum: "$amount" } } },
        ]),
      ]);

    const investmentTotal =
      (equipmentInvestment[0]?.total ?? 0) +
      (purchaseInvestment[0]?.total ?? 0);

    return apiSuccess(
      calculateCapitalRecovery(
        investmentTotal,
        withdrawn[0]?.total ?? 0,
      ),
    );
  } catch (error) {
    return apiError(errorMessage(error), 503);
  }
}
