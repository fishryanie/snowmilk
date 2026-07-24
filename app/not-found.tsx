import { Button, Result } from "antd";
import Link from "next/link";

export default function NotFound() {
  return (
    <Result
      status="404"
      title="Không tìm thấy trang"
      subTitle="Đường dẫn này không có trong hệ thống quản lý Sữa Tuyết."
      extra={
        <Link href="/dashboard">
          <Button type="primary">Về tổng quan</Button>
        </Link>
      }
    />
  );
}
