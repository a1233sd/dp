import {
  App as AntApp,
  Button,
  Card,
  Col,
  Empty,
  Flex,
  Input,
  InputNumber,
  List,
  Modal,
  Progress,
  Row,
  Statistic,
  Tag,
  Typography,
} from "antd";
import { EditOutlined, PrinterOutlined, SafetyCertificateOutlined, SearchOutlined } from "@ant-design/icons";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PageTitle } from "../components/PageTitle";
import { kindLabel } from "../lib/constants";
import { appendHistory } from "../lib/storage";
import { formatDate, scoreStatus } from "../lib/format";
import { DocumentReader } from "./report/DocumentReader";
import { FragmentCompare } from "./report/FragmentCompare";
import type { ApiRequest, CheckHistoryItem, CheckMatch, CheckResult } from "../types";

const { Text, Title } = Typography;

interface ReportPageProps {
  id?: string;
  request: ApiRequest;
  setHistory: (items: CheckHistoryItem[]) => void;
}

export function ReportPage({ id, request, setHistory }: ReportPageProps) {
  const [result, setResult] = useState<CheckResult | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(false);
  const readerRef = useRef<HTMLDivElement>(null);
  const { message } = AntApp.useApp();

  const loadResult = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const data = await request<CheckResult>(`/checks/${encodeURIComponent(id)}`);
      setResult(data);
      setHistory(appendHistory(data, data.submission_document_id || "Открытый отчет"));
    } catch (error) {
      message.error(error instanceof Error ? error.message : "Не удалось открыть отчет");
    } finally {
      setLoading(false);
    }
  }, [id, message, request, setHistory]);

  useEffect(() => {
    loadResult();
  }, [loadResult]);

  const matches = useMemo(() => {
    const query = filter.trim().toLowerCase();
    return (result?.matches || [])
      .map((match, index) => ({ ...match, index }))
      .filter((match) => !query || `${match.source_title} ${match.fragment}`.toLowerCase().includes(query))
      .sort((a, b) => b.overlap_percent - a.overlap_percent || a.start_char - b.start_char);
  }, [filter, result]);

  const selected = result?.matches[selectedIndex] || null;

  const selectMatch = (index: number) => {
    setSelectedIndex(index);
    requestAnimationFrame(() => {
      const node = readerRef.current?.querySelector(`[data-match-index="${index}"]`);
      node?.scrollIntoView({ block: "center", behavior: "smooth" });
    });
  };

  const editOriginality = () => {
    if (!result) return;
    Modal.confirm({
      title: "Изменить процент оригинальности",
      content: (
        <InputNumber
          id="originality-input"
          min={0}
          max={100}
          step={0.1}
          defaultValue={result.originality_percent}
          addonAfter="%"
          className="full-width"
        />
      ),
      onOk: async () => {
        const input = document.getElementById("originality-input") as HTMLInputElement | null;
        const value = Number(input?.value);
        if (Number.isNaN(value) || value < 0 || value > 100) throw new Error("Некорректный процент");
        const updated = await request<CheckResult>(`/checks/${result.id}/originality`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ originality_percent: value }),
        });
        setResult(updated);
        message.success("Процент обновлен");
      },
    });
  };

  const addArchive = async () => {
    if (!result?.submission_document_id) return;
    await request(`/documents/${result.submission_document_id}/archive`, { method: "POST" });
    message.success("Работа добавлена в архив уникальных документов");
  };

  if (!result) {
    return (
      <div className="page-stack">
        <PageTitle title="Отчет проверки" description="Загрузка результата..." />
        <Card loading={loading}>{!loading && <Empty description="Отчет не найден" />}</Card>
      </div>
    );
  }

  return (
    <div className="page-stack report-page">
      <PageTitle
        title="Отчет проверки"
        description={`ID ${result.id} · ${formatDate(result.checked_at)}`}
        extra={[
          <Button key="print" icon={<PrinterOutlined />} onClick={() => window.print()}>Печать</Button>,
          <Button key="edit" icon={<EditOutlined />} onClick={editOriginality}>Изменить процент</Button>,
          <Button key="archive" type="primary" disabled={!result.submission_document_id} icon={<SafetyCertificateOutlined />} onClick={addArchive}>
            Сделать уникальной
          </Button>,
        ]}
      />

      <Row gutter={[16, 16]}>
        <Col xs={24} md={8}>
          <Card className="score-card">
            <Progress type="dashboard" percent={Math.round(result.originality_percent)} status={scoreStatus(result.originality_percent)} size={148} />
            <Title level={3}>{result.originality_percent}% оригинальности</Title>
            <Text type="secondary">Совпавших токенов: {result.matched_tokens} из {result.total_tokens}</Text>
          </Card>
        </Col>
        <Col xs={24} md={16}>
          <Row gutter={[16, 16]}>
            <Col xs={12} lg={6}><Card><Statistic title="Источников" value={result.matches.length} /></Card></Col>
            <Col xs={12} lg={6}><Card><Statistic title="Токенов" value={result.total_tokens} /></Card></Col>
            <Col xs={12} lg={6}><Card><Statistic title="Совпало" value={result.matched_tokens} /></Card></Col>
            <Col xs={12} lg={6}><Card><Statistic title="Фрагментов" value={result.matches.length} /></Card></Col>
          </Row>
        </Col>
      </Row>

      <Row gutter={[16, 16]} align="top">
        <Col xs={24} xl={7}>
          <Card
            title="Источники совпадений"
            className="matches-card"
            extra={<Input allowClear size="small" prefix={<SearchOutlined />} value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Фильтр" />}
          >
            {matches.length ? (
              <List
                dataSource={matches}
                renderItem={(match: CheckMatch & { index: number }) => (
                  <List.Item className={match.index === selectedIndex ? "active-list-row" : ""} onClick={() => selectMatch(match.index)}>
                    <List.Item.Meta
                      title={
                        <Flex justify="space-between" gap={10}>
                          <Text strong>{match.source_title}</Text>
                          <Tag color="red">{match.overlap_percent}%</Tag>
                        </Flex>
                      }
                      description={`${kindLabel[match.source_kind]} · символы ${match.start_char}-${match.end_char}`}
                    />
                  </List.Item>
                )}
              />
            ) : (
              <Empty description="Совпадений нет" />
            )}
          </Card>
        </Col>
        <Col xs={24} xl={17}>
          <Card title="Текст работы" className="reader-card">
            <DocumentReader result={result} selectedIndex={selectedIndex} onSelect={selectMatch} readerRef={readerRef} />
          </Card>
        </Col>
      </Row>

      <Card title="Сравнение выбранного фрагмента">
        {selected ? <FragmentCompare match={selected} /> : <Empty description="Выберите совпадение" />}
      </Card>
    </div>
  );
}
