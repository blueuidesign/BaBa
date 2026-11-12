-- 0017 · Chi phí theo 4 nhóm (DB 1.3) + cột cho dữ liệu nhập từ Excel/Knote
-- Chỉ thêm: không đổi nghĩa cột cũ. expenses.category vẫn giữ 5 giá trị cũ để code bản 1 đọc đúng tổng.
-- Kiểm tra: xem cuối file.

-- 1. Danh mục chi phí có phiên bản
create table if not exists public.expense_categories (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id),
  code text not null,
  name text not null,
  group_code text not null check (group_code in ('nguyen_lieu','vat_tu','dau_tu','van_hanh')),
  ingredient_grp text check (ingredient_grp in ('main','additive','packaging')),
  parent_id uuid references public.expense_categories(id),
  example_text text,
  counts_in_period_pnl boolean not null default true,
  legacy_category text not null check (legacy_category in ('nhap_hang','mat_bang','luong','dien_nuoc','khac')),
  sort_order int not null default 0,
  valid_from date not null default date '2026-10-01',
  valid_to date,
  status text not null default 'active' check (status in ('active','retired')),
  created_at timestamptz not null default now()
);
create unique index if not exists expense_categories_code_open
  on public.expense_categories (org_id, code) where valid_to is null;

alter table public.expense_categories enable row level security;
drop policy if exists expense_categories_read on public.expense_categories;
create policy expense_categories_read on public.expense_categories for select
  using (public.is_org_admin() or exists (
    select 1 from public.outlets o where o.org_id = expense_categories.org_id and public.can_access_outlet(o.id)));

-- seed cho mọi org
insert into public.expense_categories (org_id, code, name, group_code, ingredient_grp, example_text, counts_in_period_pnl, legacy_category, sort_order)
select g.id, v.code, v.name, v.grp, v.igrp, v.ex, v.pnl, v.legacy, v.ord
from public.orgs g
cross join (values
  ('nl_chinh','Nguyên liệu chính','nguyen_lieu','main','vd: óc chó',true,'nhap_hang',10),
  ('phu_lieu','Phụ liệu','nguyen_lieu','additive','vd: đường',true,'nhap_hang',20),
  ('nl_khac','Nguyên liệu khác','nguyen_lieu',null,'không vào kho',true,'nhap_hang',30),
  ('vat_tu','Vật tư tiêu hao','vat_tu','packaging','vd: ly, ống hút',true,'nhap_hang',40),
  ('dau_tu','Đầu tư thiết bị','dau_tu',null,null,false,'khac',50),
  ('mat_bang','Mặt bằng','van_hanh',null,null,true,'mat_bang',60),
  ('luong','Lương','van_hanh',null,null,true,'luong',70),
  ('dien_nuoc','Điện nước, internet','van_hanh',null,null,true,'dien_nuoc',80),
  ('ve_sinh','Vệ sinh, rác','van_hanh',null,null,true,'khac',90),
  ('thu_cong_thuc','Thử công thức','van_hanh',null,null,true,'khac',100),
  ('khac','Khác','van_hanh',null,null,true,'khac',110)
) as v(code,name,grp,igrp,ex,pnl,legacy,ord)
where not exists (select 1 from public.expense_categories c where c.org_id = g.id and c.code = v.code and c.valid_to is null);

insert into public.expense_categories (org_id, code, name, group_code, parent_id, counts_in_period_pnl, legacy_category, sort_order)
select p.org_id, v.code, v.name, 'dau_tu', p.id, false, 'khac', v.ord
from public.expense_categories p
cross join (values
  ('dt_may','Máy móc thiết bị',51),
  ('dt_xe_quay','Xe, quầy, kệ, bàn',52),
  ('dt_dung_cu','Dụng cụ',53),
  ('dt_nhan_dien','Nhận diện, in ấn',54),
  ('dt_khac','Khác (đầu tư)',55)
) as v(code,name,ord)
where p.code = 'dau_tu' and p.valid_to is null
  and not exists (select 1 from public.expense_categories c where c.org_id = p.org_id and c.code = v.code and c.valid_to is null);

-- 2. expenses: cột mới
alter table public.expenses
  add column if not exists category_id uuid references public.expense_categories(id),
  add column if not exists item_name text,
  add column if not exists ingredient_id uuid references public.ingredients(id),
  add column if not exists qty numeric,
  add column if not exists purchase_id uuid references public.purchases(id),
  add column if not exists replaces_id uuid references public.expenses(id),
  add column if not exists import_ref text,
  add column if not exists import_row int;

alter table public.expenses drop constraint if exists expenses_source_check;
alter table public.expenses add constraint expenses_source_check
  check (source in ('manual','purchase','import'));
alter table public.expenses drop constraint if exists expenses_import_check;
alter table public.expenses add constraint expenses_import_check
  check (source <> 'import' or (import_ref is not null and import_row is not null));
alter table public.expenses drop constraint if exists expenses_qty_check;
alter table public.expenses add constraint expenses_qty_check check (qty is null or qty > 0);
alter table public.expenses drop constraint if exists expenses_item_name_len;
alter table public.expenses add constraint expenses_item_name_len check (item_name is null or char_length(item_name) <= 120);
create unique index if not exists expenses_import_row_uq
  on public.expenses (outlet_id, import_ref, import_row) where import_ref is not null and status <> 'reversal';

-- backfill dòng cũ
update public.expenses e set category_id = c.id
from public.outlets o, public.expense_categories c
where e.category_id is null and o.id = e.outlet_id and c.org_id = o.org_id and c.valid_to is null
  and c.code = case e.category
    when 'nhap_hang' then coalesce((
      select case i.grp when 'additive' then 'phu_lieu' when 'packaging' then 'vat_tu' when 'made' then 'phu_lieu' else 'nl_chinh' end
      from public.purchase_lines pl join public.ingredients i on i.id = pl.ingredient_id
      where e.source = 'purchase' and pl.purchase_id = e.ref_id
      order by pl.qty * coalesce(pl.unit_cost_vnd, 0) desc limit 1), 'nl_chinh')
    when 'mat_bang' then 'mat_bang' when 'luong' then 'luong' when 'dien_nuoc' then 'dien_nuoc' else 'khac' end;
update public.expenses set purchase_id = ref_id where source = 'purchase' and purchase_id is null and ref_id is not null;
update public.expenses set item_name = note where item_name is null;

-- 3. orders: đánh dấu đơn nhập từ Knote
alter table public.orders
  add column if not exists source text not null default 'app',
  add column if not exists import_ref text,
  add column if not exists customer_name text;
alter table public.orders drop constraint if exists orders_source_check;
alter table public.orders add constraint orders_source_check check (source in ('app','import'));

-- 4. View chi phí theo nhóm (đọc được cả khi cờ expense_groups còn tắt)
create or replace view public.v_daily_expenses_by_group with (security_invoker = true) as
select e.outlet_id, e.spent_on as business_date, c.group_code, c.code as category_code,
       coalesce(p.name, c.name) as category_name, c.counts_in_period_pnl,
       sum(e.amount_vnd)::int as amount_vnd
from public.expenses e
join public.expense_categories c on c.id = e.category_id
left join public.expense_categories p on p.id = c.parent_id
group by 1,2,3,4,5,6;

-- Kiểm tra:
--   select count(*) from expense_categories;                         -- 16 / org
--   select count(*) from expenses where category_id is null;         -- 0
--   select sum(amount_vnd) from expenses;                            -- không đổi so với trước migration
