import { Card, Space, Table, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import { PageTitle } from "../components/PageTitle";
import { formatDate, shortId } from "../lib/format";
import type { ArchiveItem } from "../types";

const { Text } = Typography;

interface ArchivePageProps {
  archive: ArchiveItem[];
}

export function ArchivePage({ archive }: ArchivePageProps) {
  const columns: ColumnsType<ArchiveItem> = [
    {
      title: "Документ",
      dataIndex: "title",
      render: (title: string, row) => (
        <Space direction="vertical" size={0}>
          <Text strong>{title}</Text>
          <Text type="secondary">ID {shortId(row.id)}</Text>
        </Space>
      ),
    },
    { title: "Токенов", dataIndex: "token_count", render: (value?: number | null) => value ?? "—" },
    { title: "Размер шингла", dataIndex: "shingle_size", render: (value?: number | null) => value ?? "—" },
    { title: "Создан", dataIndex: "created_at", render: formatDate },
    { title: "Обновлен", dataIndex: "updated_at", render: formatDate },
  ];

  return (
    <div className="page-stack">
      <PageTitle title="Архив уникальных работ" description="Документы, которые используются как накопленная база будущих сравнений." />
      <Card>
        <Table rowKey="id" columns={columns} dataSource={archive} scroll={{ x: 900 }} />
      </Card>
    </div>
  );
}
