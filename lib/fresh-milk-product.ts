type FreshMilkProductCandidate = {
  code?: string;
  name?: string;
  productMode?: string;
  sellingPrice?: number;
};

function searchKey(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .toLowerCase();
}

export function findFreshMilkBottleProduct<
  T extends FreshMilkProductCandidate,
>(products: T[]) {
  return (
    products
      .filter(
        (product) =>
          product.productMode === "recipe" &&
          searchKey(product.name ?? "").includes("sua tuoi") &&
          Number(product.sellingPrice ?? 0) > 0,
      )
      .toSorted((left, right) =>
        String(left.code ?? "").localeCompare(String(right.code ?? "")),
      )[0] ?? null
  );
}
