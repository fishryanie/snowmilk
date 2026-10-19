'use client';

import { ReloadOutlined, UploadOutlined } from '@ant-design/icons';
import { Alert, Button, Image, Space, Tag, Typography } from 'antd';
import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react';
import { errorText, requestV2 } from '@/components/v2/api-client';
import { statusLabels, type OrderStatus, type ShopProduct, type ShopSettings } from '@/lib/storefront-core/types';

export type Catalog = { products: ShopProduct[]; settings: ShopSettings };

export function saveOnline<T>(path: string, body: unknown) {
  return requestV2<T>(`/api/storefront-admin/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export function useOnlineQuery<T>(url: string, interval = 0) {
  const [version, setVersion] = useState(0);
  const key = JSON.stringify([url, version]);
  const [result, setResult] = useState<{ url: string; key: string; data: T | null; error: string | null } | null>(null);
  const reload = useCallback(() => setVersion(current => current + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    requestV2<T>(url, { signal: controller.signal })
      .then(data => {
        if (!controller.signal.aborted) setResult({ url, key, data, error: null });
      })
      .catch((requestError: unknown) => {
        if (!controller.signal.aborted)
          setResult(current => ({
            url,
            key,
            data: current?.url === url ? current.data : null,
            error: errorText(requestError, 'Không thể tải dữ liệu cửa hàng.'),
          }));
      });
    return () => controller.abort();
  }, [key, url]);

  useEffect(() => {
    const refreshVisible = () => {
      if (document.visibilityState === 'visible') reload();
    };
    const timer = interval > 0 ? window.setInterval(refreshVisible, interval) : null;
    if (interval > 0) window.addEventListener('focus', refreshVisible);
    return () => {
      if (timer !== null) window.clearInterval(timer);
      window.removeEventListener('focus', refreshVisible);
    };
  }, [interval, reload]);

  return {
    data: result?.url === url ? result.data : null,
    error: result?.url === url ? result.error : null,
    loading: result?.key !== key,
    reload,
  };
}

export function OnlineError({ error, retry }: { error: string | null; retry: () => void }) {
  return error ? (
    <Alert
      type='error'
      showIcon
      title={error}
      action={
        <Button icon={<ReloadOutlined />} onClick={retry}>
          Thử lại
        </Button>
      }
    />
  ) : null;
}

const statusColors: Record<OrderStatus, string> = {
  awaiting_payment: 'gold',
  payment_review: 'orange',
  paid: 'green',
  preparing: 'cyan',
  delivering: 'blue',
  completed: 'success',
  cancelled: 'error',
  expired: 'default',
};

export function OrderStatusTag({ status }: { status: OrderStatus }) {
  return <Tag color={statusColors[status]}>{statusLabels[status]}</Tag>;
}

export function OnlineImageUpload({
  value = '',
  onChange,
  kind,
  disabled,
  onBusyChange,
}: {
  value?: string;
  onChange?: (value: string) => void;
  kind: 'qr' | 'product';
  disabled?: boolean;
  onBusyChange?: (busy: boolean) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setError(null);
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setError('Chọn ảnh JPG, PNG hoặc WebP.');
      return;
    }
    if (file.size > 1_400_000) {
      setError('Ảnh tối đa 1,4 MB. Hãy giảm kích thước ảnh rồi chọn lại.');
      return;
    }
    setBusy(true);
    onBusyChange?.(true);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(',')[1]);
        reader.onerror = () => reject(new Error('Không đọc được ảnh. Hãy chọn lại.'));
        reader.readAsDataURL(file);
      });
      const result = await saveOnline<{ image: string }>('image', { base64, kind });
      onChange?.(result.image);
    } catch (uploadError) {
      setError(errorText(uploadError, 'Không tải được ảnh.'));
    } finally {
      setBusy(false);
      onBusyChange?.(false);
    }
  }

  return (
    <Space orientation='vertical' size={12} style={{ width: '100%' }}>
      {value ? (
        <Image
          src={value}
          alt={kind === 'qr' ? 'QR chuyển khoản của tiệm' : 'Ảnh món trên app'}
          width={kind === 'qr' ? 240 : 160}
          style={{ maxHeight: 320, objectFit: 'contain', maxWidth: '100%' }}
        />
      ) : null}
      <Space wrap>
        <input
          ref={input}
          type='file'
          accept='image/jpeg,image/png,image/webp'
          hidden
          aria-label={kind === 'qr' ? 'Chọn ảnh QR chuyển khoản' : 'Chọn ảnh món'}
          onChange={event => void upload(event)}
        />
        <Button icon={<UploadOutlined />} loading={busy} disabled={disabled} onClick={() => input.current?.click()}>
          {value ? 'Thay ảnh' : kind === 'qr' ? 'Tải ảnh QR lên' : 'Tải ảnh món lên'}
        </Button>
        {value ? (
          <Button disabled={disabled || busy} onClick={() => onChange?.('')}>
            Gỡ ảnh
          </Button>
        ) : null}
      </Space>
      <Typography.Text type='secondary'>JPG, PNG hoặc WebP, tối đa 1,4 MB. Bấm Lưu để áp dụng ảnh lên app.</Typography.Text>
      {error ? <Alert type='error' showIcon title={error} /> : null}
    </Space>
  );
}
