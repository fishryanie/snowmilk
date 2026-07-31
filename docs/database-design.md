# Thiết kế MongoDB

## Collections

### `products`

Một document cho mỗi biến thể sản phẩm–size vì workbook có mã độc lập (`M-OREO`, `L-OREO`) và giá bán/cost khác nhau.

Trường chính: `code`, `name`, `toppingIngredientId`, `sizeId`, `toppingName`, `sizeName`, `milkMl`, `toppingGrams`, `sellingPrice`, các snapshot cost (`milkCost`, `toppingCost`, `packagingCost`, `overheadCost`, `variableCost`, `allocatedFixedCost`, `fullCost`), `isActive`.

### `productsizes`

Ánh xạ trực tiếp sheet `Size`: `code`, `name`, `milkMl`, `cupSetName`, `sellingPrice`, `isActive`. Sản phẩm bắt buộc chọn một `sizeId`; giá bán và lượng sữa không được client tự nhập.

### `ingredients`

Ánh xạ sheet `Hàng hóa`: `code`, `name`, `category`, `purchaseUnit`, `packageQuantity`, `costUnit`, `referencePackagePrice`, `averageUnitCost`, `isActive`, `note`.

### `purchases`

Ánh xạ sheet `Nhập hàng`: client gửi ngày, `ingredientId`, số gói, tổng tiền thực trả, `fundingSource`, nhà cung cấp và ghi chú. `fundingSource` nhận `sales_revenue`, `owner_capital`, `loan` hoặc `other`; dữ liệu cũ và dữ liệu nhập từ Excel mặc định là `owner_capital`. API chụp tên/mã/nhóm/quy cách từ `ingredients`, tự tính lượng quy đổi và giá thực tế mỗi gói, rồi tính lại `ingredients.averageUnitCost`.

### `milkbatches`

Ánh xạ cả bảng mẻ và bảng chi tiết nguyên liệu của sheet `Mẻ sữa`. Mỗi dòng chi tiết nhận `ingredientId` + số lượng, sau đó API lấy đơn vị/giá vốn và tính `amount`. Chi tiết công thức nằm trong `ingredients[]`; giữ snapshot `unitCost` và `amount`.

### `sales`

Một document cho mỗi tổ hợp ngày + mẻ + phương thức thanh toán. Client chỉ gửi `batchId`, `productId` và số lượng; API tra lại sản phẩm/mẻ rồi tạo `items[]` với snapshot giá bán và cost tại thời điểm bán.

### `equipment`

Ánh xạ sheet `Đầu tư & Tài sản`: vốn đầu tư, `fundingSource`, giá trị còn lại, thời gian sử dụng, khấu hao tháng và trạng thái. Tài sản cũ không có nguồn tiền được coi là `owner_capital`.

### `expenses`

Chi phí ngoài nhập hàng/tài sản: điện, nước, mặt bằng, vận chuyển, marketing, sửa chữa hoặc khác. Mỗi chi phí ghi `paymentStatus` (`paid` hoặc `unpaid`) và `fundingSource`; bản ghi cũ không có trạng thái được coi là `paid`, không có nguồn tiền được coi là `owner_capital`. Workbook chưa có sheet riêng nên collection khởi tạo rỗng.

### `payrollperiodsettlements`

Snapshot quỹ lương sau khi tháng kết thúc: lưu kỳ `YYYY-MM`, ngày chốt, doanh thu/nhập hàng/chi phí/tài sản trong kỳ, số lũy kế, vốn xoay vòng, tổng tiền sạch được chia và snapshot tỷ lệ/số tiền của từng nhân sự. `period` là duy nhất; dữ liệu tháng hiện tại chỉ được tính tạm thời và chưa ghi collection.

### `settings`

Key-value cho các tham số từ sheet `Thiết lập`.

### `importlogs`

Lưu hash file, thời điểm import, tổng dòng hợp lệ/lỗi theo sheet. Lỗi chi tiết dùng tên `rowErrors` để tránh pathname `errors` dành riêng của Mongoose.

## Chỉ mục

- Unique: `products.code`, `productsizes.code`, `productsizes.name`, `ingredients.code`, `equipment.code`, `milkbatches.code`, `settings.key`.
- Unique compound: `sales(saleDate, batchName, paymentMethod)`.
- Sparse/index: `legacyId` trên các bản ghi có nguồn Excel.
- Date index: `sales.saleDate`, `purchases.purchaseDate`, `expenses.expenseDate`.

## Truy vết legacy

Mọi collection nhập từ Excel đều có `sourceSheet`, `sourceRow`, `legacyId`. Không xóa các giá trị bất thường trong migration; việc sửa dữ liệu phải trở thành thay đổi có chủ đích sau đối soát.
