import {
  Alert,
  App as AntApp,
  Avatar,
  Badge,
  Button,
  Card,
  Col,
  ConfigProvider,
  Descriptions,
  Drawer,
  Empty,
  Flex,
  Form,
  Grid,
  Input,
  InputNumber,
  Layout,
  List,
  Menu,
  Modal,
  Popconfirm,
  Progress,
  Radio,
  Row,
  Select,
  Space,
  Statistic,
  Switch,
  Table,
  Tabs,
  Tag,
  Tooltip,
  Typography,
  Upload,
  theme,
} from "antd";
import "antd/dist/reset.css";
import {
  ApartmentOutlined,
  AuditOutlined,
  BookOutlined,
  CheckCircleOutlined,
  CloudUploadOutlined,
  DashboardOutlined,
  DeleteOutlined,
  DiffOutlined,
  EditOutlined,
  ExperimentOutlined,
  FileDoneOutlined,
  FileSearchOutlined,
  FolderOpenOutlined,
  HistoryOutlined,
  LoginOutlined,
  LogoutOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  PlusOutlined,
  PrinterOutlined,
  ReloadOutlined,
  SafetyCertificateOutlined,
  SearchOutlined,
  SettingOutlined,
  SwapOutlined,
  TeamOutlined,
  UserOutlined,
} from "@ant-design/icons";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const { Content, Header, Sider } = Layout;
const { Dragger } = Upload;
const { Text, Title, Paragraph } = Typography;
const { useBreakpoint } = Grid;

const TOKEN_KEY = "integrity_auth_token";
const USER_KEY = "integrity_current_user";
const PROFILE_KEY = "integrity_active_profile_id";
const HISTORY_KEY = "integrity_check_history";

const roleLabel = { student: "Студент", teacher: "Преподаватель" };
const kindLabel = { reference: "Эталон", submission: "Работа" };
const kindColor = { reference: "cyan", submission: "gold" };
const ruleTypeLabel = {
  pages: "Страницы документа",
  literal: "Точная фраза",
  contains: "Строка содержит",
  starts_with: "Строка начинается с",
  regex: "Regex",
};

function parseRoute() {
  const legacyMatch = window.location.pathname.match(/\/checks\/view\/([^/]+)/);
  if (legacyMatch) {
    return { path: `/reports/${decodeURIComponent(legacyMatch[1])}`, params: { id: decodeURIComponent(legacyMatch[1]) } };
  }
  const hash = window.location.hash.replace(/^#/, "");
  const path = hash || "/overview";
  const reportMatch = path.match(/^\/reports\/([^/]+)/);
  if (reportMatch) return { path, params: { id: decodeURIComponent(reportMatch[1]) } };
  return { path, params: {} };
}

function navigate(path) {
  if (window.location.pathname.startsWith("/checks/view/")) {
    window.history.replaceState(null, "", "/");
  }
  window.location.hash = path;
}

function readStorageJSON(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key) || "") || fallback;
  } catch {
    return fallback;
  }
}

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" });
}

function scoreStatus(value) {
  const percent = Number(value) || 0;
  if (percent >= 85) return "success";
  if (percent >= 70) return "normal";
  if (percent >= 45) return "exception";
  return "exception";
}

function parseError(payload) {
  if (!payload) return "Не удалось выполнить запрос";
  if (typeof payload.detail === "string") return payload.detail;
  return JSON.stringify(payload);
}

function shortId(value) {
  return String(value || "").slice(0, 8);
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function useHashRoute() {
  const [route, setRoute] = useState(parseRoute);
  useEffect(() => {
    const onChange = () => setRoute(parseRoute());
    window.addEventListener("hashchange", onChange);
    window.addEventListener("popstate", onChange);
    return () => {
      window.removeEventListener("hashchange", onChange);
      window.removeEventListener("popstate", onChange);
    };
  }, []);
  return route;
}

function loadHistory() {
  return readStorageJSON(HISTORY_KEY, []);
}

function saveHistory(items) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(items.slice(0, 30)));
}

function appendHistory(result, title) {
  const next = [
    {
      id: result.id,
      title: title || result.submission_document_id || "Проверка без названия",
      originality_percent: result.originality_percent,
      matched_sources: (result.matches || []).length,
      checked_at: result.checked_at,
    },
    ...loadHistory().filter((item) => item.id !== result.id),
  ];
  saveHistory(next);
  return next;
}

function AuthPage({ mode, onAuth, request }) {
  const [form] = Form.useForm();
  const { message } = AntApp.useApp();
  const isLogin = mode === "login";

  const submit = async (values) => {
    try {
      const auth = await request(isLogin ? "/auth/login" : "/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      onAuth(auth);
      message.success(isLogin ? "Вход выполнен" : "Аккаунт создан");
      navigate("/overview");
    } catch (error) {
      message.error(error.message);
    }
  };

  return (
    <main className="auth-screen">
      <section className="auth-panel">
        <div className="auth-brand">
          <Badge color="#13c2c2" text="Integrity Console" />
          <Title level={1}>Проверка заимствований для учебных работ</Title>
          <Paragraph>
            Документы, правила исключений, профили преподавателя и детальные отчеты собраны в
            едином рабочем пространстве.
          </Paragraph>
          <div className="auth-proof">
            <div><strong>100+</strong><span>файлов в batch</span></div>
            <div><strong>PDF/DOCX/PPTX</strong><span>форматы загрузки</span></div>
            <div><strong>Профили</strong><span>разные наборы правил</span></div>
          </div>
        </div>
        <Card className="auth-card" bordered={false}>
          <Space direction="vertical" size={6} className="full-width">
            <Title level={2}>{isLogin ? "Вход" : "Регистрация"}</Title>
            <Text type="secondary">
              {isLogin ? "Продолжите работу в консоли проверки." : "Создайте пользователя и основной профиль правил."}
            </Text>
          </Space>
          <Form layout="vertical" form={form} onFinish={submit} className="auth-form">
            {!isLogin && (
              <>
                <Form.Item name="full_name" label="ФИО" rules={[{ required: true, message: "Введите ФИО" }]}>
                  <Input size="large" prefix={<UserOutlined />} placeholder="Иван Иванов" />
                </Form.Item>
                <Form.Item name="role" label="Роль" initialValue="teacher" rules={[{ required: true }]}>
                  <Radio.Group optionType="button" buttonStyle="solid">
                    <Radio.Button value="teacher">Преподаватель</Radio.Button>
                    <Radio.Button value="student">Студент</Radio.Button>
                  </Radio.Group>
                </Form.Item>
              </>
            )}
            <Form.Item name="email" label="Email" rules={[{ required: true, type: "email", message: "Введите email" }]}>
              <Input size="large" placeholder="user@example.com" />
            </Form.Item>
            <Form.Item
              name="password"
              label="Пароль"
              rules={[{ required: true, min: 6, message: "Минимум 6 символов" }]}
            >
              <Input.Password size="large" placeholder="Не короче 6 символов" />
            </Form.Item>
            <Button type="primary" htmlType="submit" size="large" block icon={<LoginOutlined />}>
              {isLogin ? "Войти" : "Зарегистрироваться"}
            </Button>
          </Form>
          <Divider />
          {isLogin ? (
            <Button type="link" block onClick={() => navigate("/register")}>Создать аккаунт</Button>
          ) : (
            <Button type="link" block onClick={() => navigate("/login")}>У меня уже есть аккаунт</Button>
          )}
        </Card>
      </section>
    </main>
  );
}

function AppShell({
  activeProfileId,
  children,
  collapsed,
  currentUser,
  health,
  loading,
  onLogout,
  onProfileChange,
  onRefresh,
  profiles,
  routePath,
  setCollapsed,
}) {
  const screens = useBreakpoint();
  const menuItems = [
    { key: "/overview", icon: <DashboardOutlined />, label: "Обзор" },
    { key: "/documents", icon: <FolderOpenOutlined />, label: "Документы" },
    { key: "/checks", icon: <FileSearchOutlined />, label: "Проверка" },
    { key: "/rules", icon: <AuditOutlined />, label: "Правила" },
    { key: "/archive", icon: <SafetyCertificateOutlined />, label: "Архив" },
    { key: "/settings", icon: <SettingOutlined />, label: "Настройки" },
  ];

  const selectedKey = menuItems.find((item) => routePath.startsWith(item.key))?.key || "/overview";

  return (
    <Layout className="app-shell">
      <Sider
        breakpoint="lg"
        collapsedWidth={screens.lg ? 72 : 0}
        collapsible
        collapsed={collapsed}
        onCollapse={setCollapsed}
        trigger={null}
        width={264}
        className="app-sider"
      >
        <div className="sider-brand">
          <SafetyCertificateOutlined />
          {!collapsed && <span>Integrity Console</span>}
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[selectedKey]}
          items={menuItems}
          onClick={({ key }) => navigate(key)}
        />
      </Sider>
      <Layout>
        <Header className="app-header">
          <Space>
            <Button
              type="text"
              icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
              onClick={() => setCollapsed(!collapsed)}
            />
            <Badge status={health?.status === "ok" ? "success" : "default"} text={health?.status === "ok" ? "Сервис доступен" : "Статус неизвестен"} />
          </Space>
          <Space size="middle" wrap>
            <Select
              className="profile-select"
              value={activeProfileId || undefined}
              placeholder="Профиль правил"
              options={profiles.map((profile) => ({ value: profile.id, label: profile.name }))}
              onChange={onProfileChange}
            />
            <Button icon={<ReloadOutlined />} loading={loading} onClick={onRefresh}>Обновить</Button>
            <Avatar icon={<UserOutlined />} />
            <div className="user-caption">
              <strong>{currentUser?.full_name || "Гость"}</strong>
              <span>{roleLabel[currentUser?.role] || currentUser?.role || "без роли"}</span>
            </div>
            <Tooltip title="Выйти">
              <Button icon={<LogoutOutlined />} onClick={onLogout} />
            </Tooltip>
          </Space>
        </Header>
        <Content className="app-content">{children}</Content>
      </Layout>
    </Layout>
  );
}

function PageTitle({ title, description, extra }) {
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

function OverviewPage({ documents, health, history, settings }) {
  const references = documents.filter((doc) => doc.kind === "reference").length;
  const submissions = documents.filter((doc) => doc.kind === "submission").length;
  const unique = documents.filter((doc) => doc.is_unique).length;

  return (
    <Space direction="vertical" size={18} className="full-width">
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
                  <List.Item
                    actions={[<Button type="link" onClick={() => navigate(`/reports/${item.id}`)}>Открыть</Button>]}
                  >
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
    </Space>
  );
}

function DocumentsPage({ documents, loadAll, request, users }) {
  const [selectedRowKeys, setSelectedRowKeys] = useState([]);
  const [filter, setFilter] = useState({ query: "", kind: "all" });
  const [uploadForm] = Form.useForm();
  const [manualForm] = Form.useForm();
  const [editForm] = Form.useForm();
  const [uploadFiles, setUploadFiles] = useState([]);
  const [manualOpen, setManualOpen] = useState(false);
  const [editDoc, setEditDoc] = useState(null);
  const { message, modal } = AntApp.useApp();

  const ownerOptions = users.map((user) => ({
    value: user.id,
    label: `${user.full_name} · ${roleLabel[user.role] || user.role}`,
  }));

  const filteredDocs = useMemo(() => {
    const query = filter.query.trim().toLowerCase();
    return documents.filter((doc) => {
      const kindOk = filter.kind === "all" || doc.kind === filter.kind;
      const queryOk = !query || `${doc.title} ${doc.id}`.toLowerCase().includes(query);
      return kindOk && queryOk;
    });
  }, [documents, filter]);

  const duplicateNames = useCallback((files, customTitle = "") => {
    const existing = new Set(documents.map((doc) => doc.title.trim().toLowerCase()));
    const names = files.map((file) => file.name).filter(Boolean);
    const candidates = files.length === 1 && customTitle.trim() ? [...names, customTitle.trim()] : names;
    const seen = new Set();
    return candidates.filter((name) => {
      const key = name.trim().toLowerCase();
      const duplicate = existing.has(key) || seen.has(key);
      seen.add(key);
      return duplicate;
    });
  }, [documents]);

  const submitUpload = async () => {
    const values = await uploadForm.validateFields();
    if (!uploadFiles.length) {
      message.warning("Выберите один или несколько файлов");
      return;
    }
    const duplicates = duplicateNames(uploadFiles.map((file) => file.originFileObj || file), values.title || "");
    if (duplicates.length) {
      message.error(`Файл уже существует: ${duplicates.join(", ")}`);
      return;
    }
    if (uploadFiles.length === 1) {
      const data = new FormData();
      data.append("file", uploadFiles[0].originFileObj || uploadFiles[0]);
      if (values.title) data.append("title", values.title);
      data.append("kind", values.kind);
      if (values.owner_user_id) data.append("owner_user_id", values.owner_user_id);
      await request("/documents/upload", { method: "POST", body: data });
      message.success("Документ загружен");
    } else {
      const data = new FormData();
      uploadFiles.forEach((file) => data.append("files", file.originFileObj || file));
      data.append("kind", values.kind);
      if (values.owner_user_id) data.append("owner_user_id", values.owner_user_id);
      const result = await request("/documents/upload/batch", { method: "POST", body: data });
      message.success(`Загружено ${result.saved} из ${result.total}`);
      if (result.failed) message.warning(`Ошибок: ${result.failed}`);
    }
    uploadForm.resetFields();
    setUploadFiles([]);
    setSelectedRowKeys([]);
    await loadAll();
  };

  const createManual = async (values) => {
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

  const updateDocument = async (values) => {
    await request(`/documents/${editDoc.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...values, text: values.text || undefined }),
    });
    message.success("Документ обновлен");
    setEditDoc(null);
    await loadAll();
  };

  const deleteDocuments = async (ids) => {
    await Promise.all(ids.map((id) => request(`/documents/${id}`, { method: "DELETE" })));
    message.success(`Удалено документов: ${ids.length}`);
    setSelectedRowKeys([]);
    await loadAll();
  };

  const bulkKind = async (kind) => {
    await Promise.all(
      selectedRowKeys.map((id) =>
        request(`/documents/${id}`, {
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

  const columns = [
    {
      title: "Документ",
      dataIndex: "title",
      sorter: (a, b) => a.title.localeCompare(b.title),
      render: (title, row) => (
        <Space direction="vertical" size={0}>
          <Button type="link" className="table-title-link" onClick={() => { setEditDoc(row); editForm.setFieldsValue(row); }}>
            {title}
          </Button>
          <Text type="secondary">ID {shortId(row.id)}</Text>
        </Space>
      ),
    },
    {
      title: "Тип",
      dataIndex: "kind",
      filters: [
        { text: "Работа", value: "submission" },
        { text: "Эталон", value: "reference" },
      ],
      onFilter: (value, row) => row.kind === value,
      render: (kind) => <Tag color={kindColor[kind]}>{kindLabel[kind]}</Tag>,
    },
    {
      title: "Архив",
      dataIndex: "is_unique",
      render: (value) => value ? <Tag color="green">уникальный</Tag> : <Tag>нет</Tag>,
    },
    {
      title: "Создан",
      dataIndex: "created_at",
      sorter: (a, b) => new Date(a.created_at) - new Date(b.created_at),
      render: formatDate,
    },
    {
      title: "",
      key: "actions",
      width: 132,
      render: (_, row) => (
        <Space>
          <Tooltip title="Редактировать">
            <Button icon={<EditOutlined />} onClick={() => { setEditDoc(row); editForm.setFieldsValue(row); }} />
          </Tooltip>
          <Popconfirm title="Удалить документ?" onConfirm={() => deleteDocuments([row.id])}>
            <Button danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <Space direction="vertical" size={18} className="full-width">
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
                onRemove={(file) => setUploadFiles((items) => items.filter((item) => item.uid !== file.uid))}
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
                <Button disabled={!selectedRowKeys.length} icon={<SwapOutlined />} onClick={() => bulkKind("submission")}>Сделать работами</Button>
                <Button disabled={!selectedRowKeys.length} icon={<BookOutlined />} onClick={() => bulkKind("reference")}>Сделать эталонами</Button>
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
              dataSource={filteredDocs}
              rowSelection={{ selectedRowKeys, onChange: setSelectedRowKeys }}
              pagination={{ pageSize: 10, showSizeChanger: true }}
              scroll={{ x: 900 }}
            />
          </Card>
        </Col>
      </Row>
      <Drawer title="Создать документ вручную" width={520} open={manualOpen} onClose={() => setManualOpen(false)} destroyOnClose>
        <Form form={manualForm} layout="vertical" initialValues={{ kind: "reference" }} onFinish={createManual}>
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
    </Space>
  );
}

function ChecksPage({ activeProfileId, currentUser, documents, loadAll, request, settings, setHistory }) {
  const [form] = Form.useForm();
  const [mode, setMode] = useState("document");
  const [running, setRunning] = useState(false);
  const { message } = AntApp.useApp();
  const submissions = documents.filter((doc) => doc.kind === "submission");
  const references = documents.filter((doc) => doc.kind === "reference");

  const runCheck = async (values) => {
    setRunning(true);
    try {
      const payload = {
        include_unique_archive: values.include_unique_archive,
        use_exclusion_rules: values.use_exclusion_rules,
        uniqueness_threshold: values.uniqueness_threshold,
      };
      if (currentUser) payload.owner_user_id = currentUser.id;
      if (activeProfileId) payload.profile_id = activeProfileId;
      if (values.reference_ids?.length) payload.reference_ids = values.reference_ids;
      if (mode === "document") payload.submission_document_id = values.submission_document_id;
      else payload.text = values.text;

      const result = await request("/checks", {
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
      message.error(error.message);
    } finally {
      setRunning(false);
    }
  };

  return (
    <Space direction="vertical" size={18} className="full-width">
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
              onChange={setMode}
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
    </Space>
  );
}

function RulesPage({ activeProfileId, currentUser, loadAll, profiles, request, rules, setActiveProfileId }) {
  const [profileForm] = Form.useForm();
  const [ruleForm] = Form.useForm();
  const [ruleOpen, setRuleOpen] = useState(false);
  const { message, modal } = AntApp.useApp();

  const createProfile = async (values) => {
    const profile = await request("/profiles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
    setActiveProfileId(profile.id);
    localStorage.setItem(PROFILE_KEY, profile.id);
    profileForm.resetFields();
    message.success("Профиль создан");
    await loadAll();
  };

  const renameProfile = async () => {
    const current = profiles.find((profile) => profile.id === activeProfileId);
    modal.confirm({
      title: "Переименовать профиль",
      content: (
        <Form id="rename-profile-form" layout="vertical" initialValues={{ name: current?.name }}>
          <Form.Item name="name" label="Название" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
        </Form>
      ),
      onOk: async () => {
        const form = document.getElementById("rename-profile-form");
        const input = form?.querySelector("input");
        const name = input?.value?.trim();
        if (!name) throw new Error("Введите название");
        await request(`/profiles/${activeProfileId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name }),
        });
        message.success("Профиль переименован");
        await loadAll();
      },
    });
  };

  const deleteProfile = async () => {
    const result = await request(`/profiles/${activeProfileId}`, { method: "DELETE" });
    setActiveProfileId(result.active_profile_id);
    localStorage.setItem(PROFILE_KEY, result.active_profile_id);
    message.success("Профиль удален");
    await loadAll();
  };

  const createRule = async (values) => {
    const payload = { ...values };
    if (currentUser) payload.owner_user_id = currentUser.id;
    if (activeProfileId) payload.profile_id = activeProfileId;
    await request("/rules/exclusions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    message.success("Правило добавлено");
    setRuleOpen(false);
    ruleForm.resetFields();
    await loadAll();
  };

  const deleteRule = async (id) => {
    await request(`/rules/exclusions/${id}`, { method: "DELETE" });
    message.success("Правило удалено");
    await loadAll();
  };

  const columns = [
    { title: "Название", dataIndex: "name" },
    { title: "Тип", dataIndex: "rule_type", render: (type) => <Tag>{ruleTypeLabel[type] || type}</Tag> },
    { title: "Значение", dataIndex: "value", render: (value) => <Text code>{value}</Text> },
    { title: "Описание", dataIndex: "description", render: (value) => value || "—" },
    {
      title: "",
      width: 80,
      render: (_, row) => (
        <Popconfirm title="Удалить правило?" onConfirm={() => deleteRule(row.id)}>
          <Button danger icon={<DeleteOutlined />} />
        </Popconfirm>
      ),
    },
  ];

  return (
    <Space direction="vertical" size={18} className="full-width">
      <PageTitle
        title="Правила и профили"
        description="Управление наборами исключений: титульные листы, задания, литература и служебные фразы."
        extra={<Button type="primary" icon={<PlusOutlined />} onClick={() => setRuleOpen(true)}>Добавить правило</Button>}
      />
      <Row gutter={[16, 16]}>
        <Col xs={24} xl={7}>
          <Card title="Профили правил">
            <List
              dataSource={profiles}
              renderItem={(profile) => (
                <List.Item
                  className={profile.id === activeProfileId ? "active-list-row" : ""}
                  onClick={() => {
                    setActiveProfileId(profile.id);
                    localStorage.setItem(PROFILE_KEY, profile.id);
                    loadAll();
                  }}
                >
                  <List.Item.Meta
                    avatar={<Avatar icon={<ApartmentOutlined />} />}
                    title={profile.name}
                    description={`ID ${shortId(profile.id)}`}
                  />
                </List.Item>
              )}
            />
            <Form form={profileForm} layout="vertical" onFinish={createProfile} className="top-gap">
              <Form.Item name="name" label="Новый профиль" rules={[{ required: true }]}>
                <Input placeholder="Например: РПЗ бакалавриат" />
              </Form.Item>
              <Button htmlType="submit" block icon={<PlusOutlined />}>Создать профиль</Button>
            </Form>
            <Space className="top-gap" wrap>
              <Button disabled={!activeProfileId} icon={<EditOutlined />} onClick={renameProfile}>Переименовать</Button>
              <Popconfirm title="Удалить профиль и его правила?" onConfirm={deleteProfile} disabled={profiles.length <= 1}>
                <Button danger disabled={!activeProfileId || profiles.length <= 1} icon={<DeleteOutlined />}>Удалить</Button>
              </Popconfirm>
            </Space>
          </Card>
        </Col>
        <Col xs={24} xl={17}>
          <Card title="Правила текущего профиля">
            <Table rowKey="id" columns={columns} dataSource={rules} pagination={{ pageSize: 8 }} scroll={{ x: 800 }} />
          </Card>
        </Col>
      </Row>
      <Drawer title="Новое правило исключения" width={520} open={ruleOpen} onClose={() => setRuleOpen(false)} destroyOnClose>
        <Form form={ruleForm} layout="vertical" initialValues={{ rule_type: "pages" }} onFinish={createRule}>
          <Form.Item name="name" label="Название" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="rule_type" label="Тип" rules={[{ required: true }]}>
            <Select options={Object.entries(ruleTypeLabel).map(([value, label]) => ({ value, label }))} />
          </Form.Item>
          <Form.Item name="value" label="Значение" rules={[{ required: true }]}>
            <Input placeholder="Например: 1-2, 5 или Введение" />
          </Form.Item>
          <Form.Item name="description" label="Описание">
            <Input.TextArea rows={3} />
          </Form.Item>
          <Button type="primary" htmlType="submit" block>Добавить</Button>
        </Form>
      </Drawer>
    </Space>
  );
}

function ArchivePage({ archive }) {
  const columns = [
    { title: "Документ", dataIndex: "title", render: (title, row) => <Space direction="vertical" size={0}><Text strong>{title}</Text><Text type="secondary">ID {shortId(row.id)}</Text></Space> },
    { title: "Токенов", dataIndex: "token_count", render: (value) => value ?? "—" },
    { title: "Размер шингла", dataIndex: "shingle_size", render: (value) => value ?? "—" },
    { title: "Создан", dataIndex: "created_at", render: formatDate },
    { title: "Обновлен", dataIndex: "updated_at", render: formatDate },
  ];
  return (
    <Space direction="vertical" size={18} className="full-width">
      <PageTitle title="Архив уникальных работ" description="Документы, которые используются как накопленная база будущих сравнений." />
      <Card>
        <Table rowKey="id" columns={columns} dataSource={archive} scroll={{ x: 900 }} />
      </Card>
    </Space>
  );
}

function SettingsPage({ health, settings }) {
  return (
    <Space direction="vertical" size={18} className="full-width">
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
              Backend остается источником данных. Фронтенд использует существующие эндпоинты и не требует
              дополнительной схемы БД.
            </Paragraph>
            <Space wrap>
              <Button type="primary" href="/docs" target="_blank" icon={<DiffOutlined />}>Открыть Swagger</Button>
              <Button href="/openapi.json" target="_blank">OpenAPI JSON</Button>
            </Space>
          </Card>
        </Col>
      </Row>
    </Space>
  );
}

function ReportPage({ id, request, setHistory }) {
  const [result, setResult] = useState(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(false);
  const readerRef = useRef(null);
  const { message } = AntApp.useApp();

  const loadResult = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const data = await request(`/checks/${encodeURIComponent(id)}`);
      setResult(data);
      setHistory(appendHistory(data, data.submission_document_id || "Открытый отчет"));
    } catch (error) {
      message.error(error.message);
    } finally {
      setLoading(false);
    }
  }, [id, message, request, setHistory]);

  useEffect(() => {
    loadResult();
  }, [loadResult]);

  const matches = useMemo(() => {
    const items = (result?.matches || []).map((match, index) => ({ ...match, index }));
    const query = filter.trim().toLowerCase();
    return items
      .filter((match) => !query || `${match.source_title} ${match.fragment}`.toLowerCase().includes(query))
      .sort((a, b) => b.overlap_percent - a.overlap_percent || a.start_char - b.start_char);
  }, [filter, result]);

  const selected = result?.matches?.[selectedIndex] || null;

  const selectMatch = (index) => {
    setSelectedIndex(index);
    requestAnimationFrame(() => {
      const node = readerRef.current?.querySelector(`[data-match-index="${index}"]`);
      node?.scrollIntoView({ block: "center", behavior: "smooth" });
    });
  };

  const editOriginality = () => {
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
        const input = document.getElementById("originality-input");
        const value = Number(input?.value);
        if (Number.isNaN(value) || value < 0 || value > 100) throw new Error("Некорректный процент");
        const updated = await request(`/checks/${result.id}/originality`, {
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
      <Space direction="vertical" size={18} className="full-width">
        <PageTitle title="Отчет проверки" description="Загрузка результата..." />
        <Card loading={loading}>{!loading && <Empty description="Отчет не найден" />}</Card>
      </Space>
    );
  }

  return (
    <Space direction="vertical" size={18} className="full-width report-page">
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
                renderItem={(match) => (
                  <List.Item
                    className={match.index === selectedIndex ? "active-list-row" : ""}
                    onClick={() => selectMatch(match.index)}
                  >
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
    </Space>
  );
}

function DocumentReader({ onSelect, readerRef, result, selectedIndex }) {
  const chunks = useMemo(() => {
    const text = result.processed_text || "";
    const intervals = (result.matches || [])
      .map((match, index) => ({
        start: Number(match.start_char),
        end: Number(match.end_char),
        index,
      }))
      .filter((item) => Number.isFinite(item.start) && Number.isFinite(item.end) && item.end > item.start)
      .sort((a, b) => a.start - b.start || b.end - a.end);
    const output = [];
    let cursor = 0;
    for (const item of intervals) {
      const start = Math.max(cursor, item.start);
      const end = Math.min(text.length, item.end);
      if (start > cursor) output.push({ text: text.slice(cursor, start), mark: false });
      if (end > start) output.push({ text: text.slice(start, end), mark: true, index: item.index });
      cursor = Math.max(cursor, end);
    }
    if (cursor < text.length) output.push({ text: text.slice(cursor), mark: false });
    return output;
  }, [result]);

  return (
    <div className="document-reader" ref={readerRef}>
      {chunks.map((chunk, index) => chunk.mark ? (
        <mark
          key={`${chunk.index}-${index}`}
          data-match-index={chunk.index}
          className={chunk.index === selectedIndex ? "selected-hit" : ""}
          onClick={() => onSelect(chunk.index)}
        >
          {chunk.text}
        </mark>
      ) : (
        <span key={`text-${index}`}>{chunk.text}</span>
      ))}
    </div>
  );
}

function FragmentCompare({ match }) {
  const words = useMemo(() => {
    const pattern = /[\p{L}\p{N}_-]+/gu;
    const first = new Set(String(match.fragment || "").toLowerCase().match(pattern) || []);
    const second = new Set(String(match.source_fragment || "").toLowerCase().match(pattern) || []);
    return new Set([...first].filter((word) => word.length > 2 && second.has(word)));
  }, [match]);

  const render = (text) => {
    const pattern = new RegExp(`(${[...words].map(escapeRegExp).join("|")})`, "giu");
    if (!words.size) return text;
    return String(text || "").split(pattern).map((part, index) => (
      words.has(part.toLowerCase()) ? <mark key={index} className="shared-word">{part}</mark> : <span key={index}>{part}</span>
    ));
  };

  return (
    <Row gutter={[16, 16]}>
      <Col xs={24} lg={12}>
        <Card size="small" title="В проверяемой работе">
          <div className="fragment-text">{render(match.fragment)}</div>
        </Card>
      </Col>
      <Col xs={24} lg={12}>
        <Card size="small" title={`Источник: ${match.source_title}`} extra={<Tag color="red">{match.overlap_percent}%</Tag>}>
          <div className="fragment-text">{render(match.source_fragment)}</div>
        </Card>
      </Col>
    </Row>
  );
}

function EnterpriseApp() {
  const route = useHashRoute();
  const [authToken, setAuthToken] = useState(localStorage.getItem(TOKEN_KEY) || "");
  const [currentUser, setCurrentUser] = useState(readStorageJSON(USER_KEY, null));
  const [activeProfileId, setActiveProfileId] = useState(localStorage.getItem(PROFILE_KEY) || "");
  const [profiles, setProfiles] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [users, setUsers] = useState([]);
  const [rules, setRules] = useState([]);
  const [archive, setArchive] = useState([]);
  const [health, setHealth] = useState(null);
  const [settings, setSettings] = useState(null);
  const [history, setHistory] = useState(loadHistory);
  const [loading, setLoading] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const { message } = AntApp.useApp();

  const request = useCallback(async (path, options = {}) => {
    const headers = new Headers(options.headers || {});
    const token = localStorage.getItem(TOKEN_KEY) || authToken;
    if (token && !headers.has("Authorization")) headers.set("Authorization", `Bearer ${token}`);
    const response = await fetch(path, { ...options, headers });
    let data = null;
    try {
      data = await response.json();
    } catch {
      data = null;
    }
    if (!response.ok) throw new Error(parseError(data));
    return data;
  }, [authToken]);

  const saveAuth = useCallback((auth) => {
    setAuthToken(auth.token || "");
    setCurrentUser(auth.user || null);
    setProfiles(auth.profiles || []);
    const profileId = localStorage.getItem(PROFILE_KEY) || auth.active_profile_id || auth.profiles?.[0]?.id || "";
    setActiveProfileId(profileId);
    localStorage.setItem(TOKEN_KEY, auth.token || "");
    localStorage.setItem(USER_KEY, JSON.stringify(auth.user || null));
    localStorage.setItem(PROFILE_KEY, profileId);
  }, []);

  const logout = useCallback(() => {
    setAuthToken("");
    setCurrentUser(null);
    setProfiles([]);
    setActiveProfileId("");
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem(PROFILE_KEY);
    navigate("/login");
  }, []);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [healthData, settingsData, usersData, docsData, archiveData] = await Promise.all([
        request("/health"),
        request("/settings"),
        request("/users"),
        request("/documents"),
        request("/archive/unique"),
      ]);
      setHealth(healthData);
      setSettings(settingsData);
      setUsers(usersData);
      setDocuments(docsData);
      setArchive(archiveData);

      if (localStorage.getItem(TOKEN_KEY)) {
        const auth = await request("/me");
        saveAuth({ ...auth, active_profile_id: activeProfileId || auth.active_profile_id });
        const profileId = localStorage.getItem(PROFILE_KEY) || auth.active_profile_id;
        const rulesPath = profileId ? `/rules/exclusions?profile_id=${encodeURIComponent(profileId)}` : "/rules/exclusions";
        try {
          setRules(await request(rulesPath));
        } catch {
          setRules([]);
        }
      } else {
        setRules(await request("/rules/exclusions"));
      }
    } catch (error) {
      message.error(error.message);
    } finally {
      setLoading(false);
    }
  }, [activeProfileId, message, request, saveAuth]);

  useEffect(() => {
    loadAll();
  }, []);

  useEffect(() => {
    if (!authToken && !["/login", "/register"].includes(route.path)) {
      navigate("/login");
    }
  }, [authToken, route.path]);

  const changeProfile = async (profileId) => {
    setActiveProfileId(profileId);
    localStorage.setItem(PROFILE_KEY, profileId);
    try {
      const nextRules = await request(`/rules/exclusions?profile_id=${encodeURIComponent(profileId)}`);
      setRules(nextRules);
    } catch {
      setRules([]);
    }
  };

  if (route.path === "/login" || route.path === "/register") {
    return <AuthPage mode={route.path === "/register" ? "register" : "login"} onAuth={saveAuth} request={request} />;
  }

  let page = null;
  if (route.path.startsWith("/reports/")) {
    page = <ReportPage id={route.params.id} request={request} setHistory={setHistory} />;
  } else if (route.path === "/documents") {
    page = <DocumentsPage documents={documents} loadAll={loadAll} request={request} users={users} />;
  } else if (route.path === "/checks") {
    page = (
      <ChecksPage
        activeProfileId={activeProfileId}
        currentUser={currentUser}
        documents={documents}
        loadAll={loadAll}
        request={request}
        settings={settings}
        setHistory={setHistory}
      />
    );
  } else if (route.path === "/rules") {
    page = (
      <RulesPage
        activeProfileId={activeProfileId}
        currentUser={currentUser}
        loadAll={loadAll}
        profiles={profiles}
        request={request}
        rules={rules}
        setActiveProfileId={setActiveProfileId}
      />
    );
  } else if (route.path === "/archive") {
    page = <ArchivePage archive={archive} />;
  } else if (route.path === "/settings") {
    page = <SettingsPage health={health} settings={settings} />;
  } else {
    page = <OverviewPage documents={documents} health={health} history={history} settings={settings} />;
  }

  return (
    <AppShell
      activeProfileId={activeProfileId}
      collapsed={collapsed}
      currentUser={currentUser}
      health={health}
      loading={loading}
      onLogout={logout}
      onProfileChange={changeProfile}
      onRefresh={loadAll}
      profiles={profiles}
      routePath={route.path}
      setCollapsed={setCollapsed}
    >
      {page}
    </AppShell>
  );
}

export default function App() {
  return (
    <ConfigProvider
      theme={{
        algorithm: theme.defaultAlgorithm,
        token: {
          colorPrimary: "#155EEF",
          colorInfo: "#155EEF",
          borderRadius: 8,
          fontFamily: "Inter, IBM Plex Sans, Segoe UI, system-ui, sans-serif",
        },
        components: {
          Layout: {
            headerBg: "#ffffff",
            siderBg: "#101828",
          },
          Menu: {
            darkItemBg: "#101828",
            darkSubMenuItemBg: "#101828",
            darkItemSelectedBg: "#155EEF",
          },
        },
      }}
    >
      <AntApp>
        <EnterpriseApp />
      </AntApp>
    </ConfigProvider>
  );
}
