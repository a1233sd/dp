import { App as AntApp, ConfigProvider, theme } from "antd";
import "antd/dist/reset.css";
import { EnterpriseApp } from "./app/EnterpriseApp";

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
