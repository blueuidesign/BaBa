-- 0029 · Nhập 13 đơn ngày 13/11/2026 từ Knote vào cơ sở Phan Văn Hớn (ảnh Tùng gửi 13/11 19:24 và 19:34).
-- 13 đơn, 14 phần, thu 295,000 đ, khớp tổng ngày trên Knote. Cùng cách với 0020: source='import', import_ref='knote',
-- client_id = uuid v5 theo mã đơn; giá theo Knote; không tạo bản ghi nấu, không đổi tồn kho.
-- seq_in_day bắt đầu từ 2 vì số 1 là đơn demo đã hủy ở 0026.

with v(cid, d, seq, at, total, disc, reason, pay, note, cust, code) as (values
('e662f942-83b0-574b-ba7d-4abe33847277'::uuid, '2026-11-13'::date, 2, '2026-11-13 06:42:00+07'::timestamptz, 30000, 0, null, 'cash', 'Knote KN-20261113-0642-1 · khách: chú chủ nhà', 'chú chủ nhà', 'KN-20261113-0642-1'),
('f7a01834-3a30-5ab7-9e54-84ed5061a000'::uuid, '2026-11-13'::date, 3, '2026-11-13 06:43:00+07'::timestamptz, 20000, 0, null, 'cash', 'Knote KN-20261113-0643-1 · khách: anh sửa xe', 'anh sửa xe', 'KN-20261113-0643-1'),
('f08e4653-08fd-593b-b8f3-967fc418efd3'::uuid, '2026-11-13'::date, 4, '2026-11-13 07:12:00+07'::timestamptz, 20000, 0, null, 'cash', 'Knote KN-20261113-0712-1 · khách: mẹ thầy', 'mẹ thầy', 'KN-20261113-0712-1'),
('328d5863-9cc8-5143-9695-945efb122b30'::uuid, '2026-11-13'::date, 5, '2026-11-13 07:14:00+07'::timestamptz, 20000, 0, null, 'cash', 'Knote KN-20261113-0714-1', 'Khách lẻ', 'KN-20261113-0714-1'),
('8017fe8c-1180-52d0-8a74-b2f51ca03b5a'::uuid, '2026-11-13'::date, 6, '2026-11-13 07:32:00+07'::timestamptz, 20000, 0, null, 'cash', 'Knote KN-20261113-0732-1', 'Khách lẻ', 'KN-20261113-0732-1'),
('818e4f8b-8c15-54a5-bc74-f6550ef4df46'::uuid, '2026-11-13'::date, 7, '2026-11-13 07:36:00+07'::timestamptz, 30000, 0, null, null, 'Knote KN-20261113-0736-1 · trả cả tiền mặt và chuyển khoản', 'Khách lẻ', 'KN-20261113-0736-1'),
('d249ede1-c72b-51b6-aaab-e24193fb4e2d'::uuid, '2026-11-13'::date, 8, '2026-11-13 08:18:00+07'::timestamptz, 25000, 0, null, 'cash', 'Knote KN-20261113-0818-1', 'Khách lẻ', 'KN-20261113-0818-1'),
('f3291274-a086-584d-aaf9-b9ba1134b4b7'::uuid, '2026-11-13'::date, 9, '2026-11-13 08:26:00+07'::timestamptz, 20000, 0, null, 'cash', 'Knote KN-20261113-0826-1', 'Khách lẻ', 'KN-20261113-0826-1'),
('49e59f7a-3f35-5f39-a6d2-e9c67fe13920'::uuid, '2026-11-13'::date, 10, '2026-11-13 08:50:00+07'::timestamptz, 25000, 0, null, 'cash', 'Knote KN-20261113-0850-1', 'Khách lẻ', 'KN-20261113-0850-1'),
('9b468adf-f164-59cd-9554-f0f7eafa82f8'::uuid, '2026-11-13'::date, 11, '2026-11-13 09:19:00+07'::timestamptz, 25000, 0, null, 'cash', 'Knote KN-20261113-0919-1', 'Khách lẻ', 'KN-20261113-0919-1'),
('fa5b33cd-f9a5-536d-a49e-6bcd5b7165b5'::uuid, '2026-11-13'::date, 12, '2026-11-13 09:20:00+07'::timestamptz, 30000, 0, null, 'cash', 'Knote KN-20261113-0920-1 · Knote ghi món "Riêng bí đỏ", thêm topping, 30.000 đ; ghi vào Mầm Sáng Trí Tuệ', 'Khách lẻ', 'KN-20261113-0920-1'),
('c60971f3-6786-53b0-be55-bba067eb7cda'::uuid, '2026-11-13'::date, 13, '2026-11-13 18:23:00+07'::timestamptz, 15000, 0, null, null, 'Knote KN-20261113-1823-1 · khách: Thầy · Knote chưa bấm Nhận đủ tiền', 'Thầy', 'KN-20261113-1823-1'),
('44869b7f-042b-5cd1-a2e2-23ccefb0d57d'::uuid, '2026-11-13'::date, 14, '2026-11-13 18:24:00+07'::timestamptz, 15000, 0, null, 'transfer', 'Knote KN-20261113-1824-1 · khách: mẹ thầy', 'mẹ thầy', 'KN-20261113-1824-1')
)
insert into public.orders (id, outlet_id, client_id, seq_in_day, business_date, placed_at, channel, status, is_gift, total_vnd,
                           discount_vnd, discount_reason, payment_method, note, created_by, source, import_ref, customer_name)
select v.cid, '3e1f4df8-6dcb-4593-85a4-2bef47468f42'::uuid, v.cid, v.seq, v.d, v.at, 'counter', 'active', false, v.total, v.disc, v.reason, v.pay, v.note,
       '2e8b7277-123f-4b66-8475-eb01a5266e0d'::uuid, 'import', 'knote', v.cust
from v
on conflict do nothing;

with v(oid, pcode, qty, price, lt) as (values
('e662f942-83b0-574b-ba7d-4abe33847277'::uuid, 'mv', 2, 15000, 30000),
('f7a01834-3a30-5ab7-9e54-84ed5061a000'::uuid, 'lvx', 1, 20000, 20000),
('f08e4653-08fd-593b-b8f3-967fc418efd3'::uuid, 'sh', 1, 20000, 20000),
('328d5863-9cc8-5143-9695-945efb122b30'::uuid, 'sh', 1, 20000, 20000),
('8017fe8c-1180-52d0-8a74-b2f51ca03b5a'::uuid, 'sh', 1, 20000, 20000),
('818e4f8b-8c15-54a5-bc74-f6550ef4df46'::uuid, 'tmc', 1, 30000, 30000),
('d249ede1-c72b-51b6-aaab-e24193fb4e2d'::uuid, 'stt', 1, 25000, 25000),
('f3291274-a086-584d-aaf9-b9ba1134b4b7'::uuid, 'sh', 1, 20000, 20000),
('49e59f7a-3f35-5f39-a6d2-e9c67fe13920'::uuid, 'stt', 1, 25000, 25000),
('9b468adf-f164-59cd-9554-f0f7eafa82f8'::uuid, 'stt', 1, 25000, 25000),
('fa5b33cd-f9a5-536d-a49e-6bcd5b7165b5'::uuid, 'stt', 1, 30000, 30000),
('c60971f3-6786-53b0-be55-bba067eb7cda'::uuid, 'mv', 1, 15000, 15000),
('44869b7f-042b-5cd1-a2e2-23ccefb0d57d'::uuid, 'mv', 1, 15000, 15000)
)
insert into public.order_lines (order_id, product_id, qty, unit_price_vnd, line_total_vnd)
select v.oid, p.id, v.qty, v.price, v.lt
from v
join public.orders o on o.id = v.oid
join public.outlets ot on ot.id = o.outlet_id
join public.products p on p.org_id = ot.org_id and p.code = v.pcode
where not exists (select 1 from public.order_lines x where x.order_id = v.oid);
