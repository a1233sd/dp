import { Flex, Space, Typography } from "antd";
import type { ReactNode } from "react";

const { Text, Title } = Typography;

interface PageTitleProps {
  title: string;
  description?: string;
  extra?: ReactNode;
}

export function PageTitle({ title, description, extra }: PageTitleProps) {
  return (
    <Flex justify="space-between" align="flex-start" gap={16} wrap="wrap" className="page-title">
      <div>
        <Title level={2}>{title}</Title>
        {description && <Text type="secondary">{description}</Text>}
      </div>
      {extra && <Space wrap>{extra}</Space>}
    </Flex>
  );
}
