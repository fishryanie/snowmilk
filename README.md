# Bếp Nhà Nè

> “làm ở nhà, ngon thiệt nè.”

Ứng dụng quản lý bán hàng cuối ngày, chuẩn bị món, kho, công thức, giá vốn và
tài chính cho Bếp Nhà Nè. Hệ thống hỗ trợ nhiều dòng kinh doanh; hiện tại gồm
Sữa Tuyết, Sữa tươi và Đồ ăn sáng.

## Nguồn dữ liệu production

Nguồn chính thức là MongoDB Atlas được cấu hình bằng `mongodb+srv` trong
`.env.local`, database `snowmilk`. Database local chỉ dùng để phát triển hoặc
restore thử migration; tuyệt đối không dùng số liệu local làm baseline
production.

Baseline đã đối soát ngày 12/08/2026:

- 20 ngày bán, từ 22/07/2026 đến 11/08/2026.
- Tổng doanh thu 110.501.000đ.
- Sữa Tuyết 108.501.000đ; Sữa tươi 2.000.000đ và 100 chai.
- Tiền mặt 70.030.000đ; chuyển khoản 40.471.000đ; chênh lệch 0đ.
- 2.893 ly Sữa Tuyết là số lượng ước tính, không phải dòng SKU thực tế.

## Yêu cầu

- Bun 1.1+.
- MongoDB Atlas cho production; MongoDB Community chỉ cần khi phát triển local.
- MongoDB Database Tools (`mongodump`, `mongorestore`) nếu dùng backup/restore.

## Cài đặt bằng Bun

```bash
bun install
cp .env.example .env.local
bun run dev
```

Mở [http://localhost:3000](http://localhost:3000). Với môi trường production
hoặc khi cần đọc baseline thật, giữ nguyên cấu hình Atlas trong `.env.local`:

```env
MONGODB_USERNAME=your_username
MONGODB_PASSWORD=your_password
MONGODB_URI=mongodb+srv://your-cluster.mongodb.net
MONGODB_DB_NAME=snowmilk
```

Chỉ khi chủ động phát triển trên database local mới dùng:

```env
MONGODB_URI=mongodb://127.0.0.1:27017
MONGODB_DB_NAME=snowmilk
```

Không thêm tiền tố `NEXT_PUBLIC_` vào các biến trên vì đây là thông tin chỉ
dành cho server. Có thể tiếp tục dùng URI đầy đủ có sẵn credentials để tương
thích cấu hình cũ; khi username/password được khai báo riêng, hai giá trị riêng
này sẽ được ưu tiên.

`MONGODB_DB_NAME` luôn nên được khai báo rõ ở production. Nếu bỏ trống,
ứng dụng dùng `snowmilk`; điều này tránh vô tình ghi dữ liệu vào database mặc
định `test` của MongoDB.

MongoDB local được lưu trong `.mongodb/` của dự án. Kiểm tra hoặc dừng tiến trình:

```bash
bun run db:status
bun run db:stop
```

## Nâng cấp v2 an toàn

Dry-run mặc định chỉ đọc Atlas và in nhận diện target đã che credential:

```bash
bun run migrate:v2 --catalog-map=config/v2-catalog-map.online-snowmilk.json
```

Không chạy `--apply` trước khi hoàn tất backup/restore thử, đối soát báo cáo,
kiểm kho vật lý tại cutover và maintenance window. Apply yêu cầu đồng thời
target Atlas `snowmilk`, confirmation token và checksum mới nhất của chính
dry-run đó. Xem [docs/v2-rollout.md](docs/v2-rollout.md).

## Xác thực và phân quyền

Giữ `AUTH_ENFORCEMENT=disabled` trong lúc rollout dữ liệu để các màn hình
legacy hiện tại không bị gián đoạn. Cờ này chỉ điều khiển proxy của phần legacy:
mọi Route Handler `/api/v2/*` vẫn luôn yêu cầu session thật. Sau khi migration
tạo organization, dùng bootstrap token một lần để tạo owner, xác minh đăng nhập
và membership, rồi bật `AUTH_ENFORCEMENT=enabled`. Owner, staff và viewer đều
được kiểm tra lại tại Route Handler/DAL, không chỉ ẩn nút trên giao diện.

`V2_OPERATIONS_ENABLED` cũng mặc định là `disabled`; chỉ bật cùng
`AUTH_ENFORCEMENT` trong maintenance window sau migration và trước khi owner
ghi opening balance. Trước cutover, `/sales` tiếp tục dùng luồng legacy để quán
không bị gián đoạn.

## Phân tích và import Excel

Workbook nguồn nằm tại `data/source.xlsx`.

```bash
bun run analyze:excel
bun run import:excel -- --dry-run
bun run import:excel
```

- `analyze:excel` tạo `docs/excel-profile.json`.
- `--dry-run` không ghi MongoDB.
- Import chính thức dùng upsert theo code/legacyId và tạo import log.
- Có thể chỉ định file khác: `bun run import:excel -- --file=/duong/dan/file.xlsx --dry-run`.

Trong giao diện, route `/import` hỗ trợ upload, preview, validate và xác nhận import.

## Kiểm tra dự án

```bash
bun run lint
bun run typecheck
bun run build
```

## Backup và restore

```bash
bun run db:backup
bun run db:restore -- --from=backups/2026-07-23T12-00-00-000Z
```

Restore dùng `--drop`, vì vậy collection đích sẽ được thay bằng dữ liệu trong backup đã chọn.
Backup và restore chỉ thao tác database được khai báo trong `MONGODB_DB_NAME`.

## Cấu trúc chính

```text
app/                    App Router pages và Route Handlers
components/             layout, provider, bảng/form dùng chung
hooks/                  client data hooks
lib/
  calculations/         công thức cost và bán hàng
  excel/                reader, mapper, chuẩn hóa cell
  validators/           Zod schemas
models/                 Mongoose models
services/               data access/import services
scripts/                analyze, import, backup, restore
data/source.xlsx        workbook nguồn
docs/                   phân tích, schema, business rules, đối chiếu
```

## Các route

- `/dashboard`
- `/sales`
- `/preparation`
- `/reports`
- `/purchases`
- `/expenses`
- `/products`
- `/ingredients`
- `/costing`
- `/equipment`
- `/import`
- `/settings`

## Quy tắc quan trọng

- Một product–size là một product riêng.
- V2 dùng một `SalesDay` cho mỗi ngày/điểm bán; người dùng nhập số lượng từng
  SKU cuối ngày, không nhập từng đơn POS.
- Giá và cost được snapshot tại thời điểm bán.
- Doanh thu toàn app là tổng các business line cấp lá; không thêm field cứng
  theo món mới.
- VND luôn là integer; số lượng/cost rate dùng Decimal128. Thiếu cost phải hiển
  thị thiếu dữ liệu, không mặc định thành 0 để tạo lợi nhuận giả.
- Kiểm kho là snapshot cuối ngày: nhập tồn thực tế để định giá kho và đối chiếu
  số ly theo vỏ ly. Số ly suy ra là chỉ báo vận hành, không phải số bán thực tế.
- Import giữ `sourceSheet`, `sourceRow`, `legacyId`.
- Số lượng mua và công thức được tự quy đổi về cùng đơn vị cost trước khi
  cộng hoặc tính giá vốn; đổi `gram` ↔ `kg` sẽ chuẩn hóa lịch sử mua và tính
  lại sản phẩm liên quan. Xem `docs/excel-analysis.md` và
  `docs/data-verification.md`.
