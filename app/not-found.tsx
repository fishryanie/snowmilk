import { Button, Result } from "antd";
import Link from "next/link";
import { loadBusinessProfile } from "@/lib/business-profile.server";

export default async function NotFound() {
  const profile = await loadBusinessProfile();
  return (
    <Result
      status="404"
      title="Không tìm thấy trang"
      subTitle={`Đường dẫn này không có trong hệ thống ${profile.displayName}.`}
      extra={
        <Link href="/dashboard">
          <Button type="primary">Về tổng quan</Button>
        </Link>
      }
    />
  );
}
