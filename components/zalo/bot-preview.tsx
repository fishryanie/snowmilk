'use client';
import { useState } from 'react';
import { Image, Input, Switch } from 'antd';
import { ExperimentOutlined, RobotOutlined } from '@ant-design/icons';
import { botSettingsSchema, decideAutoReply, type BotSettings } from '@/lib/zalo/automation';

export function BotPreview({ settings }: { settings: BotSettings }) {
  const [text, setText] = useState('Xin chào');
  const [first, setFirst] = useState(true);
  const parsed = botSettingsSchema.safeParse(settings);
  const decision = parsed.success ? decideAutoReply(parsed.data, text, { firstMessage: first, name: 'bạn', chatType: 'PRIVATE' }) : null;
  return <aside className='zalo-preview-panel'>
    <div className='zalo-section-title'><ExperimentOutlined /><div><h2>Thử câu trả lời</h2><p>Xem trước với nội dung đang soạn</p></div></div>
    <div className='zalo-preview-switch'><span>Khách nhắn lần đầu</span><Switch size='small' checked={first} onChange={setFirst} aria-label='Mô phỏng khách nhắn lần đầu' /></div>
    <div className='zalo-simulator'>
      <div className='zalo-sim-customer'>{text || 'Nhập tin nhắn để thử…'}</div>
      {decision ? <><div className='zalo-sim-label'><RobotOutlined /> Bot trả lời{decision.ruleLabel ? ` · ${decision.ruleLabel}` : ''}</div><div className='zalo-sim-bot'>{decision.photoUrl ? <Image src={decision.photoUrl} alt='Ảnh bot sẽ gửi' width='100%' style={{ maxHeight: 300, objectFit: 'contain', borderRadius: 8 }} /> : null}{decision.text ? <div>{decision.text}</div> : null}</div>{decision.handoff ? <div className='zalo-sim-handoff'>Chuyển sang nhân viên và tạm dừng bot</div> : null}</> : <div className='zalo-sim-placeholder'>{!parsed.success ? 'Hoàn tất các trường cấu hình để xem trước.' : 'Bot đang tắt. Bật công tắc trong bản cấu hình để thử.'}</div>}
    </div>
    <label className='zalo-field-label' htmlFor='zalo-preview-input'>Tin nhắn khách gửi</label>
    <Input id='zalo-preview-input' value={text} maxLength={2000} onChange={event => setText(event.target.value)} placeholder='Ví dụ: Tiệm có giao hàng không?' />
    <div className='zalo-test-suggestions'>{['Xin chào', '1', 'Ship như thế nào?', 'Gặp nhân viên'].map(sample => <button key={sample} type='button' onClick={() => setText(sample)}>{sample}</button>)}</div>
    <p className='zalo-preview-note'>Chỉ mô phỏng trên màn hình. Không gửi tin nhắn thật đến Zalo.</p>
  </aside>;
}
