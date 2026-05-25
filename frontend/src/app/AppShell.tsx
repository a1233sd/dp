import {
  Button,
  Avatar,
  Badge,
  Layout,
  Menu,
  Select,
  Space,
  Tooltip,
  Grid,
} from "antd";
import {
  AppstoreOutlined,
  AuditOutlined,
  DashboardOutlined,
  FileSearchOutlined,
  FolderOpenOutlined,
  LogoutOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  ReloadOutlined,
  SafetyCertificateOutlined,
  SettingOutlined,
  UserOutlined,
} from "@ant-design/icons";
import type { ReactNode } from "react";
import { roleLabel } from "../lib/constants";
import { navigate } from "../lib/routing";
import type { Health, User, UserProfile } from "../types";

const { Content, Header, Sider } = Layout;
const { useBreakpoint } = Grid;

interface AppShellProps {
  activeProfileId: string;
  children: ReactNode;
  collapsed: boolean;
  currentUser: User | null;
  health: Health | null;
  loading: boolean;
  onLogout: () => void;
  onProfileChange: (profileId: string) => void;
  onRefresh: () => void;
  profiles: UserProfile[];
  routePath: string;
  setCollapsed: (value: boolean) => void;
}

export function AppShell({
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
}: AppShellProps) {
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
          <AppstoreOutlined />
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
            <Badge
              status={health?.status === "ok" ? "success" : "default"}
              text={health?.status === "ok" ? "Сервис доступен" : "Статус неизвестен"}
            />
          </Space>

          <Space size="middle" wrap>
            <Select
              className="profile-select"
              value={activeProfileId || undefined}
              placeholder="Профиль правил"
              options={profiles.map((profile) => ({ value: profile.id, label: profile.name }))}
              onChange={onProfileChange}
            />
            <Button icon={<ReloadOutlined />} loading={loading} onClick={onRefresh}>
              Обновить
            </Button>
            <Avatar icon={<UserOutlined />} />
            <div className="user-caption">
              <strong>{currentUser?.full_name || "Гость"}</strong>
              <span>{currentUser ? roleLabel[currentUser.role] : "без роли"}</span>
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
