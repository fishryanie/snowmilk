"use client";

import {
  ArcElement,
  Chart as ChartJS,
  Tooltip,
  type ChartData,
  type ChartOptions,
} from "chart.js";
import { Doughnut } from "react-chartjs-2";
import { formatVnd } from "@/lib/formatters";

ChartJS.register(ArcElement, Tooltip);

export type PayrollAllocationDonutItem = {
  name: string;
  sharePercent: number;
  amount: number;
  color: string;
};

const UNALLOCATED_COLOR = "#dfe7e9";

export function PayrollAllocationDonut({
  items,
  allocatedPercent,
}: {
  items: PayrollAllocationDonutItem[];
  allocatedPercent: number;
}) {
  const visibleItems = items.filter((item) => item.sharePercent > 0);
  const unallocatedPercent = Math.max(0, 100 - allocatedPercent);
  const labels = visibleItems.map((item) => item.name);
  const values = visibleItems.map((item) => item.sharePercent);
  const colors = visibleItems.map((item) => item.color);

  if (unallocatedPercent > 0) {
    labels.push("Chưa phân bổ");
    values.push(unallocatedPercent);
    colors.push(UNALLOCATED_COLOR);
  }

  const data: ChartData<"doughnut"> = {
    labels,
    datasets: [
      {
        data: values,
        backgroundColor: colors,
        borderColor: "#ffffff",
        borderWidth: 4,
        hoverBorderWidth: 4,
        hoverOffset: 6,
      },
    ],
  };
  const options: ChartOptions<"doughnut"> = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: "70%",
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (context) => {
            const item = visibleItems[context.dataIndex];
            if (!item) return `${context.label}: ${context.raw}%`;
            return `${item.name}: ${item.sharePercent}% · ${formatVnd(item.amount)}`;
          },
        },
      },
    },
  };

  return (
    <div className="payroll-donut-frame">
      <Doughnut
        aria-label="Biểu đồ donut tỷ lệ phân bổ quỹ lương"
        role="img"
        data={data}
        options={options}
      />
      <div className="payroll-donut-center" aria-hidden="true">
        <strong>{allocatedPercent}%</strong>
        <span>đã phân bổ</span>
      </div>
    </div>
  );
}
