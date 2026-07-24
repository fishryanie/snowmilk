import { Card, Skeleton } from "antd";

export function RouteSkeleton() {
  return (
    <div
      className="page-wrap route-skeleton"
      aria-label="Đang tải trang"
      role="status"
    >
      <div className="route-skeleton-heading">
        <Skeleton active title={{ width: 220 }} paragraph={{ rows: 1, width: 420 }} />
      </div>
      <div className="route-skeleton-grid">
        {Array.from({ length: 4 }, (_, index) => (
          <Card className="surface-card" key={index}>
            <Skeleton active title={{ width: "55%" }} paragraph={{ rows: 2 }} />
          </Card>
        ))}
      </div>
      <Card className="surface-card route-skeleton-table">
        <Skeleton active title={{ width: 180 }} paragraph={{ rows: 5 }} />
      </Card>
    </div>
  );
}
