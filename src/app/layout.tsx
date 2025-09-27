import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'DiffPress - Антиплагиат отчетов',
  description:
    'Система проверки студенческих отчетов на совпадения с существующей базой с визуализацией диффа.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ru">
      <body className="app-body">
        <div className="app-shell">
          <header className="app-header">
            <div className="app-header__content">
              <div className="app-branding">
                <span className="app-logo">DiffPress</span>
                <p className="app-subtitle">
                  Визуальный антиплагиат и сравнение отчетов в стиле git diff
                </p>
              </div>
              <span className="app-badge">beta</span>
            </div>
          </header>
          <main className="app-main">{children}</main>
          <footer className="app-footer">
            © {new Date().getFullYear()} DiffPress. Сервис визуальной проверки совпадений.
          </footer>
        </div>
      </body>
    </html>
  );
}
