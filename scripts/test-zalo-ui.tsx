import assert from "node:assert/strict";
import type { Window } from "happy-dom";
import { installZaloTestFetch } from "./zalo-test-fixtures";

const window = globalThis.window as unknown as Window;
Object.assign(globalThis, { self: window, FileReader: window.FileReader });
const React = await import("react");
const { act } = React;
const { createRoot } = await import("react-dom/client");
const { App } = await import("antd");
const { mutate } = await import("swr");
const { CurrentAccessProvider } = await import("../components/v2/access-context");
const { ChatInbox } = await import("../components/zalo/chat-inbox");
const { BotSettingsPanel } = await import("../components/zalo/bot-settings");
const fixture = installZaloTestFetch();
const original = globalThis.fetch;
globalThis.fetch = fixture.fetcher;
const container = document.createElement("div"); document.body.append(container);
const root = createRoot(container as unknown as HTMLDivElement);
async function settle() { await act(async () => { await new Promise(resolve => setTimeout(resolve, 40)); }); }
async function click(element: HTMLElement) { await act(async () => element.click()); await settle(); }
function button(text: string) {
  const element = [...container.querySelectorAll("button")].find(button => button.textContent?.includes(text));
  assert.ok(element, `Missing button: ${text}`); return element as unknown as HTMLElement;
}
async function type(element: HTMLElement, text: string) {
  await act(async () => {
    const prototype = element.tagName === "TEXTAREA" ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(element, text);
    element.dispatchEvent(new window.Event("input", { bubbles: true }) as unknown as Event);
    element.dispatchEvent(new window.Event("change", { bubbles: true }) as unknown as Event);
  });
}
try {
  await act(async () => root.render(<App><CurrentAccessProvider><ChatInbox /></CurrentAccessProvider></App>)); await settle();
  assert.ok(container.textContent?.includes("Khách thử · An"));
  assert.ok(!fixture.requests.some(request => request.url.includes("/customer-an")), "Selecting no customer must not fetch private message histories");
  await click(button("Khách thử · An"));
  assert.ok(container.textContent?.includes("Tiệm đã ghi nhận yêu cầu"));
  assert.ok(!container.textContent?.includes("Tin cũ của khách"));
  await click(button("Xem tin nhắn cũ hơn"));
  assert.ok(container.textContent?.includes("Tin cũ của khách"));
  await click(button("Bật bot lại"));
  assert.ok(fixture.requests.some(request => request.method === "PATCH" && request.body?.botPaused === false));
  const composer = container.querySelector('[aria-label="Soạn tin nhắn cho khách"]'); assert.ok(composer);
  await type(composer as unknown as HTMLElement, "Nhân viên đang hỗ trợ bạn nhé");
  fixture.loseNextReply(); await click(button("Gửi tin"));
  assert.ok(container.textContent?.includes("Mất phản hồi thử nghiệm"));
  assert.equal((composer as unknown as HTMLTextAreaElement).value, "Nhân viên đang hỗ trợ bạn nhé");
  await click(button("Gửi tin"));
  const replies = fixture.requests.filter(request => request.method === "POST");
  assert.equal(replies.length, 2); assert.equal(replies[0].body?.requestId, replies[1].body?.requestId);
  assert.equal(fixture.sent.size, 1, "Retry after lost response uses the same send identity");

  fixture.setWritable(false); await act(async () => { await mutate("/api/v2/auth/me"); }); await settle();
  assert.equal(container.querySelector('[aria-label="Soạn tin nhắn cho khách"]'), null);
  assert.ok(container.textContent?.includes("quyền xem hội thoại"));
  fixture.setWritable(true); await act(async () => { await mutate("/api/v2/auth/me"); });
  await act(async () => root.render(<App><CurrentAccessProvider><BotSettingsPanel /></CurrentAccessProvider></App>)); await settle();
  assert.ok(container.textContent?.includes("Menu số + từ khóa"));
  const writesBeforePreview = fixture.requests.filter(request => request.method !== "GET").length;
  await click(button("Ship như thế nào?"));
  assert.ok(container.textContent?.includes("Phí giao hàng và phương thức thanh toán"));
  assert.equal(fixture.requests.filter(request => request.method !== "GET").length, writesBeforePreview, "Preview must never send customer messages or save draft rules");
  const greeting = container.querySelector("#bot-greeting"); assert.ok(greeting);
  await type(greeting as unknown as HTMLElement, "Chào {name}, tiệm hỗ trợ bạn nhé!");
  const imageInput = container.querySelector('[aria-label="Tải ảnh cho quy tắc 1"]'); assert.ok(imageInput);
  await act(async () => {
    Object.defineProperty(imageInput, "files", { configurable: true, value: [new window.File([new Uint8Array([1, 2, 3, 4])], "menu.png", { type: "image/png" })] });
    imageInput.dispatchEvent(new window.Event("change", { bubbles: true }) as unknown as Event);
  });
  await settle();
  assert.ok(fixture.requests.some(request => request.url.endsWith("/images") && request.method === "POST" && typeof request.body?.base64 === "string"));
  assert.equal(container.querySelector('img[alt="Ảnh trả lời quy tắc 1"]')?.getAttribute("src"), "https://images.example.test/menu.jpg");
  const previewOne = [...container.querySelectorAll('.zalo-test-suggestions button')].find(element => element.textContent === "1"); assert.ok(previewOne);
  await click(previewOne as unknown as HTMLElement);
  assert.equal(container.querySelector('img[alt="Ảnh bot sẽ gửi"]')?.getAttribute("src"), "https://images.example.test/menu.jpg");
  await click(button("Lưu cấu hình"));
  assert.ok(fixture.requests.some(request => request.method === "PUT" && request.body?.greeting === "Chào {name}, tiệm hỗ trợ bạn nhé!"));
  assert.ok(fixture.requests.some(request => request.method === "PUT" && (request.body?.rules as Array<{ photoUrl?: string }>)?.[0].photoUrl === "https://images.example.test/menu.jpg"));
  fixture.setWritable(false); await act(async () => { await mutate("/api/v2/auth/me"); }); await settle();
  assert.equal((container.querySelector('[aria-label="Tải ảnh cho quy tắc 1"]') as unknown as HTMLInputElement).disabled, true);
  fixture.setWritable(true); await act(async () => { await mutate("/api/v2/auth/me"); }); await settle();
  // A rejected account intentionally clears every protected cache, including auth.
  // Run this final session transition after the authenticated editing workflow.
  await act(async () => root.render(<App><CurrentAccessProvider><ChatInbox /></CurrentAccessProvider></App>)); await settle();
  await click(button("Khách thử · An"));
  fixture.setIdentity("outsider"); await act(async () => { await mutate("/api/v2/auth/me"); }); await settle();
  assert.ok(container.textContent?.includes("Không có quyền xem hội thoại cửa hàng này"));
  assert.ok(!container.textContent?.includes("Tiệm đã ghi nhận yêu cầu"), "Changing accounts cannot reuse the previous account's cached message history");
  console.log(JSON.stringify({ passed: 11, realZaloRequests: 0, realDatabaseRequests: 0 }));
} finally {
  await act(async () => root.unmount()); globalThis.fetch = original;
  await window.happyDOM.abort();
}
// Next Link's browser scheduler can retain Node handles after the DOM is disposed.
process.exit(0);
