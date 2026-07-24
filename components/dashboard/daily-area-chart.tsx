"use client";

import {
  CategoryScale,
  Chart as ChartJS,
  Filler,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip,
  type ChartData,
  type ChartOptions,
} from "chart.js";
import dayjs from "dayjs";
import { Empty } from "antd";
import { Line } from "react-chartjs-2";
import { formatVnd } from "@/lib/formatters";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  Legend,
);

type DailyAreaChartProps = {
  ariaLabel: string;
  color: string;
  fillColor: string;
  label: string;
  points: Array<{ date: string; value: number }>;
};

const compactNumber = new Intl.NumberFormat("vi-VN", {
  notation: "compact",
  maximumFractionDigits: 1,
});

export function DailyAreaChart({
  ariaLabel,
  color,
  fillColor,
  label,
  points,
}: DailyAreaChartProps) {
  if (points.length === 0) {
    return (
      <div className="dashboard-chart-empty">
        <Empty description="Chưa có dữ liệu trong khoảng ngày này" />
      </div>
    );
  }

  const data: ChartData<"line"> = {
    labels: points.map((point) => dayjs(point.date).format("DD/MM")),
    datasets: [
      {
        label,
        data: points.map((point) => point.value),
        borderColor: color,
        backgroundColor: fillColor,
        borderWidth: 2.5,
        fill: true,
        pointBackgroundColor: color,
        pointBorderColor: "#ffffff",
        pointBorderWidth: 2,
        pointHoverRadius: 6,
        pointRadius: points.length > 45 ? 0 : 3,
        tension: 0.32,
      },
    ],
  };
  const options: ChartOptions<"line"> = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      intersect: false,
      mode: "index",
    },
    plugins: {
      legend: {
        display: false,
      },
      tooltip: {
        callbacks: {
          label: (context) => `${label}: ${formatVnd(context.parsed.y)}`,
        },
      },
    },
    scales: {
      x: {
        grid: {
          display: false,
        },
        ticks: {
          maxRotation: 0,
          autoSkip: true,
          maxTicksLimit: 10,
        },
      },
      y: {
        beginAtZero: true,
        border: {
          display: false,
        },
        grid: {
          color: "rgba(104, 115, 111, 0.12)",
        },
        ticks: {
          callback: (value) => compactNumber.format(Number(value)),
        },
      },
    },
  };

  return (
    <div className="dashboard-chart-frame">
      <Line
        aria-label={ariaLabel}
        role="img"
        data={data}
        options={options}
      />
    </div>
  );
}
