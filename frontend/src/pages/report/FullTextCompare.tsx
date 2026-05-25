import { Alert, Card, Col, Empty, Row, Skeleton, Tag, Typography } from "antd";
import { useMemo, useRef } from "react";
import { kindLabel } from "../../lib/constants";
import type { CheckMatch, CheckResult } from "../../types";
import { DocumentReader } from "./DocumentReader";
import { buildHighlightChunks, findTextInterval } from "./textHighlight";

const { Text } = Typography;

interface FullTextCompareProps {
  match: CheckMatch;
  onSelect: (index: number) => void;
  result: CheckResult;
  selectedIndex: number;
  sourceLoading: boolean;
  sourceText: string | null;
}

export function FullTextCompare({
  match,
  onSelect,
  result,
  selectedIndex,
  sourceLoading,
  sourceText,
}: FullTextCompareProps) {
  const compareReaderRef = useRef<HTMLDivElement>(null);
  const source = sourceText || match.source_fragment || "";
  const sourceInterval = useMemo(() => findTextInterval(source, match.source_fragment), [match.source_fragment, source]);
  const sourceChunks = useMemo(
    () => buildHighlightChunks(source, sourceInterval ? [sourceInterval] : []),
    [source, sourceInterval],
  );

  return (
    <Row gutter={[16, 16]} align="top">
      <Col xs={24} xl={12}>
        <Card
          size="small"
          title="Полный текст проверяемой работы"
          extra={<Tag color="red">{match.overlap_percent}%</Tag>}
          className="reader-card"
        >
          <DocumentReader
            className="compare-reader"
            onSelect={onSelect}
            readerRef={compareReaderRef}
            result={result}
            selectedIndex={selectedIndex}
            visibleMatchIndexes={[selectedIndex]}
          />
        </Card>
      </Col>

      <Col xs={24} xl={12}>
        <Card
          size="small"
          title={`Полный текст источника: ${match.source_title}`}
          extra={<Tag>{kindLabel[match.source_kind]}</Tag>}
          className="reader-card"
        >
          {sourceLoading ? (
            <div className="document-reader compare-reader">
              <Skeleton active paragraph={{ rows: 12 }} title={false} />
            </div>
          ) : source ? (
            <div className="document-reader compare-reader">
              {!sourceInterval && sourceText && (
                <Alert
                  type="warning"
                  showIcon
                  className="compare-alert"
                  message="Точный фрагмент не найден в исходном тексте после примененных правил"
                />
              )}
              {sourceChunks.map((chunk, index) => chunk.mark ? (
                <mark key={`source-mark-${index}`} className="selected-hit">
                  {chunk.text}
                </mark>
              ) : (
                <span key={`source-text-${index}`}>{chunk.text}</span>
              ))}
            </div>
          ) : (
            <div className="document-reader compare-reader">
              <Empty description="Текст источника недоступен" />
              <Text type="secondary">{match.source_fragment}</Text>
            </div>
          )}
        </Card>
      </Col>
    </Row>
  );
}
