"use client";

import { Button, Result } from "antd";
import { useEffect } from "react";

export default function ErrorPage({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <Result
      status="error"
      title="Không thể tải trang"
      subTitle="Dữ liệu của bạn vẫn an toàn. Hãy thử tải lại phần nội dung này."
      extra={<Button onClick={unstable_retry}>Thử lại</Button>}
    />
  );
}
