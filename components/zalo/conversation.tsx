'use client';

import { ArrowLeftOutlined, RobotOutlined, SendOutlined, TeamOutlined } from '@ant-design/icons';
import { Alert, Button, Input, Skeleton } from 'antd';
import { useEffect, useMemo, useRef, useState } from 'react';
import useSWRInfinite from 'swr/infinite';
import { fetchApiData } from '@/lib/api-client';
import { useCurrentAccess } from '@/components/v2/access-context';
import type { ChatMessage, ConversationPage } from '@/lib/zalo/types';
import { MessageBubble } from './message-bubble';
import { ChatStatus } from './chat-status';
import { ChatError } from './shared';
import { errorText, useZaloReadUrl, zaloMutation } from './api';

export function Conversation({ chatId, onBack, onActivity, botEnabled }: {
  chatId: string; onBack: () => void; onActivity: () => void; botEnabled: boolean;
}) {
  const { can } = useCurrentAccess();
  const canWrite = can('sales:write');
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [changingState, setChangingState] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const requestId = useRef<string | null>(null);
  const scroll = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);
  const olderHeight = useRef<number | null>(null);
  const base = `conversations/${encodeURIComponent(chatId)}`;
  const readUrl = useZaloReadUrl(base);
  const query = useSWRInfinite<ConversationPage>((index, previous: ConversationPage | null) => {
    if (index && !previous?.nextCursor) return null;
    return `${readUrl}${index ? `&before=${encodeURIComponent(previous!.nextCursor!)}` : ''}`;
  }, fetchApiData<ConversationPage>, { refreshInterval: 5000, shouldRetryOnError: false, persistSize: false });
  const conversation = query.data?.[0]?.conversation;
  const messages = useMemo(() => {
    const unique = new Map<string, ChatMessage>();
    for (const page of query.data ?? []) for (const message of page.messages) unique.set(message.id, message);
    return [...unique.values()].sort((a, b) => a.sentAt.localeCompare(b.sentAt) || a.id.localeCompare(b.id));
  }, [query.data]);
  const latestId = messages.at(-1)?.id;
  useEffect(() => {
    const element = scroll.current;
    if (!element) return;
    if (olderHeight.current !== null) {
      element.scrollTop += element.scrollHeight - olderHeight.current;
      olderHeight.current = null;
    } else if (pinned.current) element.scrollTop = element.scrollHeight;
  }, [latestId, messages.length]);

  async function changeState() {
    if (!conversation) return;
    setChangingState(true); setActionError(null);
    try { await zaloMutation(`${base}/state`, { botPaused: !conversation.botPaused }, 'PATCH'); await query.mutate(); onActivity(); }
    catch (error) { setActionError(errorText(error, 'Không đổi được trạng thái bot.')); }
    finally { setChangingState(false); }
  }
  async function send() {
    const text = draft.trim();
    if (!text || busy || !canWrite) return;
    setBusy(true); setActionError(null);
    requestId.current ??= crypto.randomUUID();
    try {
      const message = await zaloMutation<ChatMessage>(`${base}/reply`, { text, requestId: requestId.current });
      if (message.deliveryStatus === 'sent') { setDraft(''); requestId.current = null; pinned.current = true; }
      else setActionError(message.error || 'Tin nhắn đang được xử lý. Kiểm tra trạng thái trước khi thử lại.');
      await query.mutate(); onActivity();
    } catch (error) { setActionError(errorText(error, 'Không gửi được tin nhắn.')); }
    finally { setBusy(false); }
  }
  const hasOlder = Boolean(query.data?.at(-1)?.nextCursor);
  return <section className='zalo-thread' aria-label='Nội dung hội thoại'>
    <header className='zalo-thread-heading'>
      <Button className='zalo-back' type='text' aria-label='Quay lại danh sách khách' icon={<ArrowLeftOutlined />} onClick={onBack} />
      <span className='zalo-avatar'>{(conversation?.displayName || '?').slice(0, 1).toUpperCase()}</span>
      <div className='zalo-thread-person'><h2>{conversation?.displayName || 'Đang tải hội thoại…'}</h2><span><ChatStatus paused={conversation?.botPaused ?? false} group={conversation?.chatType === 'GROUP'} enabled={botEnabled} /></span></div>
      {canWrite && conversation?.chatType === 'PRIVATE' ? <Button size='small' icon={conversation.botPaused ? <RobotOutlined /> : <TeamOutlined />} loading={changingState} onClick={() => void changeState()}>{conversation.botPaused ? 'Bật bot lại' : 'Tiếp quản'}</Button> : null}
    </header>
    <ChatError error={query.error} retry={() => void query.mutate()} />
    <div className='zalo-timeline' ref={scroll} role='log' aria-label='Lịch sử tin nhắn' onScroll={() => { const element = scroll.current; if (element) pinned.current = element.scrollHeight - element.scrollTop - element.clientHeight < 100; }}>
      {hasOlder ? <div className='zalo-load-older'><Button size='small' loading={query.isValidating} onClick={() => { olderHeight.current = scroll.current?.scrollHeight ?? null; void query.setSize(query.size + 1); }}>Xem tin nhắn cũ hơn</Button></div> : null}
      {!query.data && !query.error ? <Skeleton active paragraph={{ rows: 7 }} /> : messages.map(message => <MessageBubble key={message.id} message={message} />)}
    </div>
    {actionError ? <div className='zalo-composer-error'><Alert type='error' showIcon title={actionError} /></div> : null}
    {canWrite && conversation?.chatType !== 'GROUP' ? <form className='zalo-composer' onSubmit={event => { event.preventDefault(); void send(); }}>
      <Input.TextArea aria-label='Soạn tin nhắn cho khách' placeholder='Nhập tin nhắn cho khách…' autoSize={{ minRows: 2, maxRows: 5 }} maxLength={2000} showCount value={draft} disabled={busy || !conversation} onChange={event => { setDraft(event.target.value); requestId.current = null; }} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void send(); } }} />
      <div className='zalo-composer-footer'><span>Gửi thủ công sẽ tạm dừng bot cho khách này.<br /><kbd>Shift</kbd> + <kbd>Enter</kbd> xuống dòng</span><Button htmlType='submit' type='primary' icon={<SendOutlined />} loading={busy} disabled={!draft.trim() || !conversation || conversation.chatType !== 'PRIVATE'}>Gửi tin</Button></div>
    </form> : <div className='zalo-readonly'>{conversation?.chatType === 'GROUP' ? 'Hội thoại nhóm hiện chỉ hỗ trợ xem lịch sử.' : 'Tài khoản của bạn có quyền xem hội thoại.'}</div>}
  </section>;
}
