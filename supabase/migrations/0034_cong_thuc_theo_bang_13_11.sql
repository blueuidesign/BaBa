-- 0034 · Sửa công thức 7 món cho đúng bảng công thức Hà gửi 13/11 (Tùng 14/11: "làm đúng theo dữ liệu tôi mới cung cấp").
-- Công thức có phiên bản: đóng bản 1 (valid_to = 14/11) và mở bản 2 từ 14/11. Mẻ nấu và đơn cũ giữ bản 1.
-- Đã khớp sẵn, không đổi: Đen Khỏe Mạnh, Sáng Trí Tuệ, Lành Năng Lượng, Cacao. Cold Brew không có trong bảng nên giữ nguyên.
-- Chưa làm: "30 ml đường" mỗi ly (40 ml với Matcha, Cacao) vì syrup đang được đo lúc chốt ngày, không nằm trong công thức; hai món mới chưa có công thức.
with v(code, ing, qty) as (values
  ('md',  'dau_do', 60),
  ('mv',  'bap', 100), ('mv', 'dieu', 20),
  ('sh',  'dau_do', 50), ('sh', 'thanh_long', 60), ('sh', 'dieu', 20),
  ('tmc', 'matcha', 3), ('tmc', 'dieu', 32),
  ('smt', 'dau_do', 35), ('smt', 'ca_rot', 30), ('smt', 'hanh_nhan', 25),
  ('lnb', 'bap', 70), ('lnb', 'dieu', 20), ('lnb', 'khoai', 50),
  ('lvx', 'la_dua', 2), ('lvx', 'dieu', 20), ('lvx', 'me', 15)
), closed as (
  update public.recipes r set valid_to = '2026-11-14'
    from public.products p
   where p.id = r.product_id and p.code in (select distinct code from v) and r.version = 1 and r.valid_to is null
  returning r.product_id
), nw as (
  insert into public.recipes (product_id, version, valid_from, status)
  select product_id, 2, '2026-11-14', 'approved' from closed
  returning id, product_id
)
insert into public.recipe_items (recipe_id, ingredient_id, qty)
select nw.id, i.id, v.qty
  from v join public.products p on p.code = v.code
  join nw on nw.product_id = p.id
  join public.ingredients i on i.code = v.ing and i.org_id = p.org_id;

-- Kiểm tra: mỗi món trong 7 món có đúng một công thức đang hiệu lực, là bản 2
