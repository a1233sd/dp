import { App as AntApp } from "antd";
import { useCallback, useEffect, useState } from "react";
import { AppShell } from "./AppShell";
import { PROFILE_KEY, TOKEN_KEY, USER_KEY } from "../lib/constants";
import { navigate, useHashRoute } from "../lib/routing";
import { loadHistory, parseError, readStorageJSON } from "../lib/storage";
import { ArchivePage } from "../pages/ArchivePage";
import { AuthPage } from "../pages/AuthPage";
import { ChecksPage } from "../pages/ChecksPage";
import { DocumentsPage } from "../pages/DocumentsPage";
import { OverviewPage } from "../pages/OverviewPage";
import { ReportPage } from "../pages/ReportPage";
import { RulesPage } from "../pages/RulesPage";
import { SettingsPage } from "../pages/SettingsPage";
import type {
  ApiRequest,
  ArchiveItem,
  AuthPayload,
  CheckHistoryItem,
  DocumentItem,
  ExclusionRule,
  Health,
  ServiceStatus,
  Settings,
  User,
  UserProfile,
} from "../types";

function pickProfileId(auth: AuthPayload, preferred?: string | null): string {
  const stored = localStorage.getItem(PROFILE_KEY);
  const candidates = [preferred, stored, auth.active_profile_id, auth.profiles[0]?.id].filter(Boolean) as string[];
  return candidates.find((id) => auth.profiles.some((profile) => profile.id === id)) || "";
}

export function EnterpriseApp() {
  const route = useHashRoute();
  const [authToken, setAuthToken] = useState(() => localStorage.getItem(TOKEN_KEY) || "");
  const [currentUser, setCurrentUser] = useState<User | null>(() => readStorageJSON<User | null>(USER_KEY, null));
  const [activeProfileId, setActiveProfileId] = useState(() => localStorage.getItem(PROFILE_KEY) || "");
  const [profiles, setProfiles] = useState<UserProfile[]>([]);
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [rules, setRules] = useState<ExclusionRule[]>([]);
  const [archive, setArchive] = useState<ArchiveItem[]>([]);
  const [health, setHealth] = useState<Health | null>(null);
  const [serviceStatus, setServiceStatus] = useState<ServiceStatus>("unknown");
  const [settings, setSettings] = useState<Settings | null>(null);
  const [history, setHistory] = useState<CheckHistoryItem[]>(loadHistory);
  const [loading, setLoading] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const { message } = AntApp.useApp();

  const request = useCallback(async <T,>(path: string, options: RequestInit = {}): Promise<T> => {
    const headers = new Headers(options.headers || {});
    const token = localStorage.getItem(TOKEN_KEY) || authToken;
    if (token && !headers.has("Authorization")) headers.set("Authorization", `Bearer ${token}`);

    let response: Response;
    try {
      response = await fetch(path, { ...options, headers });
    } catch (error) {
      throw new Error(
        `API недоступен для ${path}. Проверьте, что FastAPI запущен, и открывайте приложение через http://127.0.0.1:8000/ или используйте Vite proxy.`,
      );
    }

    const rawBody = await response.text();
    let data: unknown = null;
    if (rawBody) {
      try {
        data = JSON.parse(rawBody);
      } catch {
        data = null;
      }
    }
    if (!response.ok) {
      throw new Error(parseError(data, {
        body: rawBody,
        path,
        status: response.status,
        statusText: response.statusText,
      }));
    }
    return data as T;
  }, [authToken]);

  const saveAuth = useCallback((auth: AuthPayload, preferredProfileId?: string | null) => {
    const nextProfileId = pickProfileId(auth, preferredProfileId);
    setAuthToken(auth.token || "");
    setCurrentUser(auth.user || null);
    setProfiles(auth.profiles || []);
    setActiveProfileId(nextProfileId);
    localStorage.setItem(TOKEN_KEY, auth.token || "");
    localStorage.setItem(USER_KEY, JSON.stringify(auth.user || null));
    localStorage.setItem(PROFILE_KEY, nextProfileId);
  }, []);

  const logout = useCallback(() => {
    setAuthToken("");
    setCurrentUser(null);
    setProfiles([]);
    setActiveProfileId("");
    setHealth(null);
    setServiceStatus("unknown");
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem(PROFILE_KEY);
    navigate("/login");
  }, []);

  const checkHealth = useCallback(async () => {
    setServiceStatus("checking");
    try {
      const healthData = await request<Health>("/health");
      setHealth(healthData);
      setServiceStatus(healthData?.status === "ok" ? "available" : "unavailable");
      return healthData;
    } catch {
      setHealth(null);
      setServiceStatus("unavailable");
      return null;
    }
  }, [request]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    void checkHealth();
    try {
      const [settingsData, usersData, docsData, archiveData] = await Promise.all([
        request<Settings>("/settings"),
        request<User[]>("/users"),
        request<DocumentItem[]>("/documents"),
        request<ArchiveItem[]>("/archive/unique"),
      ]);
      setSettings(settingsData);
      setUsers(usersData);
      setDocuments(docsData);
      setArchive(archiveData);

      if (localStorage.getItem(TOKEN_KEY)) {
        const auth = await request<AuthPayload>("/me");
        const profileId = pickProfileId(auth, activeProfileId);
        saveAuth(auth, profileId);
        const rulesPath = profileId ? `/rules/exclusions?profile_id=${encodeURIComponent(profileId)}` : "/rules/exclusions";
        try {
          setRules(await request<ExclusionRule[]>(rulesPath));
        } catch {
          setRules([]);
        }
      } else {
        setRules(await request<ExclusionRule[]>("/rules/exclusions"));
      }
    } catch (error) {
      message.error(error instanceof Error ? error.message : "Не удалось обновить данные");
    } finally {
      setLoading(false);
    }
  }, [activeProfileId, checkHealth, message, request, saveAuth]);

  useEffect(() => {
    const hasToken = Boolean(authToken || localStorage.getItem(TOKEN_KEY));
    if (hasToken && !["/login", "/register"].includes(route.path)) {
      void loadAll();
    }
  }, [authToken, loadAll, route.path]);

  useEffect(() => {
    const hasToken = Boolean(authToken || localStorage.getItem(TOKEN_KEY));
    if (!hasToken && !["/login", "/register"].includes(route.path)) {
      navigate("/login");
    }
  }, [authToken, route.path]);

  const changeProfile = useCallback(async (profileId: string) => {
    setActiveProfileId(profileId);
    localStorage.setItem(PROFILE_KEY, profileId);
    try {
      const nextRules = await request<ExclusionRule[]>(`/rules/exclusions?profile_id=${encodeURIComponent(profileId)}`);
      setRules(nextRules);
    } catch {
      setRules([]);
    }
  }, [request]);

  const handleAuth = useCallback((auth: AuthPayload) => {
    saveAuth(auth);
  }, [saveAuth]);

  if (route.path === "/login" || route.path === "/register") {
    return <AuthPage mode={route.path === "/register" ? "register" : "login"} onAuth={handleAuth} request={request} />;
  }

  let page = <OverviewPage documents={documents} health={health} history={history} settings={settings} />;
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
        onProfileChange={changeProfile}
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
  }

  return (
    <AppShell
      activeProfileId={activeProfileId}
      collapsed={collapsed}
      currentUser={currentUser}
      loading={loading}
      onLogout={logout}
      onProfileChange={changeProfile}
      onRefresh={loadAll}
      profiles={profiles}
      routePath={route.path}
      serviceStatus={serviceStatus}
      setCollapsed={setCollapsed}
    >
      {page}
    </AppShell>
  );
}
