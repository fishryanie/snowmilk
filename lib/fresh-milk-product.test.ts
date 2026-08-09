import { describe, expect, test } from "bun:test";
import { findFreshMilkBottleProduct } from "./fresh-milk-product";

describe("fresh milk bottle product", () => {
  test("finds the configured recipe product with its selling price", () => {
    expect(
      findFreshMilkBottleProduct([
        {
          code: "M-SC",
          name: "Sữa chua sấy - Size M",
          sellingPrice: 35_000,
        },
        {
          code: "SP-001",
          name: "Sữa tươi có đường",
          productMode: "recipe",
          sellingPrice: 20_000,
        },
      ]),
    ).toMatchObject({ code: "SP-001", sellingPrice: 20_000 });
  });

  test("does not mistake a legacy snow-milk product for bottled milk", () => {
    expect(
      findFreshMilkBottleProduct([
        {
          code: "M-FRESH",
          name: "Sữa tươi topping - Size M",
          productMode: "legacy",
          sellingPrice: 35_000,
        },
      ]),
    ).toBeNull();
  });
});
