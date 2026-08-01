"use client";

import { Modal, Tooltip, Typography } from "antd";
import { formatVnd } from "@/lib/formatters";

const { Paragraph, Text, Title } = Typography;

export type PayrollHelpTopic =
  | "business-cash"
  | "working-capital"
  | "distributable-pool"
  | "available-pool"
  | "allocation"
  | "period-total"
  | "withdrawal-history";

type HelpAllocation = {
  employeeName: string;
  sharePercent: number;
  amount: number;
};

type HelpPeriod = {
  periodLabel: string;
  allocatedTotal: number;
  isClosed: boolean;
};

export type PayrollExplanationData = {
  periodLabel: string;
  cumulativeRevenue: number;
  businessCashBalance: number;
  companyFundedOutflow: number;
  outstandingOwnerCapital: number;
  workingCapitalReserve: number;
  previouslySettledPools: number;
  distributablePool: number;
  allocatedTotal: number;
  withdrawnTotal: number;
  availablePool: number;
  allocations: HelpAllocation[];
  periods: HelpPeriod[];
};

const HELP_META: Record<PayrollHelpTopic, { title: string; tooltip: string }> = {
  "business-cash": {
    title: "Tiền doanh nghiệp được tính thế nào?",
    tooltip: "Doanh thu trừ các khoản đã chi bằng tiền doanh nghiệp.",
  },
  "working-capital": {
    title: "Vì sao phải giữ vốn xoay vòng?",
    tooltip: "Khoản cố định 10 triệu không được đưa vào quỹ chia.",
  },
  "distributable-pool": {
    title: "Quỹ có thể chia được tính thế nào?",
    tooltip: "Xem công thức tiền sạch sau khi chừa đủ các khoản cần giữ.",
  },
  "available-pool": {
    title: "Còn có thể rút được tính thế nào?",
    tooltip: "Phần đã phân bổ trừ số tiền nhân sự đã rút.",
  },
  allocation: {
    title: "Tiền của từng nhân sự được tính thế nào?",
    tooltip: "Mỗi người nhận quỹ có thể chia nhân với tỷ lệ của mình.",
  },
  "period-total": {
    title: "Tổng tất cả các tháng gồm những gì?",
    tooltip: "Tổng phần đã phân bổ của từng tháng đang hiển thị.",
  },
  "withdrawal-history": {
    title: "Lịch sử rút lương dùng để làm gì?",
    tooltip: "Các phiếu đã rút được lưu theo nhân sự và tháng lương.",
  },
};

export function PayrollHelpTitle({
  title,
  topic,
  onOpen,
}: {
  title: string;
  topic: PayrollHelpTopic;
  onOpen: (topic: PayrollHelpTopic) => void;
}) {
  return (
    <span className="payroll-help-title">
      <span>{title}</span>
      <Tooltip title={HELP_META[topic].tooltip}>
        <button
          type="button"
          className="payroll-help-trigger"
          aria-label={`Giải thích: ${title}`}
          onClick={() => onOpen(topic)}
        >
          !
        </button>
      </Tooltip>
    </span>
  );
}

function FormulaBox({ children }: { children: React.ReactNode }) {
  return <div className="payroll-formula-box">{children}</div>;
}

function ExplanationContent({
  topic,
  data,
}: {
  topic: PayrollHelpTopic;
  data: PayrollExplanationData;
}) {
  if (topic === "business-cash") {
    return (
      <>
        <Paragraph>
          Đây là số tiền thực sự thuộc doanh nghiệp tại cuối tháng, trước khi
          chừa vốn chủ chưa claim và vốn xoay vòng.
        </Paragraph>
        <FormulaBox>
          <Text type="secondary">Doanh thu lũy kế − Chi bằng tiền doanh nghiệp</Text>
          <strong>
            {formatVnd(data.cumulativeRevenue)} − {formatVnd(data.companyFundedOutflow)} ={" "}
            {formatVnd(data.businessCashBalance)}
          </strong>
        </FormulaBox>
      </>
    );
  }

  if (topic === "working-capital") {
    return (
      <>
        <Paragraph>
          Doanh nghiệp luôn giữ lại khoản này để nhập hàng và vận hành. Khoản
          này không chia cho nhân sự, kể cả khi tháng đó bán tốt.
        </Paragraph>
        <FormulaBox>
          <Text type="secondary">Mức giữ cố định</Text>
          <strong>{formatVnd(data.workingCapitalReserve)}</strong>
        </FormulaBox>
      </>
    );
  }

  if (topic === "distributable-pool") {
    return (
      <>
        <Paragraph>
          Quỹ tháng {data.periodLabel} chỉ lấy phần tiền sạch còn lại sau khi
          chừa đủ vốn chủ có thể claim, quỹ các tháng trước và vốn xoay vòng.
        </Paragraph>
        <FormulaBox>
          <Text type="secondary">
            Tiền doanh nghiệp − Vốn chủ chưa claim − Quỹ tháng trước − Vốn xoay vòng
          </Text>
          <strong>
            {formatVnd(data.businessCashBalance)} − {formatVnd(data.outstandingOwnerCapital)} −{" "}
            {formatVnd(data.previouslySettledPools)} − {formatVnd(data.workingCapitalReserve)} ={" "}
            {formatVnd(data.distributablePool)}
          </strong>
        </FormulaBox>
        <Paragraph type="secondary" className="payroll-help-footnote">
          Nếu kết quả âm, hệ thống hiển thị 0đ và chưa tạo quỹ để chia.
        </Paragraph>
      </>
    );
  }

  if (topic === "available-pool") {
    return (
      <>
        <Paragraph>
          Đây là tổng phần đã gán cho nhân sự nhưng chưa được rút. Phần chưa
          phân bổ vẫn nằm trong doanh nghiệp nên không tính vào đây.
        </Paragraph>
        <FormulaBox>
          <Text type="secondary">Đã phân bổ − Đã rút</Text>
          <strong>
            {formatVnd(data.allocatedTotal)} − {formatVnd(data.withdrawnTotal)} ={" "}
            {formatVnd(data.availablePool)}
          </strong>
        </FormulaBox>
      </>
    );
  }

  if (topic === "allocation") {
    return (
      <>
        <Paragraph>
          Khi sửa tỷ lệ, số tiền của mọi tháng chưa có phiếu rút được tính lại
          ngay theo công thức dưới đây.
        </Paragraph>
        <div className="payroll-help-calculation-list">
          {data.allocations.map((allocation) => (
            <div key={allocation.employeeName}>
              <span>{allocation.employeeName}</span>
              <strong>
                {formatVnd(data.distributablePool)} × {allocation.sharePercent}% ={" "}
                {formatVnd(allocation.amount)}
              </strong>
            </div>
          ))}
        </div>
      </>
    );
  }

  if (topic === "period-total") {
    const grandTotal = data.periods.reduce(
      (total, period) => total + period.allocatedTotal,
      0,
    );
    return (
      <>
        <Paragraph>
          Tổng này cộng phần đã phân bổ của tất cả các tháng, gồm cả tháng đang
          tạm tính. Tháng đã có phiếu rút sẽ được khóa phân bổ.
        </Paragraph>
        <div className="payroll-help-calculation-list">
          {data.periods.map((period) => (
            <div key={period.periodLabel}>
              <span>
                Tháng {period.periodLabel} · {period.isClosed ? "Đã chốt" : "Tạm tính"}
              </span>
              <strong>{formatVnd(period.allocatedTotal)}</strong>
            </div>
          ))}
        </div>
        <FormulaBox>
          <Text type="secondary">Tổng tất cả tháng</Text>
          <strong>{formatVnd(grandTotal)}</strong>
        </FormulaBox>
      </>
    );
  }

  return (
    <>
      <Paragraph>
        Mỗi nhân sự chỉ có một phiếu rút cho một tháng. Phiếu lưu lại tỷ lệ,
        số tiền và ngày rút tại thời điểm thực hiện.
      </Paragraph>
      <FormulaBox>
        <Text type="secondary">Tổng đã rút</Text>
        <strong>{formatVnd(data.withdrawnTotal)}</strong>
      </FormulaBox>
    </>
  );
}

export function PayrollExplanationModal({
  topic,
  data,
  onClose,
}: {
  topic: PayrollHelpTopic | null;
  data: PayrollExplanationData;
  onClose: () => void;
}) {
  return (
    <Modal
      centered
      width={660}
      open={Boolean(topic)}
      title={topic ? HELP_META[topic].title : "Giải thích cách tính"}
      footer={null}
      onCancel={onClose}
    >
      {topic ? (
        <div className="payroll-help-content">
          <Title level={5}>Số liệu tháng {data.periodLabel}</Title>
          <ExplanationContent topic={topic} data={data} />
        </div>
      ) : null}
    </Modal>
  );
}
