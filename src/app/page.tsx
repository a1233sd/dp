'use client';

import { useEffect, useRef, useState } from 'react';
import { DiffViewer, DiffSegment } from './components/DiffViewer';

interface ReportListItem {
  id: string;
  originalName: string;
  createdAt: string;
  cloudLink: string | null;
  addedToCloud: boolean;
  priorityIndexedAt: string | null;
  latestCheck: {
    id: string;
    status: string;
    similarity: number | null;
    createdAt: string;
  } | null;
}

interface CheckDetails {
  id: string;
  status: string;
  similarity: number | null;
  matches: MatchResult[];
  createdAt: string;
  completedAt: string | null;
  reportId: string;
  reportName: string | null;
  reportCloudLink: string | null;
  reportAddedToCloud: boolean;
  reportPriorityIndexedAt: string | null;
}

interface MatchResult {
  reportId: string;
  reportName: string;
  similarity: number;
  diffPreview: string;
}

export default function HomePage() {
  const [reports, setReports] = useState<ReportListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedCheckId, setSelectedCheckId] = useState<string | null>(null);
  const [checkDetails, setCheckDetails] = useState<CheckDetails | null>(null);
  const [selectedMatch, setSelectedMatch] = useState<MatchResult | null>(null);
  const [diff, setDiff] = useState<DiffSegment[]>([]);
  const [diffLoading, setDiffLoading] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [cloudLinkDraft, setCloudLinkDraft] = useState('');
  const [cloudLinkConfirmed, setCloudLinkConfirmed] = useState<string | null>(null);
  const [cloudLinkError, setCloudLinkError] = useState<string | null>(null);
  const [cloudActionId, setCloudActionId] = useState<string | null>(null);
  const cloudLinkInputRef = useRef<HTMLInputElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cloudReportsCount = reports.filter((report) => report.addedToCloud).length;
  const priorityIndexedCount = reports.filter((report) => Boolean(report.priorityIndexedAt)).length;

  const loadReports = async () => {
    const response = await fetch('/api/reports');
    if (!response.ok) {
      throw new Error('Не удалось загрузить отчеты');
    }
    const data = await response.json();
    setReports(
      data.reports.map((report: ReportListItem) => ({
        ...report,
        cloudLink: report.cloudLink ?? null,
        addedToCloud: report.addedToCloud ?? false,
        priorityIndexedAt: report.priorityIndexedAt ?? null,
      }))
    );
  };

  useEffect(() => {
    loadReports().catch((err) => setError(err.message));
  }, []);

  useEffect(() => {
    if (!selectedCheckId) {
      return;
    }
    let cancelled = false;

    const fetchCheck = async () => {
      const response = await fetch(`/api/checks/${selectedCheckId}`);
      if (!response.ok) {
        throw new Error('Не удалось загрузить проверку');
      }
      const data = await response.json();
      if (!cancelled) {
        setCheckDetails({
          ...data.check,
          reportName: data.check.reportName ?? null,
          reportCloudLink: data.check.reportCloudLink ?? null,
          reportAddedToCloud: data.check.reportAddedToCloud ?? false,
          reportPriorityIndexedAt: data.check.reportPriorityIndexedAt ?? null,
        });
        if (data.check.status === 'completed') {
          setSelectedMatch(null);
          setDiff([]);
        }
      }
      if (data.check.status !== 'completed') {
        setTimeout(fetchCheck, 2000);
      } else {
        loadReports().catch(() => undefined);
      }
    };

    fetchCheck().catch((err) => setError(err.message));

    return () => {
      cancelled = true;
    };
  }, [selectedCheckId]);

  useEffect(() => {
    if (!checkDetails || !selectedMatch) {
      return;
    }
    setDiffLoading(true);
    fetch(`/api/diff?source=${checkDetails.reportId}&target=${selectedMatch.reportId}`)
      .then(async (response) => {
        if (!response.ok) {
          throw new Error('Не удалось получить diff');
        }
        const data = await response.json();
        setDiff(data.diff);
      })
      .catch((err) => setError(err.message))
      .finally(() => setDiffLoading(false));
  }, [checkDetails, selectedMatch]);

  const handleUpload = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!cloudLinkConfirmed) {
      setError('Добавьте и подтвердите ссылку на облако перед загрузкой отчета.');
      return;
    }
    const formData = new FormData(event.currentTarget);
    formData.set('cloudLink', cloudLinkConfirmed);
    const file = formData.get('file');
    if (!(file instanceof File)) {
      setError('Выберите PDF файл');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/reports', {
        method: 'POST',
        body: formData,
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message ?? 'Ошибка загрузки файла');
      }
      const data = await response.json();
      setSelectedCheckId(data.checkId);
      await loadReports();
      event.currentTarget.reset();
      setFileName(null);
      const fileInput = event.currentTarget.querySelector<HTMLInputElement>('input[name="file"]');
      if (fileInput) {
        fileInput.value = '';
      }
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Неизвестная ошибка');
      }
    } finally {
      setLoading(false);
    }
  };

  const confirmCloudLink = () => {
    if (!cloudLinkDraft.trim()) {
      setCloudLinkError('Укажите ссылку на облачный диск.');
      setCloudLinkConfirmed(null);
      return;
    }

    try {
      const parsed = new URL(cloudLinkDraft.trim());
      const normalized = parsed.toString();
      setCloudLinkDraft(normalized);
      setCloudLinkConfirmed(normalized);
      setCloudLinkError(null);
      setError(null);
    } catch {
      setCloudLinkError('Некорректная ссылка на облачный диск.');
      setCloudLinkConfirmed(null);
    }
  };

  const resetCloudLink = () => {
    setCloudLinkConfirmed(null);
    setCloudLinkError(null);
    setError(null);
    setTimeout(() => cloudLinkInputRef.current?.focus(), 0);
  };

  const applyReportPatch = (patched: {
    id: string;
    originalName?: string;
    cloudLink?: string | null;
    addedToCloud?: boolean;
    priorityIndexedAt?: string | null;
  }) => {
    setReports((current) =>
      current.map((item) => {
        if (item.id !== patched.id) {
          return item;
        }
        return {
          ...item,
          ...(patched.originalName !== undefined ? { originalName: patched.originalName } : {}),
          ...(patched.cloudLink !== undefined ? { cloudLink: patched.cloudLink } : {}),
          ...(patched.addedToCloud !== undefined ? { addedToCloud: patched.addedToCloud } : {}),
          ...(patched.priorityIndexedAt !== undefined
            ? { priorityIndexedAt: patched.priorityIndexedAt }
            : {}),
        };
      })
    );
    setCheckDetails((current) => {
      if (!current || current.reportId !== patched.id) {
        return current;
      }
      return {
        ...current,
        ...(patched.originalName !== undefined ? { reportName: patched.originalName } : {}),
        ...(patched.cloudLink !== undefined ? { reportCloudLink: patched.cloudLink } : {}),
        ...(patched.addedToCloud !== undefined ? { reportAddedToCloud: patched.addedToCloud } : {}),
        ...(patched.priorityIndexedAt !== undefined
          ? { reportPriorityIndexedAt: patched.priorityIndexedAt }
          : {}),
      };
    });
  };

  const requestCloudLinkUpdate = async (reportId: string, currentLink: string | null) => {
    const nextLink = window.prompt('Вставьте ссылку на облачный диск', currentLink ?? '');
    if (nextLink === null) {
      return;
    }
    const trimmed = nextLink.trim();
    setCloudActionId(reportId);
    setError(null);
    try {
      const response = await fetch(`/api/reports/${reportId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ cloudLink: trimmed.length ? trimmed : null }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const message = (payload as { message?: string }).message ?? 'Не удалось сохранить ссылку';
        throw new Error(message);
      }
      if (payload && typeof payload === 'object' && 'report' in payload) {
        const reportPayload = (payload as {
          report: {
            id: string;
            originalName?: string;
            cloudLink?: string | null;
            addedToCloud?: boolean;
            priorityIndexedAt?: string | null;
          };
        }).report;
        applyReportPatch({
          id: reportPayload.id,
          originalName: reportPayload.originalName,
          cloudLink: reportPayload.cloudLink ?? null,
          addedToCloud: reportPayload.addedToCloud ?? false,
          priorityIndexedAt: reportPayload.priorityIndexedAt ?? null,
        });
      }
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Неизвестная ошибка при обновлении ссылки');
      }
    } finally {
      setCloudActionId(null);
    }
  };

  const markReportAddedToCloud = async (reportId: string) => {
    const report = reports.find((item) => item.id === reportId);
    const existingLink = report?.cloudLink ?? (checkDetails?.reportId === reportId ? checkDetails.reportCloudLink : null);
    if (!existingLink) {
      setError('Сначала добавьте ссылку на облачный диск.');
      return;
    }
    setCloudActionId(reportId);
    setError(null);
    try {
      const response = await fetch(`/api/reports/${reportId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ addedToCloud: true }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const message = (payload as { message?: string }).message ?? 'Не удалось обновить статус отчета';
        throw new Error(message);
      }
      if (payload && typeof payload === 'object' && 'report' in payload) {
        const reportPayload = (payload as {
          report: {
            id: string;
            originalName?: string;
            cloudLink?: string | null;
            addedToCloud?: boolean;
            priorityIndexedAt?: string | null;
          };
        }).report;
        applyReportPatch({
          id: reportPayload.id,
          originalName: reportPayload.originalName,
          cloudLink: reportPayload.cloudLink ?? null,
          addedToCloud: reportPayload.addedToCloud ?? false,
          priorityIndexedAt: reportPayload.priorityIndexedAt ?? null,
        });
      }
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Неизвестная ошибка при обновлении статуса облака');
      }
    } finally {
      setCloudActionId(null);
    }
  };

  return (
    <div className="page-stack">
      <section className="card card--hero fade-in">
        <span className="card__eyebrow">Быстрый старт</span>
        <h2 className="card__title">Подключите облако и проверяйте отчеты на плагиат</h2>
        <p className="card__subtitle">
          Сначала добавьте ссылку на облачное хранилище с эталонными материалами, затем загружайте новые PDF‑отчеты.
          DiffPress сравнит их с облачной базой и подсветит совпадения в формате git diff.
        </p>
        <div className="hero-actions">
          <button
            type="button"
            className="button button--primary"
            onClick={() => cloudLinkInputRef.current?.focus()}
          >
            Добавить ссылку на облако
          </button>
          <button
            type="button"
            className="button button--ghost"
            onClick={() => fileInputRef.current?.click()}
            disabled={!cloudLinkConfirmed || loading}
          >
            Загрузить PDF
          </button>
          <span className="text-muted">
            В облачной базе:{' '}
            {cloudReportsCount}{' '}
            {pluralize(cloudReportsCount, 'отчет', 'отчета', 'отчетов')}
          </span>
          <span className="text-muted">
            Приоритетный индекс:{' '}
            {priorityIndexedCount}{' '}
            {pluralize(priorityIndexedCount, 'отчет', 'отчета', 'отчетов')}
          </span>
          {selectedCheckId && (
            <span className="status-chip status-chip--processing">Проверка #{selectedCheckId.slice(0, 8)}…</span>
          )}
        </div>
      </section>

      <section className="card fade-in" id="upload">
        <div className="card__header">
          <h3 className="card__header-title">Загрузка нового отчета</h3>
          {selectedCheckId && (
            <span className="status-chip status-chip--processing">Текущая проверка #{selectedCheckId.slice(0, 8)}</span>
          )}
        </div>
        <form onSubmit={handleUpload} className="upload-form">
          <input type="hidden" name="cloudLink" value={cloudLinkConfirmed ?? ''} />
          <div className={`form-step${cloudLinkConfirmed ? ' form-step--completed' : ''}`}>
            <div className="form-step__header">
              <span className="form-step__number">1</span>
              <div>
                <h4 className="form-step__title">Добавьте ссылку на облачное хранилище</h4>
                <p className="form-step__description">
                  Укажите папку с архивом отчетов в облаке. Только файлы из этой папки участвуют в проверке.
                </p>
              </div>
            </div>
            <div className="form-step__body">
              <input
                ref={cloudLinkInputRef}
                className="form-field__input"
                type="url"
                placeholder="https://disk.yandex.ru/... или https://cloud.mail.ru/..."
                value={cloudLinkDraft}
                onChange={(event) => {
                  setCloudLinkDraft(event.target.value);
                  if (cloudLinkError) {
                    setCloudLinkError(null);
                  }
                }}
                disabled={Boolean(cloudLinkConfirmed)}
              />
              <div className="form-step__actions">
                {cloudLinkConfirmed ? (
                  <button type="button" className="button button--ghost" onClick={resetCloudLink}>
                    Изменить ссылку
                  </button>
                ) : (
                  <button type="button" className="button button--primary" onClick={confirmCloudLink}>
                    Сохранить ссылку
                  </button>
                )}
              </div>
            </div>
            {cloudLinkError && <p className="form-step__error">{cloudLinkError}</p>}
            {cloudLinkConfirmed && (
              <p className="form-step__success">Ссылка сохранена. Теперь можно загружать отчеты для проверки.</p>
            )}
          </div>
          <div
            className={`form-step${cloudLinkConfirmed ? ' form-step--enabled' : ' form-step--disabled'}`}
            aria-disabled={!cloudLinkConfirmed}
          >
            <div className="form-step__header">
              <span className="form-step__number">2</span>
              <div>
                <h4 className="form-step__title">Загрузите PDF для проверки</h4>
                <p className="form-step__description">
                  Файл будет проверен на плагиат среди материалов по указанной ссылке.
                </p>
              </div>
            </div>
            <label className={`dropzone${!cloudLinkConfirmed ? ' dropzone--disabled' : ''}`}>
              <input
                ref={fileInputRef}
                className="dropzone__input"
                type="file"
                name="file"
                accept="application/pdf"
                required
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  setFileName(file ? file.name : null);
                }}
                disabled={!cloudLinkConfirmed || loading}
              />
              <div className="dropzone__content">
                <div className="dropzone__icon">⬆️</div>
                <div className="dropzone__text">
                  {fileName ? `Выбран файл: ${fileName}` : 'Перетащите PDF или выберите файл'}
                </div>
                <div className="dropzone__hint">Формат PDF, текст будет извлечен автоматически</div>
              </div>
            </label>
            <div className="form-footer">
              <button type="submit" className="button button--primary" disabled={loading || !cloudLinkConfirmed}>
                {loading ? 'Отправка…' : 'Отправить на проверку'}
              </button>
              <span className="text-muted">
                Проверка выполняется только по архиву из облачного хранилища. Добавьте ссылку и загружайте новые отчеты.
              </span>
            </div>
          </div>
        </form>
        {error && <p className="error-banner">{error}</p>}
      </section>

      <section className="card fade-in">
        <div className="card__header">
          <h3 className="card__header-title">База отчетов</h3>
          <span className="text-muted">
            Отчеты с добавленной облачной ссылкой участвуют в проверках. Выберите запись, чтобы увидеть результаты.
          </span>
        </div>
        <div className="reports-table">
          <table className="table">
            <thead>
              <tr>
                <th>Название</th>
                <th>Дата загрузки</th>
                <th>Статус проверки</th>
                <th>Совпадение</th>
                <th>Облачная база</th>
                <th>Индексация</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {reports.map((report) => {
                const latestCheck = report.latestCheck;
                const similarityText =
                  latestCheck?.similarity != null ? `${latestCheck.similarity.toFixed(2)}%` : '—';
                const isActive = latestCheck?.id === selectedCheckId;
                const priorityIndexedAt = report.priorityIndexedAt;
                return (
                  <tr key={report.id} className={isActive ? 'table__row--active' : undefined}>
                    <td>{report.originalName}</td>
                    <td>{new Date(report.createdAt).toLocaleString()}</td>
                    <td>
                      {latestCheck ? (
                        <span className={`status-chip ${statusClass(latestCheck.status)}`}>
                          {statusLabel(latestCheck.status)}
                        </span>
                      ) : (
                        <span className="status-chip status-chip--muted">Нет проверок</span>
                      )}
                    </td>
                    <td>{similarityText}</td>
                    <td>
                      <div className="cloud-cell">
                        {report.cloudLink ? (
                          <a
                            className="cloud-cell__link"
                            href={report.cloudLink}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            Открыть облако
                          </a>
                        ) : (
                          <span className="text-muted">Ссылка не указана</span>
                        )}
                        <div className="cloud-cell__footer">
                          <span
                            className={`status-chip ${
                              report.addedToCloud ? 'status-chip--completed' : 'status-chip--muted'
                            }`}
                          >
                            {report.addedToCloud ? 'В облачной базе' : 'Не в базе'}
                          </span>
                          <button
                            type="button"
                            className="button button--ghost cloud-cell__action"
                            onClick={() => requestCloudLinkUpdate(report.id, report.cloudLink)}
                            disabled={cloudActionId === report.id}
                          >
                            {report.cloudLink ? 'Изменить' : 'Добавить'}
                          </button>
                        </div>
                      </div>
                    </td>
                    <td>
                      <div className="cloud-cell">
                        <span
                          className={`status-chip ${
                            priorityIndexedAt ? 'status-chip--processing' : 'status-chip--muted'
                          }`}
                        >
                          {priorityIndexedAt ? 'В приоритете' : 'Ждет совпадения'}
                        </span>
                        <div className="cloud-cell__footer">
                          <span className="text-muted">
                            {priorityIndexedAt
                              ? `С ${new Date(priorityIndexedAt).toLocaleString()}`
                              : 'Индекс обновится после фиксации плагиата'}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td>
                      {latestCheck && (
                        <button
                          type="button"
                          className="button button--ghost"
                          onClick={() => setSelectedCheckId(latestCheck.id)}
                        >
                          Открыть
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {checkDetails && (
        <section className="card fade-in">
          <div className="card__header">
            <h3 className="card__header-title">Результаты проверки</h3>
            <span className={`status-chip ${statusClass(checkDetails.status)}`}>
              {statusLabel(checkDetails.status)}
            </span>
          </div>
          <p className="text-muted">
            Отчет проверен {new Date(checkDetails.createdAt).toLocaleString()}.
            {checkDetails.completedAt
              ? ` Завершено ${new Date(checkDetails.completedAt).toLocaleString()}.`
              : ' Проверка выполняется…'}
            {checkDetails.similarity != null &&
              ` Максимальное совпадение: ${checkDetails.similarity.toFixed(2)}%.`}
          </p>

          <div className="cloud-panel">
            <div className="cloud-panel__header">
              <h4 className="cloud-panel__title">Облачный диск</h4>
              <span
                className={`status-chip ${
                  checkDetails.reportAddedToCloud ? 'status-chip--completed' : 'status-chip--muted'
                }`}
              >
                {checkDetails.reportAddedToCloud ? 'Отчет в облачной базе' : 'Не в базе'}
              </span>
            </div>
            <p className="cloud-panel__description">
              Укажите ссылку на папку в облачном хранилище, где лежат оригинальные отчеты. Только такие отчеты попадают в облачную
              базу для последующих проверок.
            </p>
            <div className="cloud-panel__meta">
              <span
                className={`status-chip ${
                  checkDetails.reportPriorityIndexedAt ? 'status-chip--processing' : 'status-chip--muted'
                }`}
              >
                {checkDetails.reportPriorityIndexedAt
                  ? 'Текст в приоритетном индексе'
                  : 'Нет приоритетного индекса'}
              </span>
              <span className="text-muted">
                {checkDetails.reportPriorityIndexedAt
                  ? `Обновлено ${new Date(checkDetails.reportPriorityIndexedAt).toLocaleString()}`
                  : 'После первого совпадения отчет будет проверяться в первую очередь.'}
              </span>
            </div>
            <div className="cloud-panel__actions">
              {checkDetails.reportCloudLink ? (
                <>
                  <a
                    className="button button--secondary"
                    href={checkDetails.reportCloudLink}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Открыть диск
                  </a>
                  <button
                    type="button"
                    className="button button--ghost"
                    onClick={() => requestCloudLinkUpdate(checkDetails.reportId, checkDetails.reportCloudLink)}
                    disabled={cloudActionId === checkDetails.reportId}
                  >
                    Изменить ссылку
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="button button--ghost"
                  onClick={() => requestCloudLinkUpdate(checkDetails.reportId, null)}
                  disabled={cloudActionId === checkDetails.reportId}
                >
                  Добавить ссылку
                </button>
              )}
              <button
                type="button"
                className="button button--primary"
                onClick={() => markReportAddedToCloud(checkDetails.reportId)}
                disabled={
                  cloudActionId === checkDetails.reportId ||
                  !checkDetails.reportCloudLink ||
                  checkDetails.reportAddedToCloud
                }
              >
                {checkDetails.reportAddedToCloud ? 'Добавлено' : 'Добавить отчет в облако'}
              </button>
            </div>
            {!checkDetails.reportCloudLink && (
              <p className="cloud-panel__hint">Без ссылки мы не сможем сохранить путь к облаку для этого отчета.</p>
            )}
          </div>

          {checkDetails.matches.length === 0 ? (
            <div className="diff-placeholder">
              Совпадений среди отчетов в облачном архиве не найдено — отчет уникален.
            </div>
          ) : (
            <div className="results-grid">
              <div className="matches-panel">
                <h4>Совпадения</h4>
                <p className="text-muted">
                  {checkDetails.matches.length}{' '}
                  {pluralize(checkDetails.matches.length, 'совпадение', 'совпадения', 'совпадений')} найдено.
                  Сравнение проводится с отчетами, добавленными в облако. Выберите файл, чтобы увидеть подробный diff.
                </p>
                <ul className="matches-list">
                  {checkDetails.matches.map((match) => {
                    const active = selectedMatch?.reportId === match.reportId;
                    return (
                      <li key={match.reportId}>
                        <button
                          type="button"
                          className={`match-card ${active ? 'match-card--active' : ''}`}
                          onClick={() => setSelectedMatch(match)}
                        >
                          <h5 className="match-card__title">{match.reportName}</h5>
                          <span className="match-card__meta">Совпадение: {match.similarity.toFixed(2)}%</span>
                          <pre className="match-card__preview">{match.diffPreview || 'Фрагмент недоступен'}</pre>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
              <div className="diff-panel">
                <div className="diff-panel__header">
                  <h4 className="diff-panel__title">
                    {selectedMatch ? `Сравнение с «${selectedMatch.reportName}»` : 'Выберите совпадение'}
                  </h4>
                  {selectedMatch && (
                    <span className="status-chip status-chip--completed">
                      {selectedMatch.similarity.toFixed(2)}%
                    </span>
                  )}
                </div>
                {diffLoading ? (
                  <p className="loading-pulse">Загрузка совпадения…</p>
                ) : selectedMatch ? (
                  <DiffViewer segments={diff} />
                ) : (
                  <div className="diff-placeholder">
                    Выберите совпадение слева, чтобы увидеть детальное сравнение в стиле git diff.
                  </div>
                )}
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function statusLabel(status: string) {
  switch (status) {
    case 'queued':
      return 'В очереди';
    case 'processing':
      return 'В обработке';
    case 'completed':
      return 'Завершена';
    case 'failed':
      return 'Ошибка';
    default:
      return status;
  }
}

function statusClass(status: string) {
  switch (status) {
    case 'queued':
      return 'status-chip--queued';
    case 'processing':
      return 'status-chip--processing';
    case 'completed':
      return 'status-chip--completed';
    case 'failed':
      return 'status-chip--failed';
    default:
      return 'status-chip--muted';
  }
}

function pluralize(count: number, one: string, few: string, many: string) {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) {
    return one;
  }
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) {
    return few;
  }
  return many;
}
