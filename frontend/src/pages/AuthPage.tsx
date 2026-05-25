import { App as AntApp, Badge, Button, Card, Divider, Form, Input, Radio, Typography } from "antd";
import { LoginOutlined, UserOutlined } from "@ant-design/icons";
import { navigate } from "../lib/routing";
import type { ApiRequest, AuthPayload, UserRole } from "../types";

const { Paragraph, Title } = Typography;

interface AuthPageProps {
  mode: "login" | "register";
  onAuth: (auth: AuthPayload) => void;
  request: ApiRequest;
}

interface AuthFormValues {
  full_name?: string;
  role?: UserRole;
  email: string;
  password: string;
}

export function AuthPage({ mode, onAuth, request }: AuthPageProps) {
  const [form] = Form.useForm<AuthFormValues>();
  const { message } = AntApp.useApp();
  const isLogin = mode === "login";

  const submit = async (values: AuthFormValues) => {
    try {
      const auth = await request<AuthPayload>(isLogin ? "/auth/login" : "/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      onAuth(auth);
      message.success(isLogin ? "Вход выполнен" : "Аккаунт создан");
      navigate("/overview");
    } catch (error) {
      message.error(error instanceof Error ? error.message : "Не удалось войти");
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
          <Title level={2}>{isLogin ? "Вход" : "Регистрация"}</Title>
          <Typography.Text type="secondary">
            {isLogin ? "Продолжите работу в консоли проверки." : "Создайте пользователя и основной профиль правил."}
          </Typography.Text>

          <Form form={form} layout="vertical" onFinish={submit} className="auth-form">
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
