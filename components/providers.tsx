"use client";

import { App, ConfigProvider } from "antd";
import type { PropsWithChildren } from "react";
import {
  DEFAULT_BUSINESS_PROFILE,
  type BusinessProfile,
} from "@/lib/business-profile";

export function Providers({
  children,
  businessProfile = DEFAULT_BUSINESS_PROFILE,
}: PropsWithChildren<{ businessProfile?: BusinessProfile }>) {
  const { brandColors } = businessProfile;
  return (
    <ConfigProvider
      theme={{
        token: {
          colorPrimary: brandColors.terracotta,
          colorInfo: brandColors.terracotta,
          colorSuccess: brandColors.green,
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
