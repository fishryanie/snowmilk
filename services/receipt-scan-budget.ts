import "server-only";
import { ReceiptScanBudget } from "@/models/ReceiptScanBudget";

export class ReceiptBudgetError extends Error {
  readonly status = 429;
}

export async function consumeReceiptScanBudget(now = Date.now()) {
  // Database caps apply across serverless instances and bound paid AI usage
  // even while the legacy API's authentication rollout is disabled.
  for (const [windowMs, maximum] of [[60000, 6], [3600000, 30]]) {
    const window = Math.floor(now / windowMs);
    const usage = await ReceiptScanBudget.findOneAndUpdate(
        { _id: `receipt:${windowMs}:${window}` },
        { $inc: { count: 1 }, $setOnInsert: { expiresAt: new Date((window + 1) * windowMs) } },
        { upsert: true, returnDocument: "after", setDefaultsOnInsert: false },
      );
    if (!usage || usage.count > maximum) {
      throw new ReceiptBudgetError("Đã đạt giới hạn đọc bill trong khoảng thời gian này. Hãy thử lại sau.");
    }
  }
}
