import { Button, Card, Col, Descriptions, Row, Space, Typography } from "antd";
import { DiffOutlined } from "@ant-design/icons";
import { PageTitle } from "../components/PageTitle";
import type { Health, Settings } from "../types";

const { Paragraph } = Typography;

interface SettingsPageProps {
  health: Health | null;
  settings: Settings | null;
}

export function SettingsPage({ health, settings }: SettingsPageProps) {
  return (
    <div className="page-stack">
      <PageTitle title="Настройки" description="Технические параметры и быстрый переход к Swagger API." />
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={12}>
          <Card title="Сервис">
            <Descriptions column={1}>
              <Descriptions.Item label="Статус">{health?.status || "—"}</Descriptions.Item>
              <Descriptions.Item label="Документов">{health?.documents_total ?? "—"}</Descriptions.Item>
              <Descriptions.Item label="Пользователей">{health?.users_total ?? "—"}</Descriptions.Item>
              <Descriptions.Item label="Уникальный архив">{health?.unique_archive_total ?? "—"}</Descriptions.Item>
              <Descriptions.Item label="Порог по умолчанию">{settings?.default_uniqueness_threshold ?? 80}%</Descriptions.Item>
            </Descriptions>
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card title="API">
            <Paragraph>
              Backend остается источником данных. Фронтенд использует существующие эндпоинты и не
              требует дополнительной схемы БД.
            </Paragraph>
            <Space wrap>
              <Button type="primary" href="/docs" target="_blank" icon={<DiffOutlined />}>Открыть Swagger</Button>
              <Button href="/openapi.json" target="_blank">OpenAPI JSON</Button>
            </Space>
          </Card>
        </Col>
      </Row>
    </div>
  );
}
