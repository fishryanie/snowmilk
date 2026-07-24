# Đối chiếu dữ liệu

Ngày chạy dry-run: 23/07/2026.

| Chỉ số | Excel đang hiển thị/cache | Importer tính từ dữ liệu gốc | Chênh lệch | Kết luận |
|---|---:|---:|---:|---|
| Tổng vốn đầu tư | 2.637.200 đ | 2.637.200 đ | 0 đ | Khớp |
| Tổng tiền nhập hàng | 2.677.500 đ | 2.677.500 đ | 0 đ | Khớp |
| Số ly | 16 (`Tổng quan`) | 29 (`Bán nhanh`) | +13 | Cache `Bán hàng` chưa đồng bộ |
| Doanh thu gộp | 540.000 đ (`Tổng quan`) | 1.030.000 đ (`Bán nhanh`) | +490.000 đ | Cache `Bán hàng` chưa đồng bộ |
| Giảm giá | 35.000 đ | 35.000 đ | 0 đ | Khớp snapshot chi tiết |
| Doanh thu thuần | 505.000 đ suy ra | 995.000 đ | +490.000 đ | Theo chênh số lượng |
| Cost biến đổi | 275.786,79 đ | 71.142.814,23 đ | +70.867.027,44 đ | Sai đơn vị topping kg/gram |
| Lãi đóng góp | 264.213,21 đ (trước fixed/depreciation) | -70.147.814,23 đ | -70.412.027,44 đ | Chưa thể phê duyệt migration KPI |

## Trạng thái migration

- 69 bản ghi nghiệp vụ được nhận diện, 69 hợp lệ về cấu trúc, 0 lỗi bắt buộc.
- Có 8 cảnh báo: 6 sản phẩm cost bất thường và 2 mẻ thiếu ngày nấu.
- Import kỹ thuật có thể chạy; **đối chiếu tài chính chưa thể xem là hoàn tất** cho đến khi xác nhận đơn vị topping và tính lại workbook.
- Dashboard fallback cố ý hiển thị snapshot `Tổng quan` để người dùng thấy đúng số đang có trong Excel; dashboard MongoDB sau import sẽ dùng dữ liệu sale đã chuẩn hóa.
