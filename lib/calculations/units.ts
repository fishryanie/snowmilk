type UnitDefinition = {
  dimension: "mass" | "volume";
  baseFactor: number;
  canonical: string;
  label: string;
};

const unitAliases = new Map<string, UnitDefinition>([
  ["ml", { dimension: "volume", baseFactor: 1, canonical: "ml", label: "ml" }],
  ["milliliter", { dimension: "volume", baseFactor: 1, canonical: "ml", label: "ml" }],
  ["millilitre", { dimension: "volume", baseFactor: 1, canonical: "ml", label: "ml" }],
  ["l", { dimension: "volume", baseFactor: 1_000, canonical: "l", label: "lít" }],
  ["lit", { dimension: "volume", baseFactor: 1_000, canonical: "l", label: "lít" }],
  ["liter", { dimension: "volume", baseFactor: 1_000, canonical: "l", label: "lít" }],
  ["litre", { dimension: "volume", baseFactor: 1_000, canonical: "l", label: "lít" }],
  ["lít", { dimension: "volume", baseFactor: 1_000, canonical: "l", label: "lít" }],
  ["g", { dimension: "mass", baseFactor: 1, canonical: "g", label: "g" }],
  ["gram", { dimension: "mass", baseFactor: 1, canonical: "g", label: "g" }],
  ["kg", { dimension: "mass", baseFactor: 1_000, canonical: "kg", label: "kg" }],
  ["kilogram", { dimension: "mass", baseFactor: 1_000, canonical: "kg", label: "kg" }],
]);

function normalizeUnit(unit: string) {
  return unit.trim().toLocaleLowerCase("vi");
}

function definitionFor(unit: string) {
  return unitAliases.get(normalizeUnit(unit));
}

export function convertQuantity(
  quantity: number,
  fromUnit: string,
  toUnit: string,
) {
  const normalizedFrom = normalizeUnit(fromUnit);
  const normalizedTo = normalizeUnit(toUnit);
  if (normalizedFrom === normalizedTo) return quantity;

  const from = definitionFor(fromUnit);
  const to = definitionFor(toUnit);
  if (!from || !to || from.dimension !== to.dimension) {
    throw new Error(`Không thể quy đổi từ ${fromUnit} sang ${toUnit}.`);
  }
  return (quantity * from.baseFactor) / to.baseFactor;
}

export function compatibleUnitOptions(costUnit: string) {
  const definition = definitionFor(costUnit);
  if (!definition) return [{ value: costUnit, label: costUnit }];

  const seen = new Set<string>();
  return [...unitAliases.values()].flatMap((candidate) => {
    if (
      candidate.dimension !== definition.dimension ||
      seen.has(candidate.canonical)
    ) {
      return [];
    }
    seen.add(candidate.canonical);
    return [{ value: candidate.label, label: candidate.label }];
  });
}
