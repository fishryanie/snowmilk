import { describe, expect, test } from 'bun:test';
import { normalizeBootstrapToken } from './bootstrap-token';
import { bootstrapTokenMatches } from './config';

const secret = '0123456789abcdef'.repeat(4);
const env = { AUTH_BOOTSTRAP_TOKEN: secret };

describe('Mã thiết lập chủ quán được sao chép từ cấu hình', () => {
  test('Mã thô, giá trị có dấu nháy và cả dòng dotenv đều xác thực cùng một mã', () => {
    for (const copied of [
      secret,
      `  ${secret}\n`,
      `"${secret}"`,
      `'${secret}'`,
      `AUTH_BOOTSTRAP_TOKEN=${secret}`,
      `AUTH_BOOTSTRAP_TOKEN = "${secret}"`,
      `export AUTH_BOOTSTRAP_TOKEN='${secret}'\n`,
    ]) {
      expect(bootstrapTokenMatches(normalizeBootstrapToken(copied), env)).toBe(true);
    }
  });

  test('Tên biến, mã khác và nội dung cấu hình khác không cấp quyền bootstrap', () => {
    for (const copied of [
      '',
      'AUTH_BOOTSTRAP_TOKEN',
      'AUTH_BOOTSTRAP_TOKEN=',
      `AUTH_BOOTSTRAP_TOKEN=${secret.slice(0, -1)}x`,
      `OTHER_SECRET=${secret}`,
      `AUTH_BOOTSTRAP_TOKEN=${secret}\nOTHER_SECRET=value`,
    ]) {
      expect(bootstrapTokenMatches(normalizeBootstrapToken(copied), env)).toBe(false);
    }
    expect(bootstrapTokenMatches(normalizeBootstrapToken(secret), {})).toBe(false);
  });
});
