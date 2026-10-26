'use client';
import { Alert, Button } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import { errorText } from './api';
export function ChatError({ error, retry }: { error: unknown; retry?: () => void }) {
  return error ? <Alert type='error' showIcon title={errorText(error, 'Không tải được dữ liệu.')} action={retry ? <Button size='small' icon={<ReloadOutlined />} onClick={retry}>Thử lại</Button> : undefined} /> : null;
}
