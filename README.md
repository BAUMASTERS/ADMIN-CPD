# CPD MASTER Admin

Trang quản trị lịch live, background, tiêu đề và mã host. Các thay đổi được ghi trực tiếp vào cùng Google Spreadsheet mà trang user đang sử dụng.

## Triển khai Apps Script

1. Tạo một Apps Script project riêng cho admin.
2. Tạo các file trong project với đúng tên: `Code.gs`, `index.html`, `Styles.html`, `Client.html`. Chép nội dung tương ứng từ thư mục này. Không cần thêm `styles.css` hoặc `client.js`; hai file đó chỉ phục vụ xem giao diện độc lập.
3. Trong `Code.gs`, xác nhận `ADMIN_SPREADSHEET_ID` trỏ đến đúng bảng tính CPD MASTER.
4. Chọn **Deploy > New deployment > Web app**. Chọn **Execute as: User accessing the web app** và giới hạn **Who has access** cho tài khoản hoặc nhóm quản trị được phép.
5. Cấp quyền chỉnh sửa bảng tính cho các quản trị viên. Mở URL Web App và chấp thuận quyền truy cập khi được yêu cầu.

Tên sheet cần có: `ACTURAL` (ô `A2` chứa tên sheet lịch đang hoạt động), `BG`, `TITLE`, `ECO ID` và `CPD ID`. Admin cập nhật dữ liệu trong các sheet này nên trang user đang đọc cùng bảng tính sẽ nhận được thay đổi.

## Chức năng

- Tạo, sửa, xóa khung lịch trong sheet được chọn tại `ACTURAL!A2`.
- Quản lý background trong `BG` và tiêu đề/tiền tố trong `TITLE`.
- Quản lý tên và mã host trong cột C:D của `ECO ID` hoặc `CPD ID`.
- Kiểm tra phiên bản bản ghi trước khi sửa/xóa để phát hiện thay đổi đồng thời.

Mở `index.html` trực tiếp chỉ dùng để xem giao diện; thao tác dữ liệu yêu cầu mở bằng URL Apps Script Web App đã triển khai.
