-- 0014: đặt tên 2 món mới, giá theo dòng, bỏ cốt cold brew. Theo yêu cầu 11/11/2026 chiều.
-- Giá theo dòng: Mầm Xanh 15K · Mầm Sáng 20K · Mầm Lành 25K · Mầm Trẻ 30K.

-- 1. Tên 2 món mới
update public.products set name = 'Mè, đậu đen, điều', short_name = 'Mè, đậu đen, điều' where code = 'sme';
update public.products set name = 'Gạo lứt, h.nhân, điều', short_name = 'Gạo lứt, h.nhân, điều' where code = 'lgl';

-- 2. Giá theo dòng cho mọi món đang bán, trên mọi bảng giá.
--    Giá khác thì đóng phiên bản cũ (valid_to = hôm nay) và thêm phiên bản mới từ hôm nay; giá trùng thì để nguyên.
with target as (
  select pl.id as price_list_id, p.id as product_id,
         case p.line when 'xanh' then 15000 when 'sang' then 20000 when 'lanh' then 25000 when 'tre' then 30000 end as price_vnd
  from public.products p join public.price_lists pl on pl.org_id = p.org_id
  where p.status = 'active'
), changed as (
  select t.* from target t
  where t.price_vnd is not null and not exists (
    select 1 from public.product_prices pp
    where pp.price_list_id = t.price_list_id and pp.product_id = t.product_id and pp.valid_to is null and pp.price_vnd = t.price_vnd)
), closed as (
  update public.product_prices pp set valid_to = public.vn_today()
  from changed c
  where pp.price_list_id = c.price_list_id and pp.product_id = c.product_id and pp.valid_to is null and pp.valid_from < public.vn_today()
  returning pp.id
)
insert into public.product_prices (price_list_id, product_id, price_vnd, valid_from)
select price_list_id, product_id, price_vnd, public.vn_today() from changed;

-- 3. Bật 2 món mới ở các cơ sở đang bán món cùng dòng (Sáng Hồng Đào / Sáng Trí Tuệ)
update public.outlet_menu m set enabled = true
from public.products p
where p.id = m.product_id and p.code = 'sme'
  and exists (select 1 from public.outlet_menu x join public.products y on y.id = x.product_id where x.outlet_id = m.outlet_id and y.code = 'sh' and x.enabled);
update public.outlet_menu m set enabled = true
from public.products p
where p.id = m.product_id and p.code = 'lgl'
  and exists (select 1 from public.outlet_menu x join public.products y on y.id = x.product_id where x.outlet_id = m.outlet_id and y.code = 'stt' and x.enabled);

-- 4. Bỏ cốt cold brew: ngừng công thức mẻ, ngừng vật tư cốt và cà phê (chỉ món Cold Brew đã ngừng dùng).
--    Không xóa: mẻ cũ và lịch sử kho vẫn trỏ tới.
update public.batch_recipes set status = 'retired' where code = 'cot';
update public.ingredients set status = 'retired' where code in ('cot', 'caphe');
update public.outlet_ingredient_settings s set enabled = false
from public.ingredients i where i.id = s.ingredient_id and i.code in ('cot', 'caphe');
