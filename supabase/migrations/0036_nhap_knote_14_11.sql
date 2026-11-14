-- 0036 · Nhập 15 đơn ngày 14/11/2026 từ Knote vào cơ sở Phan Văn Hớn (ảnh Tùng gửi 14/11 17:47 và 17:50).
-- 15 đơn, 22 phần, thu 520,000 đ, khớp tổng ngày trên Knote. Cùng cách với 0029: source='import', import_ref='knote',
-- client_id = uuid v5 theo mã đơn; giá theo Knote; không tạo bản ghi nấu, không đổi tồn kho. Mọi dòng là chai.
-- Trước khi nhập, ngày 14/11 ở cơ sở này chưa có đơn nào trong app (đã kiểm tra), nên seq_in_day bắt đầu từ 1.
-- Món Knote "Đậu đỏ, thêm topping" 25.000 đ (3 phần, 2 đơn lúc 09:58) không có trong app: ghi vào Mầm Đỏ Hồng Hào,
-- giữ giá Knote, cùng cách đã làm với "Riêng bí đỏ" ở 0029. Cần hỏi Hà món này thật ra là gì.

with v(cid, d, seq, at, total, disc, reason, pay, note, cust, code) as (values
('b920c469-c6b2-5d53-a528-0cb840e0d231'::uuid, '2026-11-14'::date, 1, '2026-11-14 07:25:00+07'::timestamptz, 50000, 0, null, 'cash', 'Knote KN-20261114-0725-1', 'Khách lẻ', 'KN-20261114-0725-1'),
('4ba94ff2-088d-5416-9a16-ff674fe4a0e6'::uuid, '2026-11-14'::date, 2, '2026-11-14 07:26:00+07'::timestamptz, 30000, 0, null, 'cash', 'Knote KN-20261114-0726-1 · khách: chú chủ nhà', 'chú chủ nhà', 'KN-20261114-0726-1'),
('2a177abc-eb53-5a0f-9544-eea4932dd4d6'::uuid, '2026-11-14'::date, 3, '2026-11-14 07:32:00+07'::timestamptz, 15000, 0, null, 'cash', 'Knote KN-20261114-0732-1', 'Khách lẻ', 'KN-20261114-0732-1'),
('e2d30270-2cd7-53db-a56d-b81f6ecc1987'::uuid, '2026-11-14'::date, 4, '2026-11-14 07:45:00+07'::timestamptz, 15000, 0, null, 'cash', 'Knote KN-20261114-0745-1 · khách: anh sửa xe', 'anh sửa xe', 'KN-20261114-0745-1'),
('da70d651-d32a-5191-9130-d1fc182bff63'::uuid, '2026-11-14'::date, 5, '2026-11-14 08:57:00+07'::timestamptz, 30000, 0, null, 'cash', 'Knote KN-20261114-0857-1', 'Khách lẻ', 'KN-20261114-0857-1'),
('bb7b1308-f4e3-5499-985f-e7044dac06a0'::uuid, '2026-11-14'::date, 6, '2026-11-14 09:10:00+07'::timestamptz, 60000, 0, null, 'cash', 'Knote KN-20261114-0910-1', 'Khách lẻ', 'KN-20261114-0910-1'),
('34a611ab-65d4-5433-9c2b-33871b20ebb6'::uuid, '2026-11-14'::date, 7, '2026-11-14 09:42:00+07'::timestamptz, 30000, 0, null, 'cash', 'Knote KN-20261114-0942-1', 'Khách lẻ', 'KN-20261114-0942-1'),
('297cbebb-ee3b-5149-9ef2-849b9c2c37f3'::uuid, '2026-11-14'::date, 8, '2026-11-14 09:58:00+07'::timestamptz, 50000, 0, null, 'cash', 'Knote KN-20261114-0958-1 · khách: a bí đỏ · Knote ghi món "Đậu đỏ", thêm topping, 25.000 đ/phần; ghi vào Mầm Đỏ Hồng Hào', 'a bí đỏ', 'KN-20261114-0958-1'),
('1503f525-953c-552e-9390-56f8edf3b15c'::uuid, '2026-11-14'::date, 9, '2026-11-14 09:58:00+07'::timestamptz, 50000, 0, null, 'cash', 'Knote KN-20261114-0958-2 · Knote ghi 1 món "Đậu đỏ", thêm topping, 25.000 đ; ghi vào Mầm Đỏ Hồng Hào', 'Khách lẻ', 'KN-20261114-0958-2'),
('cdb84d57-462d-5582-9665-432cd584c927'::uuid, '2026-11-14'::date, 10, '2026-11-14 10:02:00+07'::timestamptz, 35000, 0, null, 'cash', 'Knote KN-20261114-1002-1', 'Khách lẻ', 'KN-20261114-1002-1'),
('0b7a59fb-c3f7-51f7-80b3-ee9463c33ccd'::uuid, '2026-11-14'::date, 11, '2026-11-14 10:18:00+07'::timestamptz, 30000, 0, null, 'cash', 'Knote KN-20261114-1018-1', 'Khách lẻ', 'KN-20261114-1018-1'),
('3be5846f-ce4f-50ad-980d-de3046b2587c'::uuid, '2026-11-14'::date, 12, '2026-11-14 11:23:00+07'::timestamptz, 30000, 0, null, 'cash', 'Knote KN-20261114-1123-1', 'Khách lẻ', 'KN-20261114-1123-1'),
('5baa5932-e4ca-5a21-80e2-f7c932d6816c'::uuid, '2026-11-14'::date, 13, '2026-11-14 11:36:00+07'::timestamptz, 60000, 0, null, 'cash', 'Knote KN-20261114-1136-1', 'Khách lẻ', 'KN-20261114-1136-1'),
('f80b0178-f66c-50a7-b804-ccae3fd63d14'::uuid, '2026-11-14'::date, 14, '2026-11-14 14:12:00+07'::timestamptz, 15000, 0, null, 'transfer', 'Knote KN-20261114-1412-1', 'Khách lẻ', 'KN-20261114-1412-1'),
('828d53fa-85ee-5c6d-87c3-6d9181219680'::uuid, '2026-11-14'::date, 15, '2026-11-14 15:55:00+07'::timestamptz, 20000, 0, null, 'transfer', 'Knote KN-20261114-1555-1 · khách: hà', 'hà', 'KN-20261114-1555-1')
)
insert into public.orders (id, outlet_id, client_id, seq_in_day, business_date, placed_at, channel, status, is_gift, total_vnd,
                           discount_vnd, discount_reason, payment_method, note, created_by, source, import_ref, customer_name)
select v.cid, '3e1f4df8-6dcb-4593-85a4-2bef47468f42'::uuid, v.cid, v.seq, v.d, v.at, 'counter', 'active', false, v.total, v.disc, v.reason, v.pay, v.note,
       '2e8b7277-123f-4b66-8475-eb01a5266e0d'::uuid, 'import', 'knote', v.cust
from v
where not exists (select 1 from public.orders o where o.outlet_id = '3e1f4df8-6dcb-4593-85a4-2bef47468f42' and o.business_date = '2026-11-14' and o.source <> 'import')
on conflict do nothing;

with v(oid, pcode, qty, price, lt) as (values
('b920c469-c6b2-5d53-a528-0cb840e0d231'::uuid, 'stt', 2, 25000, 50000),
('4ba94ff2-088d-5416-9a16-ff674fe4a0e6'::uuid, 'mv', 2, 15000, 30000),
('2a177abc-eb53-5a0f-9544-eea4932dd4d6'::uuid, 'mv', 1, 15000, 15000),
('e2d30270-2cd7-53db-a56d-b81f6ecc1987'::uuid, 'md', 1, 15000, 15000),
('da70d651-d32a-5191-9130-d1fc182bff63'::uuid, 'tcc', 1, 30000, 30000),
('bb7b1308-f4e3-5499-985f-e7044dac06a0'::uuid, 'tmc', 2, 30000, 60000),
('34a611ab-65d4-5433-9c2b-33871b20ebb6'::uuid, 'tcc', 1, 30000, 30000),
('297cbebb-ee3b-5149-9ef2-849b9c2c37f3'::uuid, 'md', 2, 25000, 50000),
('1503f525-953c-552e-9390-56f8edf3b15c'::uuid, 'stt', 1, 25000, 25000),
('1503f525-953c-552e-9390-56f8edf3b15c'::uuid, 'md', 1, 25000, 25000),
('cdb84d57-462d-5582-9665-432cd584c927'::uuid, 'mv', 1, 15000, 15000),
('cdb84d57-462d-5582-9665-432cd584c927'::uuid, 'sh', 1, 20000, 20000),
('0b7a59fb-c3f7-51f7-80b3-ee9463c33ccd'::uuid, 'tcc', 1, 30000, 30000),
('3be5846f-ce4f-50ad-980d-de3046b2587c'::uuid, 'tmc', 1, 30000, 30000),
('5baa5932-e4ca-5a21-80e2-f7c932d6816c'::uuid, 'tcc', 2, 30000, 60000),
('f80b0178-f66c-50a7-b804-ccae3fd63d14'::uuid, 'mden', 1, 15000, 15000),
('828d53fa-85ee-5c6d-87c3-6d9181219680'::uuid, 'sh', 1, 20000, 20000)
)
insert into public.order_lines (order_id, product_id, qty, unit_price_vnd, line_total_vnd)
select v.oid, p.id, v.qty, v.price, v.lt
from v
join public.orders o on o.id = v.oid
join public.outlets ot on ot.id = o.outlet_id
join public.products p on p.org_id = ot.org_id and p.code = v.pcode
where not exists (select 1 from public.order_lines x where x.order_id = v.oid and x.product_id = p.id);

-- Kiểm tra: select count(*), sum(total_vnd) from orders where outlet_id='3e1f4df8-…' and business_date='2026-11-14' and status='active'
--   → 15 đơn, 520000. select sum(qty) from order_lines … → 22.
