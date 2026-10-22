"use client";

import { App, ConfigProvider } from "antd";
import { useEffect, type PropsWithChildren } from "react";
import { usePathname } from "next/navigation";
import { invalidateApiData } from "@/lib/api-client";
import {
  DEFAULT_BUSINESS_PROFILE,
  type BusinessProfile,
} from "@/lib/business-profile";

export function Providers({
  children,
  businessProfile = DEFAULT_BUSINESS_PROFILE,
}: PropsWithChildren<{ businessProfile?: BusinessProfile }>) {
  const { brandColors } = businessProfile;
  const pathname = usePathname();
  useEffect(() => {
    if (pathname.startsWith("/sign-in")) void invalidateApiData(true);
  }, [pathname]);
  return (
    <ConfigProvider
      theme={{
        token: {
          colorPrimary: brandColors.terracotta,
          colorInfo: brandColors.terracotta,
          colorSuccess: brandColors.green,
          colorWarning: "#c87916",
          colorError: "#ad4d3d",
          colorText: brandColors.ink,
          colorTextSecondary: "#58718b",
          colorBgLayout: brandColors.cream,
          colorBorder: "#d2e3f4",
          colorBorderSecondary: "#d2e3f4",
          borderRadius: 8,
          borderRadiusLG: 12,
          controlHeight: 40,
          controlHeightLG: 40,
          fontFamily: 'var(--font-sans)',
        },
        components: {
          Table: {
            headerBg: "#e8f3ff",
            headerColor: brandColors.ink,
            rowHoverBg: "#f5faff",
          },
        },
      }}
    >
      <App>{children}</App>
    </ConfigProvider>
  );
}
