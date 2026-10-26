'use client';
import { useCurrentAccess } from '@/components/v2/access-context';
import { requestV2, errorText } from '@/components/v2/api-client';

export { errorText };
export function zaloMutation<T>(path: string, body: unknown, method = 'POST') {
  return requestV2<T>(`/api/zalo-admin/${path}`, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
}
/** Partition both SWR and the app's HTTP cache when an account changes. */
export function useZaloReadUrl(path: string) {
  const { access } = useCurrentAccess();
  const [endpoint, query = ''] = path.split('?');
  const params = new URLSearchParams(query);
  params.set('_viewer', `${access?.organizationId ?? ''}:${access?.userId ?? ''}`);
  return `/api/zalo-admin/${endpoint}?${params}`;
}
const stamp = new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
export function chatStamp(value: string) { return stamp.format(new Date(value)); }
