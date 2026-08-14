"use client";

import { LockOutlined, MailOutlined } from "@ant-design/icons";
import { Alert, Button, Card, Form, Input, Typography } from "antd";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";

type Credentials = {
  email: string;
  password: string;
};

export function SignInForm({
  displayName,
  wordmark,
  tagline,
}: {
  displayName: string;
  wordmark: string;
  tagline: string;
}) {
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(values: Credentials) {
    setError("");
    setSubmitting(true);
    const destination =
      new URLSearchParams(window.location.search).get("next") || "/dashboard";
    const result = await authClient.signIn.email({
      email: values.email,
      password: values.password,
      callbackURL: destination,
    });
    setSubmitting(false);
    if (result.error) {
      setError("Email hoặc mật khẩu chưa đúng.");
      return;
    }
    window.location.assign(destination);
  }

  return (
    <main className="auth-page">
      <Card className="auth-card" bordered={false}>
        <div className="auth-wordmark" aria-label={displayName}>
          {wordmark}
        </div>
        <Typography.Paragraph className="auth-tagline">
          {tagline}
        </Typography.Paragraph>
        <Typography.Title level={3}>Đăng nhập vận hành</Typography.Title>
        {error ? <Alert type="error" showIcon message={error} /> : null}
        <Form<Credentials>
          layout="vertical"
          requiredMark={false}
          onFinish={submit}
        >
          <Form.Item
            name="email"
            label="Email"
            rules={[
              { required: true, message: "Hãy nhập email." },
              { type: "email", message: "Email chưa đúng định dạng." },
            ]}
          >
            <Input
              autoComplete="email"
              prefix={<MailOutlined />}
              placeholder="ban@bepnhane.vn"
              size="large"
            />
          </Form.Item>
          <Form.Item
            name="password"
            label="Mật khẩu"
            rules={[{ required: true, message: "Hãy nhập mật khẩu." }]}
          >
            <Input.Password
              autoComplete="current-password"
              prefix={<LockOutlined />}
              size="large"
            />
          </Form.Item>
          <Button
            type="primary"
            htmlType="submit"
            loading={submitting}
            block
            size="large"
          >
            Đăng nhập
          </Button>
        </Form>
      </Card>
    </main>
  );
}
