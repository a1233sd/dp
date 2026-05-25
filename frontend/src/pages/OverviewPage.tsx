import { Badge, Button, Card, Col, Empty, List, Progress, Row, Statistic } from "antd";
import {
  BookOutlined,
  CheckCircleOutlined,
  FileDoneOutlined,
  FileSearchOutlined,
  FolderOpenOutlined,
} from "@ant-design/icons";
import { PageTitle } from "../components/PageTitle";
import { formatDate, scoreStatus } from "../lib/format";
import { navigate } from "../lib/routing";
import type { CheckHistoryItem, DocumentItem, Health, Settings } from "../types";

interface OverviewPageProps {
  documents: DocumentItem[];
  health: Health | null;
  history: CheckHistoryItem[];
  settings: Settings | null;
}

export function OverviewPage({ documents, health, history, settings }: OverviewPageProps) {
  const references = documents.filter((doc) => doc.kind === "reference").length;
  const submissions = documents.filter((doc) => doc.kind === "submission").length;
  const unique = documents.filter((doc) => doc.is_unique).length;

  return (
    <div className="page-stack">
      <PageTitle
        title="Обзор"
        description="Сводка по базе документов, архиву и последним проверкам."
        extra={<Button type="primary" icon={<FileSearchOutlined />} onClick={() => navigate("/checks")}>Запустить проверку</Button>}
      />

      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} xl={6}>
          <Card><Statistic title="Документы" value={health?.documents_total ?? documents.length} prefix={<FolderOpenOutlined />} /></Card>
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <Card><Statistic title="Эталоны" value={references} prefix={<BookOutlined />} /></Card>
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <Card><Statistic title="Работы" value={submissions} prefix={<FileDoneOutlined />} /></Card>
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <Card><Statistic title="Уникальные" value={health?.unique_archive_total ?? unique} prefix={<CheckCircleOutlined />} /></Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24} xl={15}>
          <Card title="Последние проверки" extra={<Button type="link" onClick={() => navigate("/checks")}>Все действия</Button>}>
            {history.length ? (
              <List
                dataSource={history.slice(0, 6)}
                renderItem={(item) => (
                  <List.Item actions={[<Button type="link" onClick={() => navigate(`/reports/${item.id}`)}>Открыть</Button>]}>
                    <List.Item.Meta
                      avatar={<Progress type="circle" size={48} percent={Math.round(item.originality_percent)} status={scoreStatus(item.originality_percent)} />}
                      title={item.title}
                      description={`${formatDate(item.checked_at)} · источников: ${item.matched_sources}`}
                    />
                  </List.Item>
                )}
              />
            ) : (
              <Empty description="Проверки пока не запускались" />
            )}
          </Card>
        </Col>
        <Col xs={24} xl={9}>
          <Card title="Рабочий процесс" className="workflow-card">
            <List
              dataSource={[
                ["Загрузите эталоны", "reference-документы становятся базой сравнения."],
                ["Добавьте работы", "submission-документы можно загружать массово."],
                ["Настройте профиль правил", "исключите титульные листы, задания и служебные блоки."],
                ["Запустите проверку", `порог уникальности по умолчанию: ${settings?.default_uniqueness_threshold ?? 80}%.`],
              ]}
              renderItem={([title, description], index) => (
                <List.Item>
                  <List.Item.Meta
                    avatar={<Badge count={index + 1} color="#1677ff" />}
                    title={title}
                    description={description}
                  />
                </List.Item>
              )}
            />
          </Card>
        </Col>
      </Row>
    </div>
  );
}
