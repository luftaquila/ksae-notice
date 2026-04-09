import { describe, it, expect, beforeEach, vi } from 'vitest';

let mockAdminSession: any = null;
let mockSendEmail = vi.fn();

vi.mock('@/lib/auth', () => ({
  requireAdmin: () => mockAdminSession,
}));

vi.mock('@/lib/email/brevo', () => ({
  sendEmail: (...args: any[]) => mockSendEmail(...args),
}));

vi.mock('@/lib/email/templates', () => ({
  newPostNotification: (posts: any[], siteUrl: string) => '<html>test</html>',
}));

const { POST } = await import('@/app/api/admin/test-email/route');

describe('POST /api/admin/test-email', () => {
  beforeEach(() => {
    mockAdminSession = null;
    mockSendEmail = vi.fn().mockResolvedValue({ messageId: 'test-123' });
  });

  it('returns 403 when not admin', async () => {
    const res = await POST();
    expect(res.status).toBe(403);
  });

  it('sends test email to admin', async () => {
    mockAdminSession = { user: { id: 1, email: 'admin@test.com', name: 'Admin', isAdmin: true } };

    const res = await POST();
    const data = await res.json();
    expect(data.ok).toBe(true);

    expect(mockSendEmail).toHaveBeenCalledOnce();
    const call = mockSendEmail.mock.calls[0][0];
    expect(call.to.email).toBe('admin@test.com');
    expect(call.subject).toBe('[KSAE 공지봇] 테스트 메일');
  });

  it('returns 500 when email sending fails', async () => {
    mockAdminSession = { user: { id: 1, email: 'admin@test.com', name: 'Admin', isAdmin: true } };
    mockSendEmail.mockRejectedValue(new Error('API down'));

    const res = await POST();
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).toBe('API down');
  });

  it('returns generic message when non-Error is thrown', async () => {
    mockAdminSession = { user: { id: 1, email: 'admin@test.com', name: 'Admin', isAdmin: true } };
    mockSendEmail.mockRejectedValue('string error');

    const res = await POST();
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).toBe('Failed to send');
  });
});
