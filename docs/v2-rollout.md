# Bếp Nhà Nè v2 — runbook migration và cutover

Tài liệu này là guardrail vận hành. Nó không phải lệnh cho phép tự động ghi vào
Atlas. Người vận hành chỉ chạy apply trong maintenance window đã duyệt.

## 1. Target production đã khóa

- Nguồn cấu hình: `.env.local` qua `getMongoConfig()`.
- Scheme: `mongodb+srv`.
- Database: `snowmilk`.
- Timezone kinh doanh: `Asia/Ho_Chi_Minh`.
- Database local chỉ nhận bản restore để test; không dùng làm baseline.

Script phải dừng nếu target, source data hoặc catalog map thay đổi giữa dry-run
và apply. URI, username và password không được ghi vào output/log.

## 2. Baseline đối soát

| Chỉ số | Giá trị |
|---|---:|
| Ngày bán | 20 |
| Khoảng ngày | 22/07/2026–11/08/2026 |
| Tổng doanh thu | 110.501.000đ |
| Sữa Tuyết | 108.501.000đ |
| Sữa tươi | 2.000.000đ |
| Chai Sữa tươi | 100 |
| Tiền mặt | 70.030.000đ |
| Chuyển khoản | 40.471.000đ |
| Chênh lệch thanh toán | 0đ |
| Ly Sữa Tuyết ước tính | 2.893 |

`2.893` ly không được materialize thành SKU thực tế và không được tạo stock
movement hồi tố.

## 3. Dry-run online

```bash
bun run migrate:v2 --catalog-map=config/v2-catalog-map.online-snowmilk.json
```

Điều kiện đạt:

- Output ghi `mode=dry-run`, `connectionSource=online`,
  `scheme=mongodb+srv`, `dbName=snowmilk`.
- Catalog map 12/12 product, không còn exception.
- Sales 20/20 ngày và mọi tổng ở mục 2 khớp.
- `noRetroactiveStockMovements=true`.
- Lưu checksum và reconciliation report vào hồ sơ cutover.

Dry-run là read-only; không tạo cả migration receipt trong database.

## 4. Checklist trước apply

- Atlas backup hoàn tất và restore thành công vào database tạm.
- Rehearsal migration trên bản restore hoàn tất.
- Dashboard cũ/mới đối soát từng ngày, cash/bank chênh lệch 0đ.
- Mapping product/recipe đạt 100%; không có suy đoán theo tên.
- Owner đã đo và chốt ngoài hệ thống các yield nguyên liệu thô cùng hạn dùng
  thực tế của Hộp Healthy, sẵn sàng nhập ngay trong maintenance window sau
  khi seed v2 tồn tại.
- Đã kiểm kho vật lý tại điểm bán, chuẩn bị opening balances.
- Feature flag `V2_OPERATIONS_ENABLED` vẫn `disabled`, đã test và có kế hoạch
  rollback.
- Maintenance window và người chịu trách nhiệm được xác nhận.

## 5. Apply có chủ đích

Script chỉ chấp nhận apply khi có đủ ba guard:

```text
--apply
--confirm=ONLINE-snowmilk
--dry-run-checksum=<checksum 64 ký tự của dry-run mới nhất>
```

Không copy một checksum cũ vào runbook. Script tự đọc lại source, tính lại
checksum và từ chối nếu source/target/mapping đã đổi. Apply dùng transaction và
upsert/idempotency receipt để chạy lại không nhân đôi dữ liệu.

## 6. Cutover và hậu kiểm

1. Backup Atlas lần cuối.
2. Chạy incremental dry-run và xác nhận checksum mới.
3. Apply trong maintenance window.
4. Cấu hình auth, bootstrap owner bằng token dùng một lần, đăng nhập thử và xóa
   token. API v2 luôn yêu cầu session thật kể cả khi proxy legacy chưa bật auth.
5. Trong maintenance window, bật đồng thời `AUTH_ENFORCEMENT=enabled` và
   `V2_OPERATIONS_ENABLED=enabled`; chưa mở lại hệ thống cho người dùng.
6. Phiếu kiểm kho posted đầu tiên tại location tự tạo opening movements từ số
   đếm vật lý; không replay 144 purchases để suy đoán tồn hiện tại.
7. Owner nhập yield/hạn dùng đã đo, phát hành recipe Healthy, rồi đối soát 20
   ngày, business line, cash/bank và số chai.
8. Mở lại hệ thống và chuyển read/write sang v2; không dual-write kéo dài.
9. Giữ collection legacy read-only tối thiểu 30 ngày và qua một kỳ đối soát
   tháng.
10. Chỉ gỡ code legacy sau khi restore và đối soát đều đạt.

## 7. Rollout xác thực

1. Cấu hình secret tối thiểu 32 ký tự, base URL và bootstrap token dùng một lần.
2. Giữ `AUTH_ENFORCEMENT=disabled` khi migration/seed chưa xong để proxy legacy
   chưa khóa; điều này không tạo bypass cho `/api/v2/*`.
3. Bootstrap owner đầu tiên, đăng nhập thử và đọc lại membership.
4. Xóa `AUTH_BOOTSTRAP_TOKEN` khỏi môi trường.
5. Bật `AUTH_ENFORCEMENT=enabled` cùng lúc với cutover vận hành v2.
6. Kiểm thử owner/staff/viewer trên cả UI và API; staff được kiểm kho/chốt ngày,
   chỉ owner được mở lại ngày hoặc điều chỉnh kho thủ công.
