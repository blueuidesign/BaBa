-- 0027 · Bán lại 5 món đã ngừng ở 0012 (Tùng 13/11: còn nguyên liệu nên bán tiếp, sẽ bỏ sau).
-- Giữ nguyên giá và công thức cũ của từng món. Hai món mới (sme, lgl) vẫn giữ.
update public.products p set status = 'active', sort_order = v.so
from public.orgs o, (values
  ('md',1),('mv',2),('mden',3),
  ('sh',4),('smt',5),('sme',6),
  ('stt',7),('lnb',8),('lvx',9),('lnl',10),('lgl',11),
  ('tmc',12),('tcc',13),('tcb',14)
) as v(code, so)
where o.id = p.org_id and o.code = 'baba' and p.code = v.code;

-- Bật lại trên mọi cơ sở (0012 đã tắt hết nên không còn biết cơ sở nào từng tắt riêng)
insert into public.outlet_menu (outlet_id, product_id, enabled, sort_order)
select ot.id, p.id, true, p.sort_order
from public.outlets ot join public.products p on p.org_id = ot.org_id and p.code in ('smt','lnb','lvx','lnl','tcb')
on conflict (outlet_id, product_id) do update set enabled = true;
update public.outlet_menu m set sort_order = p.sort_order from public.products p where p.id = m.product_id;

-- Cold Brew cần lại cốt cold brew và cà phê (0014 đã cho ngừng)
update public.ingredients set status = 'active' where code in ('cot', 'caphe');
update public.batch_recipes set status = 'approved' where code = 'cot';

-- Kiểm tra: select code, name, status, sort_order from products order by sort_order;  -- 14 món active
