'use client';

import { PlusOutlined, SaveOutlined, RobotOutlined } from '@ant-design/icons';
import { Alert, App, Button, Input, Radio, Skeleton, Switch } from 'antd';
import { useState } from 'react';
import { useApiQuery } from '@/hooks/use-api-data';
import { useCurrentAccess } from '@/components/v2/access-context';
import { botSettingsSchema, type BotSettings, type BotRule } from '@/lib/zalo/automation';
import type { SettingsResponse } from '@/lib/zalo/types';
import { BotRuleEditor } from './bot-rule-editor';
import { BotPreview } from './bot-preview';
import { ChatError } from './shared';
import { errorText, useZaloReadUrl, zaloMutation } from './api';

function SettingsEditor({ initial, canEdit, onSaved }: { initial: BotSettings; canEdit: boolean; onSaved: () => void }) {
  const { message } = App.useApp();
  const [draft, setDraft] = useState(initial);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  function update(patch: Partial<BotSettings>) { setDraft(current => ({ ...current, ...patch })); setDirty(true); }
  function updateRule(id: string, patch: Partial<BotRule>) {
    setDraft(current => ({ ...current, rules: current.rules.map(rule => rule.id === id ? { ...rule, ...patch } : rule) })); setDirty(true);
  }
  async function save() {
    setError(null);
    const parsed = botSettingsSchema.safeParse(draft);
    if (!parsed.success) { setError(parsed.error.issues[0]?.message || 'Kiểm tra lại cấu hình.'); return; }
    setSaving(true);
    try {
      const result = await zaloMutation<SettingsResponse>('settings', parsed.data, 'PUT');
      setDraft(result.settings); setDirty(false); onSaved();
      void message.success('Đã lưu. Bot sẽ dùng cấu hình này cho tin nhắn tiếp theo.');
    } catch (cause) { setError(errorText(cause, 'Không lưu được cấu hình bot.')); }
    finally { setSaving(false); }
  }
  const disabled = !canEdit || saving || uploading;
  return <div className='zalo-settings-grid'>
    <div className='zalo-settings-main'>
      <section className='zalo-settings-card'>
        <div className='zalo-automation-master'><span className='zalo-master-icon'><RobotOutlined /></span><div><h2>Trả lời tự động</h2><p>Hỗ trợ khách ngay khi có tin nhắn mới.</p></div><Switch checked={draft.enabled} disabled={disabled} onChange={enabled => update({ enabled })} checkedChildren='Bật' unCheckedChildren='Tắt' aria-label='Bật trả lời tự động' /></div>
        {!canEdit ? <Alert type='info' showIcon title='Chỉ chủ quán có thể thay đổi cấu hình bot.' /> : null}
        <fieldset className='zalo-settings-field'><legend className='zalo-field-label'>Cách nhận diện yêu cầu</legend><Radio.Group value={draft.mode} disabled={disabled} onChange={event => update({ mode: event.target.value })} options={[{ value: 'hybrid', label: 'Menu số + từ khóa' }, { value: 'menu', label: 'Chỉ menu số' }, { value: 'keywords', label: 'Chỉ từ khóa' }]} /><p className='zalo-field-help'>Khách có thể nhập số hoặc nhắn tự nhiên. Bot đối chiếu từ khóa có trong quy tắc, không phân biệt dấu và chữ hoa.</p></fieldset>
        <div className='zalo-settings-field'><label className='zalo-field-label' htmlFor='bot-greeting'>Lời chào lần đầu</label><Input.TextArea id='bot-greeting' value={draft.greeting} rows={2} maxLength={300} showCount disabled={disabled} onChange={event => update({ greeting: event.target.value })} /><p className='zalo-field-help'>Dùng {'{name}'} để gọi tên khách.</p></div>
        <div className='zalo-settings-field'><label className='zalo-field-label' htmlFor='bot-menu-intro'>Lời dẫn menu</label><Input.TextArea id='bot-menu-intro' value={draft.menuIntro} rows={2} maxLength={300} disabled={disabled} onChange={event => update({ menuIntro: event.target.value })} /><p className='zalo-field-help'>Menu hiển thị bằng văn bản; khách nhập 1, 2, 3… để chọn.</p></div>
        <div className='zalo-settings-field'><label className='zalo-field-label' htmlFor='bot-fallback'>Khi chưa hiểu tin nhắn</label><Input.TextArea id='bot-fallback' value={draft.fallback} rows={2} maxLength={600} showCount disabled={disabled} onChange={event => update({ fallback: event.target.value })} /></div>
      </section>
      <div className='zalo-rules-title'><div><h2>Menu & câu trả lời</h2><p>Từ khóa cụ thể hơn được ưu tiên khi nhiều quy tắc cùng khớp.</p></div><span>{draft.rules.length}/9 mục</span></div>
      {draft.rules.map((rule, index) => <BotRuleEditor key={rule.id} rule={rule} index={index} disabled={disabled} onChange={patch => updateRule(rule.id, patch)} onRemove={() => update({ rules: draft.rules.filter(candidate => candidate.id !== rule.id) })} onUploadBusyChange={setUploading} />)}
      <Button block type='dashed' icon={<PlusOutlined />} disabled={disabled || draft.rules.length >= 9} onClick={() => {
        const choice = Array.from({ length: 9 }, (_, i) => String(i + 1)).find(value => !draft.rules.some(rule => rule.choice === value)) || '1';
        update({ rules: [...draft.rules, { id: crypto.randomUUID(), choice, label: '', keywords: [], response: '', enabled: true, handoff: false }] });
      }}>Thêm lựa chọn / quy tắc</Button>
      <ChatError error={error} />
      <div className='zalo-settings-save'><span>{uploading ? 'Đang tải ảnh…' : dirty ? 'Có thay đổi chưa lưu' : 'Cấu hình đang áp dụng cho bot'}<small>Chỉ áp dụng cho tin mới. Hội thoại đã tiếp quản vẫn tạm dừng.</small></span><Button type='primary' icon={<SaveOutlined />} loading={saving} disabled={!canEdit || !dirty || uploading} onClick={() => void save()}>Lưu cấu hình</Button></div>
    </div>
    <BotPreview settings={draft} />
  </div>;
}

export function BotSettingsPanel() {
  const { can } = useCurrentAccess();
  const query = useApiQuery<SettingsResponse>(useZaloReadUrl('settings'), { refreshIntervalMs: 0 });
  return <><ChatError error={query.error} retry={query.refresh} />{query.loading ? <Skeleton active paragraph={{ rows: 8 }} /> : query.data ? <SettingsEditor initial={query.data.settings} canEdit={can('settings:manage')} onSaved={query.refresh} /> : null}</>;
}
