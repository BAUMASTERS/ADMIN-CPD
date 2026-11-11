# CPD MASTER Admin

Frontend React/Vite đang là prototype với mock data. Backend Apps Script và giao diện đăng nhập Apps Script nằm riêng; cần nối React service nếu muốn React trở thành giao diện production.

## Apps Script

Chép các file sau vào cùng Apps Script project với đúng tên: `code.gs` (hoặc `Code.gs`), `Index.html`, `Client.html`, `Styles.html`. Các HTML template cho Apps Script nằm trong `apps-script/`.

Trong **Apps Script > Project Settings > Script Properties**, cấu hình:

| Property | Giá trị |
|---|---|
| `ADMIN_USERS_SPREADSHEET_ID` | ID một spreadsheet riêng, không chia sẻ cho các tài khoản admin. Backend sẽ tạo sheet `ADMIN_USERS`; sheet lưu salt và hash mật khẩu, không lưu mật khẩu rõ. |
| `ADMIN_SETUP_KEY` | Chuỗi ngẫu nhiên tối thiểu 32 ký tự. Dùng một lần để tạo superadmin đầu tiên; backend xóa property sau bootstrap. |
| `ADMIN_SPREADSHEET_ID_CPD` | Spreadsheet ID của CPD; nếu bỏ trống sẽ dùng ID mặc định trong `code.gs`. |
| `ADMIN_SPREADSHEET_ID_PG` | Spreadsheet ID của P&G; bắt buộc để chọn division P&G. |

Triển khai Web App với **Execute as: Me** để backend có quyền thao tác các spreadsheet mà không cần cấp quyền Sheets cho từng tài khoản nội bộ. Ưu tiên giới hạn deployment trong tổ chức hoặc cho người dùng có Google account theo chính sách công ty; không bật truy cập công khai trừ khi đã được phê duyệt. Tài khoản ứng dụng vẫn phải được superadmin tạo riêng.

Mở URL Web App lần đầu, nhập setup key để tạo superadmin. Setup key bị xóa sau khi tạo thành công. Superadmin đăng nhập để cấp hoặc khóa tài khoản admin.

Backend dùng PBKDF2-HMAC-SHA256 với salt riêng, giới hạn thử mật khẩu sai theo tài khoản, và phiên token tối đa 6 giờ. Không đưa setup key hoặc mật khẩu vào mã nguồn/commit.

## Quyền dữ liệu

- Lịch import: chỉ sửa Host, Đa host, Host ECO, phòng live, trạng thái và ISKEEP. Không thể tạo hoặc xóa lịch; các trường định danh phải giữ nguyên.
- Background: chỉ sửa record hiện có; không thể thêm/xóa record riêng.
- Title: có thể tạo, sửa, xóa.
- Host: có thể tạo, sửa, xóa. ECO dùng sheet `ECO ID` cột C:D; BAS dùng sheet `CPD ID` cột B:C.
- API dữ liệu yêu cầu session token hợp lệ; API quản lý tài khoản chỉ dành cho superadmin.
- Chọn division `CPD` hoặc `P&G` trước mọi thao tác; không truyền division thì backend từ chối.

## Phần chưa hoàn tất

- React `src/services/records.ts` vẫn dùng mock data, chưa gọi Apps Script. Giao diện Apps Script trong `apps-script/` là màn hình quản trị responsive tối giản, riêng biệt.
- Chưa có xem lịch dạng tháng/tuần/ngày, upload ảnh trực tiếp lên Drive, tạo brand kèm record liên quan ở các sheet, thư viện sheet, Livestream Checking hoặc Warning Checking.
- Cần triển khai và kiểm thử bằng spreadsheet thực tế trước production; kiểm tra quyền truy cập, dữ liệu từng division và quy tắc lịch của từng brand.
