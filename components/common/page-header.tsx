import { Typography } from "antd";
import type { ReactNode } from "react";

const { Paragraph, Title } = Typography;

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description: string;
  actions?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <Title level={2}>{title}</Title>
        <Paragraph className="subtitle">{description}</Paragraph>
      </div>
      {actions}
    </div>
  );
}
