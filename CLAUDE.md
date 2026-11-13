# CLAUDE.md · Kho BaBa

App bán hàng và quản lý kho cho sữa hạt **Sữa lành từ BaBa**: PWA React chạy trên điện thoại, dữ liệu và logic trên Supabase. Người dùng chính là Hà, chủ cơ sở bán ngoài đường, chỉ dùng điện thoại một tay. Người xây app là Tùng (admin).

## Đọc trước khi làm

0. `tasks/README.md` và biên bản mới nhất trong `docs/bien-ban/`: việc đang giao và quyết định mới nhất.
1. `docs/README.md`: danh mục tài liệu và thứ tự ưu tiên khi chúng mâu thuẫn.
2. `docs/phan-tich/BaBa_User_Stories.md`: bản 1 phải làm gì. Mục "Ngoài phạm vi bản 1" là ranh giới.
3. `docs/phan-tich/Ghi_chu_trien_khai.md`: code đang khác thiết kế ở đâu, màn hình nào ở file nào, việc còn thiếu.
4. `docs/phan-tich/BaBa_Thiet_ke_DB.md`: khi đụng tới DB.
5. `docs/phan-tich/BaBa_Project_Instructions.md`: vai trò, ràng buộc, giọng văn.

## Task

- Việc được giao nằm trong `tasks/`. Mở `tasks/README.md` xem task nào đang mở, chỉ làm task được giao cho phiên `code`.
- Làm xong mục nào thì đánh `[x]` và ghi kết quả (commit, PR) ngay dưới mục đó, trong cùng PR. Điểm chưa rõ ghi vào "Câu hỏi mở" của task, không tự đoán.
- Quyết định mới nhất nằm trong `docs/bien-ban/`. Biên bản mâu thuẫn với User Stories thì làm theo biên bản và sửa luôn User Stories trong cùng PR.
- Không merge PR. Tùng duyệt và merge.

## Danh mục món

- Danh mục (món, giá, công thức, vật tư, menu theo cơ sở) là **dữ liệu trong DB**, không phải hằng số trong code. Không viết cứng tên món, mã món hay số món ở frontend; mọi màn đọc từ `catalog`.
- Đổi danh mục bằng **migration mới**, không sửa migration cũ.
- Món ngừng bán: `products.status = 'retired'` và tắt trong `outlet_menu`. **Không xóa** sản phẩm, giá hay công thức, vì đơn và mẻ nấu cũ còn trỏ tới. Chai tồn của món ngừng bán vẫn phải đếm được ở đối chiếu cho tới khi hết.
- Đổi giá hay công thức: thêm phiên bản mới với `valid_from`, đóng phiên bản cũ bằng `valid_to`. Không sửa số trong phiên bản cũ.
- Món chưa có công thức: vẫn ghi nấu và bán được; nấu chỉ trừ bao bì, màn Nấu ghi "Chưa có công thức". Món chưa có giá thì để tắt trong menu.
- Danh sách hiện hành: 9 món trong 4 dòng (xem `tasks/2026-11-11_code_giai-doan-1.md`, mục A; tên 2 món mới và giá theo dòng ở `0014`). Giá theo dòng: Mầm Xanh 15K, Mầm Sáng 20K, Mầm Lành 25K, Mầm Trẻ 30K. Ô số âm do người dùng gõ luôn bị từ chối; tồn kho do hệ thống tính được phép âm.

## Cách làm việc

- Trả lời và viết UI bằng tiếng Việt. Kết luận trước, rồi mới giải thích.
- Thấy yêu cầu làm hỏng thiết kế thì nói ra trước khi làm.
- Câu hỏi nghiệp vụ chưa rõ: gom vào mục "Câu hỏi cần hỏi Hà" trong `Ghi_chu_trien_khai.md`, không tự đoán.
- Khi một quyết định làm đổi story, DB hay màn hình: chỉ ra tài liệu bị ảnh hưởng và cập nhật luôn trong `docs/`.
- Làm trên nhánh mới, mở PR vào `main`. Không push thẳng `main`.

## Stack và lệnh

- React 19 + Vite 7 + TypeScript ~5.9, react-router 7, `@supabase/supabase-js`, `vite-plugin-pwa`. Không có thư viện UI; style ở `src/styles.css`.
- `npm run dev` · `npm run typecheck` · `npm run build`. Chạy typecheck và build trước mỗi commit.
- Biến môi trường: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (xem `.env.example`; key là publishable key, để lộ được).
- Supabase project ref `fsqpajvjjmpyrgllrhgz` (Singapore). Migration ở `supabase/migrations/`, đã chạy tới `0032` và `0034` (0033 chưa chạy) (12/11/2026). Edge Function `send-push` đã deploy. Migration mới đánh số từ `0033`. Dữ liệu cũ Excel + Knote của cơ sở Phan Văn Hớn đã nhập ở `0019`, `0020` (sinh bằng `scripts/import/build_import_sql.py`).
- Địa chỉ app chính thức: https://khobaba.vxlab.vn (dùng trong email mời, hướng dẫn). `baba-wine.vercel.app` chỉ là tên miền mặc định của Vercel.

## Ràng buộc kỹ thuật bắt buộc

- **Sổ cái chỉ thêm:** không UPDATE nội dung, không DELETE bản ghi nghiệp vụ. Sai thì tạo bản ghi đảo hoặc điều chỉnh kèm lý do. Không có policy DELETE cho người dùng.
- **Mọi thao tác ghi đi qua hàm `fn_*`** (`SECURITY DEFINER`, `search_path` cố định), hàm tự kiểm quyền bằng `can_access_outlet` / `can_manage_outlet` / `is_org_admin`. Client không INSERT thẳng vào `stock_movements`.
- **Bản ghi tạo từ máy có `client_id` uuid** để gửi lại không bị trùng.
- **Danh mục có phiên bản** (`valid_from`/`valid_to`); dòng đơn lưu giá và `recipe_id` lúc bán.
- Tiền là số nguyên VND. `business_date` theo Asia/Ho_Chi_Minh (dùng `vn_today()` ở DB, `vnToday()` ở client).
- **Phân quyền bằng RLS**; giao diện chỉ ẩn hoặc làm mờ. Ba tầng: `org_memberships` (admin thấy mọi cơ sở), `memberships.role = 'owner'` (chủ một hoặc nhiều cơ sở), `memberships.role = 'staff'` (nhân viên một cơ sở).
- Migration chỉ thêm, không đổi nghĩa cột cũ. View dùng `security_invoker = true`.
- Nguyên liệu và bao bì bị trừ **lúc ghi nấu**, không phải lúc bán. Lưu đơn chỉ làm giảm số chai trên quầy.

## Giao diện

- Nền xám trung tính `#F7F7F7`; màn đăng nhập nền kem `#F7F3EB`. Màu nhấn `#296241`. Nút "+" dạng viền, không tô nền.
- Chữ Be Vietnam Pro; Quicksand chỉ cho tiêu đề lớn. Cỡ chữ nhỏ vừa phải. Ẩn thanh cuộn.
- Ưu tiên điện thoại, thao tác một tay trong vài giây.
- Lỗi luôn nói: chuyện gì, vì sao, làm gì tiếp. Trạng thái trống luôn có hành động đi tiếp.
- Bản thiết kế từng màn: `docs/thiet-ke/man-hinh/<mã>.dc.html`.

## Thương hiệu

Giọng ấm, giản dị, không khẳng định công dụng chữa bệnh. Chỉ 3 mức ngọt 0 / 10 / 20 ml syrup. Danh sách món hiện hành theo biên bản 11/11 (9 món); giá và định lượng các món cũ theo Phụ lục A của `docs/nguon/BaBa_Dac_ta_phan_mem.md` (đã nạp ở `0008_seed.sql`).
