/** Local visual preview with fake HTTP. Does not connect to MongoDB or Zalo. */
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const directory = resolve("node_modules/.cache/zalo-preview");
await mkdir(directory, { recursive: true });
const entry = resolve(directory, "entry.tsx");
await writeFile(entry, `
import React from 'react';
import { createRoot } from 'react-dom/client';
import { App, ConfigProvider } from 'antd';
import { CurrentAccessProvider } from '../../../components/v2/access-context';
import { ChatInbox } from '../../../components/zalo/chat-inbox';
import { BotSettingsPanel } from '../../../components/zalo/bot-settings';
import { installZaloTestFetch } from '../../../scripts/zalo-test-fixtures';
const fixture = installZaloTestFetch();
window.fetch = fixture.fetcher;
const settings = location.pathname.endsWith('/settings');
createRoot(document.getElementById('root')!).render(<ConfigProvider theme={{ token: { colorPrimary: '#0862c0', borderRadius: 8, fontFamily: 'system-ui, sans-serif' } }}><App><CurrentAccessProvider><div className='zalo-workspace'><header className='zalo-page-heading'><div><span className='zalo-eyebrow'>KẾT NỐI KHÁCH HÀNG</span><h1>Zalo Bot</h1><p>Mọi cuộc trò chuyện, ở cùng một nơi.</p></div><span className='zalo-channel'><span/> Bot Cái Tiệm Sữa</span></header><nav className='zalo-tabs'><a className={!settings ? 'is-active' : ''} href='/zalo'>Hội thoại</a><a className={settings ? 'is-active' : ''} href='/zalo/settings'>Trả lời tự động</a></nav>{settings ? <BotSettingsPanel/> : <ChatInbox/>}</div></CurrentAccessProvider></App></ConfigProvider>);
`);
const build = await Bun.build({ entrypoints: [entry], target: "browser", env: "disable", define: { "process.env.NODE_ENV": '"development"' } });
if (!build.success) throw new Error("Không build được bản xem thử.");
const js = await build.outputs[0].text();
const html = `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Zalo Bot · Bản xem thử</title><link rel="stylesheet" href="/style.css"><style>:root{--canvas:#f5faff;--surface:#fff;--ink:#153454;--muted:#58718b;--line:#d2e3f4;--brand:#0862c0;--brand-soft:#e8f3ff;--brand-sky:#3892df;--success:#4c775a;--danger:#ad4d3d;--amber:#d9932e}*{box-sizing:border-box}body{margin:0;padding:24px;background:var(--canvas);font-family:system-ui,sans-serif;color:var(--ink)}a{color:inherit;text-decoration:none}.preview-banner{font-size:10px;text-align:right;color:var(--muted);margin-bottom:12px}button,input,textarea{font:inherit}</style></head><body><div class="preview-banner">XEM THỬ · DỮ LIỆU GIẢ LẬP · KHÔNG GỬI TIN ZALO THẬT</div><div id="root"></div><script>window.process={env:{NODE_ENV:'development'}};</script><script type="module" src="/app.js"></script></body></html>`;
const server = Bun.serve({ hostname: "127.0.0.1", port: 3013, async fetch(request) {
  const path = new URL(request.url).pathname;
  if (path === "/app.js") return new Response(js, { headers: { "Content-Type": "application/javascript" } });
  if (path === "/style.css") return new Response(Bun.file("app/zalo/zalo.css"), { headers: { "Content-Type": "text/css" } });
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
} });
console.log(`Local preview: http://127.0.0.1:${server.port}/zalo (fake data only)`);
