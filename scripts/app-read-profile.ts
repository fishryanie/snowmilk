export {};

/** Read-only HTTP timings. Run against `next start`, not the dev compiler. */
const base = process.env.APP_PROFILE_URL ?? "http://localhost:3002";
const pages = [
  "/dashboard", "/sales", "/ingredients", "/products", "/costing", "/batches",
  "/purchases", "/expenses", "/payroll", "/divestments", "/equipment", "/settings",
 "/reports", "/employees", "/storefront/orders",
  "/storefront/products", "/storefront/settings",
];
const apis = [
  "/api/products?limit=500", "/api/ingredients?limit=500", "/api/batches?limit=500",
  "/api/purchases?limit=500", "/api/settings", "/api/sales?limit=50", "/api/reports/dashboard",
  "/api/product-onboarding", "/api/payroll/employees",
  "/api/payroll/withdrawals", "/api/payroll/periods", "/api/divestment-claims",
];

for (const path of [...pages, ...apis]) {
  const times: number[] = [];
  let status = 0;
  let bytes = 0;
  for (let run = 0; run < 4; run++) {
    const start = performance.now();
    const response = await fetch(new URL(path, base), { redirect: "manual" });
    const body = await response.arrayBuffer();
    times.push(Math.round(performance.now() - start));
    status = response.status;
    bytes = body.byteLength;
  }
  console.log(JSON.stringify({
    path, status, firstMs: times[0], warmMedianMs: times.slice(1).sort((a, b) => a - b)[1], bytes,
  }));
}
