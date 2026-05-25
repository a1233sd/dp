import {
  App as AntApp,
  Avatar,
  Button,
  Card,
  Col,
  Drawer,
  Form,
  Input,
  List,
  Modal,
  Popconfirm,
  Row,
  Select,
  Space,
  Table,
  Tag,
  Typography,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { ApartmentOutlined, DeleteOutlined, EditOutlined, PlusOutlined } from "@ant-design/icons";
import { useState } from "react";
import { PageTitle } from "../components/PageTitle";
import { PROFILE_KEY, ruleTypeLabel } from "../lib/constants";
import { shortId } from "../lib/format";
import type { ApiRequest, ExclusionRule, RuleType, User, UserProfile } from "../types";

const { Text } = Typography;

interface RulesPageProps {
  activeProfileId: string;
  currentUser: User | null;
  loadAll: () => Promise<void>;
  onProfileChange: (profileId: string) => Promise<void>;
  profiles: UserProfile[];
  request: ApiRequest;
  rules: ExclusionRule[];
  setActiveProfileId: (profileId: string) => void;
}

interface ProfileFormValues {
  name: string;
}

interface RuleFormValues {
  name: string;
  rule_type: RuleType;
  value: string;
  description?: string;
}

export function RulesPage({
  activeProfileId,
  currentUser,
  loadAll,
  onProfileChange,
  profiles,
  request,
  rules,
  setActiveProfileId,
}: RulesPageProps) {
  const [profileForm] = Form.useForm<ProfileFormValues>();
  const [renameForm] = Form.useForm<ProfileFormValues>();
  const [ruleForm] = Form.useForm<RuleFormValues>();
  const [ruleOpen, setRuleOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const { message } = AntApp.useApp();

  const activeProfile = profiles.find((profile) => profile.id === activeProfileId);

  const createProfile = async (values: ProfileFormValues) => {
    const profile = await request<UserProfile>("/profiles", {
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

  const renameProfile = async (values: ProfileFormValues) => {
    await request(`/profiles/${activeProfileId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
    setRenameOpen(false);
    message.success("Профиль переименован");
    await loadAll();
  };

  const deleteProfile = async () => {
    const result = await request<{ active_profile_id: string }>(`/profiles/${activeProfileId}`, { method: "DELETE" });
    setActiveProfileId(result.active_profile_id);
    localStorage.setItem(PROFILE_KEY, result.active_profile_id);
    message.success("Профиль удален");
    await loadAll();
  };

  const createRule = async (values: RuleFormValues) => {
    const payload: Record<string, unknown> = { ...values };
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

  const deleteRule = async (id: string) => {
    await request(`/rules/exclusions/${id}`, { method: "DELETE" });
    message.success("Правило удалено");
    await loadAll();
  };

  const columns: ColumnsType<ExclusionRule> = [
    { title: "Название", dataIndex: "name" },
    { title: "Тип", dataIndex: "rule_type", render: (type: RuleType) => <Tag>{ruleTypeLabel[type]}</Tag> },
    { title: "Значение", dataIndex: "value", render: (value: string) => <Text code>{value}</Text> },
    { title: "Описание", dataIndex: "description", render: (value?: string | null) => value || "—" },
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
    <div className="page-stack">
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
                  onClick={() => onProfileChange(profile.id)}
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
              <Button
                disabled={!activeProfileId}
                icon={<EditOutlined />}
                onClick={() => {
                  renameForm.setFieldsValue({ name: activeProfile?.name || "" });
                  setRenameOpen(true);
                }}
              >
                Переименовать
              </Button>
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

      <Modal
        title="Переименовать профиль"
        open={renameOpen}
        onCancel={() => setRenameOpen(false)}
        okText="Сохранить"
        onOk={() => renameForm.submit()}
      >
        <Form form={renameForm} layout="vertical" onFinish={renameProfile}>
          <Form.Item name="name" label="Название" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
