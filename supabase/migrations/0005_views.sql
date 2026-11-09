-- 0005_views: số liệu tính từ sổ cái. security_invoker = RLS của người gọi được áp dụng.

-- Tồn kho vật tư theo cơ sở
create or replace view public.v_stock_balance with (security_invoker = true) as
with mv as (
  select outlet_id, ingredient_id,
         sum(qty_delta) as qty,
         sum(-qty_delta) filter (where qty_delta < 0
             and reason in ('cook','cook_packaging','batch_use','sale_packaging')
             and business_date > public.vn_today() - 14) as used14,
         min(business_date) as first_date
  from public.stock_movements group by outlet_id, ingredient_id
), lots as (
  select m.outlet_id, m.ingredient_id, min(m.expires_at) as nearest_expiry
  from public.stock_movements m
  join public.ingredients i on i.id = m.ingredient_id
  where m.qty_delta > 0 and m.expires_at is not null
    and m.business_date > public.vn_today() - coalesce(i.shelf_days, 30)
  group by m.outlet_id, m.ingredient_id
)
select o.id as outlet_id, i.id as ingredient_id, i.code, i.name, i.grp, i.unit, i.kind,
       i.shelf_days, i.storage_note, i.purchase_unit, i.purchase_factor, i.sort_order,
       coalesce(s.min_qty, i.default_min_qty) as min_qty,
       case when s.outlet_id is null then i.default_lead_days else s.lead_days end as lead_days,
       s.supplier_id, sp.name as supplier_name, s.on_order_until,
       coalesce(s.notify_email, true) as notify_email,
       coalesce(s.enabled, true) as enabled,
       coalesce(mv.qty, 0) as qty_on_hand,
       least(14, greatest(1, public.vn_today() - mv.first_date + 1)) as use_days,
       case when mv.first_date is null then 0
            else coalesce(mv.used14, 0) / least(14, greatest(1, public.vn_today() - mv.first_date + 1)) end as avg_daily_use,
       case when coalesce(mv.used14, 0) > 0
            then round(coalesce(mv.qty, 0) / (mv.used14 / least(14, greatest(1, public.vn_today() - mv.first_date + 1))), 1) end as days_of_cover,
       lots.nearest_expiry
from public.outlets o
join public.ingredients i on i.org_id = o.org_id and i.status = 'active'
left join public.outlet_ingredient_settings s on s.outlet_id = o.id and s.ingredient_id = i.id
left join public.suppliers sp on sp.id = s.supplier_id
left join mv on mv.outlet_id = o.id and mv.ingredient_id = i.id
left join lots on lots.outlet_id = o.id and lots.ingredient_id = i.id;

-- Thêm cờ cần đặt (tách view để công thức dễ đọc)
create or replace view public.v_stock_status with (security_invoker = true) as
select b.*,
  (b.enabled and b.kind = 'purchased'
     and (b.on_order_until is null or b.on_order_until < public.vn_today())
     and (b.qty_on_hand < b.min_qty
          or (b.days_of_cover is not null and b.use_days >= 3 and b.days_of_cover <= coalesce(b.lead_days, 0) + 1))
  ) as needs_order,
  (b.on_order_until is not null and b.on_order_until >= public.vn_today()) as on_order,
  (b.nearest_expiry is not null and b.nearest_expiry <= public.vn_today() + 2 and b.qty_on_hand > 0) as expiring
from public.v_stock_balance b;

-- Doanh thu theo ngày: chỉ đơn active; đơn tặng tính chai, không tính tiền
create or replace view public.v_daily_sales with (security_invoker = true) as
select o.outlet_id, o.business_date,
       count(distinct o.id) filter (where not o.is_gift) as orders_count,
       coalesce(sum(l.qty), 0)::int as bottles,
       coalesce(sum(l.qty) filter (where o.is_gift), 0)::int as gift_bottles,
       coalesce(sum(l.line_total_vnd) filter (where not o.is_gift), 0)::int as revenue_vnd,
       coalesce(sum(l.qty) filter (where o.channel = 'aggregate'), 0)::int as catchup_bottles
from public.orders o
join public.order_lines l on l.order_id = o.id
where o.status = 'active'
group by o.outlet_id, o.business_date;

create or replace view public.v_sales_by_product with (security_invoker = true) as
select o.outlet_id, o.business_date, l.product_id,
       sum(l.qty)::int as qty,
       coalesce(sum(l.line_total_vnd) filter (where not o.is_gift), 0)::int as revenue_vnd
from public.orders o
join public.order_lines l on l.order_id = o.id
where o.status = 'active'
group by o.outlet_id, o.business_date, l.product_id;

-- Lịch sử hợp nhất (F03)
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
from public.day_closes d;
