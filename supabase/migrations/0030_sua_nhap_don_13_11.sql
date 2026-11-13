-- 0030 · Sửa lần nhập 0029 (đơn Knote 13/11, Phan Văn Hớn).
-- Chuyện gì: lúc 18:22 đã có 2 đơn ghi thẳng trong app (mỗi đơn 1 Mầm Vàng Thơm Ngon, số thứ tự 2 và 3). 0029 không biết nên:
--   a) 2 đơn sáng 06:42 và 06:43 định dùng số 2, 3 bị bỏ qua (trùng số thứ tự)  → thêm lại với số 15, 16;
--   b) 2 đơn Knote 18:23, 18:24 chính là 2 đơn đã ghi trong app                 → hủy bản nhập (bản ghi đảo), giữ đơn trong app.
-- Sau khi chạy: 13 đơn, 14 phần, 295.000 đ, khớp Knote.
with v(cid, seq, at, total, pay, note, cust, pcode, qty, price) as (values
('e662f942-83b0-574b-ba7d-4abe33847277'::uuid, 15, '2026-11-13 06:42:00+07'::timestamptz, 30000, 'cash', 'Knote KN-20261113-0642-1 · khách: chú chủ nhà', 'chú chủ nhà', 'mv', 2, 15000),
('f7a01834-3a30-5ab7-9e54-84ed5061a000'::uuid, 16, '2026-11-13 06:43:00+07'::timestamptz, 20000, 'cash', 'Knote KN-20261113-0643-1 · khách: anh sửa xe', 'anh sửa xe', 'lvx', 1, 20000)
), ins as (
  insert into public.orders (id, outlet_id, client_id, seq_in_day, business_date, placed_at, channel, status, is_gift, total_vnd,
                             discount_vnd, payment_method, note, created_by, source, import_ref, customer_name)
  select v.cid, '3e1f4df8-6dcb-4593-85a4-2bef47468f42'::uuid, v.cid, v.seq, '2026-11-13'::date, v.at, 'counter', 'active', false, v.total, 0, v.pay, v.note,
         '2e8b7277-123f-4b66-8475-eb01a5266e0d'::uuid, 'import', 'knote', v.cust
  from v on conflict do nothing returning id
)
insert into public.order_lines (order_id, product_id, qty, unit_price_vnd, line_total_vnd)
select v.cid, p.id, v.qty, v.price, v.qty * v.price
from v join ins on ins.id = v.cid
join public.products p on p.code = v.pcode
join public.orgs o on o.id = p.org_id and o.code = 'baba';

update public.orders set status = 'reversed'
 where id in ('c60971f3-6786-53b0-be55-bba067eb7cda', '44869b7f-042b-5cd1-a2e2-23ccefb0d57d') and status = 'active';
insert into public.orders (outlet_id, seq_in_day, business_date, channel, status, reversal_of, reversal_reason, total_vnd)
select o.outlet_id, -o.seq_in_day, o.business_date, o.channel, 'reversal', o.id, 'Nhập trùng từ Knote: đơn này đã ghi trong app lúc 18:22', 0
from public.orders o
 where o.id in ('c60971f3-6786-53b0-be55-bba067eb7cda', '44869b7f-042b-5cd1-a2e2-23ccefb0d57d')
   and not exists (select 1 from public.orders r where r.reversal_of = o.id);
