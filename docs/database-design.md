# Thiết kế MongoDB

> Phần mô tả bên dưới là schema legacy v1 và được giữ để tra cứu dữ liệu cũ.
> Schema vận hành Bếp Nhà Nè v2 nằm trong `models/v2/`, dùng các collection
> `v2_*`, sổ doanh thu/kho append-only, recipe version bất biến và tenant theo
> organization/location. Migration v2 chỉ lấy baseline từ Atlas `snowmilk`
> qua `.env.local`; database local chỉ dùng trên bản restore để test.

## Mô hình vận hành được chuẩn hóa

Luồng sản xuất thực tế được tách thành ba lớp, không tạo lại nguyên liệu hoặc
công thức trong từng sản phẩm bán:

1. `ingredients` là hàng mua vào. Ví dụ một túi trân châu có
   `purchaseUnit=túi`, `packageQuantity=1`, `costUnit=kg`; mua một túi 1 kg giá
   28.000 đ. Định lượng khi nấu có thể nhập 60 g, server tự quy đổi g ↔ kg.
2. `milkbatches` là mẻ chuẩn bị dùng lại, gồm `batchType=milk_base|topping`,
   sản lượng thực tế (`outputQuantity`, `outputUnit`) và giá vốn chuẩn hóa theo
   `ml` hoặc `g`. Ví dụ Sữa Tuyết cho ra 6 lít; trân châu đường đen cho ra 75 g
   từ 60 g trân châu và 15 g đường.
3. `products` là SKU bán ra. Mỗi SKU tham chiếu một mẻ nền sữa và 0-n mẻ
   topping, chỉ lưu lượng tiêu thụ cho một sản phẩm. Size M/L là hai SKU có số
   ml nền sữa khác nhau nhưng có thể cùng dùng 10 g topping.

Các snapshot tên, mã, đơn giá và thành tiền vẫn được lưu trong mẻ/sản phẩm để
báo cáo lịch sử ổn định. Khi giá vốn một mẻ thay đổi, các SKU `composed` đang
tham chiếu mẻ đó được tính lại. Không cho xóa mẻ khi còn sản phẩm sử dụng.

Đích đến của schema v2 vẫn là `InventoryItem` với loại `raw_material`,
`packaging`, `semi_finished`, `finished_good`. Tuy nhiên quan hệ hiện tại giữa
`Recipe`/`RecipeVersion` và `Sku` đang bắt buộc SKU nên chưa biểu diễn đúng mẻ
bán thành phẩm. Trước khi chuyển hẳn sang v2, recipe sản xuất phải cho phép
`skuId` rỗng khi output là `semi_finished`; chỉ recipe lắp ráp thành phẩm mới
gắn SKU. Bản cập nhật legacy hiện tại là lớp tương thích cho đúng vận hành và
giữ nguyên dữ liệu cũ trong thời gian migration.

## Collections

### `products`

Một document cho mỗi biến thể sản phẩm–size vì workbook có mã độc lập (`M-OREO`, `L-OREO`) và giá bán/cost khác nhau.

Sản phẩm mới dùng `productMode=composed`, `milkBatchId`, `milkMl` và
`toppingItems[]` (`batchId`, `quantity`, `unit`, snapshot cost). Các trường
`toppingIngredientId`, `sizeId`, `recipeId` chỉ còn để đọc dữ liệu legacy. Mỗi
size vẫn là một document/SKU riêng vì có mã, lượng sữa và giá bán khác nhau.

### `productsizes`

Ánh xạ trực tiếp sheet `Size`: `code`, `name`, `milkMl`, `cupSetName`, `sellingPrice`, `isActive`. Sản phẩm bắt buộc chọn một `sizeId`; giá bán và lượng sữa không được client tự nhập.

### `ingredients`

Ánh xạ sheet `Hàng hóa`: `code`, `name`, `category`, `purchaseUnit`, `packageQuantity`, `costUnit`, `referencePackagePrice`, `averageUnitCost`, `isActive`, `note`.

### `purchases`

Ánh xạ sheet `Nhập hàng`: client gửi ngày, `ingredientId`, số gói, tổng tiền thực trả, `fundingSource`, nhà cung cấp và ghi chú. Với hàng hóa sữa tươi tính theo lít, phiếu nhập còn lưu số lít thuê/tự tiệt trùng, đơn giá, bên nhận, chi phí dịch vụ, `inventoryCostAmount`, `landedUnitCost` và liên kết `sterilizationExpenseId`. `fundingSource` nhận `sales_revenue`, `owner_capital`, `loan` hoặc `other`; dữ liệu cũ và dữ liệu nhập từ Excel mặc định là `owner_capital`. API chụp tên/mã/nhóm/quy cách từ `ingredients`, tự tính lượng quy đổi và giá thực tế mỗi gói, rồi tính lại `ingredients.averageUnitCost` từ giá trị tồn kho đã gồm chi phí tiệt trùng.

### `milkbatches`

Tên collection được giữ để tương thích nhưng nghiệp vụ là **mẻ chuẩn bị**.
`batchType` phân biệt `milk_base` và `topping`. `outputQuantity`/`outputUnit`
lưu sản lượng thu được; `outputBaseQuantity`, `outputBaseUnit` và
`costPerBaseUnit` chuẩn hóa về ml hoặc g. Mỗi dòng `ingredients[]` lưu cả đơn vị
định lượng (`unit`) và đơn vị giá vốn (`costUnit`) để quy đổi chính xác. Các
trường `actualLiters`, `costPerLiter`, `costPerMl` được duy trì cho mẻ sữa cũ.

### `sales`

Một document cho mỗi tổ hợp ngày + mẻ + phương thức thanh toán. Client chỉ gửi `batchId`, `productId` và số lượng; API tra lại sản phẩm/mẻ rồi tạo `items[]` với snapshot giá bán và cost tại thời điểm bán.

### `equipment`

Ánh xạ sheet `Đầu tư & Tài sản`: vốn đầu tư, `fundingSource`, giá trị còn lại, thời gian sử dụng, khấu hao tháng và trạng thái. Tài sản cũ không có nguồn tiền được coi là `owner_capital`.

### `expenses`

Chi phí ngoài nhập hàng/tài sản: điện, nước, mặt bằng, vận chuyển, marketing, sửa chữa hoặc khác. Mỗi chi phí ghi `paymentStatus` (`paid` hoặc `unpaid`) và `fundingSource`; bản ghi cũ không có trạng thái được coi là `paid`, không có nguồn tiền được coi là `owner_capital`. Chi phí tiệt trùng tự sinh từ phiếu nhập có `sourceType=purchase_sterilization`, `sourcePurchaseId`, `provider` và `accountingTreatment=inventory_cost`; nó là công nợ nhưng không được trừ thêm khỏi lợi nhuận sau khi đã vốn hóa vào hàng tồn kho.

### `expensepayments`

Chứng từ gom các khoản tiệt trùng được thanh toán cùng lúc. Lưu ngày trả, bên nhận, nguồn tiền, tổng số lít, tổng tiền và `lines[]` tham chiếu từng expense/phiếu nhập. Một lần thanh toán có thể chốt nhiều khoản cuối tuần; các expense tương ứng được chuyển sang `paid` và lưu `paymentId`, `paidAt`.

### `payrollperiodsettlements`

Snapshot quỹ lương sau khi tháng kết thúc: lưu kỳ `YYYY-MM`, ngày chốt, doanh thu/nhập hàng/chi phí/tài sản trong kỳ, số lũy kế, cấu hình khoản trích trong kỳ (`reserveContributions`), số dư từng quỹ sau khi trích (`reserveFunds`), tổng số dư quỹ giữ lại, tổng tiền sạch được chia và snapshot tỷ lệ/số tiền của từng nhân sự. `period` là duy nhất; dữ liệu tháng hiện tại chỉ được tính tạm thời và chưa ghi collection.

### `settings`

Key-value cho các tham số từ sheet `Thiết lập` và cấu hình danh sách quỹ lương theo tháng với key `payroll_reserve_funds:YYYY-MM`. Mỗi quỹ có mã ổn định, tên, chế độ `fixed` hoặc `monthly`, và số tiền; tháng không có bản ghi riêng sẽ kế thừa cấu hình gần nhất.

### `importlogs`

Lưu hash file, thời điểm import, tổng dòng hợp lệ/lỗi theo sheet. Lỗi chi tiết dùng tên `rowErrors` để tránh pathname `errors` dành riêng của Mongoose.

## Chỉ mục

- Unique: `products.code`, `productsizes.code`, `productsizes.name`, `ingredients.code`, `equipment.code`, `milkbatches.code`, `settings.key`.
- Unique compound: `sales(saleDate, batchName, paymentMethod)`.
- Sparse/index: `legacyId` trên các bản ghi có nguồn Excel.
- Date index: `sales.saleDate`, `purchases.purchaseDate`, `expenses.expenseDate`.

## Truy vết legacy

Mọi collection nhập từ Excel đều có `sourceSheet`, `sourceRow`, `legacyId`. Không xóa các giá trị bất thường trong migration; việc sửa dữ liệu phải trở thành thay đổi có chủ đích sau đối soát.
