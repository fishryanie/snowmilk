'use client';
import { DeleteOutlined } from '@ant-design/icons';
import { Button, Input, Select, Switch, Tooltip } from 'antd';
import { useState } from 'react';
import type { BotRule } from '@/lib/zalo/automation';
import { RuleImage } from './rule-image';

export function BotRuleEditor({ rule, index, disabled, onChange, onRemove, onUploadBusyChange }: {
  rule: BotRule; index: number; disabled: boolean; onChange: (patch: Partial<BotRule>) => void; onRemove: () => void;
  onUploadBusyChange: (busy: boolean) => void;
}) {
  // Preserve partially typed separators while the parent stores normalized keywords.
  const [keywords, setKeywords] = useState(() => rule.keywords.join(', '));
  const prefix = `rule-${rule.id}`;
  return <section className={`zalo-rule${rule.enabled ? '' : ' is-disabled'}`} aria-label={`Quy tắc ${index + 1}`}>
    <div className='zalo-rule-heading'><span className='zalo-rule-number'>{rule.choice}</span><strong>{rule.label || `Quy tắc ${index + 1}`}</strong><Switch size='small' aria-label={`Bật quy tắc ${index + 1}`} checked={rule.enabled} disabled={disabled} onChange={enabled => onChange({ enabled })} /><Tooltip title='Xóa quy tắc'><Button type='text' danger icon={<DeleteOutlined />} aria-label={`Xóa quy tắc ${index + 1}`} disabled={disabled} onClick={onRemove} /></Tooltip></div>
    <div className='zalo-rule-fields'>
      <div className='zalo-rule-main-fields'><div><label className='zalo-field-label' htmlFor={`${prefix}-label`}>Tên lựa chọn</label><Input id={`${prefix}-label`} maxLength={60} value={rule.label} disabled={disabled} onChange={event => onChange({ label: event.target.value })} placeholder='Ví dụ: Xem menu & đặt món' /></div><div><label className='zalo-field-label' htmlFor={`${prefix}-choice`}>Số khách nhập</label><Select id={`${prefix}-choice`} value={rule.choice} disabled={disabled} onChange={choice => onChange({ choice })} options={Array.from({ length: 9 }, (_, i) => ({ value: String(i + 1), label: String(i + 1) }))} style={{ width: '100%' }} /></div></div>
      <div><label className='zalo-field-label' htmlFor={`${prefix}-keywords`}>Từ khóa nhận diện <span>cách nhau bằng dấu phẩy</span></label><Input.TextArea id={`${prefix}-keywords`} value={keywords} rows={2} maxLength={2000} disabled={disabled} onChange={event => { setKeywords(event.target.value); onChange({ keywords: event.target.value.split(/[,\n]/).map(value => value.trim()).filter(Boolean) }); }} placeholder='Ví dụ: menu, thực đơn, giá, đặt món' /></div>
      <RuleImage value={rule.photoUrl} disabled={disabled} index={index} onChange={photoUrl => onChange({ photoUrl })} onBusyChange={onUploadBusyChange} />
      <div><label className='zalo-field-label' htmlFor={`${prefix}-response`}>{rule.photoUrl ? 'Lời nhắn kèm ảnh (có thể để trống)' : 'Nội dung bot trả lời'}</label><Input.TextArea id={`${prefix}-response`} value={rule.response} rows={3} maxLength={1200} showCount disabled={disabled} onChange={event => onChange({ response: event.target.value })} placeholder={rule.photoUrl ? 'Ví dụ: Menu của tiệm đây nhé! Bạn chọn món giúp tiệm nha.' : 'Nhập câu trả lời cho khách…'} /></div>
      <div className='zalo-handoff-option'><Switch size='small' checked={rule.handoff} disabled={disabled} aria-label={`Chuyển nhân viên ở quy tắc ${index + 1}`} onChange={handoff => onChange({ handoff })} /><span>Chuyển cho nhân viên sau câu trả lời này<small>Bot tạm dừng đến khi bạn bật lại trong hội thoại.</small></span></div>
    </div>
  </section>;
}
