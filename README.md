# CPD MASTER Admin

Frontend React/Vite là giao diện quản trị; Apps Script chỉ chứa backend. Frontend hiện vẫn dùng mock data, chưa kết nối backend.

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

## Phần chưa hoàn tất

- React `src/services/records.ts` vẫn dùng mock data, chưa gọi Apps Script. Cần chọn và triển khai transport phù hợp để gọi backend Apps Script từ frontend.
- Chưa có xem lịch dạng tháng/tuần/ngày, upload ảnh trực tiếp lên Drive, tạo brand kèm record liên quan ở các sheet, thư viện sheet, Livestream Checking hoặc Warning Checking.
- Cần triển khai và kiểm thử bằng spreadsheet thực tế trước production; kiểm tra quyền truy cập, dữ liệu từng division và quy tắc lịch của từng brand.
