"use client";

import {
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip,
  type ChartData,
  type ChartOptions,
} from "chart.js";
import { WalletOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import { Line } from "react-chartjs-2";
import { formatVnd } from "@/lib/formatters";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
);

export type PayrollTimelineSeries = {
  name: string;
  color: string;
  points: Array<{ date: string; value: number }>;
};

const compactNumber = new Intl.NumberFormat("vi-VN", {
  notation: "compact",
  maximumFractionDigits: 1,
});

export function PayrollTimelineChart({
  series,
}: {
  series: PayrollTimelineSeries[];
}) {
  const labels = series[0]?.points.map((point) =>
    dayjs(point.date).format("DD/MM"),
  );
  const hasPositiveValue = series.some((item) =>
    item.points.some((point) => point.value > 0),
  );
  if (!labels?.length || !hasPositiveValue) {
    return (
      <div className="payroll-timeline-empty">
        <div className="payroll-zero-state">
          <span className="payroll-zero-state-icon">
            <WalletOutlined />
          </span>
          <strong>Chưa có quỹ lương để hiển thị</strong>
          <span>
            Vốn xoay vòng cần giữ hiện đang cao hơn số tiền có thể phân chia.
          </span>
        </div>
      </div>
    );
  }

  const data: ChartData<"line"> = {
    labels,
    datasets: series.map((item) => ({
      label: item.name,
      data: item.points.map((point) => point.value),
      borderColor: item.color,
      backgroundColor: item.color,
      borderWidth: 2.5,
      pointBackgroundColor: item.color,
      pointBorderColor: "#ffffff",
      pointBorderWidth: 2,
      pointHoverRadius: 6,
      pointRadius: item.points.length > 40 ? 0 : 3,
      tension: 0.34,
    })),
  };
  const options: ChartOptions<"line"> = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { intersect: false, mode: "index" },
    plugins: {
      legend: {
        position: "bottom",
        labels: { usePointStyle: true, pointStyle: "circle", boxWidth: 8 },
      },
      tooltip: {
        callbacks: {
          label: (context) =>
            `${context.dataset.label}: ${formatVnd(context.parsed.y)}`,
        },
      },
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 10 },
      },
      y: {
        beginAtZero: true,
        border: { display: false },
        grid: { color: "rgba(104, 115, 111, 0.12)" },
        ticks: {
          callback: (value) => compactNumber.format(Number(value)),
        },
      },
    },
  };

  return (
    <div className="payroll-timeline-frame">
      <Line
        aria-label="Biểu đồ lũy kế tiền được lãnh của nhân sự"
        role="img"
        data={data}
        options={options}
      />
    </div>
  );
}
