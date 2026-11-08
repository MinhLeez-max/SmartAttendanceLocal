# SmartAttendance Windows

Ứng dụng điểm danh chạy local trên Windows, dùng SQL Server 2022, Clerk và frontend React/Vite.

## 1. Thành phần và cổng chạy

- Frontend: `http://localhost:5173`
- API: `http://127.0.0.1:8080`
- Database: SQL Server database `SmartAttendanceLocal`
- Đăng nhập: Clerk Development application riêng của bản local
- Camera, QR và vị trí: cần HTTPS khi mở từ điện thoại; dùng URL HTTPS của ngrok.

Không mở trực tiếp file `index.html`. Frontend cần API Node.js và SQL Server đang chạy.

## 2. Cài đặt lần đầu

Mở PowerShell tại thư mục gốc của dự án:

```powershell
node --version
pnpm --version
pnpm install
```

Yêu cầu:

- Node.js 22.12 trở lên.
- pnpm 10.26.1.
- SQL Server 2022 đang chạy và có thể kết nối bằng SSMS.
- Internet để cài package, đăng nhập Clerk và tải mô hình AI đếm người.

Nếu PowerShell chặn `pnpm.ps1`, dùng `pnpm.cmd` thay cho `pnpm` trong tất cả lệnh.

## 3. Tạo database local

Trong SSMS, chạy lần lượt hai file sau trên máy local:

1. [sql/01-create-database.sql](sql/01-create-database.sql)
2. [sql/02-schema.sql](sql/02-schema.sql)

Hai script dành cho database mới, trống và có tên `SmartAttendanceLocal`. Không chạy chúng vào database `attendance` hoặc database đang có dữ liệu.

Tạo một SQL login riêng cho ứng dụng, map vào `SmartAttendanceLocal`, cấp quyền `db_datareader`, `db_datawriter` và quyền cần thiết cho `sys.sp_getapplock` nếu chính sách SQL Server yêu cầu. Không dùng `sa`, `sysadmin` hoặc `db_owner` để chạy website.

## 4. Cấu hình `.env`

Tạo file cấu hình local:

```powershell
Copy-Item .env.example .env
notepad .env
```

Điền các biến sau bằng giá trị của máy bạn:

```dotenv
SQLSERVER_HOST=127.0.0.1
SQLSERVER_PORT=1433
SQLSERVER_DATABASE=SmartAttendanceLocal
SQLSERVER_USER=your_sql_user
SQLSERVER_PASSWORD=your_sql_password
SQLSERVER_TRUST_CERTIFICATE=true
APP_URL=http://localhost:5173
CLERK_PUBLISHABLE_KEY=your_local_clerk_publishable_key
CLERK_SECRET_KEY=your_local_clerk_secret_key
SCHOOL_BOOTSTRAP_ADMIN_EMAIL=your_verified_email
```

Lưu ý:

- Dùng Clerk Development application của bản local.
- `SCHOOL_BOOTSTRAP_ADMIN_EMAIL` phải là email đã xác minh trong đúng Clerk application đó.
- Không gửi hoặc commit `.env`, mật khẩu SQL, Clerk secret key hay token.
- Khi dùng ngrok, đổi `APP_URL` thành URL HTTPS ngrok hiện tại rồi khởi động lại ứng dụng.

## 5. Chạy local trên máy tính

Lệnh khuyến nghị cho lúc phát triển:

```powershell
pnpm dev
```

Lệnh này tự kiểm tra SQL Server, sau đó chạy API và frontend. Mở:

```text
http://localhost:5173
```

Nhấn `Ctrl+C` trong cửa sổ chạy để dừng cả hai tiến trình.

Nếu port `8080` bị chiếm:

```powershell
Get-NetTCPConnection -LocalPort 8080 -ErrorAction SilentlyContinue
Get-Process -Id <PID>
Stop-Process -Id <PID>
```

Chỉ dừng tiến trình mà bạn xác định là đang chiếm port của dự án.

## 6. Kiểm tra hệ thống

```powershell
pnpm check
pnpm test:offline
pnpm test:sql
```

- `pnpm check`: kiểm tra kết nối và schema SQL Server.
- `pnpm test:offline`: chạy test không cần database thật.
- `pnpm test:sql`: chạy test nghiệp vụ trên `SmartAttendanceLocal`; test tự tạo dữ liệu có tiền tố `TEST_` rồi dọn dữ liệu đó.

Build frontend riêng:

```powershell
pnpm --dir artifacts/smart-attendance run build
```

Build toàn bộ:

```powershell
pnpm build
```

Nếu build toàn bộ báo lỗi type ở `lib/api-client-react/dist`, chạy trước:

```powershell
pnpm typecheck:libs
pnpm build
```

## 7. Test trên nhiều điện thoại bằng ngrok

Giữ `pnpm dev` đang chạy, mở PowerShell thứ hai và chạy:

```powershell
ngrok http 5173 --host-header=rewrite
```

Mở URL `https://...ngrok-free.dev` trên điện thoại. Không dùng URL `http://` và không dùng `localhost` trên điện thoại.

Sau mỗi lần ngrok đổi URL:

1. Cập nhật `APP_URL` trong `.env` bằng URL HTTPS mới.
2. Khởi động lại `pnpm dev`.
3. Đăng nhập lại nếu Clerk yêu cầu.

Để camera và GPS hoạt động, dùng Chrome/Safari chính thức, cấp quyền Camera và Vị trí, không mở liên kết trong trình duyệt bên trong Zalo/Messenger.

## 8. Quy trình test chức năng

1. Đăng nhập tài khoản quản trị bằng email bootstrap đã xác minh.
2. Tạo học kỳ, môn học, phòng học có tọa độ, lớp hành chính và sinh viên.
3. Tạo tài khoản đã xác minh cho giảng viên và sinh viên.
4. Gán giảng viên vào lớp học phần và tạo lịch học.
5. Giảng viên mở buổi điểm danh.
6. Sinh viên mở QR bằng thiết bị khác, cấp quyền vị trí và quét QR.
7. Giảng viên kiểm tra danh sách, thử camera đếm sĩ số và đối chiếu kết quả.

Camera chỉ đếm tổng số người bằng mô hình chạy trên trình duyệt; không nhận diện danh tính và không lưu ảnh.

## 9. Xử lý lỗi thường gặp

- `EACCES ... 127.0.0.1:8080`: port 8080 đang bị tiến trình khác sử dụng; kiểm tra bằng `Get-NetTCPConnection` như phần 5.
- `401 /api/auth/me`: kiểm tra Clerk key, `APP_URL`, email đã xác minh và đăng nhập đúng Clerk application.
- Camera không mở trên điện thoại: dùng URL HTTPS ngrok, trình duyệt chính thức và cấp lại quyền Camera.
- GPS báo chưa cấp quyền: cấp quyền Vị trí cho đúng site ngrok trong cài đặt trình duyệt rồi tải lại trang.
- Camera hiện hình nhưng mô hình không chạy: kiểm tra Internet trên điện thoại, chờ tải mô hình AI rồi bấm lại “Phân tích một khung hình”.
- Không gửi `.env` khi cần báo lỗi. Chỉ gửi nội dung lỗi đã che mật khẩu, secret key, token và thông tin cá nhân.

## 10. Các file quan trọng

- [tools/run.mjs](tools/run.mjs): khởi động API/frontend, build và test SQL.
- [tools/check.mjs](tools/check.mjs): kiểm tra SQL Server và schema.
- [artifacts/api-server/src/index.ts](artifacts/api-server/src/index.ts): điểm vào API.
- [artifacts/smart-attendance/vite.config.ts](artifacts/smart-attendance/vite.config.ts): frontend và proxy `/api`.
- [VERIFICATION.md](VERIFICATION.md): giới hạn và kết quả kiểm thử của bản local.
