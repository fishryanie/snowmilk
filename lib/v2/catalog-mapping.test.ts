import { describe, expect, test } from "bun:test";
import {
  buildCatalogBackfillPlan,
  validateExplicitCatalogMappings,
} from "./catalog-mapping";
import onlineCatalogMapJson from "@/config/v2-catalog-map.online-snowmilk.json";

describe("v2 explicit catalog mapping", () => {
  test("maps the ten known legacy codes without using names", () => {
    const codes = [
      "M-OREO",
      "L-OREO",
      "M-DUA",
      "L-DUA",
      "M-DAU",
      "L-DAU",
      "M-SC",
      "L-SC",
      "M-CHOCO",
      "L-CHOCO",
    ];
    const result = buildCatalogBackfillPlan(
      codes.map((code, index) => ({
        _id: `legacy-${index}`,
        code,
        name: `Tên không dùng để phân loại ${index}`,
        sellingPrice: code.startsWith("M-") ? 35_000 : 40_000,
      })),
    );
    expect(result.canApply).toBe(true);
    expect(result.skus).toHaveLength(10);
    expect(result.skus.every(({ businessLineCode }) => businessLineCode === "SNOW_MILK")).toBe(true);
    expect(result.catalogProducts).toHaveLength(5);
  });

  test("reports unresolved online products and blocks apply", () => {
    const result = buildCatalogBackfillPlan([
      {
        _id: "online-id",
        code: "SP-001",
        name: "Sữa tươi có đường",
        productMode: "recipe",
        sellingPrice: 20_000,
      },
    ]);
    expect(result.canApply).toBe(false);
    expect(result.issues).toEqual([
      expect.objectContaining({ code: "UNRESOLVED_PRODUCT" }),
    ]);
    expect(result.mappingTemplate[0]).toMatchObject({
      oldProductId: "online-id",
      oldProductCode: "SP-001",
      businessLineCode: "FILL_ME",
    });
  });

  test("accepts an exact id+code mapping but not a code-only override", () => {
    const explicit = validateExplicitCatalogMappings([
      {
        oldProductId: "online-id",
        oldProductCode: "SP-001",
        businessLineCode: "FRESH_MILK",
        catalogProductCode: "FRESH-BOTTLE",
        catalogProductName: "Sữa tươi đóng chai",
        skuCode: "SP-001",
        categoryCode: "FRESH_MILK",
        salesUnit: "bottle",
        fulfillment: "preproduced",
      },
    ]);
    expect(
      buildCatalogBackfillPlan(
        [
          {
            _id: "online-id",
            code: "SP-001",
            name: "Tên bất kỳ",
            sellingPrice: 20_000,
          },
        ],
        explicit,
      ).canApply,
    ).toBe(true);
    expect(
      buildCatalogBackfillPlan(
        [
          {
            _id: "different-id",
            code: "SP-001",
            name: "Tên bất kỳ",
            sellingPrice: 20_000,
          },
        ],
        explicit,
      ).canApply,
    ).toBe(false);
  });

  test("resolves all 12 online products with the exact SP-001/SP-002 map", () => {
    const snowCodes = [
      "M-OREO",
      "L-OREO",
      "M-DUA",
      "L-DUA",
      "M-DAU",
      "L-DAU",
      "M-SC",
      "L-SC",
      "M-CHOCO",
      "L-CHOCO",
    ];
    const products = [
      ...snowCodes.map((code, index) => ({
        _id: `snow-online-${index}`,
        code,
        name: `Sữa Tuyết fixture ${index}`,
        sellingPrice: code.startsWith("M-") ? 35_000 : 40_000,
      })),
      {
        _id: "6a7741e81977b7f8b9e70279",
        code: "SP-001",
        name: "Sữa tươi có đường",
        sellingPrice: 20_000,
        productMode: "recipe",
        recipeId: "6a7741e81977b7f8b9e70278",
        recipeCode: "CT-001",
      },
      {
        _id: "6a7752b41977b7f8b9e7027c",
        code: "SP-002",
        name: "Sữa tươi không đường",
        sellingPrice: 20_000,
        productMode: "recipe",
        recipeId: "6a7752b41977b7f8b9e7027b",
        recipeCode: "CT-002",
      },
    ];
    const explicit = validateExplicitCatalogMappings(onlineCatalogMapJson);
    const result = buildCatalogBackfillPlan(products, explicit);

    expect(result.canApply).toBe(true);
    expect(result.issues).toEqual([]);
    expect(result.mappingTemplate).toEqual([]);
    expect(result.skus).toHaveLength(12);
    expect(result.skuPrices).toHaveLength(12);
    expect(result.catalogProducts).toHaveLength(6);
    expect(
      result.skus
        .filter(({ code }) => code === "SP-001" || code === "SP-002")
        .map(({ code, businessLineCode, legacySourceId }) => ({
          code,
          businessLineCode,
          legacySourceId,
        })),
    ).toEqual([
      {
        code: "SP-001",
        businessLineCode: "FRESH_MILK",
        legacySourceId: "6a7741e81977b7f8b9e70279",
      },
      {
        code: "SP-002",
        businessLineCode: "FRESH_MILK",
        legacySourceId: "6a7752b41977b7f8b9e7027c",
      },
    ]);
  });
});
