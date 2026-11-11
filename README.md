# CPD MASTER Admin

Frontend React/Vite là giao diện quản trị; Apps Script chỉ chứa backend. Frontend hiện dùng mock data để hoàn thiện và thử luồng giao diện, chưa kết nối backend. Thao tác thêm/sửa/xóa trong bản demo chỉ có hiệu lực trong phiên trình duyệt hiện tại.

## Giao diện quản trị

- Chọn division CPD/P&G; dữ liệu mẫu tách biệt theo division.
- Lịch live có chế độ tháng/tuần/ngày và danh sách lịch xem có thể thêm/bỏ.
- Background hiển thị theo hồ sơ brand; form chọn ảnh chỉ xem trước tại trình duyệt, chưa upload lên Drive.
- Title chỉ sửa title và các tùy chọn ghép trên record có sẵn; không tạo/xóa, không sửa sàn/thương hiệu.
- Mã host có lựa chọn ECO/BAS và CRUD dữ liệu mẫu.
- Thư viện có xem theo division; quyền thêm/sửa/xóa chỉ mô phỏng role Superadmin trong giao diện.
- Trang tài khoản admin có tạo/khóa tài khoản mẫu và chỉ hiển thị thao tác cho role Superadmin mô phỏng.
- Livestream Checking và Warning Checking được hiển thị là tính năng sắp phát triển.

Mọi nhãn “demo” hoặc “mô phỏng” đều có nghĩa thao tác chưa được lưu vào Google Sheets/Drive và vai trò chưa được xác thực.

## Apps Script

Chép `code.gs` vào Apps Script project. Project không phục vụ giao diện HTML.

Trong **Apps Script > Project Settings > Script Properties**, cấu hình:

| Property | Giá trị |
|---|---|
| `ADMIN_USERS_SPREADSHEET_ID` | ID một spreadsheet riêng, không chia sẻ cho các tài khoản admin. Backend sẽ tạo sheet `ADMIN_USERS`; sheet lưu salt và hash mật khẩu, không lưu mật khẩu rõ. |
| `ADMIN_SETUP_KEY` | Chuỗi ngẫu nhiên tối thiểu 32 ký tự. Dùng một lần để tạo superadmin đầu tiên; backend xóa property sau bootstrap. |
| `ADMIN_SPREADSHEET_ID_CPD` | Spreadsheet ID của CPD; nếu bỏ trống sẽ dùng ID mặc định trong `code.gs`. |
| `ADMIN_SPREADSHEET_ID_PG` | Spreadsheet ID của P&G; bắt buộc để chọn division P&G. |

Các hàm Apps Script hiện thực xác thực và thao tác spreadsheet ở backend. React chưa có transport/API adapter để gọi các hàm này; cần hoàn tất phương thức kết nối và deployment trước khi dùng dữ liệu thật. Không có giao diện admin được phục vụ từ Apps Script. Bootstrap superadmin cần được gọi qua một trusted caller.

Setup key bị xóa sau khi bootstrap thành công.

Backend dùng PBKDF2-HMAC-SHA256 với salt riêng, giới hạn thử mật khẩu sai theo tài khoản, và phiên token tối đa 6 giờ. Không đưa setup key hoặc mật khẩu vào mã nguồn/commit.

## Quyền dữ liệu

- Lịch import: chỉ sửa Host, Đa host, Host ECO, phòng live, trạng thái và ISKEEP. Không thể tạo hoặc xóa lịch; các trường định danh phải giữ nguyên.
- Background: chỉ sửa record hiện có; không thể thêm/xóa record riêng.
- Title: chỉ sửa title và các tùy chọn ghép trên record có sẵn; không thể thêm hoặc xóa. Sàn và thương hiệu được giữ nguyên.
- Host: có thể tạo, sửa, xóa. ECO dùng sheet `ECO ID` cột C:D; BAS dùng sheet `CPD ID` cột B:C.
- API dữ liệu yêu cầu session token hợp lệ; API quản lý tài khoản chỉ dành cho superadmin.
- Chọn division `CPD` hoặc `P&G` trước mọi thao tác; không truyền division thì backend từ chối.

## Chưa có trong bản giao diện demo

- Transport, đăng nhập và phân quyền thật từ React tới Apps Script; các vai trò/quyền đang mô phỏng.
- Upload và quản lý hình trên Google Drive; hiện chỉ chọn tệp và xem trước cục bộ.
- Lưu thay đổi vào Google Sheets, khởi tạo brand đồng bộ record giữa các sheet và mở link sheet thật.
- Nghiệp vụ Livestream Checking và Warning Checking.
- Cần triển khai và kiểm thử với spreadsheet thực tế trước production.
