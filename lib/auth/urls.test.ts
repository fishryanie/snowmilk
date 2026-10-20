import { describe, expect, test } from 'bun:test';
import { betterAuth } from 'better-auth/minimal';
import { authUrlConfig } from './urls';

const deployment = 'snowmilk-abc123-team.vercel.app';
const branch = 'snowmilk-git-main-team.vercel.app';
const vercel = {
  NODE_ENV: 'production',
  VERCEL: '1',
  VERCEL_ENV: 'production',
  VERCEL_PROJECT_PRODUCTION_URL: 'admin.example.com',
  VERCEL_BRANCH_URL: branch,
  VERCEL_URL: deployment,
};

describe('Địa chỉ đăng nhập khi release', () => {
  test('Production thiếu URL dùng domain Vercel, chấp nhận đúng deployment và nhánh', () => {
    expect(authUrlConfig(vercel)).toEqual({
      baseURL: 'https://admin.example.com',
      trustedOrigins: ['https://admin.example.com', `https://${branch}`, `https://${deployment}`],
    });
  });

  test('Preview dùng domain nhánh, không tự tin cậy domain production', () => {
    const config = authUrlConfig({ ...vercel, VERCEL_ENV: 'preview' });
    expect(config.baseURL).toBe(`https://${branch}`);
    expect(config.trustedOrigins).not.toContain('https://admin.example.com');
  });

  test('Không có domain nhánh/production thì dùng URL deployment', () => {
    expect(authUrlConfig({ ...vercel, VERCEL_PROJECT_PRODUCTION_URL: '', VERCEL_BRANCH_URL: '' }).baseURL)
      .toBe(`https://${deployment}`);
  });

  test('URL cấu hình có ưu tiên và được chuẩn hóa thành origin', () => {
    const config = authUrlConfig({ ...vercel, BETTER_AUTH_URL: ' https://Admin.Example.COM/ ' });
    expect(config.baseURL).toBe('https://admin.example.com');
    expect(config.trustedOrigins.filter(url => url === config.baseURL)).toHaveLength(1);
  });

  test('Biến rỗng không chặn URL Vercel và local chỉ mặc định ngoài production', () => {
    expect(authUrlConfig({ ...vercel, BETTER_AUTH_URL: '  ' }).baseURL).toBe('https://admin.example.com');
    expect(authUrlConfig({ NODE_ENV: 'development' }).baseURL).toBe('http://localhost:3001');
    expect(authUrlConfig({ NODE_ENV: 'production' })).toEqual({ baseURL: undefined, trustedOrigins: [] });
    expect(authUrlConfig({ ...vercel, VERCEL: undefined }).trustedOrigins).toEqual([]);
  });

  test('Không chấp nhận URL sai giao thức hoặc có thông tin đăng nhập', () => {
    for (const url of ['admin.example.com', 'javascript:alert(1)', 'https://user:pass@admin.example.com']) {
      expect(() => authUrlConfig({ BETTER_AUTH_URL: url })).toThrow();
    }
  });

  test('Better Auth chấp nhận origin Vercel trước khi kiểm tra mật khẩu, từ chối domain lạ', async () => {
    const auth = betterAuth({
      ...authUrlConfig(vercel),
      secret: 'test-only-secret-at-least-32-characters',
      emailAndPassword: { enabled: true },
      advanced: { disableCSRFCheck: false, disableOriginCheck: false },
      logger: { disabled: true },
    });
    // Invalid email stops before database access, after the real origin middleware.
    const signIn = (requestOrigin: string) => auth.handler(new Request(`https://${deployment}/api/auth/sign-in/email`, {
      method: 'POST',
      headers: { origin: requestOrigin, 'content-type': 'application/json', cookie: 'existing=1' },
      body: JSON.stringify({ email: 'invalid-email', password: 'invalid-password' }),
    }));
    for (const requestOrigin of ['https://admin.example.com', `https://${branch}`, `https://${deployment}`]) {
      const response = await signIn(requestOrigin);
      expect(response.status).toBe(400);
      expect((await response.json()).code).toBe('INVALID_EMAIL');
    }
    for (const requestOrigin of ['https://other-project.vercel.app', `https://${deployment}.evil.example`, 'http://localhost:3001']) {
      const response = await signIn(requestOrigin);
      expect(response.status).toBe(403);
      expect((await response.json()).code).toBe('INVALID_ORIGIN');
    }
  });
});
