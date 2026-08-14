# Tiến độ

> **Nguồn production hiện tại:** MongoDB Atlas từ `.env.local`, database
> `snowmilk`. Baseline đã đối chiếu là 20 ngày bán từ 22/07/2026 đến
> 11/08/2026, tổng doanh thu 110.501.000đ. Dòng “MongoDB local” bên dưới chỉ
> ghi lại giai đoạn dựng v1 từ Excel, không phải baseline production và không
> được dùng để lập migration v2.

| Phase | Trạng thái | Kết quả |
|---|---|---|
| 1. Khởi tạo | Hoàn thành | Next.js 16, TypeScript, Ant Design, Mongoose; package manager Bun |
| 2. Phân tích Excel | Hoàn thành | Render 11 sheet, `excel-analysis.md`, `excel-profile.json`, dry-run |
| 3. Database & migration v1 | Lịch sử | Models, upsert, import log, liên kết ObjectId giữa các bảng; bản local 71 record chỉ dùng test/restore |
| 3b. Bếp Nhà Nè v2 | Đã cài đặt, chờ cutover | Schema v2, API transaction, RBAC, UI feature flag và migration Atlas dry-run; chưa ghi production |
| 4. Danh mục | Hoàn thành | Sản phẩm, Size, hàng hóa, tài sản, settings, chi phí; trường công thức chỉ đọc |
| 5. Nghiệp vụ chính | Hoàn thành | Drawer nhập hàng/mẻ sữa, select danh mục bắt buộc, tính cost phía server, bán nhanh và ghi đè có xác nhận |
| 6. Dashboard & báo cáo | Hoàn thành | KPI, sản phẩm bán chạy, date filter, API report |
| 7. Hoàn thiện | Hoàn thành có ghi chú | Responsive, loading, empty/fallback, export, backup/restore; lint, typecheck và production build đều đạt |

## Lưu ý mở

- Quy đổi topping kg ↔ gram đã được chuẩn hóa trong phép tính, import và
  backfill dữ liệu cũ.
- Cần bổ sung ngày nấu cho hai mẻ mẫu nếu muốn báo cáo theo lịch nấu.
- Import Excel v1 đã chạy trong giai đoạn lịch sử; migration production v2 chỉ
  dùng Atlas online và vẫn phải qua backup/restore + dry-run checksum trước
  `--apply`.
- React Doctor không chạy được do lớp bảo mật chặn thực thi gói từ xa; các kiểm tra cục bộ thay thế đều đạt.
