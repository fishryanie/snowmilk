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
