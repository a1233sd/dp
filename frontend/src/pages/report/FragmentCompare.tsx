import { Card, Col, Row, Tag } from "antd";
import { useMemo } from "react";
import { escapeRegExp } from "../../lib/format";
import type { CheckMatch } from "../../types";

interface FragmentCompareProps {
  match: CheckMatch;
}

export function FragmentCompare({ match }: FragmentCompareProps) {
  const sharedWords = useMemo(() => {
    const pattern = /[\p{L}\p{N}_-]+/gu;
    const first = new Set(String(match.fragment || "").toLowerCase().match(pattern) || []);
    const second = new Set(String(match.source_fragment || "").toLowerCase().match(pattern) || []);
    return new Set([...first].filter((word) => word.length > 2 && second.has(word)));
  }, [match]);

  const renderFragment = (text: string) => {
    if (!sharedWords.size) return text;
    const pattern = new RegExp(`(${[...sharedWords].map(escapeRegExp).join("|")})`, "giu");
    return String(text || "").split(pattern).map((part, index) => (
      sharedWords.has(part.toLowerCase())
        ? <mark key={index} className="shared-word">{part}</mark>
        : <span key={index}>{part}</span>
    ));
  };

  return (
    <Row gutter={[16, 16]}>
      <Col xs={24} lg={12}>
        <Card size="small" title="В проверяемой работе">
          <div className="fragment-text">{renderFragment(match.fragment)}</div>
        </Card>
      </Col>
      <Col xs={24} lg={12}>
        <Card size="small" title={`Источник: ${match.source_title}`} extra={<Tag color="red">{match.overlap_percent}%</Tag>}>
          <div className="fragment-text">{renderFragment(match.source_fragment)}</div>
        </Card>
      </Col>
    </Row>
  );
}
