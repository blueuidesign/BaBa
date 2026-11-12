# Kho BaBa · Thay đổi DB 1.3 và User Stories 1.2 cho phần Chi phí

- **Phiên bản:** bản nháp 0.3, ngày 12/11/2026. 0.2: câu trả lời của Tùng lúc 13:52. 0.3 (14:04): tên khoản chi gõ tự do, thêm loại Nguyên liệu khác, cảnh báo trước khi lưu nếu không vào kho. 0.4 (14:09): đổi thanh điều hướng, nhân viên ghi chi phí. 0.5 (14:45): ô giảm giá, phân loại chi phí Knote; 0017–0021 đã chạy, PR #12 đã merge. 0.6 (15:30): 0022 và giao diện chi phí 1.1, báo cáo Ngày·Tuần·Tháng·Toàn bộ, quản trị K01/K02 (PR #15). Chờ Tùng duyệt trước khi viết migration.
- **Nguồn:** `claude/prompts/2026-11-12_design-db_chi-phi.md`, `claude/BaBa_Chi_phi_v1.0.md`, `claude/data/BaBa_Doi_chieu_chi_phi_Excel.csv`, DB thật trên Supabase (đọc ngày 12/11).
- **Thiết kế màn hình:** canvas "Kho BaBa – Thiết kế app bản 1.1 (chi phí theo nhóm)". Canvas bản 1 giữ nguyên.

## 0. Kết luận nhanh

1. Thêm bảng `expense_categories` (cây 4 nhóm, 16 loại). Thêm 8 cột vào `expenses`, trong đó `item_name` là tên khoản chi gõ tự do. Cột `category` cũ giữ nguyên nghĩa, khoản mới vẫn ghi giá trị cũ gần nhất để code cũ đọc được.
2. Ghi khoản chi kèm cộng kho dùng chung đường với Nhập hàng: một RPC tạo **phiếu nhập + khoản chi** trong cùng transaction.
3. **Có 2 chỗ trong DB hiện tại phải sửa thì mới làm được quyết định số 1 và số 3**, cả hai đều làm được theo kiểu chỉ thêm:
   - Trigger `purchases_expense` chạy ngay khi chèn phiếu, **trước khi có dòng hàng**. Nó không biết phiếu gồm óc chó hay ly, nên luôn ghi loại `nhap_hang`. Phải chuyển việc ghi khoản chi vào cuối `fn_post_purchase` để chia theo nhóm của từng dòng.
   - `fn_post_purchase` luôn lấy ngày hôm nay. Ghi khoản chi cho ngày hôm qua kèm cộng kho sẽ lệch ngày. Thêm tham số `business_date` (không cho ngày tương lai).
4. Phiếu nhập hiện **không đảo được** (bảng `purchases` không có `status`, không có RPC đảo). Sửa khoản chi có phiếu kèm theo cần thêm cơ chế đảo phiếu.
5. Báo cáo lãi lỗ chuyển sang một RPC `fn_pnl` đọc theo nhóm. View cũ giữ cho code đang chạy.
6. Nhập Excel: 82 dòng vào cơ sở **Phan Văn Hớn**, tổng **22.327.200 đ**. Dòng 82 chuyển sang Nguyên liệu · Nguyên liệu khác, nên tổng nhóm Nguyên liệu và Vật tư tiêu hao khác bảng ở mục 4 của prompt 273.000 đ (xem mục 2).
7. **Khoản chi chỉ cộng kho khi tên được chọn từ danh sách kho và có số lượng.** Tên gõ tự do luôn chỉ ghi tiền. Với nhóm Nguyên liệu và Vật tư tiêu hao, app cảnh báo trước khi lưu một khoản không vào kho.

---

## 1. DB 1.3 · Phần bổ sung

### 1.1 Bảng mới `expense_categories`

| Cột | Kiểu | Ghi chú |
|---|---|---|
| `id` | uuid pk | |
| `org_id` | uuid fk `orgs` | danh mục dùng chung cho mọi cơ sở của tổ chức |
| `code` | text | duy nhất trong org khi `valid_to is null` |
| `name` | text | tên hiện trên chip |
| `group_code` | text | `nguyen_lieu` · `vat_tu` · `dau_tu` · `van_hanh` |
| `ingredient_grp` | text null | `main` · `additive` · `packaging`. Có giá trị thì màn H02 hiện ô Món, Số lượng và lọc món theo nhóm này |
| `parent_id` | uuid null | loại con của Đầu tư thiết bị trỏ về loại cha `dau_tu` |
| `example_text` | text null | dòng "vd: óc chó" dưới chip |
| `counts_in_period_pnl` | boolean | `false` cho mọi loại thuộc `dau_tu` |
| `legacy_category` | text null | giá trị ghi vào `expenses.category` cũ, xem 1.3 |
| `sort_order` | int | thứ tự chip |
| `valid_from`, `valid_to` | date | đổi tên hoặc bỏ loại thì đóng bản cũ, mở bản mới |
| `status` | text | `active` · `retired` |

**Vì sao `counts_in_period_pnl` là cột riêng chứ không suy từ `group_code`:** sau này có thể có loại vận hành mà Hà muốn tách khỏi lãi tháng (ví dụ tiền cọc mặt bằng). Khi đó chỉ đổi cờ, không phải sửa RPC.

**RLS:** mọi thành viên của org đọc được; chỉ admin thêm hoặc đóng phiên bản.

**Seed (16 dòng):**

| Nhóm | code | Tên chip | ingredient_grp | Ví dụ | Tính vào lãi kỳ | legacy |
|---|---|---|---|---|---|---|
| nguyen_lieu | `nl_chinh` | Nguyên liệu chính | main | vd: óc chó | có | nhap_hang |
| nguyen_lieu | `phu_lieu` | Phụ liệu | additive | vd: đường | có | nhap_hang |
| nguyen_lieu | `nl_khac` | Nguyên liệu khác | | không vào kho | có | nhap_hang |
| vat_tu | `vat_tu` | Vật tư tiêu hao | packaging | vd: ly, ống hút | có | nhap_hang |
| dau_tu | `dau_tu` (cha) | Đầu tư thiết bị | | | không | khac |
| dau_tu | `dt_may` | Máy móc thiết bị | | | không | khac |
| dau_tu | `dt_xe_quay` | Xe, quầy, kệ, bàn | | | không | khac |
| dau_tu | `dt_dung_cu` | Dụng cụ | | | không | khac |
| dau_tu | `dt_nhan_dien` | Nhận diện, in ấn | | | không | khac |
| dau_tu | `dt_khac` | Khác (đầu tư) | | | không | khac |
| van_hanh | `mat_bang` | Mặt bằng | | | có | mat_bang |
| van_hanh | `luong` | Lương | | | có | luong |
| van_hanh | `dien_nuoc` | Điện nước, internet | | | có | dien_nuoc |
| van_hanh | `ve_sinh` | Vệ sinh, rác | | | có | khac |
| van_hanh | `thu_cong_thuc` | Thử công thức | | | có | khac |
| van_hanh | `khac` | Khác | | | có | khac |

Chip "Đầu tư thiết bị" trên H02 là loại cha. Chọn nó thì hiện hàng chip con, và khoản chi lưu `category_id` của **loại con** (mặc định Máy móc thiết bị nếu không chọn).

### 1.2 Bảng `expenses` · thêm cột

| Cột mới | Kiểu | Ghi chú |
|---|---|---|
| `category_id` | uuid null fk `expense_categories` | null chỉ với dòng cũ chưa ánh xạ (sau migration sẽ không còn) |
| `ingredient_id` | uuid null fk `ingredients` | có khi khoản chi kèm cộng kho, hoặc khoản do phiếu nhập sinh ra |
| `qty` | numeric null | đơn vị nhập (kg, cái), không phải đơn vị kho |
| `purchase_id` | uuid null fk `purchases` | **cột mới, không dùng lại `ref_id`**. Lý do: `ref_id` đang mang nghĩa "id phiếu nhập" chỉ khi `source='purchase'`. Khoản chi ghi từ màn Chi phí cũng có phiếu nhập, nhưng `source='manual'`. Dùng lại `ref_id` sẽ đổi nghĩa cột cũ |
| `import_ref` | text null | `excel_I` · `excel_II` · `excel_III` · `excel_ngay`; sau này thêm `knote_rev` cho doanh thu |
| `import_row` | int null | STT dòng CSV, để đối chiếu ngược |
| `replaces_id` | uuid null fk `expenses` | khoản mới tạo ra khi sửa trỏ về khoản cũ |
| `item_name` | text null | **tên khoản chi gõ tự do**, hiện làm dòng chính trong lịch sử (vd: "Hạt óc chó, dây thừng", "Máy xay thứ 2"). Chọn tên từ danh sách kho thì lưu tên món và `ingredient_id`. Dòng cũ chưa có thì lấy `note` |

**Ràng buộc:**
- `source` thêm giá trị `'import'`. Dòng `source='import'` bắt buộc có `import_ref` và `import_row`; unique `(outlet_id, import_ref, import_row)` để nhập lại không bị trùng.
- `category` cũ giữ nguyên check 5 giá trị. Khoản mới vẫn ghi `category = legacy_category` của loại đã chọn, nên code bản 1 đang chạy vẫn đọc đúng tổng tiền.
- `ingredient_id` và `qty` phải cùng có hoặc cùng trống; `qty > 0`. Thiếu một trong hai thì khoản chỉ ghi tiền.
- Loại có `ingredient_grp` null (Nguyên liệu khác, Vận hành, Đầu tư) thì `ingredient_id` phải null.
- `item_name` dài tối đa 120 ký tự, bắt buộc với khoản ghi từ màn Chi phí bản 1.1.

### 1.3 Ánh xạ dòng cũ (backfill trong migration)

| `category` cũ | `category_id` mới |
|---|---|
| `nhap_hang`, `source='purchase'` | theo `grp` của dòng hàng có giá trị lớn nhất trên phiếu: main → nl_chinh, additive → phu_lieu, packaging → vat_tu, made → phu_lieu |
| `nhap_hang`, `source='manual'` | nl_chinh (không có phiếu để biết món). Liệt kê ra để Hà xem lại |
| `mat_bang`, `luong`, `dien_nuoc` | loại cùng tên trong Vận hành |
| `khac` | Vận hành · Khác |

DB thật hiện có 14 khoản, tổng 2.950.888 đ, đều là dữ liệu test. Sau backfill, kiểm tra: `select count(*) from expenses where category_id is null` phải bằng 0, và tổng tiền không đổi.

Bảng `historical_entries` (H03, số liệu tháng cũ) cũng có `category` 5 giá trị. Ánh xạ giống bảng trên, thêm cột `category_id` cùng cách.

### 1.4 Phiếu nhập đảo được

`purchases` thêm `status` (`posted` · `reversed` · `reversal`), `reversal_of`, `reversal_reason`. RPC `fn_reverse_purchase(p_id, p_reason)`:
1. Đánh dấu phiếu gốc `reversed`.
2. Tạo phiếu đảo cùng ngày gốc, dòng hàng âm, ghi `stock_movements` với `qty_delta` âm, `reason='purchase_reversal'`.
3. Đảo luôn các khoản chi có `purchase_id` = phiếu gốc.

**Rủi ro lớn nhất ở đây:** nếu hàng đã nấu hết, đảo phiếu sẽ làm tồn kho âm. Cách xử lý: vẫn cho đảo (sổ cái phải phản ánh sự thật là phiếu ghi nhầm), nhưng RPC trả cảnh báo "tồn kho óc chó sẽ còn −300 g, cần kiểm kê", và H08 hiện câu đó trước khi lưu.

### 1.5 RPC

Tất cả là `SECURITY DEFINER`, kiểm quyền bằng `can_access_outlet`, chạy trong migration.

| RPC | Làm gì |
|---|---|
| `fn_post_expense_v2(p jsonb)` | Nhận `outlet_id, client_id, spent_on, category_id, amount_vnd, item_name, note?, ingredient_id?, qty?`. Trả thêm `stock_applied` (true/false) để app hiện đúng nhãn. Kiểm: loại còn hiệu lực, ngày ≤ hôm nay, số tiền > 0, món có `grp` khớp `ingredient_grp` của loại. **Có món và số lượng:** gọi `fn_post_purchase` với ngày `spent_on`, một dòng hàng, `total_vnd = amount_vnd`, cờ `p_skip_expense = true`; rồi tạo khoản chi có `purchase_id`. **Không có:** chỉ tạo khoản chi. Trùng `client_id` thì trả bản cũ |
| `fn_post_purchase` (sửa thân hàm, giữ chữ ký) | Thêm khóa `business_date` (mặc định hôm nay), thêm `skip_expense`. Sau vòng lặp dòng hàng, nếu `total_vnd > 0` và không `skip_expense`: chia tiền theo nhóm của từng dòng (giá trị dòng = `qty × unit_cost_vnd`; dòng không có giá thì chia phần còn lại cho nhóm của dòng đầu tiên) và tạo **một khoản chi cho mỗi nhóm**, `source='purchase'`, `purchase_id` = phiếu |
| trigger `purchases_expense` | Khi cờ `expense_groups` bật cho cơ sở thì không làm gì (vì `fn_post_purchase` đã ghi). Cờ tắt thì chạy như cũ |
| `fn_edit_expense(p_id, p jsonb, p_reason)` | Đảo khoản cũ (lý do mặc định "Sửa khoản chi"), nếu có `purchase_id` thì gọi `fn_reverse_purchase`, rồi gọi `fn_post_expense_v2` với dữ liệu mới. Khoản mới ghi `replaces_id` = khoản cũ, để Lịch sử hiện "đã sửa" thay cho "đã hủy" |
| `fn_reverse_expense` (giữ) | Hủy khoản chi. Thêm: nếu có `purchase_id` thì hỏi có đảo phiếu không (tham số `p_with_purchase boolean`) |
| `fn_suggest_items(p_outlet, p_category_id, p_q)` | Gợi ý cho ô Tên khoản chi: món trong kho có `grp` khớp loại (gắn nhãn "trong kho"), rồi các tên tự do đã dùng ở cơ sở này (gắn nhãn "đã dùng"). So khớp không phân biệt hoa thường và dấu |
| `fn_find_duplicate_expense(p_outlet, p_spent_on, p_category_id, p_amount)` | Trả khoản `posted` cùng cơ sở, cùng ngày, cùng loại, cùng số tiền, tạo trong 24 giờ qua, kèm giờ và người ghi. Dùng cho popup W03. Chỉ cảnh báo, không chặn |
| `fn_pnl(p_outlet uuid, p_from date, p_to date)` | `p_outlet` null = mọi cơ sở admin xem được; `p_from` null = Toàn bộ. Trả: doanh thu (đơn + `historical_entries` loại doanh thu), tổng từng nhóm, `operating_cost` (các loại `counts_in_period_pnl`), `profit_before_invest`, `invest`, `profit_after_invest`, `payback_pct` (null khi đầu tư = 0) |
| `fn_pnl_matrix(p_from, p_to)` | Admin: một dòng cho mỗi cơ sở × tháng, cùng các cột trên. K01 và K02 đọc từ đây |

**Cách tính kỳ:** Ngày = `business_date`; Tuần = thứ Hai → Chủ nhật; Tháng = tháng dương lịch; Toàn bộ = từ dòng sớm nhất. Đầu tư thiết bị chỉ bị trừ khi gọi với `p_from` null.

### 1.6 Món mới trong kho (migration riêng)

Thêm 8 món theo mục 3.9 của prompt. Mỗi món thêm dòng `outlet_ingredient_settings` cho mọi cơ sở đang hoạt động. Không thêm vào công thức, nên không tự trừ khi bán. D01 hiện nhãn "đếm khi kiểm kê" cho món `packaging` không nằm trong `packaging_rules`.

Sốt Manine: đơn vị **ml**, tối thiểu **1.000 ml**, nhóm `additive` (Tùng chốt 12/11).

### 1.7 Cờ tính năng

`outlets.settings->'features'->>'expense_groups' = 'true'`. Tắt: app dùng H01/H02 bản 1 và trigger cũ. Bật: app dùng màn 1.1. Bật cho cơ sở test trước, chạy test, rồi mới bật cho cơ sở của Hà.

### 1.8 Thứ tự migration đề xuất

| Số | Nội dung | Chạy ở |
|---|---|---|
| 0017 | `expense_categories` + seed, cột mới ở `expenses` và `historical_entries`, backfill, cột đảo ở `purchases` | migration |
| 0018 | 8 món mới | migration |
| 0019 | RPC ở 1.5, sửa `fn_post_purchase`, sửa trigger theo cờ | migration |
| 0020 | Nhập 82 dòng chi phí Excel vào cơ sở Phan Văn Hớn | migration dữ liệu |
| 0021 | Nhập doanh thu Knote (`import_ref='knote_rev'`) | migration dữ liệu, chờ file Tùng gửi |

---

## 2. Nhập dữ liệu Excel

**Chạy ở đâu:** một script Python trong repo (`scripts/import_excel_costs.py`) đọc CSV và sinh ra file SQL `0020_import_excel_costs.sql`. File SQL này được duyệt bằng mắt rồi chạy như một migration. Lý do không dùng Edge Function: chỉ chạy một lần, và file SQL nằm trong git nên xem lại được đã nhập gì.

**Mỗi dòng CSV thành một khoản chi:**
- `source='import'`, `import_ref` theo cột Nguồn, `import_row` = STT.
- `client_id = uuid_generate_v5(namespace cố định của BaBa, 'excel:' || STT)`. Chạy lại không tạo trùng.
- `spent_on` = 2026-10-01 cho Phần I, II, III; ngày trong cột Ngày cho dòng "Theo ngày".
- `note` = "[Excel Phần I] " + Nội dung gốc + Số lượng gốc.
- `category_id` theo cột Loại; `ingredient_id` theo Mã vật tư (bỏ dấu `*`) nhưng **không tạo phiếu nhập**, nên không cộng kho.
- `item_name` = Nội dung gốc.
- Cơ sở: **Phan Văn Hớn** (`3e1f4df8-6dcb-4593-85a4-2bef47468f42`).
- STT 69 "Đổi tiền lẻ" 200.000 đ: là chi phí, Vận hành · Khác (giữ như CSV).
- STT 82: **chuyển** từ Vật tư tiêu hao sang **Nguyên liệu · Nguyên liệu khác**, `item_name` = "Hạt óc chó, dây thừng", không tách.
- STT 64 Sốt Manine: gắn `ingredient_id` của `sot_manine`.

**Kiểm tra sau khi chạy** (query nằm ở cuối file SQL, sai thì `raise exception` để migration rollback):

| Kiểm tra | Phải bằng |
|---|---|
| Số dòng `source='import'` | 82 |
| Phần I / II / III / Theo ngày | 1.909.500 / 16.343.000 / 1.623.000 / 2.451.700 |
| Đầu tư thiết bị | 15.935.000 |
| Nguyên liệu chính / Phụ liệu / Nguyên liệu khác | 2.213.000 / 1.072.500 / **273.000** (cả nhóm Nguyên liệu 3.558.500) |
| Vật tư tiêu hao | **2.055.700** (CSV 2.328.700 − 273.000 dòng 82) |
| Vận hành | 778.000 |
| Tổng | 22.327.200 |

Các số trên đã tính lại từ file CSV hôm nay, sau khi chuyển dòng 82. Bản CSV trong Project nên sửa cột Nhóm, Loại của dòng 82 cho khớp.

---

## 3. User Stories 1.2 · Phần thay đổi

| Mã | Story | Tiêu chí chấp nhận chính | Màn |
|---|---|---|---|
| H-1 (sửa) | Là chủ cơ sở, tôi xem chi phí theo 4 nhóm để biết tiền đi đâu | Biểu đồ tròn theo nhóm; bấm nhóm xem theo loại; lịch sử theo ngày, lọc theo nhóm; nhãn "Từ file cũ", "Từ phiếu nhập", "Chỉ ghi tiền"; trống thì có nút Thêm khoản chi | H01, H05, H06 |
| H-2 (sửa) | Tôi ghi một khoản chi trong vài giây bằng chip | Chip 4 nhóm, có dòng ví dụ; Đầu tư thiết bị có chip con; số tiền > 0; ngày không ở tương lai | H02, H04, H07 |
| H-5 (mới) | Mua nguyên liệu ở chợ, tôi ghi ở màn Chi phí và kho tự cộng | Ô Tên khoản chi gõ tự do, có gợi ý tên trong kho theo loại. Chọn tên "trong kho" và ghi số lượng thì cộng kho, tạo phiếu nhập. Ghi ở D03 hay H02 đều ra cùng một cặp phiếu nhập và khoản chi | H02, H09, D03 |
| H-8 (mới) | Tôi ghi nhanh một khoản bằng tên bất kỳ, không cần có trong danh mục kho | Tên tự do lưu được ở mọi loại; không thêm món vào tồn kho. Nhóm Nguyên liệu, Vật tư tiêu hao mà không vào kho thì hỏi trước khi lưu: "Khoản này không vào tồn kho", Sửa lại / Vẫn lưu | H09, H04, W04 |
| H-6 (mới) | App nhắc khi tôi có thể đang ghi trùng | Cùng ngày, loại, số tiền trong 24 giờ thì hiện popup "Có vẻ khoản này đã ghi lúc …", Vẫn ghi / Bỏ | W03 |
| H-3 (sửa) | Tôi sửa hoặc hủy khoản chi ghi nhầm | Sửa: khoản cũ hiện "đã sửa", khoản mới thay thế; có phiếu kèm thì kho chỉnh theo. Hủy phải có lý do. Không xóa hẳn | H08 |
| F-4 (sửa) | Tôi xem lãi lỗ theo Ngày, Tuần, Tháng, Toàn bộ | Ngày/Tuần/Tháng: doanh thu − 3 nhóm, không trừ đầu tư. Toàn bộ: trừ thêm đầu tư, hiện lãi trước và sau đầu tư, phần trăm hoàn vốn. Số âm màu cảnh báo | F05, F07, F01, F06 |
| K-2 (sửa) | Admin xem lãi lỗ cơ sở × tháng và toàn bộ | Bảng cơ sở × 3 tháng gần, cột Cộng; chế độ Toàn bộ có đầu tư và hoàn vốn từng cơ sở | K01, K02 |
| H-7 (mới) | Chi phí từ file Excel cũ có trong app | 82 khoản, tổng đúng như bảng mục 2; nhãn "Từ file cũ"; sửa được như khoản thường | H01, H05 |
| D-6 (mới) | Ly, ống hút, nắp hiện trong kho dù chưa tự trừ | Có trong D01 với nhãn "đếm khi kiểm kê"; cập nhật khi Kiểm kê | D01, D05 |

**Ngoài phạm vi bản 1 (thêm vào danh sách cuối User Stories):** giá vốn mỗi chai; tự trừ ly, ống hút khi bán; khấu hao đầu tư theo tháng.

---

## 4. Test cần sửa và test mới

**Sửa trong `BaBa_Kich_ban_test_tu_dong_v1.3.md`, Phần 14:**

| Mã | Đang test | Đổi thành |
|---|---|---|
| T095 | Biểu đồ chỉ có "Nhập hàng" | Biểu đồ chỉ có nhóm **Nguyên liệu** (từ 2 phiếu nhập), lịch sử có nhãn "Từ phiếu nhập" |
| T097 | Ghi chú "nhập kho đã tự ghi" trên H02 | Ghi chú nằm ở D03: "Phiếu có giá sẽ tự ghi vào Chi phí" |
| T098 | Loại Mặt bằng | Chip **Mặt bằng** (nhóm Vận hành); biểu đồ có 2 nhóm |
| T099 | Điện nước | Chip Điện nước, internet; giữ số |
| T101 | Hủy khoản | Mở H08 → Hủy khoản chi → lý do. Thêm kiểm: khoản hiện gạch ngang "đã hủy" |
| T102 | Lọc theo loại | Lọc theo **nhóm** Vận hành; bấm nhóm trên biểu đồ ra H05 theo loại |
| T103, T106 | "Hôm nay", "Tháng này", Lợi nhuận | Chip **Ngày**, **Tháng**; dòng "Lãi lỗ"; số âm màu cảnh báo; có 3 dòng con theo nhóm |
| T096, T100 | Số tiền trống, ngày tương lai | Giữ nguyên |

**Case mới (đề xuất T113–T124, chạy sau T112):**

| Mã | Thao tác | Mong đợi |
|---|---|---|
| T113 | H02: chip Nguyên liệu chính, gõ "óc" | Gợi ý Óc chó nhãn "trong kho"; không gợi ý đường, ly; có dòng "Dùng tên 'óc'" |
| T114 ★ | Nguyên liệu chính, Óc chó 1 kg, 420.000 → Lưu | Kho óc chó +1.000 g; F03 có 1 phiếu nhập; H01 có 1 khoản, nhãn "Từ phiếu nhập" |
| T115 | Vật tư tiêu hao, chọn Ly giấy, bỏ trống số lượng, 250.000 → Lưu | Popup W04 "không vào tồn kho"; Vẫn lưu: chỉ ghi tiền, kho không đổi, nhãn "Chỉ ghi tiền" |
| T115b | Nguyên liệu khác, gõ "Hạt óc chó, dây thừng", 273.000 → Lưu → Vẫn lưu | Lưu được; D01 không có món mới; H01 hiện tên đã gõ |
| T115c | Vận hành · Khác, gõ "Đổi tiền lẻ" → Lưu | **Không** hiện W04 (nhóm Vận hành không liên quan kho) |
| T116 | Ghi lại đúng khoản T115 | Popup W03; bấm Bỏ: không lưu; Vẫn ghi: có 2 khoản |
| T117 | D03 nhập 1 dòng óc chó + 1 dòng ly có giá | H01 có **2** khoản (Nguyên liệu chính, Vật tư tiêu hao), cộng đúng tổng phiếu |
| T118 ★ | H08 sửa khoản T114 thành 2 kg, 840.000 | Kho óc chó +2.000 g so với trước T114; khoản cũ "đã sửa"; tổng tháng tăng 420.000 |
| T119 | Đầu tư thiết bị · Máy móc 1.200.000 | Lãi tháng **không** đổi; Toàn bộ giảm 1.200.000; % hoàn vốn đổi |
| T120 ★ | F06 Toàn bộ | Có dòng Đầu tư thiết bị, Lãi lỗ sau đầu tư, % hoàn vốn = lãi trước đầu tư ÷ đầu tư |
| T121 | F07 Tuần | Thứ Hai → Chủ nhật; cộng các ngày khớp F05 từng ngày |
| T122 | K01, K02 bằng tài khoản admin | Cột Cộng = tổng các tháng; dòng Cộng 3 cơ sở = tổng các dòng |
| T123 ★ | Sau migration 0020 | Tổng 82 dòng và 4 nhóm khớp bảng mục 2 |
| T124 | Chạy lại file 0020 | Không thêm dòng nào (client_id trùng) |

---

## 5. Đã trả lời và còn chờ

**Đã chốt (Tùng, 12/11 13:52 và 14:04):**
- 82 dòng Excel thuộc cơ sở **Phan Văn Hớn**.
- Đổi tiền lẻ 200.000 đ là chi phí (Vận hành · Khác).
- Sốt Manine: ml, tối thiểu 1.000 ml, thêm vào kho.
- Hạt óc chó, dây thừng: loại **Nguyên liệu khác**, tên giữ nguyên, không tách.
- Tên khoản chi gõ tự do được; tên không có trong kho thì không vào tồn kho; cảnh báo trước khi lưu.
- 4 ánh xạ vật tư đúng: Tem dán 4×6 → `nhan`, Dây thừng → `day_gai`, Chai nhựa → `chai_330`, Bịch 1–2 ngăn → `tui`.

**Còn chờ:**
1. File doanh thu Knote (Tùng sắp gửi) và mốc ngày chuyển sang app.
2. Kỳ báo cáo: bỏ hay giữ phần chọn Từ tháng → Đến tháng ở Toàn bộ.
3. Phiếu nhập D03 nhiều nhóm mà chỉ có tổng tiền: chọn cách xử lý (đề xuất: bắt nhập giá từng dòng khi phiếu có từ 2 nhóm trở lên).
4. Cảnh báo W04 hiện mọi lần ở nhóm Nguyên liệu và Vật tư tiêu hao, kể cả loại Nguyên liệu khác. Nếu Hà thấy phiền khi ghi Nguyên liệu khác thường xuyên, có thể bỏ cảnh báo riêng cho loại này vì chip đã ghi "không vào kho".


## 6. Thanh điều hướng và quyền ghi chi phí (0.4)

**Quyết định của Tùng (12/11 14:09):** thanh dưới thành **Trang chủ · Bán · Báo cáo · Chi phí · Tài khoản**. Nấu (C01) mở từ nút "Nấu" ở Trang chủ, C01 có mũi tên quay lại A04. Mục đích: nhân viên thêm chi phí nhanh.

**Tài liệu bị ảnh hưởng:** Project instructions (mục Bản 1 đã chốt, dòng Điều hướng), User Stories 1.2 (story A-4 Trang chủ, C-1 Nấu), `BaBa_Ghi_chu_trien_khai.md` (bảng màn hình), code `src/components` thanh dưới và route `/nau`.

**Thay đổi DB kéo theo:** hiện `fn_post_expense` và `fn_reverse_expense` chỉ cho **chủ cơ sở** (`can_manage_outlet`). Để nhân viên ghi được, `fn_post_expense_v2` dùng `can_access_outlet`. Đề xuất phân quyền (chờ Tùng chốt):

| Việc | Nhân viên | Chủ cơ sở, admin |
|---|---|---|
| Thêm khoản chi | được | được |
| Xem khoản chi | chỉ khoản mình ghi, trong 7 ngày | tất cả |
| Sửa, hủy | chỉ khoản mình ghi trong ngày, ngày chưa chốt | tất cả |
| Biểu đồ theo nhóm, Báo cáo lãi lỗ | không | được |

Lý do giới hạn xem: chi phí có Lương và Mặt bằng, chủ cơ sở thường không muốn nhân viên thấy. RLS trên `expenses` lọc theo `created_by = auth.uid()` với nhân viên.


## 7. Ô giảm giá và dữ liệu Knote (0.5)

**Giảm giá (Tùng 12/11 14:45):** ghi ở cấp đơn, dòng món giữ giá niêm yết.
- DB: `orders.discount_vnd` (≥ 0), `orders.discount_reason`; `orders.total_vnd` = tổng dòng − giảm giá = tiền thu.
- `fn_post_order` nhận `discount_vnd`, `discount_reason`; báo lỗi khi giảm lớn hơn tiền đơn; đơn tặng không có giảm giá.
- `v_daily_sales.revenue_vnd` và doanh thu theo đơn khi đối chiếu (`fn_close_day`) đều trừ giảm giá.
- `v_sales_by_product` vẫn theo giá niêm yết, nên cộng "Theo món" có thể lớn hơn doanh thu đúng bằng tổng giảm giá.
- Màn: B01 nút "Giảm giá" ở thanh dưới → B03 bottom sheet (5%, 10% làm tròn nghìn đồng, nhập số tiền, lý do) → B04 đã lưu, hiện tạm tính và giảm.
- Story mới B-4: "Tôi giảm giá cho khách quen ngay khi ghi đơn, doanh thu và đối chiếu tự trừ đúng."
- Test mới: giảm 5% đơn 40.000 → thu 38.000; giảm 40.000 cho đơn 30.000 bị chặn; đối chiếu cuối ngày trừ đúng.

**Migration đã viết (PR #12, chưa chạy):** 0017 danh mục và cột mới · 0018 vật tư mới · 0019 nhập 105 khoản chi · 0020 nhập 72 đơn Knote · 0021 giảm giá. Các RPC chi phí 1.1 (mục 1.5) chuyển sang 0022.

**Chi phí Knote, Tùng chốt 12/11:** đá (4 dòng) → Phụ liệu; đường (3 dòng) → đường thốt nốt; 2 dòng "4 chai mẫu" không trùng; "nhập hàng" 485.000 tạm Nguyên liệu chính. Tổng kiểm: Nguyên liệu 2.334.000 · Đầu tư 950.000 · Vận hành 5.032.000 · cộng 8.316.000.
**Còn hỏi:** Mặt bằng 5.000.000 ngày 04/11 là tiền thuê tháng 11 hay tiền cọc.


## 8. Đã làm ở PR #15 (0.6, 12/11)

**Migration 0022 `0022_chi_phi_rpc.sql`** (khác bản đặc tả ở mục 1.5):
- Không dùng cờ `expense_groups`: thay đổi bật cùng lúc cho mọi cơ sở khi chạy 0022 và merge PR #15.
- Trigger `purchases_expense` bị bỏ; `fn_post_purchase` tự ghi chi phí sau khi có dòng hàng, chia tiền theo nhóm (nguyên liệu chính, phụ liệu, vật tư tiêu hao) theo thành tiền từng dòng. Phiếu không dòng nào có giá: cả tổng vào một nhóm. Câu hỏi mục 5.3 vì vậy không cần bắt nhập giá: tổng phiếu ở D03 chính là cộng thành tiền các dòng.
- Trigger `expenses_category`: mọi khoản chi (kể cả code cũ, dòng đảo) tự có `category_id`.
- RPC: `fn_post_expense_v2`, `fn_edit_expense`, `fn_reverse_expense` (đảo luôn phiếu kèm theo), `fn_reverse_purchase` (trả về món tồn âm), `fn_find_duplicate_expense`. Gợi ý tên làm ở app (món trong kho + tên đã dùng), không cần `fn_suggest_items`.
- View `v_daily_pnl_groups`: doanh thu + 4 nhóm theo ngày, gồm số nhập tay tháng cũ; Báo cáo và Quản trị đọc từ đây (thay cho `fn_pnl`).
- Thêm ô "Ngày nhập" ở D03.

**Giao diện:** Chi phí (H01–H09, W03, W04) trên thanh dưới; Báo cáo bỏ Hôm nay/Tháng N/Tháng trước/Tất cả, thay bằng Ngày · Tuần · Tháng · Toàn bộ có ‹ ›, Toàn bộ không còn chọn Từ tháng → Đến tháng; Quản trị Theo tháng (cơ sở × 3 tháng, Lãi lỗ/Doanh thu/Chi phí) và Toàn bộ (hoàn vốn); D01 nhãn "đếm khi kiểm kê"; Báo cáo ghi chú giảm giá trong Theo món và số đơn chép từ Knote.

**Còn lại:** quyền nhân viên ghi chi phí (chờ chốt); sửa kịch bản test T095–T112 theo mục 4.

## Đề xuất

- Khi đảo phiếu làm tồn kho âm, tạo luôn một thông báo "Cần kiểm kê óc chó" để Hà không quên.
- Màn H01 có thể thêm dòng nhỏ "Đã ghi 3 khoản hôm nay" ở Trang chủ, giúp Hà nhớ ghi chi phí cuối ngày. Chưa làm ở bản này.
