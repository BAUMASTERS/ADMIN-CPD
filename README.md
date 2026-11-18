# Force Shadow · Operations

Frontend React/Vite là giao diện quản trị; Apps Script chỉ chứa backend. Khi chưa bật cấu hình API, frontend dùng mock data; khi bật, đăng nhập, đọc và sửa dữ liệu sẽ đi qua Vercel API proxy tới Apps Script.

## Deploy frontend lên Vercel

- Đặt Root Directory là `ADMIN-CPD` nếu repository chứa dự án trong thư mục con.
- Build command: `npm run build`; Output Directory: `dist`.
- `node_modules` và thư mục build được loại khỏi source/deployment; để Vercel cài dependencies trên Linux thay vì dùng binary đã tạo trên Windows.
- Nếu deploy cũ vẫn báo `tsc: Permission denied`, redeploy một lần với **Clear build cache**.
- Thêm Environment Variables: `VITE_API_BASE_URL=/api/apps-script` và `APPS_SCRIPT_WEB_APP_URL=https://script.google.com/macros/s/<deployment-id>/exec`.
- Sau khi sửa `code.gs`, tạo deployment Apps Script kiểu **Web app**, chạy dưới tài khoản có quyền với spreadsheet, rồi cập nhật URL deployment trong Vercel. Proxy ngoài Google không thể gửi Google session cookie; deployment cần cho phép truy cập từ Vercel (thường là **Anyone**, nếu chính sách Workspace cho phép). Các thao tác dữ liệu vẫn bắt buộc đăng nhập admin riêng của backend.

## Giao diện quản trị

- Dashboard là màn hình mặc định, gồm tổng quan studio và tracking lịch sắp tới.
- Bản desktop có sidebar bấm để thu gọn/mở rộng; division CPD/P&G chọn được ngay từ workspace switcher.
- Dashboard có biểu đồ Gantt theo giờ cho các phiên live trong 7 ngày; có thể chuyển tuần và lọc loại lịch.
- Bản mobile ưu tiên thao tác nhanh một tay, thanh điều hướng dưới và biểu đồ Gantt cuộn ngang.
- Chỉ có chế độ Sáng/Tối, chuyển bằng một nút; màu nhấn ice blue ở sáng và burgundy ở tối.
- Chọn division CPD/P&G; dữ liệu mẫu tách biệt theo division.
- Lịch live có chế độ xem theo tháng hoặc ngày (không có chế độ tuần); danh sách lịch xem có thể thêm/bỏ.
- Background hiển thị theo hồ sơ brand; form chọn ảnh chỉ xem trước tại trình duyệt, chưa upload lên Drive.
- Title chỉ sửa title và các tùy chọn ghép trên record có sẵn; không tạo/xóa, không sửa sàn/thương hiệu.
- Mã host có lựa chọn ECO/BAS và CRUD dữ liệu mẫu.
- Thư viện có xem theo division; quyền thêm/sửa/xóa chỉ mô phỏng role Superadmin trong giao diện.
- Trang tài khoản admin có tạo/khóa tài khoản mẫu và chỉ hiển thị thao tác cho role Superadmin mô phỏng.
- Livestream Checking và Warning Checking được hiển thị là tính năng sắp phát triển.

Khi Vercel chưa cấu hình `VITE_API_BASE_URL`, các nhãn “demo” hoặc “mô phỏng” có nghĩa thao tác chưa được lưu vào Google Sheets/Drive và vai trò chưa được xác thực.

Tracking được thiết kế để dùng dữ liệu từ spreadsheet `1ja9bF2VI05hPMz_wDiDK6fnbR4nc605UP3IXz57bB3c`, sheet `LỊCH SẮP TỚI`. Bản backend hiện có snapshot reader cho sheet đó; adapter dashboard chưa chuẩn hóa snapshot thành các phiên Gantt nên tracking vẫn lấy lịch từ API section `schedules`.

## Apps Script

Chép `code.gs` vào Apps Script project. Project không phục vụ giao diện HTML.

Trong **Apps Script > Project Settings > Script Properties**, cấu hình:

| Property | Giá trị |
|---|---|
| `ADMIN_USERS_SPREADSHEET_ID` | ID một spreadsheet riêng, không chia sẻ cho các tài khoản admin. Backend sẽ tạo sheet `ADMIN_USERS`; sheet lưu salt và hash mật khẩu, không lưu mật khẩu rõ. |
| `ADMIN_SETUP_KEY` | Chuỗi ngẫu nhiên tối thiểu 32 ký tự. Dùng một lần để tạo superadmin đầu tiên; backend xóa property sau bootstrap. |
| `ADMIN_SPREADSHEET_ID_CPD` | Spreadsheet ID của CPD; nếu bỏ trống sẽ dùng ID mặc định trong `code.gs`. |
| `ADMIN_SPREADSHEET_ID_PG` | Spreadsheet ID của P&G; bắt buộc để chọn division P&G. |

Các hàm Apps Script hiện thực xác thực và thao tác spreadsheet ở backend. `doPost` cung cấp JSON actions có allowlist; `doGet` là health check. Frontend gọi `/api/apps-script`; Vercel proxy chuyển tiếp request tới URL deployment được cấu hình trong `APPS_SCRIPT_WEB_APP_URL`, tránh gọi Apps Script trực tiếp từ browser/CORS. Không có giao diện admin được phục vụ từ Apps Script. Bootstrap superadmin cần được gọi qua một trusted caller.

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

- Quản lý tài khoản admin chưa được nối vào màn hình admin-users; màn hình đó vẫn dùng dữ liệu mô phỏng.
- Upload và quản lý hình trên Google Drive; hiện chỉ chọn tệp và xem trước cục bộ.
- Khởi tạo brand đồng bộ record giữa các sheet và mở link sheet thật.
- Dashboard chưa dùng snapshot của sheet `LỊCH SẮP TỚI`; vẫn đang tạo Gantt từ dữ liệu lịch trong division.
- Nghiệp vụ Livestream Checking và Warning Checking.
- Cần triển khai và kiểm thử với spreadsheet thực tế trước production.
