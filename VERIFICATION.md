# Phạm vi kiểm chứng bản Windows

## Đã kiểm tra trong môi trường tạo gói

- TypeScript cho các thư viện, máy chủ và giao diện của bản SQL Server.
- Dựng được máy chủ Node.js và giao diện Vite.
- Bộ kiểm tra xuất mã: vị trí OUTPUT/TOP, thay upsert/khóa giao dịch, chặn các
  cấu trúc PostgreSQL chưa được chuyển, bảo vệ database không trống, foreign
  keys không xóa dây chuyền, unique index cho các cột nullable.
- Bộ test offline của bản tải: truy vấn SQL Server có tham số, chuỗi Unicode,
  TOP, OUTPUT inserted, ngày/giờ, tọa độ độ chính xác cao, join và URL lời mời
  theo origin local được cấu hình. Không cần SQL Server cho bộ test này.
- Lockfile có gói native Windows cho esbuild/Tailwind; bản ZIP không có
  node_modules, dist, .env thật, tài khoản, database dump hoặc Secrets trên Replit.

## Chưa được xác nhận với SQL Server thật

Môi trường tạo gói không truy cập được SQL Server 2022 tại 127.0.0.1 trên máy
Windows của bạn. Vì vậy **chưa chạy script DDL, kiểm thử giao dịch đồng thời
hoặc kiểm thử đăng nhập/điểm danh end-to-end với SQL Server thật**.
Không coi việc typecheck/build/offline test thành công là nghiệm thu runtime.

Sau khi cấu hình trên Windows, chạy:

```powershell
pnpm check
pnpm test:offline
pnpm test:sql
pnpm dev
```

`test:sql` dùng dialect SQL Server và các quy tắc nghiệp vụ thật, không thay
database bằng một kho giả lập. Nó tạo rồi dọn đúng các bản ghi thử của mình.
Nếu bước nào chưa đạt, dừng lại và gửi lỗi đã che thông tin nhạy cảm để sửa.
Sau đó kiểm tra bằng các tài khoản local đã xác minh: quản trị viên tạo học
phần/lịch, giảng viên mở phiên, sinh viên quét QR, giảng viên sửa có lý do,
sinh viên xem lịch sử. Kiểm tra cả tải lại và các phiên đăng nhập riêng.

Drizzle hỗ trợ SQL Server trong bản 1.0.0-rc.5 ở đây; bản đó được ghim riêng
cho gói local, không nâng thư viện hoặc đổi database của app trên Replit.
