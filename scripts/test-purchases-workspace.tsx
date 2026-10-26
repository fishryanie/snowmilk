/** Real React/Ant Design checks with fake HTTP; never connects to the app DB. */
import assert from 'node:assert/strict';
import type { Window } from 'happy-dom';
import { vietnamDateKey } from '../lib/vietnam-date';

const window = globalThis.window as unknown as Window;
const React = await import('react');
const { act } = React;
const { createRoot } = await import('react-dom/client');
const { App } = await import('antd');
const { default: PurchasesPage } = await import('../app/purchases/page');
const originalFetch = globalThis.fetch;
const calls: string[] = [];
const pending = new Map<string, (response: Response) => void>();
const today = vietnamDateKey(new Date());
const todayUrl = `/api/purchases?limit=500&from=${today}&to=${today}`;
const rankingUrl = '/api/reports/topping-ranking?refresh=0';
const ranking = {
  asOfDate: today, updatedAt: new Date().toISOString(), totalKg: 3, purchaseCount: 1,
  excludedPurchaseCount: 0, excludedUnits: [],
  ranking: [{ rank: 1, code: 'TP001', name: 'Topping thử', totalKg: 3, sharePercent: 100, purchaseCount: 1, lastPurchaseDate: today }],
};
const purchase = {
  id: 'test-purchase', purchaseDate: `${today}T23:30:00+07:00`, itemCode: 'TP001',
  itemName: 'Hàng nhập thử', category: 'Topping', packageCount: 1, packageQuantity: 3,
  costUnit: 'kg', actualPackagePrice: 90_000, convertedQuantity: 3, totalAmount: 90_000,
  fundingSource: 'sales_revenue',
};

globalThis.fetch = (async (input: RequestInfo | URL) => {
  const url = String(input);
  calls.push(url);
  if (url === '/api/ingredients?limit=500') return Response.json({ success: true, data: [] });
  if (url === rankingUrl) return Response.json({ success: true, data: ranking });
  if (url.startsWith('/api/purchases?')) return new Promise<Response>(resolve => pending.set(url, resolve));
  throw new Error(`Unexpected request: ${url}`);
}) as typeof fetch;

const container = document.createElement('div');
document.body.append(container);
const root = createRoot(container as unknown as HTMLDivElement);
const text = () => container.textContent ?? '';
async function click(label: string, role = 'button') {
  const selector = role === 'tab' ? '[role="tab"]' : 'button';
  const element = [...container.querySelectorAll(selector)].find(node => node.textContent?.trim() === label);
  assert.ok(element, `Missing ${role}: ${label}`);
  await act(async () => { (element as unknown as HTMLElement).click(); });
}
async function respond(url: string, data: unknown) {
  const resolve = pending.get(url);
  assert.ok(resolve, `No pending request: ${url}`);
  pending.delete(url);
  await act(async () => resolve(Response.json({ success: true, data })));
}

try {
  await act(async () => root.render(<App><PurchasesPage /></App>));
  assert.ok(calls.includes(todayUrl), 'First visit must query only today');
  assert.ok(!calls.includes('/api/purchases?limit=500'), 'First visit cannot fetch all history');
  assert.ok(!calls.includes(rankingUrl), 'Topping must not fetch before opening its tab');
  assert.ok(text().includes('Hôm nay'), 'Date controls stay visible while loading');
  await respond(todayUrl, [purchase]);
  assert.ok(text().includes(purchase.itemName), 'Vietnam date must include late evening purchases');

  await click('7 ngày qua');
  const weekUrl = calls.filter(url => url.startsWith('/api/purchases?')).at(-1)!;
  assert.notEqual(weekUrl, todayUrl);
  assert.ok(weekUrl.includes(`&to=${today}`));
  assert.ok(!text().includes(purchase.itemName), 'Changing dates must not show the previous query');
  assert.ok(!calls.includes(rankingUrl));
  await respond(weekUrl, []);

  await click('Tất cả');
  await respond('/api/purchases?limit=500', []);
  assert.ok(text().includes('Tất cả ngày'), 'All-history query requires explicit selection');
  await click('Hôm nay');
  assert.ok(text().includes(purchase.itemName), 'Returning to today reuses its matching cache');

  await click('Topping', 'tab');
  // The topping module is intentionally lazy; give its import time to settle.
  for (let attempt = 0; attempt < 50 && !calls.includes(rankingUrl); attempt += 1) {
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
  }
  assert.ok(calls.includes(rankingUrl), 'Opening the topping tab must load the report');
  assert.ok(text().includes('Topping thử'));
  assert.ok(!text().includes(purchase.itemName), 'The purchase list belongs to its own tab');
  await click('Danh sách nhập hàng', 'tab');
  assert.ok(text().includes(purchase.itemName));
  assert.ok(!text().includes('Tổng quan topping'));
  console.log(JSON.stringify({ passed: 6, initialPurchaseQuery: todayUrl, deferredTopping: true }));
} finally {
  await act(async () => root.unmount());
  globalThis.fetch = originalFetch;
  await window.happyDOM.close();
}
