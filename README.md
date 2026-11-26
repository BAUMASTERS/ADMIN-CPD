# Force Shadow · Operations

Frontend React/Vite là giao diện quản trị; Apps Script chỉ chứa backend. Khi chưa bật cấu hình API, frontend dùng mock data; khi bật, đăng nhập, đọc và sửa dữ liệu sẽ đi qua Vercel API proxy tới Apps Script.

## Deploy frontend lên Vercel

- Đặt Root Directory là `ADMIN-CPD` nếu repository chứa dự án trong thư mục con.
- Build command: `npm run build`; Output Directory: `dist`.
- `node_modules` và thư mục build được loại khỏi source/deployment; để Vercel cài dependencies trên Linux thay vì dùng binary đã tạo trên Windows.
- Nếu deploy cũ vẫn báo `tsc: Permission denied`, redeploy một lần với **Clear build cache**.
- Proxy mặc định dùng deployment `https://script.google.com/macros/s/AKfycbyFS2IlnCB7BPxGmEiQHE5XiK93uWOBoSrP8RaWUxqcg3UTOdSpYpe0S29NCP62uslS/exec`; có thể ghi đè bằng biến `APPS_SCRIPT_WEB_APP_URL`. Frontend cần `VITE_API_BASE_URL=/api/apps-script`.
- Nếu `APPS_SCRIPT_WEB_APP_URL` đã tồn tại trên Vercel, cập nhật biến đó sang URL deployment mới rồi redeploy. Proxy ngoài Google không thể gửi Google session cookie; deployment cần cho phép truy cập từ Vercel (thường là **Anyone**, nếu chính sách Workspace cho phép). Các thao tác dữ liệu vẫn bắt buộc đăng nhập admin riêng của backend.

## Giao diện quản trị

- Dashboard là màn hình mặc định và chỉ hiển thị biểu đồ Gantt lấy từ sheet tracking. Có thể lọc theo sàn TTS/SHP và brand; filter match chuỗi trong cột B của tracking. Brand CPD gồm 3ce, drg, gar, mny, oap.
- Bản desktop có sidebar bấm để thu gọn/mở rộng; division CPD/P&G chọn được ngay từ workspace switcher.
- Dashboard có biểu đồ Gantt theo ngày cho các khoảng Start–End trong 7 ngày; có thể chuyển tuần và hôm nay được nhấn mạnh. Superadmin và admin CPD được sửa trạng thái, nội dung, ngày bắt đầu/kết thúc của tracking CPD.
- Tổng quan P&G dùng spreadsheet `1-c5kYP09R_uuxM_161N3P_oC2L0gOjyE8fOdL7uSf3w`, tab `26'TRACKING`, với các cột `Section`, `Status`, `Content`, `Start`, `End`. Danh sách brand P&G chưa khai báo nên bộ lọc brand hiện để “Tất cả”; admin P&G chỉ được sửa dữ liệu P&G.
- Bản mobile ưu tiên thao tác nhanh một tay, thanh điều hướng dưới và biểu đồ Gantt cuộn ngang.
- Chỉ có chế độ Sáng/Tối, chuyển bằng một nút; màu nhấn ice blue ở sáng và burgundy ở tối.
- Chọn division CPD/P&G; dữ liệu mẫu tách biệt theo division.
- Lịch live có chế độ xem theo tháng hoặc ngày (không có chế độ tuần); danh sách lịch xem có thể thêm/bỏ. Theo ngày có bộ lọc brand/sàn, mặc định là tất cả. CPD đọc cả lịch từ `WEB_DATA` trong workbook chính và lịch mega; P&G dùng lịch mega.
- Background và Title có bộ lọc brand/sàn. Background chỉ sửa record hiện có; nút Background mở thẳng thư mục Drive `1V6Tf1TBKbll-lC8oE2ynatlP4PAX2QLd`, không upload tự động.
- Title chỉ sửa title và các tùy chọn ghép trên record có sẵn; không tạo/xóa, không sửa sàn/thương hiệu. TTS được kiểm tra tối đa 32 ký tự sau khi ghép `[mã host]_[hh]_[dd/mm]_title`, dùng mã host dài nhất hiện có. Shopee chặn các cụm cụ thể được liệt kê trong giao diện; nội dung nhạy cảm, hàng cấm, bản quyền và thông tin sai lệch vẫn cần kiểm tra thủ công.
- Mã host có lựa chọn ECO/BAS và CRUD dữ liệu mẫu.
- Thư viện có xem theo division; quyền thêm/sửa/xóa chỉ mô phỏng role Superadmin trong giao diện.
- Superadmin có thể thêm, sửa, khóa/mở và xóa tài khoản trong LIST. Admin CPD/P&G chỉ xem được hồ sơ của mình và chỉ đổi mật khẩu/avatar.
- Livestream Checking và Warning Checking được hiển thị là tính năng sắp phát triển.

Khi Vercel chưa cấu hình `VITE_API_BASE_URL`, các nhãn “demo” hoặc “mô phỏng” có nghĩa thao tác chưa được lưu vào Google Sheets/Drive và vai trò chưa được xác thực.

Spreadsheet `1Wqkll2nltkSJ593bgmDKbWgwXcS59nzzsdR7cqY3h8E` là nguồn dữ liệu CPD; lịch đọc từ tab `WEB_DATA` và dò cột theo header (`PLATFORM`, `BRAND`, `DATE`, `START TIME`, `END TIME`, `PIC`, `HOST`, `ECO`, `DUO/OP`, `KOL live`), còn Title, Background và mã host đọc từ các tab tương ứng. Dashboard CPD đọc sheet `TRACKING (CPD)` trong spreadsheet `1bNco8_NAVBWDxeotX9AZrIrougKND7xhRLZhO9NFid8`, theo các cột `Section`, `Status`, `Content`, `Start`, `End`. Lịch mega và tài khoản admin dùng chung workbook `1h2Np6UVDI6RmjBtJyZByi8gaDapV9g-RtNvElzpDc4U`; lịch đọc sheet `LỊCH SẮP TỚI`, tài khoản đọc sheet `LIST`.

## Apps Script

Thêm cả bốn file Apps Script (`code.gs`, `auth.gs`, `records.gs`, `tracking.gs`) vào cùng một Apps Script project. `code.gs` giữ cấu hình chung và điểm vào API; xác thực, CRUD sheet và tracking được tách riêng để dễ bảo trì. Project không phục vụ giao diện HTML.

Không cần Script Properties riêng cho đăng nhập. Tài khoản lấy từ workbook `1h2Np6UVDI6RmjBtJyZByi8gaDapV9g-RtNvElzpDc4U`, sheet `LIST`: cột B `userid`, C `password`, D `name`, E `role`, F `avatar`; cột G `active` là tùy chọn để khóa/mở tài khoản (ô trống được xem là đang hoạt động). Role hợp lệ là `superadmin`, `admincpd` (CPD), và `adminpng` (P&G). Superadmin có thể thêm, sửa, khóa/mở và xóa tài khoản trực tiếp từ giao diện. User thường chỉ nhận hồ sơ của chính mình từ API và chỉ có thể cập nhật mật khẩu/avatar.

**Lưu ý:** theo yêu cầu, mật khẩu được lưu dạng văn bản trong LIST!C. Bất kỳ ai có quyền xem spreadsheet đều có thể đọc chúng; chỉ cấp quyền xem sheet cho người được phép quản lý tài khoản và không dùng lại các mật khẩu quan trọng khác. Backend chỉ đọc mật khẩu để xác thực, không trả giá trị này trong API. Cột C được ghi dưới dạng text khi đổi mật khẩu để giữ nguyên ký tự như số 0 ở đầu. Tab `ADMIN_USERS` hoặc các Script Properties của cơ chế đăng nhập cũ không còn được sử dụng; nếu còn dữ liệu cũ, chúng không được tự động xóa.

Các hàm Apps Script hiện thực xác thực và thao tác spreadsheet ở backend. `doPost` cung cấp JSON actions có allowlist; `doGet` là health check. Frontend gọi `/api/apps-script`; Vercel proxy chuyển tiếp request tới URL deployment được cấu hình trong `APPS_SCRIPT_WEB_APP_URL`, tránh gọi Apps Script trực tiếp từ browser/CORS. Không có giao diện admin được phục vụ từ Apps Script.

Backend giới hạn thử mật khẩu sai theo tài khoản và phiên token tối đa 6 giờ. Quyền sửa tracking được kiểm tra tại Apps Script: superadmin có thể sửa cả hai division; `admincpd` chỉ CPD; `adminpng` chỉ P&G. Sau khi cập nhật bất kỳ file `.gs` nào, đồng bộ file đó vào Apps Script project và deploy phiên bản Web app mới.

## Quyền dữ liệu

- Lịch `WEB_DATA` chỉ dành cho CPD; lịch mega dùng chung CPD/P&G. Các lịch chỉ sửa Host, Đa host, Host ECO, phòng live, trạng thái và ISKEEP. Không thể tạo hoặc xóa lịch; các trường định danh phải giữ nguyên.
- Background: chỉ sửa record hiện có; không thể thêm/xóa record riêng.
- Title: chỉ sửa title và các tùy chọn ghép trên record có sẵn; không thể thêm hoặc xóa. Sàn và thương hiệu được giữ nguyên.
- Host: có thể tạo, sửa, xóa. ECO dùng sheet `ECO ID` cột C:D; BAS dùng sheet `CPD ID` cột B:C.
- API dữ liệu yêu cầu session token hợp lệ; API CRUD tài khoản chỉ dành cho superadmin. User thường chỉ được gọi API hồ sơ cá nhân để đổi mật khẩu/avatar của chính mình.
- Role `admincpd` chỉ được truy cập CPD; `adminpng` chỉ division P&G; Superadmin được truy cập cả hai.
- Backend kiểm tra quyền division cho từng request; không truyền division thì từ chối.

## Giới hạn hiện tại

- Drive mở thư mục được cấu hình sẵn; chưa có Google Drive Picker hoặc thao tác tải/quản lý file trực tiếp trong web.
- Danh sách từ cấm Shopee hiện chỉ bao gồm các cụm cụ thể user đã cung cấp; các nhóm nội dung rộng hơn cần kiểm tra thủ công.
- Khởi tạo brand đồng bộ record giữa các sheet và mở link sheet thật.
- Nghiệp vụ Livestream Checking và Warning Checking.
- Cần triển khai và kiểm thử quyền truy cập với spreadsheet thực tế trước production.
