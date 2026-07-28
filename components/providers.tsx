"use client";

import { App, ConfigProvider } from "antd";
import type { PropsWithChildren } from "react";

export function Providers({ children }: PropsWithChildren) {
  return (
    <ConfigProvider
      theme={{
        token: {
          colorPrimary: "#287f96",
          colorInfo: "#287f96",
          colorSuccess: "#2f7d59",
          colorWarning: "#c87916",
          colorError: "#c2413b",
          borderRadius: 12,
          borderRadiusLG: 12,
          controlHeight: 40,
          controlHeightLG: 40,
          fontFamily:
            '"Inter", "SF Pro Display", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        },
        components: {
          Table: { headerBg: "#f5f7f6" },
        },
      }}
    >
      <App>{children}</App>
    </ConfigProvider>
  );
}
