# Tiến độ

| Phase | Trạng thái | Kết quả |
|---|---|---|
| 1. Khởi tạo | Hoàn thành | Next.js 16, TypeScript, Ant Design, Mongoose; package manager Bun |
| 2. Phân tích Excel | Hoàn thành | Render 11 sheet, `excel-analysis.md`, `excel-profile.json`, dry-run |
| 3. Database & migration | Hoàn thành | Models, upsert, import log, liên kết ObjectId giữa các bảng; MongoDB local đã import 71 bản ghi |
| 4. Danh mục | Hoàn thành | Sản phẩm, Size, hàng hóa, tài sản, settings, chi phí; trường công thức chỉ đọc |
| 5. Nghiệp vụ chính | Hoàn thành | Drawer nhập hàng/mẻ sữa, select danh mục bắt buộc, tính cost phía server, bán nhanh và ghi đè có xác nhận |
| 6. Dashboard & báo cáo | Hoàn thành | KPI, sản phẩm bán chạy, date filter, API report |
| 7. Hoàn thiện | Hoàn thành có ghi chú | Responsive, loading, empty/fallback, export, backup/restore; lint, typecheck và production build đều đạt |

## Lưu ý mở

- Quy đổi topping kg ↔ gram đã được chuẩn hóa trong phép tính, import và
  backfill dữ liệu cũ.
- Cần bổ sung ngày nấu cho hai mẻ mẫu nếu muốn báo cáo theo lịch nấu.
- Import chính thức đã chạy; các cảnh báo dữ liệu được giữ nguyên để đối soát.
- React Doctor không chạy được do lớp bảo mật chặn thực thi gói từ xa; các kiểm tra cục bộ thay thế đều đạt.
