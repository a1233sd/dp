import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

vi.mock('@/lib/cloud-scanner', () => ({
  inspectCloudStorage: vi.fn(),
  CloudSyncError: class MockCloudSyncError extends Error {},
}));

import { POST } from './route';
import { inspectCloudStorage, CloudSyncError } from '@/lib/cloud-scanner';

const inspectCloudStorageMock = vi.mocked(inspectCloudStorage);

describe('POST /api/cloud/scan', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns preview when scan succeeds', async () => {
    inspectCloudStorageMock.mockResolvedValue([
      { name: 'first.pdf', status: 'new' },
      { name: 'second.pdf', status: 'existing' },
    ]);

    const request = {
      json: vi.fn().mockResolvedValue({ cloudLink: 'https://disk.yandex.ru/d/folder' }),
    } as unknown as NextRequest;

    const response = await POST(request);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      cloudLink: 'https://disk.yandex.ru/d/folder',
      resources: [
        { name: 'first.pdf', status: 'new' },
        { name: 'second.pdf', status: 'existing' },
      ],
    });
    expect(inspectCloudStorageMock).toHaveBeenCalledWith('https://disk.yandex.ru/d/folder');
  });

  it('returns 400 when request body is missing', async () => {
    const request = {
      json: vi.fn().mockRejectedValue(new Error('Invalid JSON')),
    } as unknown as NextRequest;

    const response = await POST(request);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      message: 'Ссылка на облачный диск обязательна',
    });
    expect(inspectCloudStorageMock).not.toHaveBeenCalled();
  });

  it('returns 400 when cloud link host is not supported', async () => {
    const request = {
      json: vi.fn().mockResolvedValue({ cloudLink: 'https://example.com/folder' }),
    } as unknown as NextRequest;

    const response = await POST(request);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      message: 'Ссылка должна вести на поддерживаемое облачное хранилище',
    });
    expect(inspectCloudStorageMock).not.toHaveBeenCalled();
  });

  it('returns 400 when cloud scanner reports a validation error', async () => {
    inspectCloudStorageMock.mockRejectedValueOnce(new CloudSyncError('Validation error'));

    const request = {
      json: vi.fn().mockResolvedValue({ cloudLink: 'https://disk.yandex.ru/d/folder' }),
    } as unknown as NextRequest;

    const response = await POST(request);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ message: 'Validation error' });
  });

  it('returns 502 when unexpected error occurs', async () => {
    inspectCloudStorageMock.mockRejectedValueOnce(new Error('network down'));

    const request = {
      json: vi.fn().mockResolvedValue({ cloudLink: 'https://disk.yandex.ru/d/folder' }),
    } as unknown as NextRequest;

    const response = await POST(request);

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({
      message: 'Не удалось просканировать облачное хранилище',
    });
  });
});
