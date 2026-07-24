# Business rules

1. Tiền lưu dưới dạng số VND, không lưu chuỗi có ký hiệu tiền.
2. Ngày lưu dưới dạng `Date`; ngày serial Excel được chuẩn hóa theo epoch 1899-12-30.
3. Số lượng, đơn giá và chi phí không được âm.
4. Một ngày có thể có nhiều sale nếu khác mẻ hoặc phương thức thanh toán.
5. Ghi trùng ngày + mẻ + thanh toán phải xác nhận ghi đè.
6. Sale lưu snapshot giá bán và cost/ly để báo cáo lịch sử ổn định.
7. Giá vốn bình quân hàng hóa lấy tổng tiền mua chia tổng lượng quy đổi; khi chưa mua dùng giá tham khảo/quy cách.
8. Khấu hao tháng chỉ tính cho tài sản kích hoạt.
9. Chi phí mua hàng, chi phí vận hành và vốn đầu tư là ba nhóm khác nhau. Phiếu nhập hàng phải ghi nguồn tiền; chỉ nguồn `Vốn chủ` làm tăng tổng vốn đã bỏ, còn mọi nguồn vẫn được tính là tiền ra.
10. Không tự thêm tồn kho vì workbook không có dữ liệu hoặc công thức tồn.
11. Import có lỗi bắt buộc sẽ dừng toàn bộ; cảnh báo không chặn import.
12. Chạy lại file import dùng upsert theo code/legacyId, không nhân đôi dữ liệu.
13. Chốt ngày nhập tổng lít sữa và doanh thu thực nhận; cost sữa nền lấy trực tiếp từ cost/ml của mẻ sữa. Khi không nhập số ly theo size, tổng số ly, bao bì và topping là số ước tính theo định mức ml/ly và giá bán tham chiếu; cơ cấu size dùng tỷ lệ từ các bản chốt có số ly thực tế. Nếu chưa có lịch sử thực tế, hệ thống tạm chia đều M/L và phải nói rõ đây là giả định trung lập.
14. Nếu người dùng nhập tổng số ly thực tế nhưng không nhập riêng M/L, tổng ly là ràng buộc cứng; hệ thống chỉ ước tính cơ cấu M/L từ tổng doanh thu và giá bán tham chiếu, không dùng số lít sữa. Bản chốt này không được dùng làm lịch sử tỷ lệ M/L thực tế.
15. Bản ghi thoái vốn chỉ ghi nhận ngày, số tiền thực tế đã rút và ghi chú. Tổng tiền đã rút được dùng để đối chiếu tiến độ thu hồi vốn, không làm giảm hoặc thay đổi dữ liệu vốn đầu tư ban đầu.
16. Gợi ý thoái vốn là quy tắc vận hành tham khảo: chỉ đề xuất phần tiền lũy kế còn dư sau các lần rút và sau quỹ dự phòng 30 ngày, không vượt vốn còn cần thu hồi, đồng thời yêu cầu dòng tiền vận hành dương và tối thiểu 7 ngày bán làm mẫu. Gợi ý không thay thế số dư ngân hàng, khoản phải trả hoặc nghĩa vụ thuế và không tự tạo giao dịch.
17. Phiếu nhập cũ hoặc được import từ workbook không có thông tin nguồn tiền được mặc định là `Vốn chủ` để giữ tương thích với số liệu lịch sử.
