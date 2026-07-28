# Business rules

1. Tiền lưu dưới dạng số VND, không lưu chuỗi có ký hiệu tiền.
2. Ngày lưu dưới dạng `Date`; ngày serial Excel được chuẩn hóa theo epoch 1899-12-30.
3. Số lượng, đơn giá và chi phí không được âm.
4. Một ngày có thể có nhiều sale nếu khác mẻ hoặc phương thức thanh toán.
5. Ghi trùng ngày + mẻ + thanh toán phải xác nhận ghi đè.
6. Sale lưu snapshot giá bán và cost/ly để báo cáo lịch sử ổn định.
7. Giá vốn bình quân hàng hóa lấy tổng tiền mua chia tổng lượng quy đổi; khi chưa mua dùng giá tham khảo/quy cách.
8. Khấu hao tháng chỉ tính cho tài sản kích hoạt.
9. Chi phí mua hàng, chi phí vận hành và vốn đầu tư là ba nhóm khác nhau. Phiếu nhập hàng, chi phí và tài sản đều phải ghi nguồn tiền. Chỉ phiếu nhập và tài sản dùng `Vốn chủ` làm tăng tổng vốn đã bỏ; mọi nguồn vẫn được tính là tiền ra.
10. Tồn kho chỉ được ghi từ snapshot kiểm thực tế, không tự cộng/trừ theo sale. Số ly suy ra từ vỏ ly là chỉ báo đối chiếu; nếu tổng tồn sữa của một công thức lớn hơn sản lượng một lần nấu thì không dùng dữ liệu sữa để suy ly.
11. Import có lỗi bắt buộc sẽ dừng toàn bộ; cảnh báo không chặn import.
12. Chạy lại file import dùng upsert theo code/legacyId, không nhân đôi dữ liệu.
13. Chốt ngày yêu cầu tiền mặt, tiền chuyển khoản và mẻ sữa dùng để lấy giá vốn; tổng doanh thu thực nhận được tự động cộng từ hai hình thức nhận tiền. Người dùng không phải nhập số lít sữa, tổng số ly hay số ly theo size.
14. Số ly Size M/L được ước tính từ doanh thu và giá bán tham chiếu, ưu tiên tổ hợp có tổng tiền gần doanh thu nhất rồi chọn cơ cấu M/L cân bằng nhất. Lượng sữa nền, bao bì, topping và lợi nhuận đều là số ước tính phát sinh từ cơ cấu này; giao diện phải ghi rõ không phải số đếm thực tế.
15. Tiền còn lại của doanh nghiệp để claim và hiển thị trên Dashboard được tính bằng tổng doanh thu thực nhận trừ tổng tiền nhập hàng, chi phí và tài sản có nguồn `Tiền bán hàng`. Chỉ phiếu nhập và tài sản đang dùng `Vốn chủ`, có nguyên giá nhỏ hơn số tiền còn lại mới được chọn; tổng nhiều khoản được chọn cũng phải nhỏ hơn số tiền còn lại. Khi claim, hệ thống ghi snapshot thoái vốn và đổi nguồn tiền của phiếu nhập hoặc tài sản sang `Tiền bán hàng`; khi xóa claim, nguồn tiền được hoàn lại thành `Vốn chủ`.
16. Gợi ý quỹ dự phòng 30 ngày trên Dashboard chỉ là tham khảo vận hành, không phải hạn mức claim. Hạn mức claim luôn dùng số tiền còn lại theo quy tắc 15.
17. Phiếu nhập, chi phí và tài sản cũ hoặc được import từ workbook không có thông tin nguồn tiền được mặc định là `Vốn chủ` để giữ tương thích với số liệu lịch sử. Bản ghi mới mặc định dùng `Tiền bán hàng` trên giao diện.
18. Tiến độ thu hồi vốn là số lũy kế: tổng vốn chủ ban đầu trừ tổng các lần thu hồi. Khoảng ngày trên Dashboard không được làm thay đổi chỉ số này.
19. Gợi ý thoái vốn dùng cùng số dư tiền doanh nghiệp với hạn mức claim để không trừ một khoản thu hồi hai lần; quỹ dự phòng vẫn lấy chi vận hành trong kỳ đang chọn.
