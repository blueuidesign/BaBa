-- 0019 · Nhập chi phí cũ vào cơ sở Phan Văn Hớn
-- Nguồn: claude/data/BaBa_Doi_chieu_chi_phi_Excel.csv (82 dòng) và claude/data/BaBa_Chi_phi_Knote_03-11_11-11.csv (23 dòng).
-- Sinh bằng scripts/import/build_import_sql.py. client_id = uuid v5 theo nguồn + STT nên chạy lại không trùng.
-- Chỉ ghi tiền, không tạo phiếu nhập, không cộng kho. Quyết định của Tùng 12/11: Excel STT 69 là chi phí; STT 82 vào
-- Nguyên liệu khác; Knote: đá vào Phụ liệu, đường là đường thốt nốt, 2 dòng "4 chai mẫu" không trùng.
-- Tổng theo nguồn Excel:
--   excel_I: 1.909.500
--   excel_II: 16.343.000
--   excel_III: 1.623.000
--   excel_ngay: 2.451.700
-- Excel
insert into public.expenses (outlet_id, client_id, spent_on, category, amount_vnd, note, source, status, created_by,
                             category_id, item_name, ingredient_id, import_ref, import_row)
select o.id, v.cid, v.d, c.legacy_category, v.amt, v.note, 'import', 'active', '2e8b7277-123f-4b66-8475-eb01a5266e0d'::uuid,
       c.id, v.item, v.ing, v.ref, v.rn
from public.outlets o
cross join lateral (values
('2a9f8304-3b40-5d59-9ef7-c07332901122'::uuid, '2026-10-01'::date, 'HẠT ÓC CHÓ', 106000, 'nl_chinh', (select id from ingredients where code = 'oc_cho' and org_id = o.org_id), '[Excel Phần I] HẠT ÓC CHÓ · SL gốc 500G · [Excel Phần I] HẠT ÓC CHÓ', 'excel_I', 1),
('ab6377ce-b2c4-5d34-9e6b-b88ce49c6fb8'::uuid, '2026-10-01'::date, 'BỘT CA CAO', 100000, 'phu_lieu', (select id from ingredients where code = 'cacao' and org_id = o.org_id), '[Excel Phần I] BỘT CA CAO · SL gốc 500G · [Excel Phần I] BỘT CA CAO', 'excel_I', 2),
('04ba171f-480a-5c8f-9483-054f826933dd'::uuid, '2026-10-01'::date, 'HẠNH NHÂN', 178000, 'nl_chinh', (select id from ingredients where code = 'hanh_nhan' and org_id = o.org_id), '[Excel Phần I] HẠNH NHÂN · SL gốc 1KG · [Excel Phần I] HẠNH NHÂN', 'excel_I', 3),
('3861c2ba-8f95-5b1c-86c6-3869d7908bfc'::uuid, '2026-10-01'::date, 'MUỐI HỒNG', 110000, 'phu_lieu', (select id from ingredients where code = 'muoi_hong' and org_id = o.org_id), '[Excel Phần I] MUỐI HỒNG · SL gốc 3 TÚI 500G · [Excel Phần I] MUỐI HỒNG', 'excel_I', 4),
('d95a3a59-6668-5e24-94cd-4ec2d0dbb7ef'::uuid, '2026-10-01'::date, 'BỘT MATCHA', 62000, 'phu_lieu', (select id from ingredients where code = 'matcha' and org_id = o.org_id), '[Excel Phần I] BỘT MATCHA · SL gốc 100G · [Excel Phần I] BỘT MATCHA', 'excel_I', 5),
('da6a52a9-cb02-5d64-86e8-84f6cfab7d19'::uuid, '2026-10-01'::date, 'BỘT LÁ DỨA', 58000, 'phu_lieu', (select id from ingredients where code = 'la_dua' and org_id = o.org_id), '[Excel Phần I] BỘT LÁ DỨA · SL gốc 100G · [Excel Phần I] BỘT LÁ DỨA', 'excel_I', 6),
('46c8bdda-9847-5814-ad3b-539033a067b4'::uuid, '2026-10-01'::date, 'ĐÂU ĐỎ', 140000, 'nl_chinh', (select id from ingredients where code = 'dau_do' and org_id = o.org_id), '[Excel Phần I] ĐÂU ĐỎ · SL gốc 2KG · [Excel Phần I] ĐÂU ĐỎ', 'excel_I', 7),
('77b582d5-99e5-54ed-a7c3-70be96541b7a'::uuid, '2026-10-01'::date, 'MÈ ĐEN', 120000, 'nl_chinh', (select id from ingredients where code = 'me' and org_id = o.org_id), '[Excel Phần I] MÈ ĐEN · SL gốc 1KG · [Excel Phần I] MÈ ĐEN', 'excel_I', 8),
('f64a3f39-11c1-5ff9-80a7-e8872046c79f'::uuid, '2026-10-01'::date, 'HẠT ĐỀU', 400000, 'nl_chinh', (select id from ingredients where code = 'dieu' and org_id = o.org_id), '[Excel Phần I] HẠT ĐỀU · SL gốc 3KG · [Excel Phần I] HẠT ĐỀU', 'excel_I', 9),
('ef8eb7a4-10cb-5736-a44c-85e967f30c9b'::uuid, '2026-10-01'::date, 'ĐƯỜNG THỐT NỐT', 400000, 'phu_lieu', (select id from ingredients where code = 'thot_not' and org_id = o.org_id), '[Excel Phần I] ĐƯỜNG THỐT NỐT · SL gốc 1KG · [Excel Phần I] ĐƯỜNG THỐT NỐT', 'excel_I', 10),
('e443c55e-eb0b-5bed-b282-e5f8a1a7c3f6'::uuid, '2026-10-01'::date, 'ĐƯỜNG PHÈN', 27500, 'phu_lieu', (select id from ingredients where code = 'phen' and org_id = o.org_id), '[Excel Phần I] ĐƯỜNG PHÈN · SL gốc 1 TÚI 500G · [Excel Phần I] ĐƯỜNG PHÈN', 'excel_I', 11),
('f52070a2-0985-5bf4-b5d4-62efd38ca31e'::uuid, '2026-10-01'::date, 'HOA NHÀI KHÔ', 103000, 'phu_lieu', (select id from ingredients where code = 'nhai' and org_id = o.org_id), '[Excel Phần I] HOA NHÀI KHÔ · SL gốc 1KG · [Excel Phần I] HOA NHÀI KHÔ', 'excel_I', 12),
('3ff0804b-7635-57ab-ae73-ba47dc56751a'::uuid, '2026-10-01'::date, 'CƠM DỪA TƯƠI', 57000, 'nl_chinh', (select id from ingredients where code = 'dua' and org_id = o.org_id), '[Excel Phần I] CƠM DỪA TƯƠI · SL gốc 2.2KG · [Excel Phần I] CƠM DỪA TƯƠI', 'excel_I', 13),
('69201818-3393-5dfe-9d16-8402e65f0dc9'::uuid, '2026-10-01'::date, 'THANH LONG ĐỎ', 18000, 'nl_chinh', (select id from ingredients where code = 'thanh_long' and org_id = o.org_id), '[Excel Phần I] THANH LONG ĐỎ · SL gốc 1KG · [Excel Phần I] THANH LONG ĐỎ', 'excel_I', 14),
('caac8027-640f-5af9-8e87-809cce287b42'::uuid, '2026-10-01'::date, 'BẮP HẠT', 30000, 'nl_chinh', (select id from ingredients where code = 'bap' and org_id = o.org_id), '[Excel Phần I] BẮP HẠT · SL gốc 1KG · [Excel Phần I] BẮP HẠT', 'excel_I', 15),
('253dbaff-9091-55a1-8a7d-2e1ee656445f'::uuid, '2026-10-01'::date, 'CHAI THUỶ TINH', 81000, 'dt_dung_cu', null, '[Excel Phần II] CHAI THUỶ TINH · [Excel Phần II] CHAI THUỶ TINH', 'excel_II', 16),
('4da3ed5c-7957-5945-a791-6314072e55cf'::uuid, '2026-10-01'::date, 'MÁY XAY CÔNG NGHIỆP', 2890000, 'dt_may', null, '[Excel Phần II] MÁY XAY CÔNG NGHIỆP · [Excel Phần II] MÁY XAY CÔNG NGHIỆP', 'excel_II', 17),
('37c48525-b393-58b0-9933-675bda9868f4'::uuid, '2026-10-01'::date, 'TẤM LÓT CAO SU', 80000, 'dt_dung_cu', null, '[Excel Phần II] TẤM LÓT CAO SU · [Excel Phần II] TẤM LÓT CAO SU', 'excel_II', 18),
('e9f31d98-81d6-558f-801a-4b7dde23000b'::uuid, '2026-10-01'::date, 'RÂY LỌC', 39000, 'dt_dung_cu', null, '[Excel Phần II] RÂY LỌC · [Excel Phần II] RÂY LỌC', 'excel_II', 19),
('c1394912-d96d-5513-a613-42fe208ecfb6'::uuid, '2026-10-01'::date, 'KÌM BẤM LỔ', 41000, 'dt_dung_cu', null, '[Excel Phần II] KÌM BẤM LỔ · [Excel Phần II] KÌM BẤM LỔ', 'excel_II', 20),
('92da422a-deda-58bb-b048-3a05b4910492'::uuid, '2026-10-01'::date, 'CÂN ĐIỆN TỬ', 119000, 'dt_may', null, '[Excel Phần II] CÂN ĐIỆN TỬ · [Excel Phần II] CÂN ĐIỆN TỬ', 'excel_II', 21),
('2819256d-1a76-5e50-bc1c-a99647f848e1'::uuid, '2026-10-01'::date, 'SÁCH NẤU SỮA HẠT', 140000, 'dt_khac', null, '[Excel Phần II] SÁCH NẤU SỮA HẠT · [Excel Phần II] SÁCH NẤU SỮA HẠT', 'excel_II', 22),
('05c8dd0d-2cdf-5ae3-8e34-d167f0b9f9cb'::uuid, '2026-10-01'::date, 'CỐC ĐONG THUỶ TINH', 216000, 'dt_dung_cu', null, '[Excel Phần II] CỐC ĐONG THUỶ TINH · [Excel Phần II] CỐC ĐONG THUỶ TINH', 'excel_II', 23),
('dfbebd3a-eab7-5819-babc-ed2bf91d88a0'::uuid, '2026-10-01'::date, 'KHAY INOX', 208000, 'dt_dung_cu', null, '[Excel Phần II] KHAY INOX · [Excel Phần II] KHAY INOX', 'excel_II', 24),
('2fabb4ef-d354-5699-9293-13d72f9c5909'::uuid, '2026-10-01'::date, 'THỚT INOX', 36000, 'dt_dung_cu', null, '[Excel Phần II] THỚT INOX · [Excel Phần II] THỚT INOX', 'excel_II', 25),
('c7bf4647-f2ff-50e6-9092-417b0df32785'::uuid, '2026-10-01'::date, 'THAU RỖ INOX', 140000, 'dt_dung_cu', null, '[Excel Phần II] THAU RỖ INOX · [Excel Phần II] THAU RỖ INOX', 'excel_II', 26),
('dfec3977-c77e-5d5a-be6e-f6e6f68be898'::uuid, '2026-10-01'::date, 'XẺNG XÚC ĐÁ', 55000, 'dt_dung_cu', null, '[Excel Phần II] XẺNG XÚC ĐÁ · [Excel Phần II] XẺNG XÚC ĐÁ', 'excel_II', 27),
('a85f4704-caa0-5d6a-9340-d7221ac13af9'::uuid, '2026-10-01'::date, 'THAU INOX', 41000, 'dt_dung_cu', null, '[Excel Phần II] THAU INOX · [Excel Phần II] THAU INOX', 'excel_II', 28),
('5c539ae9-5f96-5194-9027-63fdedd6bf8d'::uuid, '2026-10-01'::date, 'VÁ MÚC INOX 1', 24000, 'dt_dung_cu', null, '[Excel Phần II] VÁ MÚC INOX 1 · [Excel Phần II] VÁ MÚC INOX 1', 'excel_II', 29),
('3fa3c460-a85d-56e9-8a0b-1959e1ba0b8c'::uuid, '2026-10-01'::date, 'VÁ MÚC 2', 12000, 'dt_dung_cu', null, '[Excel Phần II] VÁ MÚC 2 · [Excel Phần II] VÁ MÚC 2', 'excel_II', 30),
('0d5ee47d-58f4-5724-bfc4-d9dac7c37881'::uuid, '2026-10-01'::date, 'KẸP GĂP', 20000, 'dt_dung_cu', null, '[Excel Phần II] KẸP GĂP · [Excel Phần II] KẸP GĂP', 'excel_II', 31),
('b21ec59d-8ccd-542d-9230-ce020889c760'::uuid, '2026-10-01'::date, 'CA ĐONG NHỰA', 46000, 'dt_dung_cu', null, '[Excel Phần II] CA ĐONG NHỰA · [Excel Phần II] CA ĐONG NHỰA', 'excel_II', 32),
('b893c29d-9e49-58c0-a4e1-dc6ff342ea3d'::uuid, '2026-10-01'::date, 'CA ĐONG NHỎ', 43000, 'dt_dung_cu', null, '[Excel Phần II] CA ĐONG NHỎ · [Excel Phần II] CA ĐONG NHỎ', 'excel_II', 33),
('684d7b12-1b01-50d7-a6b5-2845a75c5044'::uuid, '2026-10-01'::date, 'BÌNH THUỶ TINH ĐỰNG SYRUP', 59000, 'dt_dung_cu', null, '[Excel Phần II] BÌNH THUỶ TINH ĐỰNG SYRUP · [Excel Phần II] BÌNH THUỶ TINH ĐỰNG SYRUP', 'excel_II', 34),
('4e3adfe7-2966-5b97-a5d2-7769ff2916fa'::uuid, '2026-10-01'::date, 'BẾP ĐIỆN', 325000, 'dt_may', null, '[Excel Phần II] BẾP ĐIỆN · [Excel Phần II] BẾP ĐIỆN', 'excel_II', 35),
('a909f904-0f80-52e5-9142-e5b33c5f113c'::uuid, '2026-10-01'::date, 'TỦ MÁT', 4720000, 'dt_may', null, '[Excel Phần II] TỦ MÁT · [Excel Phần II] TỦ MÁT', 'excel_II', 36),
('44037d01-4e51-50df-859e-8806364958fb'::uuid, '2026-10-01'::date, 'KÉO', 23000, 'dt_dung_cu', null, '[Excel Phần II] KÉO · [Excel Phần II] KÉO', 'excel_II', 37),
('94938bc5-c1c5-5c7f-8fd9-19004dd46fd6'::uuid, '2026-10-01'::date, 'KHĂN', 30000, 've_sinh', null, '[Excel Phần II] KHĂN · [Excel Phần II] KHĂN', 'excel_II', 38),
('26d218b2-2fc2-5cb1-adda-e4f88aa16ba2'::uuid, '2026-10-01'::date, 'KỆ 5 TẦNG', 800000, 'dt_xe_quay', null, '[Excel Phần II] KỆ 5 TẦNG · [Excel Phần II] KỆ 5 TẦNG', 'excel_II', 39),
('19fc4f0c-3db7-5ed3-a001-5c478f69b23f'::uuid, '2026-10-01'::date, 'BÀN INOX', 750000, 'dt_xe_quay', null, '[Excel Phần II] BÀN INOX · [Excel Phần II] BÀN INOX', 'excel_II', 40),
('5186add0-d817-52b1-bc03-779fbdd6b740'::uuid, '2026-10-01'::date, 'NƯỚC RỬA CHÉN', 18000, 've_sinh', null, '[Excel Phần II] NƯỚC RỬA CHÉN · [Excel Phần II] NƯỚC RỬA CHÉN', 'excel_II', 41),
('4e894ee7-3c5a-5f86-9744-69a587b729b5'::uuid, '2026-10-01'::date, 'CHẢO CHỐNG DÍNH SIZE 24, DAO, MIẾNG RỬA CHÉN', 290000, 'dt_dung_cu', null, '[Excel Phần II] CHẢO CHỐNG DÍNH SIZE 24, DAO, MIẾNG RỬA CHÉN · [Excel Phần II] CHẢO CHỐNG DÍNH SIZE 24, DAO, MIẾNG RỬA CHÉN', 'excel_II', 42),
('73013b5a-f8e5-5e15-a044-cabd3ccdd2aa'::uuid, '2026-10-01'::date, 'CHỔI, CÂY LAU NHÀ, MIẾNG DẶM CHÂN', 390000, 've_sinh', null, '[Excel Phần II] CHỔI, CÂY LAU NHÀ, MIẾNG DẶM CHÂN · [Excel Phần II] CHỔI, CÂY LAU NHÀ, MIẾNG DẶM CHÂN', 'excel_II', 43),
('bccf4dcc-90a2-522a-86a3-9f7f8b026f1a'::uuid, '2026-10-01'::date, '6 HỘP ĐỰNG THỰC PHẨM', 227000, 'dt_dung_cu', null, '[Excel Phần II] 6 HỘP ĐỰNG THỰC PHẨM · [Excel Phần II] 6 HỘP ĐỰNG THỰC PHẨM', 'excel_II', 44),
('32eec850-b51b-5d85-b9bc-fa826c691eb5'::uuid, '2026-10-01'::date, 'BẢNG HIỆU', 1500000, 'dt_nhan_dien', null, '[Excel Phần II] BẢNG HIỆU · [Excel Phần II] BẢNG HIỆU', 'excel_II', 45),
('e192fe12-349b-521a-87df-e707b449d76c'::uuid, '2026-10-01'::date, 'XE', 2350000, 'dt_xe_quay', null, '[Excel Phần II] XE · [Excel Phần II] XE', 'excel_II', 46),
('0a4a9217-95ea-5ea6-9bc2-f124b28dfe0f'::uuid, '2026-10-01'::date, 'KHÓA CỬA CUỐN', 300000, 'dt_xe_quay', null, '[Excel Phần II] KHÓA CỬA CUỐN · [Excel Phần II] KHÓA CỬA CUỐN', 'excel_II', 47),
('d128c6c6-b61d-5b31-9fe7-320a573ed7f6'::uuid, '2026-10-01'::date, 'MENU', 45000, 'dt_nhan_dien', null, '[Excel Phần II] MENU · [Excel Phần II] MENU', 'excel_II', 48),
('948ef425-80a9-58a6-af09-468b7ab201ed'::uuid, '2026-10-01'::date, 'CA NHỰA NHỎ', 32000, 'dt_dung_cu', null, '[Excel Phần II] CA NHỰA NHỎ · [Excel Phần II] CA NHỰA NHỎ', 'excel_II', 49),
('3cf52498-6e9d-5f5c-a052-15d8edaee88c'::uuid, '2026-10-01'::date, 'POSTER', 120000, 'dt_nhan_dien', null, '[Excel Phần II] POSTER · [Excel Phần II] POSTER', 'excel_II', 50),
('43e8c9de-a134-55f9-a9a0-f2985e1466a2'::uuid, '2026-10-01'::date, 'HỘP NHỰA 500ML', 40000, 'dt_dung_cu', null, '[Excel Phần II] HỘP NHỰA 500ML · [Excel Phần II] HỘP NHỰA 500ML (hộp nhựa 500ml: đầu tư thiết bị)', 'excel_II', 51),
('8bd419a3-d690-5cef-97d7-bc7d2ff82d31'::uuid, '2026-10-01'::date, 'KỆ ÚP LY', 93000, 'dt_xe_quay', null, '[Excel Phần II] KỆ ÚP LY · [Excel Phần II] KỆ ÚP LY', 'excel_II', 52),
('e48684c4-15c7-5001-920a-eb2b564fdad6'::uuid, '2026-10-01'::date, 'TEM DÁN 4X6', 672000, 'vat_tu', (select id from ingredients where code = 'nhan' and org_id = o.org_id), '[Excel Phần III] TEM DÁN 4X6 · SL gốc 2000 TEM · [Excel Phần III] TEM DÁN 4X6', 'excel_III', 53),
('24515b4f-9f43-5b1c-aa1c-e26d17f8b921'::uuid, '2026-10-01'::date, 'CHAI NHỰA', 518000, 'vat_tu', (select id from ingredients where code = 'chai_330' and org_id = o.org_id), '[Excel Phần III] CHAI NHỰA · SL gốc 225 CHAI · [Excel Phần III] CHAI NHỰA', 'excel_III', 54),
('21b820da-a8d4-5dbf-bcb3-c3dc7a9a6095'::uuid, '2026-10-01'::date, 'ỐNG HUT GIẤY', 140000, 'vat_tu', (select id from ingredients where code = 'ong_hut' and org_id = o.org_id), '[Excel Phần III] ỐNG HUT GIẤY · SL gốc 1000 CÁI · [Excel Phần III] ỐNG HUT GIẤY', 'excel_III', 55),
('693e4216-0bae-598d-b276-3898945ace0b'::uuid, '2026-10-01'::date, 'DÂY THỪNG', 55000, 'vat_tu', (select id from ingredients where code = 'day_gai' and org_id = o.org_id), '[Excel Phần III] DÂY THỪNG · SL gốc 160M · [Excel Phần III] DÂY THỪNG', 'excel_III', 56),
('4cadf197-82dd-53ff-8632-8fde1d6f9bfe'::uuid, '2026-10-01'::date, 'LY GIẤY MANG ĐI', 113000, 'vat_tu', (select id from ingredients where code = 'ly_giay' and org_id = o.org_id), '[Excel Phần III] LY GIẤY MANG ĐI · SL gốc 50LY · [Excel Phần III] LY GIẤY MANG ĐI', 'excel_III', 57),
('db19f326-6331-51fe-b8c0-ef9c1e02ce23'::uuid, '2026-10-01'::date, 'QUAI XÁCH LY BẰNG LÁ', 83000, 'vat_tu', (select id from ingredients where code = 'quai_la' and org_id = o.org_id), '[Excel Phần III] QUAI XÁCH LY BẰNG LÁ · SL gốc 100 CÁI · [Excel Phần III] QUAI XÁCH LY BẰNG LÁ', 'excel_III', 58),
('0c1a9c82-178c-535d-9f02-8db371513af6'::uuid, '2026-10-01'::date, 'GIẤY CHỐNG TRÀN', 42000, 'vat_tu', (select id from ingredients where code = 'giay_chong_tran' and org_id = o.org_id), '[Excel Phần III] GIẤY CHỐNG TRÀN · SL gốc 500 TỜ · [Excel Phần III] GIẤY CHỐNG TRÀN', 'excel_III', 59),
('57dc2a48-34f8-5610-a1ac-c10880f9e188'::uuid, '2026-10-24'::date, 'Chổi phết dầu', 30000, 'dt_dung_cu', null, '[Excel Theo ngày] Chổi phết dầu · SL gốc 1.0', 'excel_ngay', 60),
('4599ab48-f6dd-5128-ae5e-3918fe96e959'::uuid, '2026-10-24'::date, 'Bắp', 30000, 'nl_chinh', (select id from ingredients where code = 'bap' and org_id = o.org_id), '[Excel Theo ngày] Bắp · SL gốc 3.0', 'excel_ngay', 61),
('3ad22b0b-e9da-55c3-9e9f-aece0acfe919'::uuid, '2026-10-24'::date, 'Hạt sen, bí đỏ test', 48000, 'thu_cong_thuc', null, '[Excel Theo ngày] Hạt sen, bí đỏ test · SL gốc 2.0', 'excel_ngay', 62),
('f1ee3972-df50-5b61-8e17-d7aefff94180'::uuid, '2026-10-24'::date, 'Bí đỏ, cà rốt, khoai, bắp', 68000, 'nl_chinh', null, '[Excel Theo ngày] Bí đỏ, cà rốt, khoai, bắp · SL gốc 4.0', 'excel_ngay', 63),
('3a1c11a0-c250-50ef-9e35-d8462b965332'::uuid, '2026-10-25'::date, 'Sốt Manine', 51000, 'phu_lieu', (select id from ingredients where code = 'sot_manine' and org_id = o.org_id), '[Excel Theo ngày] Sốt Manine · SL gốc 2.0', 'excel_ngay', 64),
('a77ab6ee-fe78-5e30-9565-9ef5159b8ca0'::uuid, '2026-10-26'::date, 'Ly giấy 360ml', 188700, 'vat_tu', (select id from ingredients where code = 'ly_giay' and org_id = o.org_id), '[Excel Theo ngày] Ly giấy 360ml · SL gốc 100.0 · Ly giấy 360ml; gồm Ly đường (100.0); gồm Băng dán (1.0); gồm Nắp trắng (100.0)', 'excel_ngay', 65),
('d86b2d82-27e9-5a20-a856-2bb8e7680cb3'::uuid, '2026-10-27'::date, 'Đậu đỏ', 120000, 'nl_chinh', (select id from ingredients where code = 'dau_do' and org_id = o.org_id), '[Excel Theo ngày] Đậu đỏ · SL gốc 1kg', 'excel_ngay', 66),
('0597f140-88a3-5e0c-adab-dc1d37b15f74'::uuid, '2026-10-27'::date, 'Mè đen', 70000, 'nl_chinh', (select id from ingredients where code = 'me' and org_id = o.org_id), '[Excel Theo ngày] Mè đen · SL gốc 1kg', 'excel_ngay', 67),
('c47cb895-e894-5dc6-ad73-eaa51d6edbef'::uuid, '2026-10-27'::date, 'Hộp nhựa, bịch 1-2 ngăn, tem dán, giấy note', 244000, 'vat_tu', null, '[Excel Theo ngày] Hộp nhựa, bịch 1-2 ngăn, tem dán, giấy note', 'excel_ngay', 68),
('7e909464-f727-5286-b670-44cff5e8dc80'::uuid, '2026-10-28'::date, 'Đổi tiền lẻ', 200000, 'khac', null, '[Excel Theo ngày] Đổi tiền lẻ · Tùng chốt 12/11: tính là chi phí', 'excel_ngay', 69),
('68b3490a-e64e-5231-9a8b-2a1800dc26bb'::uuid, '2026-10-28'::date, 'Cà rốt', 6000, 'nl_chinh', (select id from ingredients where code = 'ca_rot' and org_id = o.org_id), '[Excel Theo ngày] Cà rốt · SL gốc 2 củ', 'excel_ngay', 70),
('ce8d2f4b-76ac-5d6c-9d7b-258c41da0ad1'::uuid, '2026-10-28'::date, 'Bí đỏ', 20000, 'nl_chinh', (select id from ingredients where code = 'bi_do' and org_id = o.org_id), '[Excel Theo ngày] Bí đỏ · SL gốc 1 quả', 'excel_ngay', 71),
('ae50461f-7b5b-5bed-96ba-42c17cb96017'::uuid, '2026-10-28'::date, 'Cơm dừa', 25000, 'nl_chinh', (select id from ingredients where code = 'dua' and org_id = o.org_id), '[Excel Theo ngày] Cơm dừa · SL gốc 1 kg', 'excel_ngay', 72),
('2e1baad9-78b4-580c-8b5a-d662deae6c2b'::uuid, '2026-10-28'::date, 'Khoai mật', 20000, 'nl_chinh', (select id from ingredients where code = 'khoai' and org_id = o.org_id), '[Excel Theo ngày] Khoai mật · SL gốc 1 kg', 'excel_ngay', 73),
('7c5f193a-f458-5e38-8314-0917f014c524'::uuid, '2026-10-28'::date, 'In mã QR', 2000, 'khac', null, '[Excel Theo ngày] In mã QR · SL gốc 2.0', 'excel_ngay', 74),
('4ebcc0b8-62bc-5354-9796-d1fda658c89d'::uuid, '2026-10-28'::date, 'Hạt điều', 700000, 'nl_chinh', (select id from ingredients where code = 'dieu' and org_id = o.org_id), '[Excel Theo ngày] Hạt điều · SL gốc 5 kg', 'excel_ngay', 75),
('4ed6ed51-392f-54ac-8ee7-feb6f1b0c7a8'::uuid, '2026-10-29'::date, 'Đường phèn, đường thốt nốt', 161000, 'phu_lieu', null, '[Excel Theo ngày] Đường phèn, đường thốt nốt · SL gốc 2.0 · Đường phèn; gồm Đường thốt nốt (3.0)', 'excel_ngay', 76),
('73354151-55b6-5c42-a7ae-2a27ed63971b'::uuid, '2026-10-29'::date, 'Bắp', 40000, 'nl_chinh', (select id from ingredients where code = 'bap' and org_id = o.org_id), '[Excel Theo ngày] Bắp · SL gốc 8.0', 'excel_ngay', 77),
('9e6be622-ab33-5326-8ceb-bcf90d9b96d6'::uuid, '2026-10-29'::date, 'Bí đỏ', 20000, 'nl_chinh', (select id from ingredients where code = 'bi_do' and org_id = o.org_id), '[Excel Theo ngày] Bí đỏ · SL gốc 1 quả', 'excel_ngay', 78),
('12660558-4d28-5cde-8968-6c784a958451'::uuid, '2026-10-29'::date, 'Khoai mật', 20000, 'nl_chinh', (select id from ingredients where code = 'khoai' and org_id = o.org_id), '[Excel Theo ngày] Khoai mật · SL gốc 1 kg', 'excel_ngay', 79),
('f01982a4-5450-5f8d-be0f-7a1cae3e0fe4'::uuid, '2026-10-29'::date, 'Cơm dừa', 25000, 'nl_chinh', (select id from ingredients where code = 'dua' and org_id = o.org_id), '[Excel Theo ngày] Cơm dừa · SL gốc 1 kg', 'excel_ngay', 80),
('95757a25-f838-51f2-83a1-f8eaf1dfff7e'::uuid, '2026-10-29'::date, 'Tiền rác', 90000, 've_sinh', null, '[Excel Theo ngày] Tiền rác · SL gốc 1.0', 'excel_ngay', 81),
('08dd8786-a800-5ea8-92ca-4a56c8beb016'::uuid, '2026-10-30'::date, 'Hạt óc chó, dây thừng', 273000, 'nl_khac', null, '[Excel Theo ngày] Hạt óc chó, dây thừng', 'excel_ngay', 82)
) as v(cid, d, item, amt, cat, ing, note, ref, rn)
join public.expense_categories c on c.org_id = o.org_id and c.code = v.cat and c.valid_to is null
where o.id = '3e1f4df8-6dcb-4593-85a4-2bef47468f42'::uuid
on conflict do nothing;
-- Knote chi phí
insert into public.expenses (outlet_id, client_id, spent_on, category, amount_vnd, note, source, status, created_by,
                             category_id, item_name, ingredient_id, import_ref, import_row)
select o.id, v.cid, v.d, c.legacy_category, v.amt, v.note, 'import', 'active', '2e8b7277-123f-4b66-8475-eb01a5266e0d'::uuid,
       c.id, v.item, v.ing, v.ref, v.rn
from public.outlets o
cross join lateral (values
('f29422e4-ce61-5dc3-92cf-2814d2e7d121'::uuid, '2026-11-03'::date, 'nước đá', 30000, 'phu_lieu', null, '[Knote · Nước] nước đá · Tùng 12/11: đá xếp Phụ liệu', 'knote_cp', 1),
('2a23e89c-eba3-5275-821b-7e957d11430a'::uuid, '2026-11-04'::date, 'đường', 231000, 'phu_lieu', (select id from ingredients where code = 'thot_not' and org_id = o.org_id), '[Knote · Nhập hàng] đường · Tùng 12/11: đường thốt nốt', 'knote_cp', 2),
('df08819e-c031-512b-8608-e849f792c9fc'::uuid, '2026-11-04'::date, 'Dù', 880000, 'dt_xe_quay', null, '[Knote · Khác] Dù', 'knote_cp', 3),
('c2c7867d-5114-5ba4-8660-f6c4db74dff0'::uuid, '2026-11-04'::date, 'mặt bằng', 5000000, 'mat_bang', null, '[Knote · Mặt bằng] mặt bằng · Tùng 12/11: tạm tính là tiền thuê tháng 11', 'knote_cp', 4),
('e377ad0f-f90f-5c1a-b660-2ce3a1230db1'::uuid, '2026-11-05'::date, '4 chai mẫu', 35000, 'dt_dung_cu', null, '[Knote · Khác] 4 chai mẫu · Tùng 12/11: không trùng, mua 2 lần', 'knote_cp', 5),
('7ded5348-0129-5f4b-a10a-d89d2cd3eda5'::uuid, '2026-11-05'::date, '4 chai mẫu', 35000, 'dt_dung_cu', null, '[Knote · Khác] 4 chai mẫu · Tùng 12/11: không trùng, mua 2 lần', 'knote_cp', 6),
('03423be7-9c0d-55f2-a680-0109f2dca674'::uuid, '2026-11-05'::date, 'matcha', 128000, 'phu_lieu', (select id from ingredients where code = 'matcha' and org_id = o.org_id), '[Knote · Nhập hàng] matcha', 'knote_cp', 7),
('9a6c13c6-99be-5645-8930-8fb5aa8ef0f7'::uuid, '2026-11-05'::date, 'nhập hàng', 485000, 'nl_chinh', null, '[Knote · Nhập hàng] nhập hàng · Tùng 12/11: tạm xếp Nguyên liệu chính, chưa rõ mua gì', 'knote_cp', 8),
('da3f511d-b1b2-56ec-8fdc-24de3b165260'::uuid, '2026-11-05'::date, 'nước đá', 20000, 'phu_lieu', null, '[Knote · Nước] nước đá · Tùng 12/11: đá xếp Phụ liệu', 'knote_cp', 9),
('7fe9f243-dc27-5c65-8582-4a2be7c8e989'::uuid, '2026-11-05'::date, 'bắp', 28000, 'nl_chinh', (select id from ingredients where code = 'bap' and org_id = o.org_id), '[Knote · Nhập hàng] bắp', 'knote_cp', 10),
('a1a955e5-257c-59b2-8b57-26b42acbaa97'::uuid, '2026-11-06'::date, 'thanh long', 10000, 'nl_chinh', (select id from ingredients where code = 'thanh_long' and org_id = o.org_id), '[Knote · Nhập hàng] thanh long', 'knote_cp', 11),
('c060d67c-c767-548e-90e8-ef356d1ef0a9'::uuid, '2026-11-06'::date, 'bắp', 24000, 'nl_chinh', (select id from ingredients where code = 'bap' and org_id = o.org_id), '[Knote · Nhập hàng] bắp', 'knote_cp', 12),
('107c2425-aab7-5889-b1dd-647650251d23'::uuid, '2026-11-08'::date, 'đá', 13000, 'phu_lieu', null, '[Knote · Nhập hàng] đá · Tùng 12/11: đá xếp Phụ liệu', 'knote_cp', 13),
('a59eaa27-7eb2-5bfa-991f-92744856309e'::uuid, '2026-11-08'::date, 'nhập hàng thanh long', 30000, 'nl_chinh', (select id from ingredients where code = 'thanh_long' and org_id = o.org_id), '[Knote · Nhập hàng] nhập hàng thanh long', 'knote_cp', 14),
('c7bf93ef-1c36-5d87-99a3-e2de4409c835'::uuid, '2026-11-08'::date, 'bí đỏ', 30000, 'nl_chinh', (select id from ingredients where code = 'bi_do' and org_id = o.org_id), '[Knote · Nhập hàng] bí đỏ', 'knote_cp', 15),
('5d4b9415-532a-58be-ad63-a9edea5fca7b'::uuid, '2026-11-09'::date, 'đường', 112000, 'phu_lieu', (select id from ingredients where code = 'thot_not' and org_id = o.org_id), '[Knote · Nhập hàng] đường · Tùng 12/11: đường thốt nốt', 'knote_cp', 16),
('909abe36-cf4e-5e71-a370-262b4fe4fdf6'::uuid, '2026-11-09'::date, 'bắp', 48000, 'nl_chinh', (select id from ingredients where code = 'bap' and org_id = o.org_id), '[Knote · Nhập hàng] bắp', 'knote_cp', 17),
('6694403d-8315-5b9a-976b-077c5084e75f'::uuid, '2026-11-10'::date, 'mã qr', 24000, 'khac', null, '[Knote · Khác] mã qr', 'knote_cp', 18),
('f45cccf0-8ec7-516f-a625-991644ff3459'::uuid, '2026-11-10'::date, '10kg đường', 340000, 'phu_lieu', (select id from ingredients where code = 'thot_not' and org_id = o.org_id), '[Knote · Nhập hàng] 10kg đường · Tùng 12/11: đường thốt nốt', 'knote_cp', 19),
('e84a5dc4-2a4c-51a3-9934-300e18deecdb'::uuid, '2026-11-10'::date, '5kg điều', 700000, 'nl_chinh', (select id from ingredients where code = 'dieu' and org_id = o.org_id), '[Knote · Nhập hàng] 5kg điều', 'knote_cp', 20),
('d37ecc8d-ea5c-58ac-aa18-d284d76656c0'::uuid, '2026-11-11'::date, 'pin cân', 8000, 'khac', null, '[Knote · Khác] pin cân', 'knote_cp', 21),
('f4a26efa-ff67-5bc5-b492-49d04b8ced26'::uuid, '2026-11-11'::date, 'cacao', 85000, 'phu_lieu', (select id from ingredients where code = 'cacao' and org_id = o.org_id), '[Knote · Nhập hàng] cacao', 'knote_cp', 22),
('5a092ec0-ad18-5b77-a914-a20bb2e1d504'::uuid, '2026-11-11'::date, 'đá', 20000, 'phu_lieu', null, '[Knote · Nhập hàng] đá · Tùng 12/11: đá xếp Phụ liệu', 'knote_cp', 23)
) as v(cid, d, item, amt, cat, ing, note, ref, rn)
join public.expense_categories c on c.org_id = o.org_id and c.code = v.cat and c.valid_to is null
where o.id = '3e1f4df8-6dcb-4593-85a4-2bef47468f42'::uuid
on conflict do nothing;
do $$ begin
  if (select count(*) from expenses where outlet_id='3e1f4df8-6dcb-4593-85a4-2bef47468f42' and import_ref in ('excel_I','excel_II','excel_III','excel_ngay') and status='active') <> 82 then raise exception 'Excel: số dòng lệch'; end if;
  if (select sum(amount_vnd) from expenses where outlet_id='3e1f4df8-6dcb-4593-85a4-2bef47468f42' and import_ref in ('excel_I','excel_II','excel_III','excel_ngay') and status='active') <> 22327200 then raise exception 'Excel: tổng tiền lệch'; end if;
  if (select coalesce(sum(e.amount_vnd),0) from expenses e join expense_categories c on c.id=e.category_id where e.outlet_id='3e1f4df8-6dcb-4593-85a4-2bef47468f42' and e.import_ref in ('excel_I','excel_II','excel_III','excel_ngay') and e.status='active' and c.group_code='dau_tu') <> 15935000 then raise exception 'Excel: nhóm dau_tu lệch'; end if;
  if (select coalesce(sum(e.amount_vnd),0) from expenses e join expense_categories c on c.id=e.category_id where e.outlet_id='3e1f4df8-6dcb-4593-85a4-2bef47468f42' and e.import_ref in ('excel_I','excel_II','excel_III','excel_ngay') and e.status='active' and c.group_code='nguyen_lieu') <> 3558500 then raise exception 'Excel: nhóm nguyen_lieu lệch'; end if;
  if (select coalesce(sum(e.amount_vnd),0) from expenses e join expense_categories c on c.id=e.category_id where e.outlet_id='3e1f4df8-6dcb-4593-85a4-2bef47468f42' and e.import_ref in ('excel_I','excel_II','excel_III','excel_ngay') and e.status='active' and c.group_code='van_hanh') <> 778000 then raise exception 'Excel: nhóm van_hanh lệch'; end if;
  if (select coalesce(sum(e.amount_vnd),0) from expenses e join expense_categories c on c.id=e.category_id where e.outlet_id='3e1f4df8-6dcb-4593-85a4-2bef47468f42' and e.import_ref in ('excel_I','excel_II','excel_III','excel_ngay') and e.status='active' and c.group_code='vat_tu') <> 2055700 then raise exception 'Excel: nhóm vat_tu lệch'; end if;
end $$;
do $$ begin
  if (select count(*) from expenses where outlet_id='3e1f4df8-6dcb-4593-85a4-2bef47468f42' and import_ref in ('knote_cp') and status='active') <> 23 then raise exception 'Knote chi phí: số dòng lệch'; end if;
  if (select sum(amount_vnd) from expenses where outlet_id='3e1f4df8-6dcb-4593-85a4-2bef47468f42' and import_ref in ('knote_cp') and status='active') <> 8316000 then raise exception 'Knote chi phí: tổng tiền lệch'; end if;
  if (select coalesce(sum(e.amount_vnd),0) from expenses e join expense_categories c on c.id=e.category_id where e.outlet_id='3e1f4df8-6dcb-4593-85a4-2bef47468f42' and e.import_ref in ('knote_cp') and e.status='active' and c.group_code='dau_tu') <> 950000 then raise exception 'Knote chi phí: nhóm dau_tu lệch'; end if;
  if (select coalesce(sum(e.amount_vnd),0) from expenses e join expense_categories c on c.id=e.category_id where e.outlet_id='3e1f4df8-6dcb-4593-85a4-2bef47468f42' and e.import_ref in ('knote_cp') and e.status='active' and c.group_code='nguyen_lieu') <> 2334000 then raise exception 'Knote chi phí: nhóm nguyen_lieu lệch'; end if;
  if (select coalesce(sum(e.amount_vnd),0) from expenses e join expense_categories c on c.id=e.category_id where e.outlet_id='3e1f4df8-6dcb-4593-85a4-2bef47468f42' and e.import_ref in ('knote_cp') and e.status='active' and c.group_code='van_hanh') <> 5032000 then raise exception 'Knote chi phí: nhóm van_hanh lệch'; end if;
end $$;
