'use client';

import { CommentOutlined, ReloadOutlined, SearchOutlined, RobotOutlined } from '@ant-design/icons';
import { Button, Input, Segmented, Skeleton, Tooltip } from 'antd';
import Link from 'next/link';
import { useState } from 'react';
import { useApiQuery } from '@/hooks/use-api-data';
import type { ConversationList, SettingsResponse } from '@/lib/zalo/types';
import { Conversation } from './conversation';
import { ChatStatus } from './chat-status';
import { ChatError } from './shared';
import { chatStamp, useZaloReadUrl } from './api';

export function ChatInbox() {
  const [selected, setSelected] = useState<string | null>(null);
  const [filter, setFilter] = useState({ q: '', paused: false, cursors: [] as string[] });
  const params = new URLSearchParams({ q: filter.q });
  if (filter.paused) params.set('paused', '1');
  if (filter.cursors.length) params.set('before', filter.cursors[filter.cursors.length - 1]);
  const query = useApiQuery<ConversationList>(useZaloReadUrl(`conversations?${params}`), { refreshIntervalMs: 5000 });
  const settings = useApiQuery<SettingsResponse>(useZaloReadUrl('settings'), { refreshIntervalMs: 30_000 });
  const rows = query.data?.conversations ?? [];
  return <>
    <div className={`zalo-inbox${selected ? ' has-selection' : ''}`}>
      <aside className='zalo-conversations' aria-label='Danh sách khách hàng'>
        <div className='zalo-list-heading'><div><h2>Hội thoại</h2><span>Khách nhắn trực tiếp với bot</span></div><Tooltip title='Làm mới'><Button aria-label='Làm mới hội thoại' type='text' icon={<ReloadOutlined />} loading={query.refreshing} onClick={query.refresh} /></Tooltip></div>
        <div className='zalo-list-controls'>
          <Input.Search allowClear prefix={<SearchOutlined />} placeholder='Tìm tên hoặc mã khách…' aria-label='Tìm hội thoại' onSearch={q => { setFilter(current => ({ ...current, q: q.trim(), cursors: [] })); setSelected(null); }} />
          <Segmented block value={filter.paused ? 'paused' : 'all'} options={[{ value: 'all', label: 'Tất cả' }, { value: 'paused', label: 'Chờ nhân viên' }]} onChange={value => setFilter(current => ({ ...current, paused: value === 'paused', cursors: [] }))} />
        </div>
        <ChatError error={query.error} retry={query.refresh} />
        <div className='zalo-conversation-list'>
          {query.loading ? <div className='zalo-padding'><Skeleton active paragraph={{ rows: 5 }} /></div> : rows.length ? rows.map(row => <button key={row.chatId} className={`zalo-customer${selected === row.chatId ? ' is-selected' : ''}`} onClick={() => setSelected(row.chatId)} aria-pressed={selected === row.chatId}>
            <span className='zalo-avatar'>{row.displayName.slice(0, 1).toUpperCase()}</span>
            <span className='zalo-customer-info'><span className='zalo-customer-top'><strong>{row.displayName}</strong><time dateTime={row.lastMessageAt}>{chatStamp(row.lastMessageAt)}</time></span><span className='zalo-preview'>{row.preview}</span><span className={`zalo-small-status${row.botPaused ? ' is-paused' : ''}`}><ChatStatus paused={row.botPaused} group={row.chatType === 'GROUP'} enabled={settings.data?.settings.enabled ?? false} /></span></span>
          </button>) : <div className='zalo-list-empty'><CommentOutlined /><strong>{filter.q || filter.paused ? 'Chưa có hội thoại phù hợp' : 'Chưa có tin nhắn'}</strong><p>{filter.q || filter.paused ? 'Thử đổi từ khóa hoặc bộ lọc.' : 'Khi khách nhắn cho bot, hội thoại sẽ xuất hiện tại đây.'}</p></div>}
        </div>
        <footer className='zalo-list-footer'><Button size='small' disabled={!filter.cursors.length} onClick={() => setFilter(current => ({ ...current, cursors: current.cursors.slice(0, -1) }))}>Trước</Button><span>Trang {filter.cursors.length + 1}</span><Button size='small' disabled={!query.data?.nextCursor} onClick={() => { const cursor = query.data?.nextCursor; if (cursor) setFilter(current => ({ ...current, cursors: [...current.cursors, cursor] })); }}>Sau</Button></footer>
      </aside>
      {selected ? <Conversation key={selected} chatId={selected} onBack={() => setSelected(null)} onActivity={query.refresh} botEnabled={settings.data?.settings.enabled ?? false} /> : <section className='zalo-welcome'>
        <div className='zalo-welcome-art'><CommentOutlined /><span><RobotOutlined /></span></div><span className='zalo-eyebrow'>HỘP THƯ CỦA TIỆM</span><h2>Gần khách hơn,<br />qua từng cuộc trò chuyện.</h2><p>Chọn một khách ở bên trái để xem tin nhắn,<br className='zalo-desktop-break' /> tiếp quản hoặc theo dõi bot trả lời.</p><Link href='/zalo/settings'><Button icon={<RobotOutlined />}>Thiết lập trả lời tự động</Button></Link>
        <div className='zalo-welcome-status'><span className={`zalo-status-dot${settings.data?.settings.enabled ? ' is-enabled' : ''}`} />{settings.error ? 'Chưa tải được trạng thái bot' : settings.data?.settings.enabled ? 'Bot tự động đang bật' : 'Bot tự động đang tắt'}</div>
      </section>}
    </div>
    <p className='zalo-history-note'>Lịch sử được lưu từ khi kết nối webhook. Tin cũ chưa được lưu và tin gửi từ hệ thống khác có thể không có trong hộp thư.</p>
  </>;
}
