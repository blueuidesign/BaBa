-- 0018 · 8 món mới trong kho (prompt chi phí 12/11, mục 3.9; Sốt Manine: ml, tối thiểu 1.000 ml, Tùng chốt 12/11)
-- 5 món bao bì (ly, ống hút, nắp, quai lá, giấy chống tràn) không có trong packaging_rules nên KHÔNG tự trừ khi nấu/bán;
-- số còn lại cập nhật khi kiểm kê.
insert into public.ingredients (org_id, code, name, grp, unit, purchase_unit, purchase_factor, kind, default_min_qty, sort_order, status)
select g.id, v.code, v.name, v.grp, v.unit, v.unit, 1, 'purchased', v.minq, v.ord, 'active'
from public.orgs g
cross join (values
  ('hat_sen','Hạt sen','main','g',1000,15),
  ('muoi_hong','Muối hồng','additive','g',500,38),
  ('sot_manine','Sốt Manine','additive','ml',1000,39),
  ('ly_giay','Ly giấy 360 ml','packaging','cai',100,60),
  ('nap_ly','Nắp ly','packaging','cai',100,61),
  ('ong_hut','Ống hút giấy','packaging','cai',200,62),
  ('quai_la','Quai xách ly bằng lá','packaging','cai',50,63),
  ('giay_chong_tran','Giấy chống tràn','packaging','cai',200,64)
) as v(code,name,grp,unit,minq,ord)
where not exists (select 1 from public.ingredients i where i.org_id = g.id and i.code = v.code);

insert into public.outlet_ingredient_settings (outlet_id, ingredient_id, min_qty, enabled)
select o.id, i.id, i.default_min_qty, true
from public.outlets o
join public.ingredients i on i.org_id = o.org_id
where i.code in ('hat_sen','muoi_hong','sot_manine','ly_giay','nap_ly','ong_hut','quai_la','giay_chong_tran')
on conflict do nothing;

-- Kiểm tra: select code, unit from ingredients where code in (...);  -- 8 dòng
