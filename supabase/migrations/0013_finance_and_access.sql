-- 0013_finance_and_access: chi phí, số liệu tháng cũ, tiền đầu ngày, mở khóa ngày,
-- luật hoàn tác mẻ nấu mới, quản lý người dùng. Theo biên bản họp 11/11/2026.
-- Mọi bảng mới đều nối thêm: sai thì tạo bản ghi đảo (status 'reversal'), không sửa số cũ.

-- ===== Bảng =====
create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  outlet_id uuid not null references public.outlets(id),
  client_id uuid unique,
  spent_on date not null,
  category text not null check (category in ('nhap_hang','mat_bang','luong','dien_nuoc','khac')),
  amount_vnd int not null check (amount_vnd <> 0), -- bản ghi đảo mang số âm
  note text,
  source text not null default 'manual' check (source in ('manual','purchase')),
  ref_id uuid,
  status text not null default 'active' check (status in ('active','reversed','reversal')),
  reversal_of uuid references public.expenses(id),
  reversal_reason text,
  created_by uuid references public.profiles(id) default auth.uid(),
  created_at timestamptz not null default now()
);
create index expenses_outlet_date on public.expenses (outlet_id, spent_on);

-- Doanh thu, chi phí của tháng trước khi dùng app (chuyển từ Knote)
create table public.historical_entries (
  id uuid primary key default gen_random_uuid(),
  outlet_id uuid not null references public.outlets(id),
  client_id uuid unique,
  month date not null check (month = date_trunc('month', month)::date),
  kind text not null check (kind in ('revenue','expense')),
  category text check (category in ('nhap_hang','mat_bang','luong','dien_nuoc','khac')),
  amount_vnd int not null check (amount_vnd <> 0),
  note text,
  status text not null default 'active' check (status in ('active','reversed','reversal')),
  reversal_of uuid references public.historical_entries(id),
  reversal_reason text,
  created_by uuid references public.profiles(id) default auth.uid(),
  created_at timestamptz not null default now(),
  check (kind = 'revenue' or category is not null)
);
create index historical_outlet_month on public.historical_entries (outlet_id, month);

-- Tiền đầu ngày trong hộp. Ghi nhiều lần thì lần sau cùng có hiệu lực.
create table public.cash_opens (
  id uuid primary key default gen_random_uuid(),
  outlet_id uuid not null references public.outlets(id),
  client_id uuid unique,
  business_date date not null,
  amount_vnd int not null check (amount_vnd >= 0),
  created_by uuid references public.profiles(id) default auth.uid(),
  created_at timestamptz not null default now()
);
create index cash_opens_outlet_date on public.cash_opens (outlet_id, business_date, created_at desc);

-- Nhật ký mở khóa ngày đã chốt
create table public.day_unlocks (
  id uuid primary key default gen_random_uuid(),
  outlet_id uuid not null references public.outlets(id),
  business_date date not null,
  day_close_id uuid not null references public.day_closes(id),
  reason text not null check (length(trim(reason)) > 0),
  created_by uuid references public.profiles(id) default auth.uid(),
  created_at timestamptz not null default now()
);

alter table public.expenses enable row level security;
alter table public.historical_entries enable row level security;
alter table public.cash_opens enable row level security;
alter table public.day_unlocks enable row level security;
-- Số liệu tài chính chỉ chủ cơ sở và admin xem; ghi chỉ qua hàm
create policy expenses_read on public.expenses for select to authenticated using (public.can_manage_outlet(outlet_id));
create policy historical_read on public.historical_entries for select to authenticated using (public.can_manage_outlet(outlet_id));
create policy cash_opens_read on public.cash_opens for select to authenticated using (public.can_access_outlet(outlet_id));
create policy day_unlocks_read on public.day_unlocks for select to authenticated using (public.can_access_outlet(outlet_id));

-- ===== View =====
-- Thêm số đơn tặng (cột mới đặt cuối để không đổi nghĩa cột cũ)
create or replace view public.v_daily_sales with (security_invoker = true) as
select o.outlet_id, o.business_date,
       count(distinct o.id) filter (where not o.is_gift) as orders_count,
       coalesce(sum(l.qty), 0)::int as bottles,
       coalesce(sum(l.qty) filter (where o.is_gift), 0)::int as gift_bottles,
       coalesce(sum(l.line_total_vnd) filter (where not o.is_gift), 0)::int as revenue_vnd,
       coalesce(sum(l.qty) filter (where o.channel = 'aggregate'), 0)::int as catchup_bottles,
       count(distinct o.id) filter (where o.is_gift) as gift_orders_count
from public.orders o
join public.order_lines l on l.order_id = o.id
where o.status = 'active'
group by o.outlet_id, o.business_date;

-- Chi phí theo ngày và loại (bản ghi đảo trừ đi bản gốc nên cộng cả hai là đúng)
create or replace view public.v_daily_expenses with (security_invoker = true) as
select outlet_id, spent_on as business_date, category, sum(amount_vnd)::int as amount_vnd
from public.expenses where status in ('active','reversed','reversal')
group by 1, 2, 3;

create or replace view public.v_daily_pnl with (security_invoker = true) as
with r as (select outlet_id, business_date, revenue_vnd, bottles, orders_count from public.v_daily_sales),
     e as (select outlet_id, business_date, sum(amount_vnd)::int as expense_vnd from public.v_daily_expenses group by 1, 2)
select coalesce(r.outlet_id, e.outlet_id) as outlet_id,
       coalesce(r.business_date, e.business_date) as business_date,
       coalesce(r.revenue_vnd, 0) as revenue_vnd,
       coalesce(e.expense_vnd, 0) as expense_vnd,
       coalesce(r.revenue_vnd, 0) - coalesce(e.expense_vnd, 0) as profit_vnd,
       coalesce(r.bottles, 0) as bottles,
       coalesce(r.orders_count, 0) as orders_count
from r full join e on e.outlet_id = r.outlet_id and e.business_date = r.business_date;

-- Chi phí theo tháng và loại: phát sinh trong app + nhập tay cho tháng cũ
create or replace view public.v_monthly_expenses with (security_invoker = true) as
select outlet_id, month, category, sum(amount_vnd)::int as amount_vnd, bool_or(historical) as has_historical
from (
  select outlet_id, date_trunc('month', spent_on)::date as month, category, amount_vnd, false as historical from public.expenses
  union all
  select outlet_id, month, category, amount_vnd, true from public.historical_entries where kind = 'expense'
) x group by 1, 2, 3;

create or replace view public.v_monthly_pnl with (security_invoker = true) as
with r as (
  select outlet_id, date_trunc('month', business_date)::date as month, sum(revenue_vnd)::int as rev, sum(bottles)::int as bottles
  from public.v_daily_sales group by 1, 2
), hr as (
  select outlet_id, month, sum(amount_vnd)::int as rev from public.historical_entries where kind = 'revenue' group by 1, 2
), e as (
  select outlet_id, month, sum(amount_vnd)::int as exp, bool_or(has_historical) as hist from public.v_monthly_expenses group by 1, 2
), k as (
  select outlet_id, month from r union select outlet_id, month from hr union select outlet_id, month from e
)
select k.outlet_id, k.month,
       (coalesce(r.rev, 0) + coalesce(hr.rev, 0)) as revenue_vnd,
       coalesce(e.exp, 0) as expense_vnd,
       (coalesce(r.rev, 0) + coalesce(hr.rev, 0) - coalesce(e.exp, 0)) as profit_vnd,
       coalesce(r.bottles, 0) as bottles,
       coalesce(hr.rev, 0) as historical_revenue_vnd,
       (hr.rev is not null or coalesce(e.hist, false)) as has_historical
from k
left join r on r.outlet_id = k.outlet_id and r.month = k.month
left join hr on hr.outlet_id = k.outlet_id and hr.month = k.month
left join e on e.outlet_id = k.outlet_id and e.month = k.month;

-- Lịch sử hợp nhất: thêm mở khóa ngày và chi phí nhập tay
create or replace view public.v_activity with (security_invoker = true) as
select o.outlet_id, o.placed_at as at, 'order'::text as kind, o.id as ref_id,
       case when o.status = 'reversal' then 'Hoàn tác đơn' when o.is_gift then 'Đơn tặng ' || o.seq_in_day
            when o.channel = 'aggregate' then 'Đơn bổ sung cuối ngày' else 'Đơn ' || o.seq_in_day end as title,
       (select string_agg(l.qty || ' ' || p.short_name, ' · ' order by p.sort_order)
          from public.order_lines l join public.products p on p.id = l.product_id where l.order_id = o.id)
         || case when o.status = 'reversed' then ' · đã hoàn tác' else '' end
         || coalesce(' · ' || o.reversal_reason, '') as detail,
       case when o.status = 'reversal' then -(select total_vnd from public.orders x where x.id = o.reversal_of) else o.total_vnd end as amount_vnd,
       o.status, o.created_by as actor_id, o.business_date
from public.orders o
union all
select c.outlet_id, c.cooked_at, 'cook', c.id,
       'Đã nấu ' || (select coalesce(sum(qty), 0) from public.cook_run_lines where cook_run_id = c.id) || ' chai',
       (select string_agg(l.qty || ' ' || p.short_name, ' · ' order by p.sort_order)
          from public.cook_run_lines l join public.products p on p.id = l.product_id where l.cook_run_id = c.id)
         || case when c.status = 'reversed' then ' · đã hoàn tác' else '' end,
       null, c.status, c.created_by, c.business_date
from public.cook_runs c
union all
select b.outlet_id, b.produced_at, 'batch', b.id,
       'Mẻ ' || br.name || ' · ' || b.batch_count || ' mẻ',
       'Hạn ' || to_char(b.expires_at, 'DD/MM'), null, 'active', b.created_by, b.business_date
from public.production_batches b join public.batch_recipes br on br.id = b.batch_recipe_id
union all
select pu.outlet_id, pu.purchased_at, 'purchase', pu.id,
       'Nhập hàng' || coalesce(' từ ' || s.name, ''),
       (select string_agg(i.name || ' ' || trim(to_char(l.qty, 'FM999G999D0')) || ' ' || i.unit, ' · ')
          from public.purchase_lines l join public.ingredients i on i.id = l.ingredient_id where l.purchase_id = pu.id),
       pu.total_vnd, 'active', pu.created_by, pu.business_date
from public.purchases pu left join public.suppliers s on s.id = pu.supplier_id
union all
select sc.outlet_id, sc.counted_at, 'count', sc.id,
       'Kiểm kê ' || (select count(*) from public.stock_count_lines where stock_count_id = sc.id) || ' vật tư',
       (select string_agg(i.name || ' ' || case when l.qty_actual >= l.qty_book then '+' else '' end
                          || trim(to_char(l.qty_actual - l.qty_book, 'FM999G999D0')) || ' ' || i.unit, ' · ')
          from public.stock_count_lines l join public.ingredients i on i.id = l.ingredient_id
          where l.stock_count_id = sc.id and l.qty_actual <> l.qty_book),
       null, 'active', sc.counted_by, sc.business_date
from public.stock_counts sc
union all
select d.outlet_id, d.closed_at, 'close', d.id,
       'Đối chiếu ' || to_char(d.business_date, 'DD/MM') || case when d.supersedes is not null then ' (chốt lại)' else '' end,
       'Chai chưa rõ ' || d.diff_bottles || ' · tiền lệch ' || d.diff_money_vnd || ' đ' || coalesce(' · ' || d.money_diff_reason, ''),
       null, case when d.is_current then 'active' else 'superseded' end, d.closed_by, d.business_date
from public.day_closes d
union all
select u.outlet_id, u.created_at, 'close', u.id,
       'Mở khóa ngày ' || to_char(u.business_date, 'DD/MM'), u.reason, null, 'unlock', u.created_by, u.business_date
from public.day_unlocks u
union all
select e.outlet_id, e.created_at, 'expense', e.id,
       case when e.status = 'reversal' then 'Hủy khoản chi' else 'Chi phí · ' ||
         case e.category when 'nhap_hang' then 'Nhập hàng' when 'mat_bang' then 'Mặt bằng' when 'luong' then 'Lương'
                         when 'dien_nuoc' then 'Điện nước, internet' else 'Khác' end end,
       e.note || case when e.status = 'reversed' then ' · đã hủy' else '' end || coalesce(' · ' || e.reversal_reason, ''),
       e.amount_vnd, e.status, e.created_by, e.spent_on
from public.expenses e where e.source = 'manual';

-- ===== Hàm =====
create or replace function public.fn_post_expense(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_outlet uuid := (p->>'outlet_id')::uuid;
  v_client uuid := nullif(p->>'client_id', '')::uuid;
  v_amount int := (p->>'amount_vnd')::int;
  v_date date := coalesce(nullif(p->>'spent_on', '')::date, public.vn_today());
  v_id uuid;
begin
  if auth.uid() is null or not public.can_manage_outlet(v_outlet) then raise exception 'Chỉ chủ cơ sở được ghi chi phí' using errcode = '42501'; end if;
  if v_client is not null then
    select id into v_id from expenses where client_id = v_client;
    if found then return jsonb_build_object('id', v_id, 'duplicate', true); end if;
  end if;
  if v_amount is null or v_amount <= 0 then raise exception 'Số tiền phải lớn hơn 0' using errcode = 'P0001'; end if;
  if v_date > public.vn_today() then raise exception 'Không ghi chi phí cho ngày chưa tới' using errcode = 'P0001'; end if;
  insert into expenses (outlet_id, client_id, spent_on, category, amount_vnd, note)
  values (v_outlet, v_client, v_date, p->>'category', v_amount, nullif(trim(p->>'note'), ''))
  returning id into v_id;
  return jsonb_build_object('id', v_id);
end $$;

create or replace function public.fn_reverse_expense(p_id uuid, p_reason text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v expenses;
begin
  select * into v from expenses where id = p_id for update;
  if not found or not public.can_manage_outlet(v.outlet_id) then raise exception 'Không tìm thấy khoản chi' using errcode = '42501'; end if;
  if v.status <> 'active' then raise exception 'Khoản chi này đã được hủy' using errcode = 'P0001'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'Cần ghi lý do hủy' using errcode = 'P0001'; end if;
  update expenses set status = 'reversed', reversal_reason = trim(p_reason) where id = p_id;
  insert into expenses (outlet_id, spent_on, category, amount_vnd, note, source, ref_id, status, reversal_of, reversal_reason)
  values (v.outlet_id, v.spent_on, v.category, -v.amount_vnd, v.note, v.source, v.ref_id, 'reversal', v.id, trim(p_reason));
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.fn_post_historical(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_outlet uuid := (p->>'outlet_id')::uuid;
  v_client uuid := nullif(p->>'client_id', '')::uuid;
  v_amount int := (p->>'amount_vnd')::int;
  v_month date := date_trunc('month', (p->>'month')::date)::date;
  v_kind text := p->>'kind';
  v_id uuid;
begin
  if auth.uid() is null or not public.can_manage_outlet(v_outlet) then raise exception 'Chỉ chủ cơ sở được nhập số liệu tháng cũ' using errcode = '42501'; end if;
  if v_client is not null then
    select id into v_id from historical_entries where client_id = v_client;
    if found then return jsonb_build_object('id', v_id, 'duplicate', true); end if;
  end if;
  if v_amount is null or v_amount <= 0 then raise exception 'Số tiền phải lớn hơn 0' using errcode = 'P0001'; end if;
  if v_month is null or v_month >= date_trunc('month', public.vn_today())::date then
    raise exception 'Chỉ nhập cho các tháng đã qua; tháng này app tự tính' using errcode = 'P0001';
  end if;
  if v_kind not in ('revenue','expense') then raise exception 'Chọn doanh thu hoặc chi phí' using errcode = 'P0001'; end if;
  insert into historical_entries (outlet_id, client_id, month, kind, category, amount_vnd, note)
  values (v_outlet, v_client, v_month, v_kind,
          case when v_kind = 'expense' then coalesce(nullif(p->>'category', ''), 'khac') end,
          v_amount, nullif(trim(p->>'note'), ''))
  returning id into v_id;
  return jsonb_build_object('id', v_id);
end $$;

create or replace function public.fn_reverse_historical(p_id uuid, p_reason text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v historical_entries;
begin
  select * into v from historical_entries where id = p_id for update;
  if not found or not public.can_manage_outlet(v.outlet_id) then raise exception 'Không tìm thấy dòng này' using errcode = '42501'; end if;
  if v.status <> 'active' then raise exception 'Dòng này đã được xóa' using errcode = 'P0001'; end if;
  update historical_entries set status = 'reversed', reversal_reason = coalesce(nullif(trim(p_reason), ''), 'Nhập nhầm') where id = p_id;
  insert into historical_entries (outlet_id, month, kind, category, amount_vnd, note, status, reversal_of, reversal_reason)
  values (v.outlet_id, v.month, v.kind, v.category, -v.amount_vnd, v.note, 'reversal', v.id, coalesce(nullif(trim(p_reason), ''), 'Nhập nhầm'));
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.fn_set_cash_open(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_outlet uuid := (p->>'outlet_id')::uuid;
  v_client uuid := nullif(p->>'client_id', '')::uuid;
  v_amount int := (p->>'amount_vnd')::int;
  v_date date := public.vn_today(); v_id uuid;
begin
  if auth.uid() is null or not public.can_access_outlet(v_outlet) then raise exception 'Bạn không có quyền ở cơ sở này' using errcode = '42501'; end if;
  if v_client is not null then
    select id into v_id from cash_opens where client_id = v_client;
    if found then return jsonb_build_object('id', v_id, 'duplicate', true); end if;
  end if;
  if v_amount is null or v_amount < 0 then raise exception 'Số tiền không được âm' using errcode = 'P0001'; end if;
  if exists (select 1 from day_closes where outlet_id = v_outlet and business_date = v_date and is_current) then
    raise exception 'Hôm nay đã chốt; mở khóa ngày trước khi sửa tiền đầu ngày' using errcode = 'P0001';
  end if;
  insert into cash_opens (outlet_id, client_id, business_date, amount_vnd) values (v_outlet, v_client, v_date, v_amount)
  returning id into v_id;
  return jsonb_build_object('id', v_id);
end $$;

-- Mở khóa ngày đã chốt: chỉ chủ cơ sở và admin, bắt buộc lý do.
-- Lần chốt cũ thôi hiệu lực (vẫn giữ trong sổ); chốt lại sau đó không cần lý do nữa.
create or replace function public.fn_unlock_day(p_outlet uuid, p_date date, p_reason text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v day_closes;
begin
  if auth.uid() is null or not public.can_manage_outlet(p_outlet) then raise exception 'Chỉ chủ cơ sở được mở khóa ngày' using errcode = '42501'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'Cần ghi lý do mở khóa' using errcode = 'P0001'; end if;
  select * into v from day_closes where outlet_id = p_outlet and business_date = p_date and is_current for update;
  if not found then raise exception 'Ngày % chưa chốt', to_char(p_date, 'DD/MM') using errcode = 'P0001'; end if;
  update day_closes set is_current = false where id = v.id;
  insert into day_unlocks (outlet_id, business_date, day_close_id, reason) values (p_outlet, p_date, v.id, trim(p_reason));
  return jsonb_build_object('ok', true);
end $$;

-- Hoàn tác mẻ nấu: trong 10 phút, ngày chưa chốt, và sau khi bỏ mẻ thì
-- với mọi món trong mẻ: tồn qua + các mẻ khác − đã bán ≥ 0
create or replace function public.fn_cook_run_reversible(p_run uuid) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare v cook_runs;
begin
  select * into v from cook_runs where id = p_run;
  if not found or not public.can_access_outlet(v.outlet_id) then return false; end if;
  if v.status <> 'active' or v.created_at < now() - interval '10 minutes' then return false; end if;
  if exists (select 1 from day_closes where outlet_id = v.outlet_id and business_date = v.business_date and is_current) then return false; end if;
  return not exists (
    select 1 from cook_run_lines l
    join public.fn_bottles_on_hand(v.outlet_id, v.business_date) b on b.product_id = l.product_id
    where l.cook_run_id = p_run and b.carried + b.cooked - b.sold - l.qty < 0);
end $$;

create or replace function public.fn_reverse_cook_run(p_run uuid, p_reason text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v cook_runs;
begin
  select * into v from cook_runs where id = p_run for update;
  if not found or not public.can_access_outlet(v.outlet_id) then raise exception 'Không tìm thấy mẻ nấu' using errcode = '42501'; end if;
  if v.status <> 'active' then raise exception 'Mẻ nấu đã được hoàn tác' using errcode = 'P0001'; end if;
  if v.created_at < now() - interval '10 minutes' then
    raise exception 'Đã quá 10 phút; hãy sửa bằng kiểm kê và đếm chai cuối ngày' using errcode = 'P0001';
  end if;
  if not public.fn_cook_run_reversible(p_run) then
    raise exception 'Đã bán một phần số chai của mẻ này; hãy sửa bằng đếm chai cuối ngày' using errcode = 'P0001';
  end if;
  update cook_runs set status = 'reversed', reversal_reason = coalesce(p_reason, 'Ghi nhầm') where id = p_run;
  insert into stock_movements (outlet_id, ingredient_id, qty_delta, reason, ref_table, ref_id, business_date)
  select outlet_id, ingredient_id, -qty_delta, 'reversal', 'cook_runs', p_run, business_date
    from stock_movements where ref_table = 'cook_runs' and ref_id = p_run and reason in ('cook', 'cook_packaging');
  if v.plan_id is not null then update cook_plans set status = 'draft' where id = v.plan_id; end if;
  return jsonb_build_object('ok', true);
end $$;

-- Nhập hàng có tổng tiền thì tự ghi một khoản chi "Nhập hàng"
create or replace function public.trg_purchase_expense() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(new.total_vnd, 0) > 0 then
    insert into expenses (outlet_id, spent_on, category, amount_vnd, note, source, ref_id, created_by)
    values (new.outlet_id, new.business_date, 'nhap_hang', new.total_vnd,
            coalesce((select 'Nhập hàng · ' || s.name from suppliers s where s.id = new.supplier_id), 'Nhập hàng'),
            'purchase', new.id, new.created_by);
  end if;
  return new;
end $$;
create trigger purchases_expense after insert on public.purchases for each row execute function public.trg_purchase_expense();
revoke execute on function public.trg_purchase_expense() from public, anon, authenticated;

-- Tạo cơ sở: chỉ admin. Chỉ bật món đang bán và đã có giá.
create or replace function public.fn_create_outlet(p_name text, p_model text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_org uuid; v_id uuid; v_pl uuid;
begin
  if auth.uid() is null or not public.is_org_admin() then raise exception 'Chỉ admin được tạo cơ sở mới' using errcode = '42501'; end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'Tên cơ sở không được trống' using errcode = 'P0001'; end if;
  select org_id into v_org from org_memberships where user_id = auth.uid() and status = 'active' and role = 'admin' limit 1;
  if exists (select 1 from outlets where org_id = v_org and lower(name) = lower(trim(p_name))) then
    raise exception 'Đã có cơ sở tên "%"', trim(p_name) using errcode = 'P0001';
  end if;
  select id into v_pl from price_lists where org_id = v_org and code = 'default';
  insert into outlets (org_id, name, model, created_by, price_list_id)
  values (v_org, trim(p_name), p_model, auth.uid(), v_pl) returning id into v_id;
  insert into outlet_menu (outlet_id, product_id, sort_order, enabled)
  select v_id, p.id, p.sort_order,
         p.status = 'active' and public.current_price(v_id, p.id, public.vn_today()) is not null
           and (not exists (select 1 from model_default_menu m where m.org_id = v_org and m.model = p_model)
                or p.id in (select product_id from model_default_menu m where m.org_id = v_org and m.model = p_model))
    from products p where p.org_id = v_org;
  insert into notification_settings (outlet_id) values (v_id);
  return v_id;
end $$;

-- Danh sách người của một cơ sở (chủ cơ sở xem), hoặc mọi cơ sở (admin, p_outlet = null)
create or replace function public.fn_list_members(p_outlet uuid default null)
returns table (membership_id uuid, outlet_id uuid, outlet_name text, user_id uuid, email text, full_name text, role text, status text, created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if p_outlet is null and not public.is_org_admin() then raise exception 'Chỉ admin xem được mọi cơ sở' using errcode = '42501'; end if;
  if p_outlet is not null and not public.can_manage_outlet(p_outlet) then raise exception 'Chỉ chủ cơ sở xem được danh sách này' using errcode = '42501'; end if;
  return query
  select m.id, m.outlet_id, o.name, m.user_id, coalesce(pr.email, m.invited_email), pr.full_name, m.role, m.status, m.created_at
    from memberships m join outlets o on o.id = m.outlet_id
    left join profiles pr on pr.id = m.user_id
   where m.status <> 'removed' and (p_outlet is null or m.outlet_id = p_outlet)
   order by o.name, m.role, coalesce(pr.email, m.invited_email);
end $$;

-- Thôi cho một người vào cơ sở. Chủ cơ sở gỡ được nhân viên; admin gỡ được cả chủ cơ sở.
create or replace function public.fn_remove_member(p_membership uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v memberships;
begin
  select * into v from memberships where id = p_membership for update;
  if not found or not public.can_manage_outlet(v.outlet_id) then raise exception 'Không tìm thấy người này' using errcode = '42501'; end if;
  if v.role = 'owner' and not public.is_org_admin() then raise exception 'Chỉ admin được gỡ chủ cơ sở' using errcode = '42501'; end if;
  if v.user_id = auth.uid() then raise exception 'Bạn không tự gỡ mình được' using errcode = 'P0001'; end if;
  update memberships set status = 'removed', updated_at = now() where id = p_membership;
  return jsonb_build_object('ok', true);
end $$;

-- Quyền gọi hàm: chỉ người đã đăng nhập
do $$ declare f text; begin
  foreach f in array array['fn_post_expense(jsonb)','fn_reverse_expense(uuid,text)','fn_post_historical(jsonb)',
    'fn_reverse_historical(uuid,text)','fn_set_cash_open(jsonb)','fn_unlock_day(uuid,date,text)',
    'fn_cook_run_reversible(uuid)','fn_reverse_cook_run(uuid,text)','fn_create_outlet(text,text)',
    'fn_list_members(uuid)','fn_remove_member(uuid)']
  loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
