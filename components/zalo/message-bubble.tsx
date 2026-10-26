'use client';
import { Image, Tooltip } from 'antd';
import { RobotOutlined, UserOutlined, CheckOutlined, ClockCircleOutlined, ExclamationCircleOutlined } from '@ant-design/icons';
import type { ChatMessage } from '@/lib/zalo/types';
import { safeMediaUrl } from '@/lib/zalo/types';
import { chatStamp } from './api';

function MessageText({ text }: { text: string }) {
  return <span className='zalo-message-text'>{text.split(/(https:\/\/[^\s]+)/g).map((part, index) => safeMediaUrl(part) && part.startsWith('https://') ? <a key={`${part}-${index}`} href={part} target='_blank' rel='noreferrer'>{part}</a> : part)}</span>;
}
export function MessageBubble({ message }: { message: ChatMessage }) {
  const outgoing = message.direction === 'outbound';
  const photo = safeMediaUrl(message.photo);
  const sticker = safeMediaUrl(message.stickerUrl);
  const voice = safeMediaUrl(message.voiceUrl);
  const status = message.deliveryStatus;
  const failed = status === 'failed' || status === 'uncertain';
  const statusText = status === 'sent' ? 'Đã gửi' : status === 'failed' ? 'Gửi thất bại' : status === 'uncertain' ? 'Chưa rõ kết quả gửi' : 'Đang gửi';
  return <article className={`zalo-message${outgoing ? ' is-outgoing' : ''}${failed ? ' has-error' : ''}`} aria-label={`${outgoing ? message.source === 'manual' ? 'Nhân viên' : 'Bot' : message.senderName}: ${message.text || message.caption || 'Tin đa phương tiện'}`}>
    {outgoing ? <div className='zalo-message-source'>{message.source === 'manual' ? <UserOutlined /> : <RobotOutlined />}{message.source === 'manual' ? message.senderName : 'Bot tự động'}{message.ruleLabel ? ` · ${message.ruleLabel}` : ''}</div> : null}
    <div className='zalo-message-bubble'>
      {message.text ? <MessageText text={message.text} /> : null}
      {photo ? <Image src={photo} alt={outgoing ? 'Ảnh bot gửi' : 'Ảnh khách gửi'} width={240} style={{ maxWidth: '100%', borderRadius: 10 }} /> : null}
      {sticker ? <Image src={sticker} alt='Nhãn dán' width={96} preview={false} /> : null}
      {voice ? <audio controls preload='none' src={voice}>Trình duyệt chưa hỗ trợ nghe tin nhắn thoại.</audio> : null}
      {message.caption ? <MessageText text={message.caption} /> : null}
      {!message.text && !photo && !sticker && !voice && !message.caption ? <em>Tin nhắn chưa hỗ trợ hiển thị</em> : null}
      <div className='zalo-message-time'><time dateTime={message.sentAt}>{chatStamp(message.sentAt)}</time>{outgoing ? <Tooltip title={message.error || statusText}><span className={failed ? 'zalo-delivery-error' : ''}>{status === 'sent' ? <CheckOutlined /> : failed ? <ExclamationCircleOutlined /> : <ClockCircleOutlined />} {statusText}</span></Tooltip> : null}</div>
    </div>
    {message.error ? <span className='zalo-send-error'>{message.error}</span> : null}
  </article>;
}
