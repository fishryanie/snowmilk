import { RobotOutlined, TeamOutlined } from '@ant-design/icons';

export function ChatStatus({ paused, group, enabled }: { paused: boolean; group: boolean; enabled: boolean }) {
  if (group) return <>Hội thoại nhóm · Chỉ xem</>;
  if (paused) return <><TeamOutlined /> Chờ nhân viên</>;
  return <><RobotOutlined />{enabled ? 'Bot hỗ trợ' : 'Tự động đang tắt'}</>;
}
