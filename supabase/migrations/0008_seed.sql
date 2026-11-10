-- 0008_seed: danh mục BaBa theo Phụ lục A đặc tả, cơ sở mẫu, admin
insert into public.orgs (code, name) values ('baba', 'Sữa lành từ BaBa') on conflict (code) do nothing;

insert into public.bootstrap_admins (email) values ('mr.tungvx@gmail.com'), ('troon.org@gmail.com')
on conflict (email) do nothing;

insert into public.ingredients (org_id, code, name, grp, unit, purchase_unit, purchase_factor, kind, shelf_days, default_min_qty, default_lead_days, storage_note, sort_order)
select o.id, v.* from public.orgs o, (values
  ('dau_do','Đậu đỏ khô','main','g','kg',1000,'purchased',null::int,3000,3,'Nơi khô ráo, đậy kín. Ngâm 6–8 giờ, hấp chín trước khi xay.',10),
  ('bap','Bắp Mỹ hạt','main','g','kg',1000,'purchased',null,3000,null,'Bảo quản lạnh nếu đã tách hạt.',11),
  ('me','Mè đen','main','g','kg',1000,'purchased',null,1000,3,'Hũ kín, tránh ẩm. Rang thơm trước khi xay.',12),
  ('dieu','Hạt điều','main','g','kg',1000,'purchased',null,3000,3,'Hũ kín, nơi mát. Rang nhẹ trước khi xay.',13),
  ('hanh_nhan','Hạnh nhân','main','g','kg',1000,'purchased',null,1000,5,'Hũ kín, nơi mát.',14),
  ('oc_cho','Óc chó','main','g','kg',1000,'purchased',null,500,5,'Ngăn mát tủ lạnh để không hôi dầu.',15),
  ('thanh_long','Thanh long đỏ','main','g','kg',1000,'purchased',5,1000,null,'Ngăn mát, dùng trong 5 ngày.',16),
  ('ca_rot','Cà rốt','main','g','kg',1000,'purchased',7,1000,null,'Ngăn mát.',17),
  ('bi_do','Bí đỏ','main','g','kg',1000,'purchased',7,1000,null,'Nơi thoáng; đã cắt thì để ngăn mát.',18),
  ('khoai','Khoai lang mật','main','g','kg',1000,'purchased',7,1000,null,'Nơi thoáng, tránh ẩm.',19),
  ('dua','Cơm dừa tươi','main','g','kg',1000,'purchased',1,500,null,'Ngăn mát, dùng trong ngày.',20),
  ('la_dua','Bột lá dứa','additive','g','g',1,'purchased',null,50,null,'Hũ kín, tránh sáng.',30),
  ('cacao','Bột cacao','additive','g','g',1,'purchased',null,300,null,'Hũ kín, nơi khô.',31),
  ('matcha','Matcha','additive','g','g',1,'purchased',null,100,null,'Hũ kín, ngăn mát, tránh sáng.',32),
  ('caphe','Cà phê rang xay','additive','g','g',1,'purchased',null,400,null,'Túi van một chiều, nơi mát.',33),
  ('thot_not','Đường thốt nốt','additive','g','kg',1000,'purchased',null,500,null,'Hũ kín.',34),
  ('phen','Đường phèn','additive','g','kg',1000,'purchased',null,500,null,'Hũ kín.',35),
  ('nhai','Hoa nhài khô','additive','g','g',1,'purchased',null,20,null,'Hũ kín, tránh sáng.',36),
  ('syrup','Syrup ngọt lành','made','ml','ml',1,'made',14,1000,null,'Chai sạch, ngăn mát, dùng trong 14 ngày.',40),
  ('cot','Cốt cold brew','made','ml','ml',1,'made',7,1200,null,'Chai kín, ngăn mát, dùng trong 7 ngày.',41),
  ('chai_330','Chai 330 ml + nắp','packaging','cai','cai',1,'purchased',null,150,7,'Rửa, tiệt trùng trước khi rót.',50),
  ('nhan','Nhãn dán chai','packaging','cai','cai',1,'purchased',null,150,4,null,51),
  ('card','Card "Bạn có biết"','packaging','cai','cai',1,'purchased',null,150,4,'Lời nhắn và thông tin dinh dưỡng treo cổ chai.',52),
  ('day_gai','Dây gai buộc card','packaging','cai','cai',1,'purchased',null,150,4,null,53),
  ('tui','Túi đựng','packaging','cai','cai',1,'purchased',null,100,null,null,54)
) as v(code,name,grp,unit,purchase_unit,purchase_factor,kind,shelf_days,default_min_qty,default_lead_days,storage_note,sort_order)
where o.code = 'baba'
on conflict (org_id, code) do nothing;

insert into public.products (org_id, code, name, short_name, line, color, has_caffeine, yield_per_jar, sort_order)
select o.id, v.* from public.orgs o, (values
  ('md','Mầm Đỏ Hồng Hào','Đỏ Hồng Hào','xanh','#B9675A',false,6,1),
  ('mv','Mầm Vàng Thơm Ngon','Vàng Thơm Ngon','xanh','#F2D27A',false,5,2),
  ('mden','Mầm Đen Khoẻ Mạnh','Đen Khoẻ Mạnh','xanh','#2E2E2C',false,6,3),
  ('sh','Mầm Sáng Hồng Hào','Sáng Hồng Hào','sang','#D9558B',false,6,4),
  ('smt','Mầm Sáng Mắt Trong','Sáng Mắt Trong','sang','#F2A86B',false,6,5),
  ('stt','Mầm Sáng Trí Tuệ','Sáng Trí Tuệ','sang','#F0B74A',false,6,6),
  ('lnb','Mầm Lành Nhẹ Bụng','Lành Nhẹ Bụng','lanh','#F1C27D',false,6,7),
  ('lvx','Mầm Lành Vững Xương','Lành Vững Xương','lanh','#9FAE9F',false,6,8),
  ('lnl','Mầm Lành Năng Lượng','Lành Năng Lượng','lanh','#EFE6D2',false,6,9),
  ('tcc','Mầm Sữa Cacao','Cacao','tre','#6B4532',false,6,10),
  ('tmc','Mầm Sữa Matcha','Matcha','tre','#8DB35E',true,6,11),
  ('tcb','Mầm Sữa Cold Brew','Cold Brew','tre','#3B2A20',true,6,12)
) as v(code,name,short_name,line,color,has_caffeine,yield_per_jar,sort_order)
where o.code = 'baba'
on conflict (org_id, code) do nothing;

insert into public.price_lists (org_id, code, name)
select id, 'default', 'Giá niêm yết chung' from public.orgs where code = 'baba'
on conflict (org_id, code) do nothing;

insert into public.product_prices (price_list_id, product_id, price_vnd, valid_from)
select pl.id, p.id, v.price, '2026-01-01'
from (values ('md',15000),('mv',15000),('mden',15000),('sh',20000),('smt',20000),('stt',25000),
             ('lnb',20000),('lvx',20000),('lnl',25000),('tcc',30000),('tmc',30000),('tcb',30000)) as v(code, price)
join public.products p on p.code = v.code
join public.orgs o on o.id = p.org_id and o.code = 'baba'
join public.price_lists pl on pl.org_id = o.id and pl.code = 'default';

insert into public.recipes (product_id, version)
select p.id, 1 from public.products p join public.orgs o on o.id = p.org_id and o.code = 'baba'
on conflict (product_id, version) do nothing;

insert into public.recipe_items (recipe_id, ingredient_id, qty)
select r.id, i.id, v.qty
from (values
  ('md','dau_do',40),('mv','bap',140),('mden','me',28),
  ('sh','dau_do',20),('sh','dieu',20),('sh','thanh_long',50),
  ('smt','hanh_nhan',25),('smt','dau_do',15),('smt','ca_rot',50),
  ('stt','oc_cho',15),('stt','dieu',20),('stt','bi_do',60),
  ('lnb','bap',70),('lnb','dieu',18),('lnb','khoai',50),
  ('lvx','me',18),('lvx','dieu',25),('lvx','la_dua',0.75),
  ('lnl','hanh_nhan',20),('lnl','dieu',25),('lnl','dua',30),
  ('tcc','dieu',35),('tcc','cacao',9),
  ('tmc','dieu',32),('tmc','matcha',3.5),
  ('tcb','dieu',30),('tcb','cot',75)
) as v(pcode, icode, qty)
join public.orgs o on o.code = 'baba'
join public.products p on p.org_id = o.id and p.code = v.pcode
join public.recipes r on r.product_id = p.id and r.version = 1
join public.ingredients i on i.org_id = o.id and i.code = v.icode
on conflict do nothing;

insert into public.packaging_rules (org_id, product_kind, ingredient_id, qty_per_unit, consume_at)
select o.id, 'milk_bottle', i.id, 1, 'cook'
from public.orgs o join public.ingredients i on i.org_id = o.id and i.code in ('chai_330','nhan','card','day_gai')
where o.code = 'baba'
on conflict do nothing;

insert into public.batch_recipes (org_id, code, name, output_ingredient_id, output_qty, note)
select o.id, v.code, v.name, i.id, v.qty, v.note
from (values ('syrup','Syrup ngọt lành','syrup',1000,'Hoa nhài cho vào sau khi tắt bếp để giữ hương. Nước 625 ml.'),
             ('cot','Cốt cold brew','cot',1200,'Ủ lạnh 12–16 giờ với 1.200 ml nước lọc.')) as v(code,name,out_code,qty,note)
join public.orgs o on o.code = 'baba'
join public.ingredients i on i.org_id = o.id and i.code = v.out_code
on conflict do nothing;

insert into public.batch_recipe_items (batch_recipe_id, ingredient_id, qty)
select br.id, i.id, v.qty
from (values ('syrup','thot_not',375),('syrup','phen',250),('syrup','nhai',5),('cot','caphe',200)) as v(bcode, icode, qty)
join public.orgs o on o.code = 'baba'
join public.batch_recipes br on br.org_id = o.id and br.code = v.bcode
join public.ingredients i on i.org_id = o.id and i.code = v.icode
on conflict do nothing;

insert into public.sweetness_levels (org_id, code, name, syrup_ml, sort_order)
select o.id, v.* from public.orgs o,
  (values ('none','Không đường',0,1),('light','Ít ngọt',10,2),('medium','Ngọt vừa',20,3)) as v(code,name,ml,s)
where o.code = 'baba' on conflict do nothing;

-- Xe lưu động bật 4 món; các mô hình khác bật đủ 12 (không có dòng = bật hết)
insert into public.model_default_menu (org_id, model, product_id)
select o.id, 'M1_cart', p.id from public.orgs o join public.products p on p.org_id = o.id
where o.code = 'baba' and p.code in ('md','mv','tcc','tmc') on conflict do nothing;

-- Cơ sở mẫu
insert into public.outlets (org_id, name, model, address, settings, price_list_id)
select o.id, 'Quầy Hồng Gai', 'M2_street', 'Hồng Gai, Hạ Long, Quảng Ninh', '{"seed": true}'::jsonb, pl.id
from public.orgs o join public.price_lists pl on pl.org_id = o.id and pl.code = 'default'
where o.code = 'baba'
on conflict (org_id, name) do nothing;

insert into public.outlet_menu (outlet_id, product_id, sort_order)
select ot.id, p.id, p.sort_order from public.outlets ot join public.products p on p.org_id = ot.org_id
where ot.name = 'Quầy Hồng Gai' on conflict do nothing;

insert into public.notification_settings (outlet_id)
select id from public.outlets where name = 'Quầy Hồng Gai' on conflict do nothing;

insert into public.suppliers (outlet_id, name, note)
select ot.id, v.name, v.note from public.outlets ot,
  (values ('Hạt Việt','Hạt, đậu khô; giao 3–5 ngày'),('Chợ Hạ Long','Rau củ, dừa; mua ngay')) as v(name, note)
where ot.name = 'Quầy Hồng Gai' on conflict do nothing;

insert into public.outlet_ingredient_settings (outlet_id, ingredient_id, min_qty, lead_days, supplier_id)
select ot.id, i.id, i.default_min_qty, i.default_lead_days, s.id
from public.outlets ot
join public.ingredients i on i.org_id = ot.org_id
join public.suppliers s on s.outlet_id = ot.id
  and s.name = case when i.code in ('dau_do','me','dieu','hanh_nhan','oc_cho') then 'Hạt Việt'
                    when i.code in ('bap','thanh_long','ca_rot','bi_do','khoai','dua') then 'Chợ Hạ Long' end
where ot.name = 'Quầy Hồng Gai'
on conflict do nothing;
