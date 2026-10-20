# Cái Tiệm Sữa

> “làm ở nhà, ngon thiệt nè.”

Ứng dụng quản lý bán hàng cuối ngày, chuẩn bị món, kho, công thức, giá vốn và
tài chính cho Cái Tiệm Sữa. Hệ thống hỗ trợ nhiều dòng kinh doanh; hiện tại gồm
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

Mở [http://localhost:3001](http://localhost:3001). Nếu đổi cổng dev, cập nhật
`BETTER_AUTH_URL` tương ứng để đăng nhập không bị lỗi origin. Với môi trường production
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

## Hiệu năng truy vấn

Đo hiệu năng truy vấn và kiểm tra/thêm index bằng `bun run db:profile`,
`bun run db:indexes` (dry-run) và `bun run db:indexes --apply`.
Xem kết quả đo và cách kiểm thử tại [docs/database-performance.md](docs/database-performance.md).

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
- `/storefront/orders` — đơn hàng đặt qua app, bill chuyển khoản và trạng thái giao hàng.
- `/storefront/products` — thêm, sửa, xóa món, ảnh, giá, topping và số lượng bán online.
- `/storefront/settings` — thông tin shop, ảnh QR chuyển khoản và phí giao hàng.

## Quản trị cửa hàng online trên web

Mở nhóm **Cửa hàng online** trên menu để vào **Đơn hàng online**, **Món trên app**
và **Shop & QR chuyển khoản**. Menu trên app dùng `storefront_products`, cài đặt
dùng `storefront_settings`, đơn dùng `storefront_orders` trong cùng database và
`STOREFRONT_STORE_ID` với app đặt món. Danh mục `/products` tiếp tục dùng cho
công thức/giá vốn. Đơn online chưa tự cộng vào phiếu chốt ngày.

Thiết lập một lần trên server có cấu hình MongoDB đúng của tiệm:

```sh
bun --env-file=.env.local scripts/setup-online-admin.ts
```

Script chuẩn bị tổ chức/điểm bán nếu còn thiếu và ghi cấu hình cửa hàng, secret
đăng nhập và mã thiết lập vào `.env.local`; không chuyển đổi kho/doanh thu.
Khởi động lại server rồi vào `/sign-in/storefront-setup`, nhập tên, email,
mật khẩu và mã `AUTH_BOOTSTRAP_TOKEN` lấy tại server để tạo chủ quán đầu tiên.
Nếu đã có owner, dùng tài khoản hiện tại; không tạo lại. Xóa mã bootstrap khỏi
môi trường server sau khi thiết lập. Khi deploy, cấu hình các biến tương ứng
trên server và `BETTER_AUTH_URL` theo domain admin.

### Đăng nhập sau khi deploy Vercel

Nếu thấy **“Địa chỉ admin chưa khớp cấu hình đăng nhập trên server.”**, kiểm tra
**Project → Settings → Environment Variables**. Đặt `BETTER_AUTH_URL` theo origin
admin thực tế, ví dụ `https://admin.example.com` hoặc `https://ten-project.vercel.app`,
không thêm `/sign-in`, không giữ `http://localhost:3001` của máy dev. Chọn đúng
môi trường **Production** hoặc **Preview**, rồi **Redeploy** để áp dụng.

Khi không đặt `BETTER_AUTH_URL`, app dùng domain production của Vercel cho bản
Production, hoặc URL nhánh/deployment cho Preview. Các URL nhánh và deployment
do Vercel cung cấp được thêm vào danh sách origin đăng nhập và quản trị cửa hàng;
không cho phép chung mọi domain `*.vercel.app`. Domain riêng cần khai báo qua
`BETTER_AUTH_URL`. `localhost:3001` chỉ là mặc định khi chạy ngoài production.
Giữ `BETTER_AUTH_SECRET` ổn định trên server để phiên đăng nhập dùng được giữa
các instance.

API cửa hàng luôn yêu cầu phiên đăng nhập thật và đúng tổ chức, kể cả khi
auth legacy đang tắt. Owner quản lý món/QR; staff xử lý đơn; viewer chỉ xem.
Ảnh upload nhận JPG/PNG/WebP tối đa 1,4 MB; bấm **Lưu** sau khi chọn ảnh.
Xóa món yêu cầu phiên bản mới nhất để tránh xóa từ danh sách cũ sau khi có
đơn mới. Các đơn đã đặt giữ nguyên tên, giá và topping kể cả khi món bị xóa.
Đơn được lọc trên server theo số điện thoại/trạng thái, phân trang 50 đơn,
tự cập nhật 15 giây; phải có lý do khi hủy đơn.
Đơn COD hiển thị rõ số tiền cần thu khi giao; đơn chuyển khoản có phần xem bill
và xác nhận tiền. Chưa có QR vẫn nhận COD, còn đơn chuyển khoản cần QR hợp lệ.

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

## DeepSeek: nhập hàng từ ảnh bill

Mobile gọi `POST /api/purchases/scan` với `{ imageBase64 }` (JPEG, tối đa 4 triệu ký tự base64). Server đọc danh mục thật, gọi DeepSeek `deepseek-flash` với ảnh và JSON output, kiểm tra kết quả và trả bản nháp. Các trường không đọc được giữ `null`; ngày không hợp lệ không tự đổi thành hôm nay. Ảnh chỉ dùng cho yêu cầu đọc, không lưu ảnh trong MongoDB. API có giới hạn 6 lần/phút và 30 lần/giờ toàn máy chủ để giới hạn chi phí cả khi AUTH_ENFORCEMENT legacy chưa bật. Khi bật auth, proxy áp quyền `purchases:write` cho cả hai endpoint.

`POST /api/purchases/import-receipt` nhận `{ receiptId, lines }`, `lines` theo validator phiếu nhập hiện có. Lưu cả bill và cập nhật danh mục/giá vốn trong một transaction; lỗi hoàn tác tất cả. Dấu vân tay JPEG là idempotency key: gửi lại dữ liệu giống nhau trả các ID đã lưu; dữ liệu khác với ảnh đã lưu trả 409. Hai dòng tạo cùng hàng mới/quy cách tái sử dụng một hàng trong danh mục. Dấu vân tay chỉ nhận diện cùng ảnh; chụp lại bill bằng ảnh khác cần người dùng kiểm tra lịch sử.

Cấu hình trên máy chủ (không đưa vào biến NEXT_PUBLIC_/EXPO_PUBLIC_):

```env
DEEPSEEK_API_KEY=
DEEPSEEK_RECEIPT_MODEL=deepseek-flash
```

Khi dùng Vercel, đặt các biến này trên project API và deploy các route mới. Giá trị model phải là API ID `deepseek-flash` (không kèm dấu nháy), không dùng tên hiển thị `DeepSeek-V4.1-Flash`. Sau khi sửa biến môi trường, redeploy để API nhận giá trị mới. Server kiểm tra model trước khi dùng hạn mức đọc bill; lỗi cấu hình hoặc lỗi dịch vụ được báo riêng, không yêu cầu người dùng chụp ảnh rõ hơn. MongoDB cần Atlas hoặc replica set. Mobile lưu bill ở ngày Việt Nam `YYYY-MM-DDT12:00:00+07:00`. Không nhập thử giao dịch vào DB production.

Test transaction dùng MongoDB replica set tạm, bind `127.0.0.1:27029`, tên replica set `receipt-test`; test chỉ cho phép URI localhost này và tự tạo/xóa DB `snowmilk_receipt_test_<uuid>`:

```sh
RECEIPT_TEST_MONGODB_URI='mongodb://127.0.0.1:27029/?replicaSet=receipt-test' bun test services/receipt-import.integration.test.ts
bun test lib/receipt.test.ts lib/validators/resources.test.ts lib/vietnam-date.test.ts
```
