import { prefetchApiData } from "@/lib/api-client";
import { vietnamDateKey } from "@/lib/vietnam-date";

/** Keep these keys identical to the initial queries used by each workspace. */
export function routeDataUrls(path: string, v2 = false, now = new Date()): string[] {
  const date = vietnamDateKey(now);
  const monthStart = `${date.slice(0, 7)}-01`;
  const dashboard = `/api/reports/dashboard?from=${monthStart}&to=${date}`;
  switch (path) {
    case "/dashboard": return [dashboard];
    case "/sales": return ["/api/sales?limit=50"];
    case "/products": return ["/api/product-onboarding"];
    case "/ingredients": return ["/api/ingredients?limit=500"];
    case "/purchases": return v2
      ? ["/api/v2/catalog/purchase-items", "/api/v2/purchase-receipts"]
      : ["/api/purchases?limit=500", "/api/ingredients?limit=500", "/api/reports/topping-ranking?refresh=0"];
    case "/costing": return ["/api/products?limit=500", "/api/batches?limit=500"];
    case "/batches": return ["/api/batches?limit=500", "/api/ingredients?limit=500", "/api/settings"];
    case "/expenses": return ["/api/expenses"];
    case "/equipment": return ["/api/equipment"];
    case "/divestments": return ["/api/divestment-claims?v=0"];
    case "/payroll": return [dashboard, "/api/payroll/employees", "/api/payroll/withdrawals", "/api/payroll/periods"];
    case "/employees": return ["/api/v2/memberships"];
    case "/reports": {
      const from = new Date(now);
      from.setUTCDate(from.getUTCDate() - 29);
      return ["/api/v2/catalog/skus", `/api/v2/reports/revenue?from=${vietnamDateKey(from)}&to=${date}`];
    }
    case "/settings": return ["/api/settings"];
    case "/storefront/orders": return ["/api/v2/auth/me", "/api/storefront-admin/orders?"];
    case "/storefront/products": return ["/api/v2/auth/me", "/api/storefront-admin/catalog"];
    case "/storefront/settings": return ["/api/v2/auth/me", "/api/storefront-admin/settings"];
    default: return [];
  }
}

export function prefetchRouteData(path: string, v2 = false) {
  for (const url of routeDataUrls(path, v2)) prefetchApiData(url);
}
