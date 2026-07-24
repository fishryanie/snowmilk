"use client";

import { Button, Result } from "antd";

export default function ErrorPage({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <Result
      status="error"
      title="Không thể tải trang"
      subTitle="Dữ liệu của bạn vẫn an toàn. Hãy thử tải lại phần nội dung này."
      extra={<Button onClick={reset}>Thử lại</Button>}
    />
  );
}
