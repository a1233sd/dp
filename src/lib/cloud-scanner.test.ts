import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('./repository', () => ({
  findReportByCloudLinkAndName: vi.fn(() => null),
}));

import { inspectCloudStorage } from './cloud-scanner';
import { findReportByCloudLinkAndName } from './repository';

const findReportMock = vi.mocked(findReportByCloudLinkAndName);

describe('cloud-scanner fetch behaviour', () => {
  beforeEach(() => {
    findReportMock.mockReturnValue(null);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('uses browser-like headers when requesting cloud listings', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    const html = '<a href="/files/test.pdf">download</a>';
    const response = new Response(html, {
      status: 200,
      headers: { 'content-type': 'text/html' },
    });
    fetchMock.mockResolvedValue(response);

    await inspectCloudStorage('https://cloud.mail.ru/public/some/path');

    expect(fetchMock).toHaveBeenCalledWith(
      'https://cloud.mail.ru/public/some/path',
      expect.objectContaining({ headers: expect.any(Headers) }),
    );

    const callOptions = fetchMock.mock.calls[0]?.[1];
    const headers = callOptions && 'headers' in callOptions ? callOptions.headers : null;
    expect(headers).toBeInstanceOf(Headers);
    expect(headers?.get('user-agent')).toContain('Mozilla/5.0');
    expect(headers?.get('accept')).toContain('text/html');
  });
});
