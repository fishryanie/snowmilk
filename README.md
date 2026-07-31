# Snowmilk — quản lý quán Sữa Tuyết

Ứng dụng Next.js thay thế workbook quản lý bán Sữa Tuyết: bán nhanh theo ngày/mẻ, nhập hàng, sản phẩm, hàng hóa, công thức giá vốn, tài sản, chi phí, dashboard, import/export Excel.

## Yêu cầu

- Bun 1.1+.
- MongoDB Community chạy local.
- MongoDB Database Tools (`mongodump`, `mongorestore`) nếu dùng backup/restore.

## Cài đặt bằng Bun

```bash
bun install
cp .env.example .env.local
bun run db:start
bun run dev
```

Mở [http://localhost:3000](http://localhost:3000). Cấu hình MongoDB local:

```env
MONGODB_URI=mongodb://127.0.0.1:27017
MONGODB_DB_NAME=snowmilk
```

Với MongoDB Atlas, URI chỉ cần chứa cluster host. Ứng dụng tự URL-encode rồi
chèn username/password vào URI:

```env
MONGODB_USERNAME=your_username
MONGODB_PASSWORD=your_password
MONGODB_URI=mongodb+srv://your-cluster.mongodb.net
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
- Một sale là một ngày + mẻ + phương thức thanh toán, có `items[]`.
- Giá và cost được snapshot tại thời điểm bán.
- Kiểm kho là snapshot cuối ngày: nhập tồn thực tế để định giá kho và đối chiếu
  số ly theo vỏ ly. Số ly suy ra là chỉ báo vận hành, không phải số bán thực tế.
- Import giữ `sourceSheet`, `sourceRow`, `legacyId`.
- Số lượng mua và công thức được tự quy đổi về cùng đơn vị cost trước khi
  cộng hoặc tính giá vốn; đổi `gram` ↔ `kg` sẽ chuẩn hóa lịch sử mua và tính
  lại sản phẩm liên quan. Xem `docs/excel-analysis.md` và
  `docs/data-verification.md`.
