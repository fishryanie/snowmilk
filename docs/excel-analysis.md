# Phân tích workbook “QUẢN LÝ QUÁN SỮA”

## 1. Phạm vi và cách phân tích

- File nguồn được sao chép vào `data/source.xlsx`; file gốc ngoài dự án không bị chỉnh sửa.
- Workbook có 11 sheet, 3 biểu đồ (ExcelJS nhận diện 2 chart trong `Tổng quan`; bản render cho thấy vùng biểu đồ dashboard) và hàng nghìn công thức được điền sẵn xuống các dòng trống.
- `bun run analyze:excel` xuất hồ sơ kỹ thuật đầy đủ vào `docs/excel-profile.json`, gồm công thức, merge, data validation, định dạng và dữ liệu mẫu.
- Tất cả 11 sheet đã được render để kiểm tra trực quan. Màu vàng là vùng nhập, màu xanh/lục là vùng tính tự động, vùng xám là danh sách phụ trợ.

> Quan trọng: `rowCount` của ExcelJS thường là 1.000 vì workbook đã chuẩn bị công thức/validation đến dòng 1.000. Số bản ghi nghiệp vụ thật trong lần dry-run hiện tại là 71, gồm cả 2 bản ghi Size.

## 2. Luồng nghiệp vụ thật

```text
Thiết lập ──────────────┐
Đầu tư & Tài sản ───────┼→ phân bổ cố định/khấu hao
                        │
Nhập hàng → Hàng hóa → Mẻ sữa → Sản phẩm → Bán nhanh → Bán hàng → Tổng quan
             giá vốn BQ   cost/ml    cost/ly       nhập tay    tách dòng    KPI
Size ────────────────────────────────┘
```

Workbook ghi rõ **không quản lý tồn kho**. Vì vậy phiên bản web chỉ quản lý danh mục, lịch sử mua và giá vốn; chưa tự thêm nhập kho, xuất kho, định mức tồn hoặc cảnh báo tồn.

## 3. Phân tích từng sheet

| Sheet | Vai trò | Dữ liệu nhập thủ công | Dữ liệu/công thức tự động | Mapping hệ thống |
|---|---|---|---|---|
| `Hướng dẫn` | Tài liệu sử dụng workbook | Nội dung hướng dẫn | Không | Tài liệu nghiệp vụ, không import collection |
| `Thiết lập` | Tham số cost | B4:B10: công suất bếp, giá điện, điện/nước, overhead, số ly dự kiến, chi phí cố định | B11 lấy khấu hao từ tài sản; B12 phân bổ cố định/ly | `settings`; trang `/settings` |
| `Đầu tư & Tài sản` | Vốn đầu tư và khấu hao | Ngày, tên, nhóm, số lượng, đơn giá, giá trị còn lại, thời gian dùng, kích hoạt, ghi chú | Tổng tiền, khấu hao/tháng, mã nội bộ; B207:B209 tổng hợp | `equipment`; `/equipment` |
| `Size` | Danh mục size | Mã/tên size, ml sữa nền, bộ ly, giá bán mặc định, kích hoạt | Danh sách size/bao bì dùng cho validation | `productsizes`; `/sizes`; `products.sizeId` |
| `Sản phẩm` | Mỗi product–size một dòng | Topping, size, gram topping, trạng thái; các mã cũ được giữ nguyên | Tên món, giá bán, ml sữa, cost sữa/topping/bao bì/overhead/fixed/full cost | `products`; `/products`, `/costing` |
| `Hàng hóa` | Nguyên liệu, topping, bao bì | Mã, tên, nhóm, đơn vị mua, quy cách, đơn vị cost, giá tham khảo, kích hoạt, ghi chú | Giá vốn bình quân lấy từ `Nhập hàng`; danh sách kích hoạt | `ingredients`; `/ingredients` |
| `Mẻ sữa` | Mẻ/công thức sữa nền | Tên mẻ, sản lượng thực tế, thời gian nấu, ghi chú; ở bảng chi tiết chỉ chọn hàng, số lượng và ghi chú | Mã mẻ, công suất/giá điện/điện khác/nước từ Thiết lập; đơn vị/giá vốn từ Hàng hóa; cost nguyên liệu, điện, tổng mẻ, cost/lít, cost/ml, cost 400/550 ml | `milkbatches` với `ingredients[]`; `/batches`, `/costing` |
| `Nhập hàng` | Lịch sử mua, nguồn giá vốn | Ngày, tên hàng, số gói, giá thực tế, nhà cung cấp, ghi chú | Mã/nhóm/quy cách/đơn vị/giá tham khảo, lượng quy đổi, tổng tiền | `purchases`; `/purchases` |
| `Bán nhanh` | Form nhập bán hàng chính | Ngày, mẻ, thanh toán, số lượng từng sản phẩm, ghi chú | Tiêu đề sản phẩm, tổng ly, doanh thu dự kiến | `sales` (một document cho ngày + mẻ + thanh toán); `/sales` |
| `Bán hàng` | Tách Bán nhanh thành dòng chi tiết | Không nên nhập trực tiếp; cột giảm giá có một giá trị mẫu cần bảo toàn | Tên/mã món, mẻ, số lượng, giá, doanh thu, cost và lãi đóng góp | `sales.items[]`; nguồn snapshot giá/cost khi import |
| `Tổng quan` | KPI, bảng tổng hợp, biểu đồ | B4:B5 là khoảng ngày | SUMIFS doanh thu/cost/chi phí, lãi, khấu hao và bảng sản phẩm/mẻ | `/dashboard`; `/api/reports/dashboard` |

## 4. Công thức nghiệp vụ cần giữ nguyên

### Giá vốn bình quân hàng hóa

```text
Nếu có lịch sử mua:
  Giá vốn bình quân/đơn vị = Tổng tiền mua / Tổng lượng quy đổi
Nếu chưa có lịch sử mua:
  Giá vốn/đơn vị = Giá tham khảo/gói / Quy cách/gói
```

### Cost mẻ sữa

```text
Cost nguyên liệu = tổng thành tiền chi tiết nguyên liệu của mẻ
Cost điện = Thời gian nấu × Công suất bếp × Giá điện + Điện khác
Tổng cost mẻ = Cost nguyên liệu + Cost điện + Nước/vệ sinh
Cost/lít = Tổng cost mẻ / Thành phẩm thực tế (L)
Cost/ml = Cost/lít / 1.000
```

### Cost sản phẩm

```text
Cost sữa = ml sữa nền × cost/ml của mẻ áp dụng
Cost topping = lượng topping × giá vốn/đơn vị
Cost bao bì = bộ ly + ống hút + muỗng + túi
Overhead = (cost sữa + topping + bao bì) × tỷ lệ overhead
Cost biến đổi = sữa + topping + bao bì + overhead
Full cost = cost biến đổi + phân bổ cố định/khấu hao mỗi ly
```

### Bán hàng và dashboard

```text
Doanh thu dòng = Số lượng × Giá bán - Giảm giá
Tổng cost biến đổi = Số lượng × Cost biến đổi/ly
Lãi đóng góp = Doanh thu - Tổng cost biến đổi
Lợi nhuận tạm tính = Lãi đóng góp - Chi phí cố định phân bổ - Khấu hao phân bổ
Tổng âm còn lại = Lợi nhuận tạm tính - Tổng vốn đã bỏ lũy kế
```

Web lưu `unitPrice` và `unitVariableCost` trong từng `sale.items[]` để báo cáo quá khứ không đổi khi giá/công thức hiện tại thay đổi.

Card `Tổng âm còn lại` hiển thị trực tiếp kết quả cuối; dashboard không hiển
thị riêng tổng trung gian. `Tổng vốn đã bỏ lũy kế` bao gồm tiền thiết bị và
chỉ các phiếu nhập hàng chọn nguồn `Vốn chủ`. Phiếu nhập từ workbook không có
nguồn tiền được mặc định là `Vốn chủ`; các nguồn khác vẫn được tính vào tiền ra
nhưng không làm tăng vốn cần thu hồi.

### Gợi ý thoái vốn

```text
Số dư tiền ghi nhận = Tổng tiền vào lũy kế
  - Tổng tiền mua hàng, chi phí và thiết bị lũy kế
  - Tổng tiền đã thoái vốn

Quỹ dự phòng = Chi vận hành bình quân/ngày trong kỳ × 30 ngày
Trần có thể rút = min(
  Số dư tiền ghi nhận - Quỹ dự phòng,
  Vốn còn cần thu hồi
)
```

Dashboard chỉ gợi ý một số tiền lớn hơn 0 khi dòng tiền lũy kế và dòng tiền
vận hành trong kỳ đều dương, có ít nhất 7 ngày bán làm mẫu, và sau khi rút vẫn
giữ đủ quỹ dự phòng. Gợi ý không tự tạo bản ghi thoái vốn và phải được đối
chiếu với số dư ngân hàng, khoản phải trả và nghĩa vụ thuế.

## 5. Quan hệ và chống trùng

- `products.code`, `productSizes.code`, `ingredients.code`, `equipment.code`, `milkBatches.code` là khóa tự nhiên, có unique index.
- Form web chỉ gửi các trường tương ứng vùng vàng. `ingredientId`, `sizeId`, `toppingIngredientId`, `batchId` và `productId` là liên kết bắt buộc; API tra lại dữ liệu nguồn và không nhận tên/giá/cost từ client.
- Dòng lịch sử dùng `legacyId` dạng `purchase:<row>`, `sale-quick:<row>`.
- Mọi bản ghi import giữ `sourceSheet`, `sourceRow`, `legacyId` để truy vết.
- Import dùng upsert, nên chạy lại cùng file không tạo bản ghi trùng.
- Sale có unique index trên `(saleDate, batchName, paymentMethod)`; UI yêu cầu xác nhận trước khi ghi đè.

## 6. Dữ liệu bất thường hoặc chưa rõ

### 6.1. Sai đơn vị cost topping

Workbook gốc từng lưu các topping `Dâu giòn`, `Sữa chua sấy`, `Choco Ball`
với đơn vị cost là `kg`, nhưng công thức sản phẩm nhân trực tiếp với lượng
dùng `15` gram:

| Topping | Giá vốn BQ trong workbook | Công thức hiện tại | Hệ quả |
|---|---:|---:|---|
| Dâu giòn | 396.000 đ/kg | `15 × 396.000` | 5.940.000 đ/ly |
| Sữa chua sấy | 323.700 đ/kg | `15 × 323.700` | 4.855.500 đ/ly |
| Choco Ball | 285.333 đ/kg | `15 × 285.333` | 4.280.000 đ/ly |

Hệ thống hiện quy đổi lượng công thức sang đơn vị cost trước khi nhân
(`15 g = 0,015 kg`). Lịch sử mua có nhiều đơn vị cũng được quy đổi về đơn vị
danh mục trước khi cộng; đổi đơn vị danh mục sẽ chuẩn hóa purchase cũ, tính
lại giá vốn bình quân và tính lại các sản phẩm liên quan. Backfill ngày
31/07/2026 đã sửa dữ liệu MongoDB cũ.

### 6.2. Cache công thức giữa các sheet chưa đồng bộ

- `Bán nhanh`: 29 ly, doanh thu dự kiến 1.030.000 đ.
- `Bán hàng`/`Tổng quan` đang cache: 16 ly, doanh thu 540.000 đ, giảm giá 35.000 đ.
- Nguyên nhân: các dòng Dâu/Sữa chua/Choco ở `Bán hàng` chưa phản ánh số lượng mới từ `Bán nhanh` trong cache được lưu.

Importer ưu tiên số lượng gốc ở `Bán nhanh`, dùng `Bán hàng` làm snapshot giá, cost và giảm giá. Chênh lệch được ghi trong `docs/data-verification.md`.

### 6.3. Ngày nấu mẻ

Hai mẻ mẫu chưa có ngày nấu. Import vẫn giữ mẻ và cảnh báo; không tự gán ngày giả.

## 7. Không bỏ qua dữ liệu

- Các vùng danh sách phụ trợ và công thức điền sẵn không trở thành bản ghi database vì chúng không phải dữ liệu người dùng.
- `Hướng dẫn` không thành collection nhưng toàn bộ ý nghĩa đã được ghi lại trong tài liệu này.
- Không thêm nghiệp vụ tồn kho vì workbook tuyên bố rõ “Không quản lý tồn kho”.
- Không sửa kết quả cost bất thường trong code/import; UI đánh dấu cảnh báo để đối soát.
