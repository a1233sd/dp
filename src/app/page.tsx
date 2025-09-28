'use client';

import { useEffect, useRef, useState } from 'react';
import { DiffViewer, DiffSegment } from './components/DiffViewer';

interface ReportListItem {
  id: string;
  originalName: string;
  createdAt: string;
  cloudLink: string | null;
  addedToCloud: boolean;
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
  const [fileNames, setFileNames] = useState<string[]>([]);
  const [deleteAllLoading, setDeleteAllLoading] = useState(false);
  const [deletingReportId, setDeletingReportId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cloudReportsCount = reports.filter((report) => report.addedToCloud).length;

  const clearCheckState = () => {
    setSelectedCheckId(null);
    setCheckDetails(null);
    setSelectedMatch(null);
    setDiff([]);
  };

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
    const formData = new FormData(event.currentTarget);
    const files = formData
      .getAll('files')
      .filter((item): item is File => item instanceof File && item.size > 0);
    if (files.length === 0) {
      setError('Выберите хотя бы один PDF файл');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/reports', {
        method: 'POST',
        body: (() => {
          const payload = new FormData();
          files.forEach((file) => {
            payload.append('files', file);
          });
          return payload;
        })(),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const message = (payload as { message?: string }).message ?? 'Ошибка загрузки файла';
        throw new Error(message);
      }
      const queuedItems = Array.isArray((payload as { items?: unknown }).items)
        ? ((payload as { items: { checkId: string }[] }).items)
        : [payload as { checkId?: string }];
      const checkWithId = queuedItems.find((item) => item && typeof item.checkId === 'string');
      if (checkWithId?.checkId) {
        setSelectedCheckId(checkWithId.checkId);
      }
      await loadReports();
      event.currentTarget.reset();
      setFileNames([]);
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

  const handleDeleteReport = async (reportId: string) => {
    const report = reports.find((item) => item.id === reportId);
    const reportName = report?.originalName ?? 'этот отчет';
    if (!window.confirm(`Удалить «${reportName}» из базы?`)) {
      return;
    }
    setDeletingReportId(reportId);
    setError(null);
    try {
      const response = await fetch(`/api/reports/${reportId}`, { method: 'DELETE' });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const message = (payload as { message?: string }).message ?? 'Не удалось удалить отчет';
        throw new Error(message);
      }
      const latestCheckId = report?.latestCheck?.id ?? null;
      setReports((current) => current.filter((item) => item.id !== reportId));
      const shouldResetCheck =
        (checkDetails && checkDetails.reportId === reportId) ||
        (latestCheckId !== null && selectedCheckId === latestCheckId);
      if (shouldResetCheck) {
        clearCheckState();
      } else {
        setSelectedCheckId((current) => {
          if (current && latestCheckId !== null && current === latestCheckId) {
            return null;
          }
          return current;
        });
      }
      if (selectedMatch?.reportId === reportId) {
        setSelectedMatch(null);
        setDiff([]);
      }
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Не удалось удалить отчет');
      }
    } finally {
      setDeletingReportId(null);
    }
  };

  const handleDeleteAllReports = async () => {
    if (!reports.length) {
      return;
    }
    if (!window.confirm('Удалить все отчеты из базы? Действие невозможно отменить.')) {
      return;
    }
    setDeleteAllLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/reports', { method: 'DELETE' });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const message = (payload as { message?: string }).message ?? 'Не удалось очистить базу отчетов';
        throw new Error(message);
      }
      setReports([]);
      clearCheckState();
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Не удалось очистить базу отчетов');
      }
    } finally {
      setDeleteAllLoading(false);
      setDeletingReportId(null);
    }
  };

  return (
    <div className="page-stack">
      <section className="card card--hero fade-in">
        <span className="card__eyebrow">Быстрый старт</span>
        <h2 className="card__title">Проверяйте отчеты на плагиат</h2>
        <p className="card__subtitle">
          Облачная папка с эталонными материалами подключена автоматически. Загрузите PDF-отчеты, и DiffPress сравнит их с
          архивом и покажет совпадения в формате git diff.
        </p>
        <div className="hero-actions">
          <button
            type="button"
            className="button button--secondary"
            onClick={() => fileInputRef.current?.click()}
          >
            Загрузить PDF
          </button>
          <span className="text-muted">
            В облачной базе: {cloudReportsCount}{' '}
            {pluralize(cloudReportsCount, 'отчет', 'отчета', 'отчетов')}
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
          <div className="upload-steps">
            <div className="upload-step">
              <div className="upload-step__header">
                <div>
                  <span className="upload-step__badge">Шаг 1</span>
                  <h4 className="upload-step__title">Загрузите PDF для проверки</h4>
                  <p className="upload-step__description">
                    Выберите один или несколько PDF-файлов. Для каждого будет запущена отдельная проверка по облачной базе.
                  </p>
                </div>
                {fileNames.length > 0 && (
                  <span className="status-chip status-chip--queued">Выбрано {fileNames.length}</span>
                )}
              </div>
              <label className="dropzone">
                <input
                  ref={fileInputRef}
                  className="dropzone__input"
                  type="file"
                  name="files"
                  accept="application/pdf"
                  multiple
                  onChange={(event) => {
                    const filesList = event.target.files ? Array.from(event.target.files) : [];
                    setFileNames(filesList.map((file) => file.name));
                    setError(null);
                  }}
                />
                <div className="dropzone__content">
                  <div className="dropzone__icon">⬆️</div>
                  <div className="dropzone__text">
                    {fileNames.length === 0
                      ? 'Перетащите PDF или выберите файлы'
                      : fileNames.length === 1
                      ? `Выбран файл: ${fileNames[0]}`
                      : `Выбрано файлов: ${fileNames.length}`}
                  </div>
                  <div className="dropzone__hint">Формат PDF, текст будет извлечен автоматически</div>
                </div>
              </label>
            </div>
          </div>
          <div className="form-footer">
            <button type="submit" className="button button--primary" disabled={loading}>
              {loading ? 'Отправка…' : 'Отправить на проверку'}
            </button>
            <span className="text-muted">
              Проверка выполняется по отчетам, импортированным из облачной папки.
            </span>
          </div>
        </form>
        {error && <p className="error-banner">{error}</p>}
      </section>

      <section className="card fade-in">
        <div className="card__header">
          <div className="card__header-stack">
            <h3 className="card__header-title">База отчетов</h3>
            <span className="text-muted">
              Отчеты, импортированные из облачной папки, помечены статусом «В облачной базе». Выберите запись, чтобы увидеть результаты.
            </span>
          </div>
          <div className="card__header-actions">
            <button
              type="button"
              className="button button--ghost-danger"
              onClick={handleDeleteAllReports}
              disabled={deleteAllLoading || reports.length === 0}
            >
              {deleteAllLoading ? 'Очистка…' : 'Очистить базу'}
            </button>
          </div>
        </div>
        <div className="reports-table">
          <table className="table">
            <thead>
              <tr>
                <th>Название</th>
                <th>Дата загрузки</th>
                <th>Статус проверки</th>
                <th>Совпадение</th>
                <th>Источник</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {reports.map((report) => {
                const latestCheck = report.latestCheck;
                const similarityText =
                  latestCheck?.similarity != null ? `${latestCheck.similarity.toFixed(2)}%` : '—';
                const isActive = latestCheck?.id === selectedCheckId;
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
                      <span
                        className={`status-chip ${
                          report.addedToCloud ? 'status-chip--completed' : 'status-chip--muted'
                        }`}
                      >
                        {report.addedToCloud ? 'В облачной базе' : 'Загружен вручную'}
                      </span>
                    </td>
                    <td>
                      <div className="table__actions">
                        {latestCheck && (
                          <button
                            type="button"
                            className="button button--ghost"
                            onClick={() => setSelectedCheckId(latestCheck.id)}
                          >
                            Открыть
                          </button>
                        )}
                        <button
                          type="button"
                          className="button button--ghost-danger"
                          onClick={() => handleDeleteReport(report.id)}
                          disabled={deletingReportId === report.id || deleteAllLoading}
                        >
                          {deletingReportId === report.id ? 'Удаление…' : 'Удалить'}
                        </button>
                      </div>
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

          <p className="cloud-panel__description">
            Сравнение выполняется с файлами, импортированными из подключенной облачной папки.
          </p>

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
