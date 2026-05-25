import {
  Alert,
  App as AntApp,
  Button,
  Card,
  Col,
  Descriptions,
  Form,
  Input,
  InputNumber,
  Row,
  Select,
  Switch,
  Tabs,
} from "antd";
import { ExperimentOutlined, FolderOpenOutlined } from "@ant-design/icons";
import { useState } from "react";
import { PageTitle } from "../components/PageTitle";
import { appendHistory } from "../lib/storage";
import { navigate } from "../lib/routing";
import type { ApiRequest, CheckResult, DocumentItem, Settings, User, CheckHistoryItem } from "../types";

interface ChecksPageProps {
  activeProfileId: string;
  currentUser: User | null;
  documents: DocumentItem[];
  loadAll: () => Promise<void>;
  request: ApiRequest;
  settings: Settings | null;
  setHistory: (items: CheckHistoryItem[]) => void;
}

interface CheckFormValues {
  include_unique_archive: boolean;
  reference_ids?: string[];
  submission_document_id?: string;
  text?: string;
  title?: string;
  uniqueness_threshold: number;
  use_exclusion_rules: boolean;
}

export function ChecksPage({
  activeProfileId,
  currentUser,
  documents,
  loadAll,
  request,
  settings,
  setHistory,
}: ChecksPageProps) {
  const [form] = Form.useForm<CheckFormValues>();
  const [mode, setMode] = useState<"document" | "text">("document");
  const [running, setRunning] = useState(false);
  const { message } = AntApp.useApp();

  const submissions = documents.filter((doc) => doc.kind === "submission");
  const references = documents.filter((doc) => doc.kind === "reference");

  const runCheck = async (values: CheckFormValues) => {
    setRunning(true);
    try {
      const payload: Record<string, unknown> = {
        include_unique_archive: values.include_unique_archive,
        use_exclusion_rules: values.use_exclusion_rules,
        uniqueness_threshold: values.uniqueness_threshold,
      };
      if (currentUser) payload.owner_user_id = currentUser.id;
      if (activeProfileId) payload.profile_id = activeProfileId;
      if (values.reference_ids?.length) payload.reference_ids = values.reference_ids;
      if (mode === "document") payload.submission_document_id = values.submission_document_id;
      else payload.text = values.text;

      const result = await request<CheckResult>("/checks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const title = mode === "document"
        ? submissions.find((doc) => doc.id === values.submission_document_id)?.title
        : values.title || "Проверка текста";
      setHistory(appendHistory(result, title));
      message.success(`Проверка завершена: ${result.originality_percent}%`);
      await loadAll();
      navigate(`/reports/${result.id}`);
    } catch (error) {
      message.error(error instanceof Error ? error.message : "Не удалось запустить проверку");
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="page-stack">
      <PageTitle
        title="Проверка"
        description="Запуск анализа с выбором источников, архива и профиля исключений."
        extra={<Button icon={<FolderOpenOutlined />} onClick={() => navigate("/documents")}>К документам</Button>}
      />

      <Row gutter={[16, 16]}>
        <Col xs={24} xl={15}>
          <Card title="Новая проверка">
            <Tabs
              activeKey={mode}
              onChange={(key) => setMode(key as "document" | "text")}
              items={[
                { key: "document", label: "Загруженный документ" },
                { key: "text", label: "Вставить текст" },
              ]}
            />
            <Form
              form={form}
              layout="vertical"
              initialValues={{
                include_unique_archive: true,
                use_exclusion_rules: true,
                uniqueness_threshold: settings?.default_uniqueness_threshold ?? 80,
              }}
              onFinish={runCheck}
            >
              {mode === "document" ? (
                <Form.Item name="submission_document_id" label="Проверяемая работа" rules={[{ required: true }]}>
                  <Select
                    showSearch
                    optionFilterProp="label"
                    placeholder="Выберите submission-документ"
                    options={submissions.map((doc) => ({ value: doc.id, label: doc.title }))}
                  />
                </Form.Item>
              ) : (
                <>
                  <Form.Item name="title" label="Название проверки">
                    <Input placeholder="Например: фрагмент РПЗ" />
                  </Form.Item>
                  <Form.Item name="text" label="Текст" rules={[{ required: true }]}>
                    <Input.TextArea rows={10} />
                  </Form.Item>
                </>
              )}

              <Form.Item name="reference_ids" label="Конкретные эталоны">
                <Select
                  mode="multiple"
                  allowClear
                  optionFilterProp="label"
                  placeholder="Пусто = все доступные источники"
                  options={references.map((doc) => ({ value: doc.id, label: doc.title }))}
                />
              </Form.Item>

              <Row gutter={16}>
                <Col xs={24} md={8}>
                  <Form.Item name="uniqueness_threshold" label="Порог уникальности">
                    <InputNumber min={0} max={100} step={0.1} addonAfter="%" className="full-width" />
                  </Form.Item>
                </Col>
                <Col xs={24} md={8}>
                  <Form.Item name="include_unique_archive" label="Архив уникальных" valuePropName="checked">
                    <Switch checkedChildren="Вкл" unCheckedChildren="Выкл" />
                  </Form.Item>
                </Col>
                <Col xs={24} md={8}>
                  <Form.Item name="use_exclusion_rules" label="Правила исключений" valuePropName="checked">
                    <Switch checkedChildren="Вкл" unCheckedChildren="Выкл" />
                  </Form.Item>
                </Col>
              </Row>

              <Button type="primary" htmlType="submit" loading={running} size="large" icon={<ExperimentOutlined />}>
                Запустить проверку
              </Button>
            </Form>
          </Card>
        </Col>
        <Col xs={24} xl={9}>
          <Card title="Перед запуском" className="insight-card">
            <Descriptions column={1} size="small">
              <Descriptions.Item label="Работ">{submissions.length}</Descriptions.Item>
              <Descriptions.Item label="Эталонов">{references.length}</Descriptions.Item>
              <Descriptions.Item label="Профиль">{activeProfileId ? "выбран" : "не выбран"}</Descriptions.Item>
            </Descriptions>
            <Alert
              className="top-gap"
              type="info"
              showIcon
              message="Как читать результат"
              description="В отчете слева остается текст работы с подсветкой, справа — источники. Клик по совпадению синхронизирует фрагменты."
            />
          </Card>
        </Col>
      </Row>
    </div>
  );
}
