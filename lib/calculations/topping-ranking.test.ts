import { describe, expect, test } from "bun:test";
import { calculateToppingRanking } from "./topping-ranking";

const updatedAt = new Date("2026-08-17T08:00:00.000Z");

describe("calculateToppingRanking", () => {
  test("quy đổi gram sang kg và xếp hạng theo tổng lượng nhập", () => {
    const report = calculateToppingRanking({
      asOfDate: "2026-08-17",
      updatedAt,
      ingredients: [
        { code: "TP001", name: "Oreo", category: "Topping" },
        { code: "TP002", name: "Dừa non", category: "Topping" },
        { code: "TP009", name: "Trân Châu", category: "Topping" },
      ],
      purchases: [
        {
          itemCode: "TP001",
          itemName: "Oreo",
          category: "Topping",
          convertedQuantity: 2,
          costUnit: "kg",
          purchaseDate: "2026-08-12T00:00:00.000Z",
        },
        {
          itemCode: "TP002",
          itemName: "Dừa non",
          category: "Topping",
          convertedQuantity: 2500,
          costUnit: "gram",
          purchaseDate: "2026-08-15T00:00:00.000Z",
        },
      ],
    });

    expect(report.totalKg).toBe(4.5);
    expect(report.purchaseCount).toBe(2);
    expect(report.ranking.map((row) => [row.rank, row.name, row.totalKg])).toEqual([
      [1, "Dừa non", 2.5],
      [2, "Oreo", 2],
      [3, "Trân Châu", 0],
    ]);
    expect(report.ranking[0].sharePercent).toBe(55.6);
    expect(report.ranking[0].lastPurchaseDate).toBe("2026-08-15");
  });

  test("giữ đồng hạng và dùng kiểu xếp hạng thi đấu", () => {
    const report = calculateToppingRanking({
      asOfDate: "2026-08-17",
      updatedAt,
      ingredients: [],
      purchases: ["Dâu", "Kiwi", "Việt quất", "Trân châu"].map(
        (name, index) => ({
          itemCode: `TP00${index + 1}`,
          itemName: name,
          category: "Topping",
          convertedQuantity: index < 3 ? 3 : 0,
          costUnit: "kg",
          purchaseDate: "2026-08-10T00:00:00.000Z",
        }),
      ),
    });

    expect(report.ranking.map((row) => row.rank)).toEqual([1, 1, 1, 4]);
  });

  test("bỏ ngày tương lai và báo các đơn vị không thể so sánh theo khối lượng", () => {
    const report = calculateToppingRanking({
      asOfDate: "2026-08-17",
      updatedAt,
      ingredients: [],
      purchases: [
        {
          itemCode: "TP001",
          itemName: "Oreo",
          category: "Topping",
          convertedQuantity: 10,
          costUnit: "bịch",
          purchaseDate: "2026-08-10T00:00:00.000Z",
        },
        {
          itemCode: "TP002",
          itemName: "Dừa non",
          category: "Topping",
          convertedQuantity: 100,
          costUnit: "kg",
          purchaseDate: "2026-08-18T00:00:00+07:00",
        },
      ],
    });

    expect(report.totalKg).toBe(0);
    expect(report.purchaseCount).toBe(0);
    expect(report.excludedPurchaseCount).toBe(1);
    expect(report.excludedUnits).toEqual(["bịch"]);
  });
});
