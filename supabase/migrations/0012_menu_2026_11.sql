-- 0012_menu_2026_11: thực đơn 9 món theo biên bản họp 11/11/2026 (mục 8)
-- Món bỏ không xóa: chuyển status 'retired', tắt trên mọi cơ sở. Đơn cũ vẫn trỏ được tới món cũ.
-- Món mới chưa có giá: thêm vào outlet_menu ở trạng thái tắt; bật khi admin nhập giá.

-- 1. Đổi tên, đổi dòng
update public.products p set name = v.name, short_name = v.short_name, line = v.line, sort_order = v.sort_order
from public.orgs o, (values
  ('md',   'Mầm Đỏ Hồng Đào',    'Đỏ Hồng Đào',    'xanh', 1),
  ('mv',   'Mầm Vàng Thơm Ngon', 'Vàng Thơm Ngon', 'xanh', 2),
  ('mden', 'Mầm Đen Khỏe Mạnh',  'Đen Khỏe Mạnh',  'xanh', 3),
  ('sh',   'Mầm Sáng Hồng Đào',  'Sáng Hồng Đào',  'sang', 4),
  ('stt',  'Mầm Sáng Trí Tuệ',   'Sáng Trí Tuệ',   'lanh', 6),
  ('tmc',  'Matcha',             'Matcha',         'tre',  8),
  ('tcc',  'Cacao',              'Cacao',          'tre',  9)
) as v(code, name, short_name, line, sort_order)
where o.id = p.org_id and o.code = 'baba' and p.code = v.code;

-- 2. Ngừng bán 5 món
update public.products p set status = 'retired', sort_order = 100 + p.sort_order
from public.orgs o where o.id = p.org_id and o.code = 'baba' and p.code in ('smt','lnb','lvx','lnl','tcb') and p.status <> 'retired';
update public.outlet_menu m set enabled = false
from public.products p where p.id = m.product_id and p.status = 'retired';
delete from public.model_default_menu d using public.products p where p.id = d.product_id and p.status = 'retired';

-- 3. Nguyên liệu mới cho 2 món mới
insert into public.ingredients (org_id, code, name, grp, unit, purchase_unit, purchase_factor, kind, shelf_days, default_min_qty, default_lead_days, storage_note, sort_order)
select o.id, v.* from public.orgs o, (values
  ('dau_den','Đậu đen xanh lòng','main','g','kg',1000,'purchased',null::int,1000,3,'Nơi khô ráo, đậy kín. Ngâm 6–8 giờ trước khi nấu.',16),
  ('gao_lut','Gạo lứt','main','g','kg',1000,'purchased',null::int,1000,3,'Hũ kín, nơi khô mát. Rang thơm trước khi xay.',17)
) as v(code,name,grp,unit,purchase_unit,purchase_factor,kind,shelf_days,default_min_qty,default_lead_days,storage_note,sort_order)
where o.code = 'baba'
on conflict (org_id, code) do nothing;

-- 4. Hai món mới (tên tạm, chưa có giá, chưa có công thức)
insert into public.products (org_id, code, name, short_name, line, color, has_caffeine, yield_per_jar, sort_order)
select o.id, v.* from public.orgs o, (values
  ('sme','Mè đen · Đậu đen · Điều','Mè · Đậu đen · Điều','sang','#4A4A48',false,6,5),
  ('lgl','Gạo lứt · Hạnh nhân · Điều','Gạo lứt · Hạnh nhân','lanh','#C9A27A',false,6,7)
) as v(code,name,short_name,line,color,has_caffeine,yield_per_jar,sort_order)
where o.code = 'baba'
on conflict (org_id, code) do nothing;

insert into public.outlet_menu (outlet_id, product_id, enabled, sort_order)
select ot.id, p.id, false, p.sort_order
from public.outlets ot join public.products p on p.org_id = ot.org_id and p.code in ('sme','lgl')
on conflict (outlet_id, product_id) do nothing;

-- 5. Thứ tự hiển thị trên mọi cơ sở theo thứ tự mới
update public.outlet_menu m set sort_order = p.sort_order from public.products p where p.id = m.product_id;
