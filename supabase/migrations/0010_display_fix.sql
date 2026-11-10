-- 0010_display_fix: định dạng số kiểu Việt Nam trong lịch sử (5.000 g, 200 cái)
create or replace function public.fmt_qty(p numeric, p_unit text) returns text
language sql immutable as $$
  select
    case when p = trunc(p)
      then replace(to_char(trunc(p), 'FM999,999,990'), ',', '.')
      else replace(replace(replace(to_char(p, 'FM999,999,990.99'), ',', '#'), '.', ','), '#', '.')
    end
    || ' ' || case p_unit when 'cai' then 'cái' else p_unit end
$$;

create or replace view public.v_activity with (security_invoker = true) as
select o.outlet_id, o.placed_at as at, 'order'::text as kind, o.id as ref_id,
       case when o.status = 'reversal' then 'Hoàn tác đơn ' || abs(o.seq_in_day) when o.is_gift then 'Đơn tặng ' || o.seq_in_day
            when o.channel = 'aggregate' then 'Đơn bổ sung cuối ngày' else 'Đơn ' || o.seq_in_day end as title,
       coalesce((select string_agg(l.qty || ' ' || p.short_name, ' · ' order by p.sort_order)
          from public.order_lines l join public.products p on p.id = l.product_id where l.order_id = o.id), '')
         || case when o.status = 'reversed' then ' · đã hoàn tác' else '' end
         || coalesce(o.reversal_reason, '') as detail,
       case when o.status = 'reversal' then -(select x.total_vnd from public.orders x where x.id = o.reversal_of) else o.total_vnd end as amount_vnd,
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
       'Mẻ ' || br.name || ' · ' || public.fmt_qty(b.batch_count, 'mẻ'),
       'Hạn ' || to_char(b.expires_at, 'DD/MM'), null, 'active', b.created_by, b.business_date
from public.production_batches b join public.batch_recipes br on br.id = b.batch_recipe_id
union all
select pu.outlet_id, pu.purchased_at, 'purchase', pu.id,
       'Nhập hàng' || coalesce(' từ ' || s.name, ''),
       (select string_agg(i.name || ' ' || public.fmt_qty(l.qty, i.unit), ' · ' order by i.sort_order)
          from public.purchase_lines l join public.ingredients i on i.id = l.ingredient_id where l.purchase_id = pu.id),
       pu.total_vnd, 'active', pu.created_by, pu.business_date
from public.purchases pu left join public.suppliers s on s.id = pu.supplier_id
union all
select sc.outlet_id, sc.counted_at, 'count', sc.id,
       'Kiểm kê ' || (select count(*) from public.stock_count_lines where stock_count_id = sc.id) || ' vật tư',
       coalesce((select string_agg(i.name || ' ' || case when l.qty_actual > l.qty_book then '+' else '' end
                          || public.fmt_qty(l.qty_actual - l.qty_book, i.unit), ' · ')
          from public.stock_count_lines l join public.ingredients i on i.id = l.ingredient_id
          where l.stock_count_id = sc.id and l.qty_actual <> l.qty_book), 'Khớp sổ'),
       null, 'active', sc.counted_by, sc.business_date
from public.stock_counts sc
union all
select d.outlet_id, d.closed_at, 'close', d.id,
       'Đối chiếu ' || to_char(d.business_date, 'DD/MM') || case when d.supersedes is not null then ' (chốt lại)' else '' end,
       'Chai chưa rõ ' || d.diff_bottles || ' · tiền lệch ' || replace(to_char(d.diff_money_vnd, 'FM999,999,990'), ',', '.') || ' đ'
         || coalesce(' · ' || d.money_diff_reason, ''),
       null, case when d.is_current then 'active' else 'superseded' end, d.closed_by, d.business_date
from public.day_closes d;
