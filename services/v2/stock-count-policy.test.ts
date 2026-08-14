import { describe, expect, test } from "bun:test";
import {
  assertCompleteOpeningCount,
  assertOpeningCostPolicy,
} from "@/services/v2/stock-count-policy";

const costLine = {
  inventoryItemId: "507f1f77bcf86cd799439011",
  countedQuantity: "10",
  unitCostVnd: "1250.5",
  note: "",
};

describe("opening stock cost policy", () => {
  test("owner can confirm cost only on the server-detected opening count", () => {
    expect(() =>
      assertOpeningCostPolicy(
        { role: "owner" },
        { lines: [costLine] },
        "opening",
      ),
    ).not.toThrow();
    expect(() =>
      assertOpeningCostPolicy(
        { role: "owner" },
        { lines: [costLine] },
        "cycle",
      ),
    ).toThrow("phiếu mở kho đầu tiên");
  });

  test("staff can cycle-count but cannot post the one-time opening", () => {
    expect(() =>
      assertOpeningCostPolicy(
        { role: "staff" },
        { lines: [{ ...costLine, unitCostVnd: undefined }] },
        "cycle",
      ),
    ).not.toThrow();
    expect(() =>
      assertOpeningCostPolicy(
        { role: "staff" },
        { lines: [costLine] },
        "opening",
      ),
    ).toThrow("Chỉ owner");
  });

  test("opening count must cover every active inventory item exactly once", () => {
    expect(() =>
      assertCompleteOpeningCount(["potato", "corn"], ["corn", "potato"]),
    ).not.toThrow();
    expect(() =>
      assertCompleteOpeningCount(["potato", "corn"], ["potato"]),
    ).toThrow("toàn bộ hàng hóa");
  });
});
