# Kết quả test · Kho BaBa

Thư mục này ghi lại kết quả mỗi lần test, mỗi lần một file, đặt tên theo `YYYY-MM-DD_<loai-test>.md`.

Kịch bản test nằm trong Project claude.ai "Sữa lành từ BaBa":
- `BaBa_Kich_ban_test_nhanh.md`: luồng chính, 20 bước, khoảng 15 phút.
- `BaBa_Kich_ban_test_day_du.md`: các chức năng chi tiết, chạy khi luồng chính đã qua.

## Cách ghi một lần test

1. Copy file gần nhất, đổi ngày và loại test.
2. Ghi bản deploy đã test (commit hoặc địa chỉ Vercel), máy và trình duyệt.
3. Bảng kết quả: mỗi bước ghi Đạt / Lỗi / Chưa chạy.
4. Mỗi vấn đề một mã `T<ngày>-<số>` (ví dụ `T1110-01`), phân loại **Lỗi** (app làm sai so với story) hoặc **Cải tiến** (app làm đúng story nhưng dùng chưa tiện). Kèm: màn hình, cách tái hiện, mong đợi, nguyên nhân nếu đã biết, trạng thái.
5. Vấn đề làm đổi story thì ghi rõ story nào cần sửa.

## Danh sách các lần test

| Ngày | Loại | Kết quả | Vấn đề còn mở |
| --- | --- | --- | --- |
| 10/11/2026 | [Test nhanh luồng chính](2026-11-10_test-nhanh.md) | Luồng chạy trọn; bước 20 chờ sáng 11/11 | 1 lỗi, 4 cải tiến |
