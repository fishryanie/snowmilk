'use client';
import { PictureOutlined, UploadOutlined } from '@ant-design/icons';
import { Alert, Button, Image } from 'antd';
import { useRef, useState, type ChangeEvent } from 'react';
import { MAX_MENU_IMAGE_BYTES } from '@/lib/zalo/types';
import { errorText, zaloMutation } from './api';

export function RuleImage({ value, disabled, index, onChange, onBusyChange }: {
  value?: string; disabled: boolean; index: number;
  onChange: (url: string | undefined) => void; onBusyChange: (busy: boolean) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; event.target.value = '';
    if (!file || busy) return;
    setError(null);
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > MAX_MENU_IMAGE_BYTES) {
      setError('Chọn ảnh JPG, PNG hoặc WebP tối đa 2 MB.'); return;
    }
    setBusy(true); onBusyChange(true);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(',')[1]);
        reader.onerror = () => reject(new Error('Không đọc được ảnh.'));
        reader.readAsDataURL(file);
      });
      const result = await zaloMutation<{ photoUrl: string }>('images', { base64 });
      onChange(result.photoUrl);
    } catch (cause) { setError(errorText(cause, 'Không tải được ảnh menu.')); }
    finally { setBusy(false); onBusyChange(false); }
  }
  return <div className='zalo-rule-image'>
    <label className='zalo-field-label' htmlFor={`zalo-rule-image-${index}`}>Ảnh gửi cho khách <span>tùy chọn</span></label>
    {value ? <div className='zalo-rule-image-preview'><Image src={value} alt={`Ảnh trả lời quy tắc ${index + 1}`} width={220} style={{ maxWidth: '100%', maxHeight: 280, objectFit: 'contain', borderRadius: 8 }} /></div> : null}
    <input id={`zalo-rule-image-${index}`} ref={input} hidden type='file' accept='image/jpeg,image/png,image/webp' aria-label={`Tải ảnh cho quy tắc ${index + 1}`} disabled={disabled || busy} onChange={event => void upload(event)} />
    <div className='zalo-image-actions'><Button icon={value ? <UploadOutlined /> : <PictureOutlined />} loading={busy} disabled={disabled || busy} onClick={() => input.current?.click()}>{value ? 'Thay ảnh' : 'Thêm ảnh trả lời'}</Button>{value ? <Button type='text' danger disabled={disabled || busy} onClick={() => onChange(undefined)}>Gỡ ảnh</Button> : null}</div>
    <p className='zalo-field-help'>JPG, PNG hoặc WebP, tối đa 2 MB. Ảnh được gửi trực tiếp trong Zalo. Bấm Lưu cấu hình để áp dụng.</p>
    {error ? <Alert type='error' showIcon title={error} /> : null}
  </div>;
}
