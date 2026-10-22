# Hiệu năng truy vấn MongoDB

Đo ngày 13/10/2026 trên database Atlas `snowmilk`. Dữ liệu tại thời điểm đo:
314 phiếu nhập, 76 bản chốt bán hàng, 48 nguyên liệu và 18 sản phẩm.

## Kết quả

Dashboard trước đây chạy 21 truy vấn mỗi request, đọc cùng collection nhiều
lần cho tổng chi, nguồn tiền, vốn đầu tư và cảnh báo. Bản mới dùng 10 truy vấn:

- Một aggregation `$facet` cho mỗi collection mua hàng, tài sản và chi phí,
  trả các dòng trong kỳ, tổng lũy kế và cảnh báo nguồn tiền.
- MongoDB tổng hợp doanh thu lịch sử, ngày bán mới nhất và số ngày lệch tiền;
  backend không tải toàn bộ lịch sử để tính các giá trị này.
- Truy vấn doanh thu trong kỳ chỉ lấy các field được dùng trong báo cáo.
- Kiểm tra mẻ có giá vốn bằng `exists`, thay vì đếm toàn bộ mẻ phù hợp.

Đo 7 cặp request trước/sau, cùng khoảng ngày 01/07–13/10/2026 và kết nối
đã sẵn sàng:

| Chỉ số | Trước | Sau |
| --- | ---: | ---: |
| Số truy vấn | 21 | 10 |
| Trung vị thời gian xử lý backend | 374 ms | 100 ms |

Mọi response trong 7 cặp khớp hoàn toàn. Đối chiếu thêm báo cáo tháng 8,
tháng 10 và một khoảng ngày không có giao dịch cũng khớp. Quy tắc bản chốt
ngày ưu tiên hơn dòng bán lẻ được giữ theo ngày Việt Nam; chi phí thiếu
paymentStatus vẫn được coi là đã trả; vốn đã claim vẫn giữ giá trị lịch sử.

Đây là thời gian gọi backend local tới Atlas, không phải tổng thời gian tải
page trong browser. Thời gian kết nối ban đầu và độ trễ mạng vẫn ảnh hưởng
request đầu tiên. Với dữ liệu hiện tại, thời gian thực thi các truy vấn danh
sách trên MongoDB khoảng 0–6 ms, còn một lượt mạng khoảng 50 ms. Vì vậy index
chủ yếu loại bỏ việc sort/quét dư và giúp truy vấn ổn định khi dữ liệu tăng;
không nên suy ra mọi page sẽ nhanh hơn theo cùng tỷ lệ với dashboard.

## Index

14 index bổ sung đã được tạo trên Atlas và khai báo trong Mongoose schemas.
Danh sách dùng chung nằm ở `lib/db-read-indexes.ts`:

- Lịch sử nhập hàng theo purchaseDate + createdAt; tra phiếu theo
  ingredientId, itemCode và category.
- Lịch sử bán hàng theo entryMode + saleDate + _id, hỗ trợ cursor và ngày trùng.
- Danh sách sản phẩm, nguyên liệu, size, mẻ, chi phí và tài sản theo createdAt.
- Nguyên liệu kiểm kho theo isActive + category + name.
- Mẻ theo cookedAt + createdAt; thu hồi vốn theo withdrawalDate + createdAt.

`explain("executionStats")` xác nhận 8 truy vấn trong profiler đều dùng
IXSCAN và không có SORT. Lịch sử nhập hàng lấy 250 dòng chỉ đọc 250 documents,
thay cho quét cả 314 documents rồi sort trước đây. Cách bố trí index theo
điều kiện lọc và sắp xếp dựa trên
[hướng dẫn ESR của MongoDB](https://www.mongodb.com/docs/manual/tutorial/equality-sort-range-guideline/).

Các thay đổi chỉ thêm index, không sửa giao dịch, không xóa index hiện hữu.
Phần index có hiệu lực ngay trên Atlas; phần backend cần deploy code mới.

## Công cụ kiểm tra

```sh
bun run db:profile
bun run db:indexes
bun run db:indexes --apply
```

`db:profile` chỉ đọc: in thời gian, kích thước kết quả và query plan, không in
nội dung bản ghi hay credential. `db:indexes` mặc định dry-run. `--apply`
chỉ tạo index còn thiếu trên collection đã có; không dùng `syncIndexes()`
vì thao tác đó có thể xóa index ngoài danh sách. Chạy lại dry-run sau apply
không còn index cần tạo.

Test aggregation và index dùng database tạm riêng trên localhost:27030,
không dùng cấu hình database của app:

```sh
DB_PERFORMANCE_TEST_MONGODB_URI='mongodb://127.0.0.1:27030/' bun test lib/dashboard-queries.integration.test.ts
```

5 test tích hợp kiểm tra collection rỗng, trạng thái thanh toán legacy,
nguồn vốn sau claim/xóa nguồn, ranh giới ngày Việt Nam và kết quả sắp xếp
trước/sau index. Database fixture tự được xóa sau test.


## Tải trang và cache — 22/10/2026

Đã kiểm tra lại trên Atlas thật, chỉ đọc dữ liệu. Các truy vấn danh sách trong
`db:profile` dùng IXSCAN, không có SORT; MongoDB thực thi 0–2 ms. Lượt mạng
local–Atlas thường 48–111 ms; tạo kết nối mới đo được 902 ms. Dry-run
`db:indexes` không phát hiện thiếu index đọc. Với lượng dữ liệu hiện tại, chưa
có bằng chứng cần thiết kế lại schema để giải quyết shimmer ở mọi trang.

Các nguyên nhân ở tầng ứng dụng:

- AppShell thay toàn bộ children bằng skeleton khi bấm menu, khiến trang đang
  hiển thị bị unmount. Nó còn có timeout dự phòng 10 giây nếu navigation
  không hoàn tất. Đã bỏ lớp loading tự quản này, giữ việc chuyển route cho Next.
- Hook API cũ không giữ dữ liệu giữa các lần mount, dùng effect để fetch sau
  hydration, abort request khi rời trang; focus/visibility có thể tải trùng.
  Các workspace v2 và storefront còn có loader riêng. Đã hợp nhất bằng SWR.
- React.cache của branding chỉ dùng lại trong một render. Branding công khai
  được cache 60 giây trong Next Data Cache, có khóa organization; lỗi đọc DB
  không được cache thành branding mặc định. API giao dịch và session không
  dùng server cache chung.
- Cursor danh sách/mua hàng dùng batch mặc định 101 bản ghi, nên vài trăm
  dòng vẫn phát sinh getMore qua mạng. Đã dùng batch 500 cho danh sách và
  dữ liệu mua hàng tính tổng; giữ nguyên giới hạn, phép tính và kết quả trả về.
- Pool Mongoose giới hạn 10 connection mỗi instance, cho phép mở đồng thời
  tối đa 10 để phục vụ các truy vấn báo cáo chạy song song.

Cache phía trình duyệt chỉ nằm trong RAM của phiên trang, không ghi dữ liệu
kinh doanh vào localStorage hay cache công khai. Trang đã tải hiện dữ liệu
thật ngay khi quay lại và đồng bộ nền; request đồng thời cùng URL được gộp.
Prefetch bắt đầu khi hover, focus, touch hoặc chọn menu, dùng đúng URL,
bộ lọc và ngày Việt Nam của workspace. Dữ liệu mẫu Excel không được đưa
vào cache dùng chung.

Mọi thao tác ghi qua apiFetch/requestV2 làm mới query đang mở, xóa dữ liệu
query không còn mở, bao gồm các biến thể ngày/bộ lọc. Response đọc cũ không
được ghi đè cache sau mutation. Đổi URL không hiển thị dữ liệu của URL trước.
Lỗi 401/403 và vào màn hình đăng nhập xóa cache. Đăng nhập thành công hiện
có full navigation, tạo phiên RAM mới. Quyền vẫn được kiểm tra trên server.
Bản nhập chốt ngày v2 nằm riêng, không bị background refresh ghi đè.

### Số đo HTTP production local

Chạy `next build` rồi `next start --port 3002`, MongoDB Atlas từ `.env.local`.
Mỗi URL đo 4 lần, warm là trung vị 3 lần sau. Các flag auth legacy/v2 đang
ở mặc định tắt trên máy này; bảng không đo chi phí đăng nhập và phân quyền
trên deployment đã bật enforcement. Không thay flag hay bootstrap tài khoản
để benchmark. Không ghi giao dịch thử vào Atlas.

Thời gian HTML chỉ là response tài liệu, **không phải** thời gian từ click
đến có đủ dữ liệu, hydration, biểu đồ và ảnh. API là round-trip HTTP đầy đủ
đến backend local, gồm truy vấn Atlas. First là lần đầu URL được script gọi,
không nhất thiết là cold start của một instance độc lập.

| Page | First (ms) | Warm median (ms) |
| --- | ---: | ---: |
| `/dashboard` | 77 | 5 |
| `/sales` | 8 | 4 |
| `/ingredients` | 274 | 31 |
| `/products` | 8 | 4 |
| `/costing` | 7 | 4 |
| `/batches` | 7 | 4 |
| `/purchases` | 7 | 3 |
| `/expenses` | 6 | 4 |
| `/payroll` | 10 | 7 |
| `/divestments` | 9 | 6 |
| `/equipment` | 6 | 4 |
| `/settings` | 7 | 3 |
| `/inventory` | 6 | 4 |
| `/preparation` | 6 | 3 |
| `/reports` | 6 | 4 |
| `/employees` | 6 | 4 |
| `/storefront/orders` | 7 | 4 |
| `/storefront/products` | 7 | 4 |
| `/storefront/settings` | 7 | 5 |

| API | First (ms) | Warm median (ms) |
| --- | ---: | ---: |
| `/api/products?limit=500` | 1337 | 259 |
| `/api/ingredients?limit=500` | 511 | 107 |
| `/api/batches?limit=500` | 52 | 51 |
| `/api/purchases?limit=500` | 158 | 111 |
| `/api/settings` | 53 | 50 |
| `/api/sales` | 202 | 115 |
| `/api/reports/dashboard` | 65 | 57 |
| `/api/product-onboarding` | 103 | 61 |
| `/api/inventory` | 58 | 106 |
| `/api/payroll/employees` | 55 | 51 |
| `/api/payroll/withdrawals` | 55 | 51 |
| `/api/payroll/periods` | 162 | 129 |
| `/api/divestment-claims` | 127 | 110 |

Trong lượt đo trước/sau cùng máy: ingredients 163 → 107 ms, purchases
206 → 111 ms. Các response products, ingredients, purchases và inventory
được đối chiếu SHA-256 trước/sau và giống hoàn toàn. Lượt đầu products vẫn
1.337 ms khi tiến trình/connection/model vừa khởi động; các con số warm
không phải cam kết cho cold start hay deployment từ region khác.

Đã bấm thử các trang vận hành, danh mục, tài chính và cài đặt trên browser
bản production. Các lần quan sát trả về trong vài trăm ms; một số lần vào
trang đầu vẫn thấy skeleton ngắn. Quay lại Kho và Nhập hàng đã có dữ liệu
thật mà không bị lớp skeleton của menu che toàn trang. Thời gian gọi công
cụ browser có overhead, không dùng nó làm chỉ số Web Vitals.

### Kiểm tra và giới hạn

- 279 test pass, 11 test MongoDB tích hợp bị skip vì chưa có DB fixture local.
- 10 test cache kiểm tra gộp request, invalidation, response cũ đến muộn,
  lỗi quyền, lỗi mạng và khóa prefetch theo ngày Việt Nam.
- 8 kiểm tra với React DOM + Happy DOM: mount đầu, remount dùng cache, không
  fetch trùng khi remount, refresh nền giữ nội dung, đổi filter, prefetch,
  mutation và cache trang không còn mở. Render component kiểm thử từ cache
  khoảng 0,6 ms; đây không phải số đo render toàn bộ app trong browser.
- Typecheck và build pass. ESLint không có lỗi; còn 2 warning unused-vars
  đã có sẵn ở `lib/storefront-core/store.ts`. React Doctor chạy trên changed
  files báo không có diagnostic mới; score tổng thể báo 49/100 nên không
  dùng score này để khẳng định toàn bộ kiến trúc app đã được kiểm toán.

Lệnh tái hiện:

```sh
bun run build
bun run start -- --port 3002
# terminal khác
bun run profile:app
bun test lib/api-client.test.ts
bun run test:api-navigation
```

DOM test dùng Node để chạy Happy DOM (đã kiểm tra Node 25.2.1), tránh
không tương thích Happy DOM mới với Bun 1.1.34. HTTP profiler có thể đổi
base bằng biến APP_PROFILE_URL; luôn kiểm tra status, không coi redirect
đăng nhập là một page có dữ liệu.

Code chưa được deploy trong lần kiểm tra này. Để chốt mục tiêu latency trên
production cần đo domain thật, với session thật, thiết bị/mạng đích và cả
cold/warm instances; kiểm tra region compute gần Atlas. Chưa có bằng chứng
cho phép hứa mọi page/lần tải đầu dưới 100 ms.

Tham khảo API cache: [SWR revalidation](https://swr.vercel.app/docs/revalidation),
[mutation](https://swr.vercel.app/docs/mutation). Next caching được đối chiếu
với tài liệu đi kèm Next 16.2.11 trong node_modules/next/dist/docs.
