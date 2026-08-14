'use client';

import { SafetyCertificateOutlined } from '@ant-design/icons';
import { Alert, Card, Typography } from 'antd';
import Link from 'next/link';
import { PageHeader } from '@/components/common/page-header';

const { Paragraph, Title } = Typography;

export function V2RolloutNotice({ feature }: { feature: string }) {
  return (
    <div className='page-wrap v2-workspace'>
      <PageHeader
        title={feature}
        description='Khu vực này sẽ mở sau khi dữ liệu online được migration, kiểm kho mở đầu và đối soát thành công.'
      />
      <Card className='surface-card v2-empty-state'>
        <SafetyCertificateOutlined aria-hidden='true' />
        <Title level={4}>Chưa bật vận hành v2</Title>
        <Paragraph>
          Bếp vẫn đang dùng luồng hiện tại để không gián đoạn bán hàng. Tính năng này
          được giữ khóa cho đến thời điểm cutover đã xác nhận.
        </Paragraph>
        <Alert
          type='info'
          showIcon
          title='Dữ liệu hiện tại vẫn an toàn và tiếp tục được vận hành bình thường.'
        />
        <Link href='/dashboard'>Về Tổng quan</Link>
      </Card>
    </div>
  );
}
