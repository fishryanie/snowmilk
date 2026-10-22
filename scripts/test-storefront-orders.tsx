/** Real React/Ant Design DOM checks with fake HTTP; never connects to the app DB. */
import assert from 'node:assert/strict';
import type { Window } from 'happy-dom';

const window = globalThis.window as unknown as Window;
const React = await import('react');
const { act } = React;
const { createRoot } = await import('react-dom/client');
const { App } = await import('antd');
const { CurrentAccessProvider } = await import('../components/v2/access-context');
const { OnlineOrders } = await import('../components/storefront/online-orders');
const { mutate } = await import('swr');
const originalFetch = globalThis.fetch;
const requests: Array<{ url: string; method: string; body: unknown }> = [];
let writable = true;
let rows = [{
  id: '507f1f77bcf86cd799439011', code: 'ORDER1', status: 'preparing', createdAt: '2026-10-22T00:00:00Z',
  customer: { name: 'Khách thử', phone: '0900000000' }, total: 60_000,
}];
const initialRow = structuredClone(rows[0]);
const detail = {
  ...initialRow, paymentMethod: 'cod', hasReceipt: false, events: [],
  customer: { ...initialRow.customer, address: 'Địa chỉ thử', note: '', location: null },
  quote: { subtotal: 50_000, deliveryFee: 10_000, total: 60_000, lines: [{
    key: 'line1', name: 'Sữa chỉ tải khi xem chi tiết', quantity: 2, unitPrice: 25_000, total: 50_000, toppings: [],
  }] },
};
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  const method = init?.method ?? 'GET';
  const body = typeof init?.body === 'string' ? JSON.parse(init.body) : null;
  requests.push({ url, method, body });
  let data: unknown;
  if (url === '/api/v2/auth/me') {
    data = { userId: 'test', role: writable ? 'owner' : 'viewer', organizationId: 'test-shop', permissions: writable ? ['sales:read', 'sales:write'] : ['sales:read'] };
  } else if (method === 'POST') {
    if (url.endsWith('/delete')) rows = [];
    else rows = rows.map(row => ({ ...row, status: body.status }));
    data = { saved: true };
  } else if (url.startsWith('/api/storefront-admin/orders?')) {
    data = { orders: rows, nextCursor: null };
  } else if (url === `/api/storefront-admin/orders/${initialRow.id}`) {
    data = detail;
  } else {
    throw new Error(`Unexpected request: ${url}`);
  }
  return Response.json({ success: true, data });
}) as typeof fetch;
const container = document.createElement('div');
document.body.append(container);
const root = createRoot(container as unknown as HTMLDivElement);
const buttons = () => Array.from(document.querySelectorAll('button'));
function button(label: string) {
  const found = buttons().find(b => b.getAttribute('aria-label') === label);
  assert.ok(found, `Missing button: ${label}`);
  return found;
}
async function click(element: { click(): void }) { await act(async () => element.click()); }
async function settle() { await act(async () => { await new Promise(resolve => setTimeout(resolve, 30)); }); }
async function confirm() {
  const found = Array.from(document.querySelectorAll('[role="dialog"] button')).find(b => /Cập nhật trạng thái|Hủy đơn|Xóa đơn/.test(b.textContent ?? ''));
  assert.ok(found, 'Missing confirmation button');
  await click(found as unknown as HTMLButtonElement);
  await settle();
}
const detailRequests = () => requests.filter(r => r.method === 'GET' && r.url === `/api/storefront-admin/orders/${initialRow.id}`);

try {
  await act(async () => root.render(<App><CurrentAccessProvider><OnlineOrders /></CurrentAccessProvider></App>));
  await settle();
  assert.deepEqual(Array.from(container.querySelectorAll('thead th')).map(th => th.textContent), ['Mã đơn hàng', 'Ngày đặt', 'Tổng tiền', 'Tên', 'SĐT', 'Trạng thái', 'Xóa', 'Hủy đơn', 'Chi tiết']);
  assert.equal(detailRequests().length, 0);
  assert.ok(!document.body.textContent?.includes(detail.quote.lines[0].name));
  await act(async () => {
    button(`Xem chi tiết đơn ${initialRow.code}`).dispatchEvent(new window.MouseEvent('mouseover', { bubbles: true }) as unknown as Event);
    await new Promise(resolve => setTimeout(resolve, 150));
  });
  await settle();
  assert.equal(document.querySelector('[role="tooltip"]')?.textContent, 'Xem chi tiết');

  const statusButton = buttons().find(b => b.getAttribute('aria-label')?.includes('Chuyển sang: Đang giao cho bạn'));
  assert.ok(statusButton);
  await click(statusButton);
  assert.equal(detailRequests().length, 0, 'status changes must not load the cart');
  await confirm();
  assert.ok(requests.some(r => r.method === 'POST' && (r.body as { status?: string })?.status === 'delivering'));

  await click(button(`Xem chi tiết đơn ${initialRow.code}`));
  await settle();
  assert.equal(detailRequests().length, 1);
  assert.ok(document.body.textContent?.includes(detail.quote.lines[0].name));
  assert.equal(document.querySelectorAll('[role="dialog"] img').length, 0, 'product detail must not render images');
  const close = document.querySelector('[role="dialog"] button[aria-label="Close"]');
  assert.ok(close);
  await click(close as unknown as HTMLButtonElement);

  await click(button(`Hủy đơn ${initialRow.code}`));
  const writesBefore = requests.filter(r => r.method === 'POST').length;
  await confirm();
  assert.equal(requests.filter(r => r.method === 'POST').length, writesBefore, 'cancel must require a reason');
  const textarea = document.querySelector('#online-order-action-note');
  assert.ok(textarea);
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')!.set!;
    setter.call(textarea, 'Khách đổi ý');
    textarea.dispatchEvent(new window.Event('input', { bubbles: true }) as unknown as Event);
    textarea.dispatchEvent(new window.Event('change', { bubbles: true }) as unknown as Event);
  });
  await confirm();
  assert.ok(requests.some(r => (r.body as { note?: string })?.note === 'Khách đổi ý'));
  assert.equal(button(`Hủy đơn ${initialRow.code}`).disabled, true);
  assert.equal(detailRequests().length, 1, 'closing detail must stop detail fetches after writes');

  await click(button(`Xóa đơn ${initialRow.code}`));
  await confirm();
  assert.ok(requests.some(r => r.url.endsWith('/delete') && r.method === 'POST'));
  assert.ok(!container.textContent?.includes(initialRow.code));

  rows = [initialRow];
  writable = false;
  await act(async () => { await mutate('/api/v2/auth/me'); await mutate('/api/storefront-admin/orders?'); });
  await settle();
  assert.equal(button(`Xóa đơn ${initialRow.code}`).disabled, true);
  assert.equal(button(`Hủy đơn ${initialRow.code}`).disabled, true);
  assert.equal(button(`Xem chi tiết đơn ${initialRow.code}`).disabled, false);
  console.log(JSON.stringify({ passed: 9, lazyDetailRequests: 1, productImages: 0 }));
} finally {
  await act(async () => root.unmount());
  globalThis.fetch = originalFetch;
  await window.happyDOM.abort();
}
