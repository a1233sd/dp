import {
  App as AntApp,
  Button,
  Card,
  Col,
  Drawer,
  Flex,
  Form,
  Input,
  Popconfirm,
  Row,
  Select,
  Space,
  Table,
  Tag,
  Tooltip,
  Typography,
  Upload,
} from "antd";
import type { UploadFile } from "antd/es/upload/interface";
import type { ColumnsType } from "antd/es/table";
import type { Key } from "react";
import { useMemo, useState } from "react";
import {
  BookOutlined,
  CloudUploadOutlined,
  DeleteOutlined,
  EditOutlined,
  FileSearchOutlined,
  PlusOutlined,
  SearchOutlined,
  SwapOutlined,
} from "@ant-design/icons";
import { PageTitle } from "../components/PageTitle";
import { kindColor, kindLabel, roleLabel } from "../lib/constants";
import { formatDate, shortId } from "../lib/format";
import { navigate } from "../lib/routing";
import type { ApiRequest, DocumentItem, User } from "../types";

const { Dragger } = Upload;
const { Text } = Typography;

interface DocumentsPageProps {
  documents: DocumentItem[];
  loadAll: () => Promise<void>;
  request: ApiRequest;
  users: User[];
}

interface UploadFormValues {
  title?: string;
  kind: DocumentItem["kind"];
  owner_user_id?: string;
}

interface ManualDocumentFormValues extends UploadFormValues {
  text: string;
}

export function DocumentsPage({ documents, loadAll, request, users }: DocumentsPageProps) {
  const [selectedRowKeys, setSelectedRowKeys] = useState<Key[]>([]);
  const [filter, setFilter] = useState({ query: "", kind: "all" });
  const [uploadFiles, setUploadFiles] = useState<UploadFile[]>([]);
  const [manualOpen, setManualOpen] = useState(false);
  const [editDoc, setEditDoc] = useState<DocumentItem | null>(null);
  const [uploadForm] = Form.useForm<UploadFormValues>();
  const [manualForm] = Form.useForm<ManualDocumentFormValues>();
  const [editForm] = Form.useForm<Partial<ManualDocumentFormValues>>();
  const { message, modal } = AntApp.useApp();

  const ownerOptions = users.map((user) => ({
    value: user.id,
    label: `${user.full_name} · ${roleLabel[user.role]}`,
  }));

  const filteredDocuments = useMemo(() => {
    const query = filter.query.trim().toLowerCase();
    return documents.filter((doc) => {
      const kindOk = filter.kind === "all" || doc.kind === filter.kind;
      const queryOk = !query || `${doc.title} ${doc.id}`.toLowerCase().includes(query);
      return kindOk && queryOk;
    });
  }, [documents, filter]);

  const findDuplicates = (files: UploadFile[], customTitle = "") => {
    const existing = new Set(documents.map((doc) => doc.title.trim().toLowerCase()));
    const fileNames = files.map((file) => file.name).filter(Boolean);
    const candidates = files.length === 1 && customTitle.trim() ? [...fileNames, customTitle.trim()] : fileNames;
    const seen = new Set<string>();
    return candidates.filter((name) => {
      const key = name.trim().toLowerCase();
      const duplicate = existing.has(key) || seen.has(key);
      seen.add(key);
      return duplicate;
    });
  };

  const submitUpload = async () => {
    const values = await uploadForm.validateFields();
    if (!uploadFiles.length) {
      message.warning("Выберите один или несколько файлов");
      return;
    }
    const duplicates = findDuplicates(uploadFiles, values.title || "");
    if (duplicates.length) {
      message.error(`Файл уже существует: ${duplicates.join(", ")}`);
      return;
    }

    if (uploadFiles.length === 1) {
      const data = new FormData();
      const file = uploadFiles[0].originFileObj;
      if (!file) return;
      data.append("file", file);
      if (values.title) data.append("title", values.title);
      data.append("kind", values.kind);
      if (values.owner_user_id) data.append("owner_user_id", values.owner_user_id);
      await request("/documents/upload", { method: "POST", body: data });
      message.success("Документ загружен");
    } else {
      const data = new FormData();
      uploadFiles.forEach((file) => {
        if (file.originFileObj) data.append("files", file.originFileObj);
      });
      data.append("kind", values.kind);
      if (values.owner_user_id) data.append("owner_user_id", values.owner_user_id);
      const result = await request<{ saved: number; total: number; failed: number }>("/documents/upload/batch", {
        method: "POST",
        body: data,
      });
      message.success(`Загружено ${result.saved} из ${result.total}`);
      if (result.failed) message.warning(`Ошибок: ${result.failed}`);
    }

    uploadForm.resetFields();
    setUploadFiles([]);
    setSelectedRowKeys([]);
    await loadAll();
  };

  const createManualDocument = async (values: ManualDocumentFormValues) => {
    await request("/documents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
    message.success("Документ создан");
    setManualOpen(false);
    manualForm.resetFields();
    await loadAll();
  };

  const updateDocument = async (values: Partial<ManualDocumentFormValues>) => {
    if (!editDoc) return;
    await request(`/documents/${editDoc.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...values, text: values.text || undefined }),
    });
    message.success("Документ обновлен");
    setEditDoc(null);
    await loadAll();
  };

  const deleteDocuments = async (ids: Key[]) => {
    await Promise.all(ids.map((id) => request(`/documents/${String(id)}`, { method: "DELETE" })));
    message.success(`Удалено документов: ${ids.length}`);
    setSelectedRowKeys([]);
    await loadAll();
  };

  const bulkChangeKind = async (kind: DocumentItem["kind"]) => {
    await Promise.all(
      selectedRowKeys.map((id) =>
        request(`/documents/${String(id)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kind }),
        }),
      ),
    );
    message.success("Тип выбранных документов обновлен");
    setSelectedRowKeys([]);
    await loadAll();
  };

  const openEditor = (doc: DocumentItem) => {
    setEditDoc(doc);
    editForm.setFieldsValue({
      title: doc.title,
      kind: doc.kind,
      owner_user_id: doc.owner_user_id || undefined,
      text: "",
    });
  };

  const columns: ColumnsType<DocumentItem> = [
    {
      title: "Документ",
      dataIndex: "title",
      sorter: (a, b) => a.title.localeCompare(b.title),
      render: (title: string, row) => (
        <Space direction="vertical" size={0}>
          <Button type="link" className="table-title-link" onClick={() => openEditor(row)}>
            {title}
          </Button>
          <Text type="secondary">ID {shortId(row.id)}</Text>
        </Space>
      ),
    },
    {
      title: "Тип",
      dataIndex: "kind",
      render: (kind: DocumentItem["kind"]) => <Tag color={kindColor[kind]}>{kindLabel[kind]}</Tag>,
    },
    {
      title: "Архив",
      dataIndex: "is_unique",
      render: (value: boolean) => (value ? <Tag color="green">уникальный</Tag> : <Tag>нет</Tag>),
    },
    { title: "Создан", dataIndex: "created_at", sorter: (a, b) => Date.parse(a.created_at) - Date.parse(b.created_at), render: formatDate },
    {
      title: "",
      width: 132,
      render: (_, row) => (
        <Space>
          <Tooltip title="Редактировать">
            <Button icon={<EditOutlined />} onClick={() => openEditor(row)} />
          </Tooltip>
          <Popconfirm title="Удалить документ?" onConfirm={() => deleteDocuments([row.id])}>
            <Button danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div className="page-stack">
      <PageTitle
        title="Документы"
        description="Единый реестр эталонов и проверяемых работ с массовыми операциями."
        extra={[
          <Button key="manual" icon={<PlusOutlined />} onClick={() => setManualOpen(true)}>Создать вручную</Button>,
          <Button key="check" type="primary" icon={<FileSearchOutlined />} onClick={() => navigate("/checks")}>К проверке</Button>,
        ]}
      />

      <Row gutter={[16, 16]}>
        <Col xs={24} xl={8}>
          <Card title="Загрузка файлов" className="sticky-card">
            <Form form={uploadForm} layout="vertical" initialValues={{ kind: "submission" }}>
              <Form.Item name="title" label="Название для одиночной загрузки">
                <Input placeholder="Если пусто, используется имя файла" />
              </Form.Item>
              <Form.Item name="kind" label="Тип документа" rules={[{ required: true }]}>
                <Select options={[
                  { value: "submission", label: "Проверяемая работа" },
                  { value: "reference", label: "Эталонный документ" },
                ]} />
              </Form.Item>
              <Form.Item name="owner_user_id" label="Владелец">
                <Select allowClear showSearch optionFilterProp="label" options={ownerOptions} placeholder="Без владельца" />
              </Form.Item>
              <Dragger
                multiple
                fileList={uploadFiles}
                beforeUpload={() => false}
                onChange={({ fileList }) => setUploadFiles(fileList)}
              >
                <p className="ant-upload-drag-icon"><CloudUploadOutlined /></p>
                <p className="ant-upload-text">Перетащите PDF, DOCX, PPTX или текстовые файлы</p>
                <p className="ant-upload-hint">Можно загрузить 10, 50 или больше файлов одним действием</p>
              </Dragger>
              <Button type="primary" block className="top-gap" icon={<CloudUploadOutlined />} onClick={submitUpload}>
                Загрузить выбранные
              </Button>
            </Form>
          </Card>
        </Col>

        <Col xs={24} xl={16}>
          <Card
            title="Реестр документов"
            extra={
              <Space wrap>
                <Input
                  allowClear
                  prefix={<SearchOutlined />}
                  placeholder="Поиск"
                  value={filter.query}
                  onChange={(event) => setFilter((prev) => ({ ...prev, query: event.target.value }))}
                />
                <Select
                  value={filter.kind}
                  onChange={(kind) => setFilter((prev) => ({ ...prev, kind }))}
                  options={[
                    { value: "all", label: "Все типы" },
                    { value: "submission", label: "Работы" },
                    { value: "reference", label: "Эталоны" },
                  ]}
                />
              </Space>
            }
          >
            <Flex justify="space-between" align="center" wrap="wrap" gap={8} className="table-toolbar">
              <Text type="secondary">Выбрано: {selectedRowKeys.length}</Text>
              <Space wrap>
                <Button disabled={!selectedRowKeys.length} icon={<SwapOutlined />} onClick={() => bulkChangeKind("submission")}>Сделать работами</Button>
                <Button disabled={!selectedRowKeys.length} icon={<BookOutlined />} onClick={() => bulkChangeKind("reference")}>Сделать эталонами</Button>
                <Button
                  danger
                  disabled={!selectedRowKeys.length}
                  icon={<DeleteOutlined />}
                  onClick={() => modal.confirm({
                    title: `Удалить выбранные документы: ${selectedRowKeys.length}?`,
                    okText: "Удалить",
                    okButtonProps: { danger: true },
                    cancelText: "Отмена",
                    onOk: () => deleteDocuments(selectedRowKeys),
                  })}
                >
                  Удалить
                </Button>
              </Space>
            </Flex>
            <Table
              rowKey="id"
              columns={columns}
              dataSource={filteredDocuments}
              rowSelection={{ selectedRowKeys, onChange: setSelectedRowKeys }}
              pagination={{ pageSize: 10, showSizeChanger: true }}
              scroll={{ x: 900 }}
            />
          </Card>
        </Col>
      </Row>

      <Drawer title="Создать документ вручную" width={520} open={manualOpen} onClose={() => setManualOpen(false)} destroyOnClose>
        <Form form={manualForm} layout="vertical" initialValues={{ kind: "reference" }} onFinish={createManualDocument}>
          <Form.Item name="title" label="Название" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="kind" label="Тип" rules={[{ required: true }]}>
            <Select options={[
              { value: "reference", label: "Эталонный документ" },
              { value: "submission", label: "Проверяемая работа" },
            ]} />
          </Form.Item>
          <Form.Item name="owner_user_id" label="Владелец">
            <Select allowClear options={ownerOptions} />
          </Form.Item>
          <Form.Item name="text" label="Текст" rules={[{ required: true }]}>
            <Input.TextArea rows={10} />
          </Form.Item>
          <Button type="primary" htmlType="submit" block>Сохранить</Button>
        </Form>
      </Drawer>

      <Drawer title="Редактировать документ" width={560} open={!!editDoc} onClose={() => setEditDoc(null)} destroyOnClose>
        <Form form={editForm} layout="vertical" onFinish={updateDocument}>
          <Form.Item name="title" label="Название" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="kind" label="Тип" rules={[{ required: true }]}>
            <Select options={[
              { value: "reference", label: "Эталонный документ" },
              { value: "submission", label: "Проверяемая работа" },
            ]} />
          </Form.Item>
          <Form.Item name="owner_user_id" label="Владелец">
            <Select allowClear options={ownerOptions} />
          </Form.Item>
          <Form.Item name="text" label="Новый текст">
            <Input.TextArea rows={10} placeholder="Оставьте пустым, если текст менять не нужно" />
          </Form.Item>
          <Button type="primary" htmlType="submit" block>Сохранить изменения</Button>
        </Form>
      </Drawer>
    </div>
  );
}
