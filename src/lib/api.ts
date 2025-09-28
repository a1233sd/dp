const DEFAULT_BASE_URL = 'http://localhost:8000/api';

function normalizePath(path: string): string {
  if (!path.startsWith('/')) {
    return `/${path}`;
  }
  return path;
}

export function getApiBaseUrl() {
  if (typeof process !== 'undefined') {
    const env = process.env.NEXT_PUBLIC_API_BASE_URL;
    if (env && env.trim().length > 0) {
      return env.replace(/\/$/, '');
    }
  }
  return DEFAULT_BASE_URL;
}

export function buildApiUrl(path: string) {
  return `${getApiBaseUrl()}${normalizePath(path)}`;
}
