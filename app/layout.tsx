import type { Metadata } from "next";
import { AntdRegistry } from "@ant-design/nextjs-registry";
import { AppShell } from "@/components/layout/app-shell";
import { Providers } from "@/components/providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "Sữa Tuyết — Quản lý vận hành",
  description: "Quản lý bán hàng, giá vốn và chi phí quán Sữa Tuyết",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="vi">
      <body>
        <AntdRegistry>
          <Providers>
            <AppShell>{children}</AppShell>
          </Providers>
        </AntdRegistry>
      </body>
    </html>
  );
}
