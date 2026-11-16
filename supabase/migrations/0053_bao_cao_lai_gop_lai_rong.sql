-- 0053 · Báo cáo lãi gộp, lãi ròng (Tùng duyệt 16/11). Chạy trên production 16/11.
-- 1) Khoản chi vận hành dùng cho nhiều tháng: hai cột period_from, period_to (ngày 1 của tháng); báo cáo chia đều theo tháng.
-- 2) Khấu hao: toàn bộ đầu tư thiết bị ÷ 12 tháng, tính từ tháng 11/2026 ở Phan Văn Hớn (outlets.settings.depr_start, depr_months).
--    Thiết bị mua sau đó tính từ tháng mua.
-- 3) Hai RPC báo cáo, chỉ chủ cơ sở và quản trị gọi được.
alter table public.expenses add column if not exists period_from date;
alter table public.expenses add column if not exists period_to date;
comment on column public.expenses.period_from is 'Tháng đầu (ngày 1) mà khoản chi này dùng cho; null = chỉ tháng của spent_on';
comment on column public.expenses.period_to is 'Tháng cuối (ngày 1) mà khoản chi này dùng cho';

create or replace function public.fn_set_expense_period(p_client uuid, p_from date, p_to date)
returns jsonb language plpgsql security definer set search_path to 'public' as $fn$
declare v expenses; v_grp text; v_f date; v_t date;
begin
  select * into v from expenses where client_id = p_client and status = 'active' order by created_at desc limit 1;
  if not found or not public.can_manage_outlet(v.outlet_id) then raise exception 'Không tìm thấy khoản chi' using errcode = '42501'; end if;
  if p_from is null then
    update expenses set period_from = null, period_to = null where id = v.id;
    return jsonb_build_object('id', v.id, 'months', 1);
  end if;
  select c.group_code into v_grp from expense_categories c where c.id = v.category_id;
  if v_grp is distinct from 'van_hanh' then raise exception 'Chỉ khoản chi vận hành mới chia cho nhiều tháng' using errcode = 'P0001'; end if;
  v_f := date_trunc('month', p_from)::date; v_t := date_trunc('month', coalesce(p_to, p_from))::date;
  if v_t < v_f then raise exception 'Tháng kết thúc phải sau tháng bắt đầu' using errcode = 'P0001'; end if;
  if v_t > v_f + interval '35 months' then raise exception 'Một khoản chi chia tối đa 36 tháng' using errcode = 'P0001'; end if;
  update expenses set period_from = v_f, period_to = v_t where id = v.id;
  return jsonb_build_object('id', v.id, 'months', (extract(year from age(v_t, v_f)) * 12 + extract(month from age(v_t, v_f)) + 1)::int);
end $fn$;

update public.outlets set settings = coalesce(settings, '{}'::jsonb) || '{"depr_start":"2026-11-01","depr_months":12}'::jsonb
 where id = '3e1f4df8-6dcb-4593-85a4-2bef47468f42';

-- Lãi gộp một khoảng ngày: doanh thu, giá vốn, theo ngày, theo món (kèm chi tiết chi phí một phần)
create or replace function public.fn_profit_report(p_outlet uuid, p_from date, p_to date)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $fn$
declare r jsonb;
begin
  if not public.can_manage_outlet(p_outlet) then raise exception 'Bạn không có quyền xem báo cáo lãi của cơ sở này' using errcode = '42501'; end if;
  with o as (
    select id, business_date, total_vnd, is_gift from orders
     where outlet_id = p_outlet and status = 'active' and business_date between p_from and p_to
  ), l as (
    select o.business_date, o.is_gift, x.product_id, coalesce(x.container, 'chai') as container, x.qty, x.line_total_vnd, x.unit_cost_vnd
      from order_lines x join o on o.id = x.order_id
  ), w as (
    select dc.business_date, dl.product_id, dl.waste_qty
      from day_closes dc join day_close_lines dl on dl.day_close_id = dc.id
     where dc.outlet_id = p_outlet and dc.is_current and dc.business_date between p_from and p_to and coalesce(dl.waste_qty, 0) > 0
  )
  select jsonb_build_object(
    'from', p_from, 'to', p_to,
    'revenue', (select coalesce(sum(total_vnd), 0) from o),
    'orders', (select count(*) from o),
    'parts', (select coalesce(sum(qty), 0) from l where not is_gift),
    'cogs', (select coalesce(sum(qty * unit_cost_vnd), 0) from l where not is_gift),
    'parts_no_cost', (select coalesce(sum(qty), 0) from l where not is_gift and unit_cost_vnd is null),
    'gift_qty', (select coalesce(sum(qty), 0) from l where is_gift),
    'gift_cost', (select coalesce(sum(qty * unit_cost_vnd), 0) from l where is_gift),
    'waste_qty', (select coalesce(sum(waste_qty), 0) from w),
    'waste_cost', (select coalesce(sum(waste_qty * public.fn_unit_cost(product_id, 'chai', business_date)), 0) from w),
    'by_day', coalesce((select jsonb_agg(jsonb_build_object('d', d, 'revenue', rev, 'parts', parts, 'cogs', cogs) order by d) from (
        select o.business_date d, sum(o.total_vnd) rev,
               (select coalesce(sum(qty), 0) from l where l.business_date = o.business_date and not l.is_gift) parts,
               (select coalesce(sum(qty * unit_cost_vnd), 0) from l where l.business_date = o.business_date and not l.is_gift) cogs
          from o group by o.business_date) t), '[]'::jsonb),
    'by_product', coalesce((select jsonb_agg(jsonb_build_object('product_id', product_id, 'container', container, 'qty', qty, 'revenue', rev, 'cogs', cogs,
                                     'detail', public.fn_unit_cost_detail(product_id, container, p_to)) order by (rev - coalesce(cogs, 0)) desc) from (
        select product_id, container, sum(qty) qty, sum(line_total_vnd) rev, sum(qty * unit_cost_vnd) cogs
          from l where not is_gift group by product_id, container) t), '[]'::jsonb)
  ) into r;
  return r;
end $fn$;

-- Lãi ròng theo tháng: lãi gộp − hao hụt (tặng, hủy) − vận hành (chia theo tháng) − khấu hao
create or replace function public.fn_net_report(p_outlet uuid, p_from date, p_to date)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $fn$
declare
  v_org uuid; v_set jsonb; v_n int; v_start date; r jsonb;
begin
  if not public.can_manage_outlet(p_outlet) then raise exception 'Bạn không có quyền xem báo cáo lãi của cơ sở này' using errcode = '42501'; end if;
  select org_id, coalesce(settings, '{}'::jsonb) into v_org, v_set from outlets where id = p_outlet;
  v_n := greatest(1, coalesce((v_set->>'depr_months')::int, 12));
  v_start := nullif(v_set->>'depr_start', '')::date;
  with m as (
    select generate_series(date_trunc('month', p_from)::date, date_trunc('month', p_to)::date, interval '1 month')::date as mo
  ), o as (
    select id, date_trunc('month', business_date)::date mo, total_vnd, is_gift from orders
     where outlet_id = p_outlet and status = 'active' and business_date >= date_trunc('month', p_from)::date
       and business_date < (date_trunc('month', p_to) + interval '1 month')::date
  ), l as (
    select o.mo, o.is_gift, x.qty, x.unit_cost_vnd from order_lines x join o on o.id = x.order_id
  ), w as (
    select date_trunc('month', dc.business_date)::date mo, dl.waste_qty, public.fn_unit_cost(dl.product_id, 'chai', dc.business_date) uc
      from day_closes dc join day_close_lines dl on dl.day_close_id = dc.id
     where dc.outlet_id = p_outlet and dc.is_current and coalesce(dl.waste_qty, 0) > 0
  ), e as (
    select x.id, x.amount_vnd, x.spent_on, c.group_code, c.code, c.name, c.sort_order,
           coalesce(x.period_from, date_trunc('month', x.spent_on)::date) pf,
           coalesce(x.period_to, x.period_from, date_trunc('month', x.spent_on)::date) pt
      from expenses x join expense_categories c on c.id = x.category_id
     where x.outlet_id = p_outlet and x.status = 'active'
  ), ox as (
    select m.mo, e.code, e.name, min(e.sort_order) so,
           sum(e.amount_vnd::numeric / ((extract(year from age(e.pt, e.pf)) * 12 + extract(month from age(e.pt, e.pf)) + 1))) amt
      from m join e on e.group_code = 'van_hanh' and m.mo between e.pf and e.pt
     group by m.mo, e.code, e.name
  ), dp as (
    select m.mo, sum(e.amount_vnd::numeric / v_n) amt
      from m join e on e.group_code = 'dau_tu'
       and m.mo >= greatest(date_trunc('month', e.spent_on)::date, coalesce(v_start, date_trunc('month', e.spent_on)::date))
       and m.mo < (greatest(date_trunc('month', e.spent_on)::date, coalesce(v_start, date_trunc('month', e.spent_on)::date)) + make_interval(months => v_n))::date
     group by m.mo
  )
  select jsonb_build_object(
    'depr_months', v_n, 'depr_start', v_start,
    'invest_total', (select coalesce(sum(amount_vnd), 0) from e where group_code = 'dau_tu'),
    'invest_by_cat', coalesce((select jsonb_agg(jsonb_build_object('name', name, 'amount', amt) order by amt desc) from (select name, sum(amount_vnd) amt from e where group_code = 'dau_tu' group by name) t), '[]'::jsonb),
    'opex_cats', coalesce((select jsonb_agg(jsonb_build_object('code', code, 'name', name) order by sort_order) from expense_categories
                            where org_id = v_org and group_code = 'van_hanh' and status = 'active' and parent_id is null), '[]'::jsonb),
    'months', coalesce((select jsonb_agg(jsonb_build_object(
        'month', m.mo,
        'revenue', (select coalesce(sum(total_vnd), 0) from o where o.mo = m.mo),
        'orders', (select count(*) from o where o.mo = m.mo),
        'parts', (select coalesce(sum(qty), 0) from l where l.mo = m.mo and not is_gift),
        'cogs', (select coalesce(sum(qty * unit_cost_vnd), 0) from l where l.mo = m.mo and not is_gift),
        'parts_no_cost', (select coalesce(sum(qty), 0) from l where l.mo = m.mo and not is_gift and unit_cost_vnd is null),
        'gift_qty', (select coalesce(sum(qty), 0) from l where l.mo = m.mo and is_gift),
        'gift_cost', (select coalesce(sum(qty * unit_cost_vnd), 0) from l where l.mo = m.mo and is_gift),
        'waste_qty', (select coalesce(sum(waste_qty), 0) from w where w.mo = m.mo),
        'waste_cost', (select coalesce(sum(waste_qty * uc), 0) from w where w.mo = m.mo),
        'opex', coalesce((select jsonb_agg(jsonb_build_object('code', code, 'name', name, 'amount', round(amt)) order by so) from ox where ox.mo = m.mo), '[]'::jsonb),
        'opex_total', (select coalesce(round(sum(amt)), 0) from ox where ox.mo = m.mo),
        'depreciation', (select coalesce(round(sum(amt)), 0) from dp where dp.mo = m.mo),
        'cash', jsonb_build_object(
          'nguyen_lieu', (select coalesce(sum(amount_vnd), 0) from e where group_code = 'nguyen_lieu' and date_trunc('month', spent_on)::date = m.mo),
          'vat_tu', (select coalesce(sum(amount_vnd), 0) from e where group_code = 'vat_tu' and date_trunc('month', spent_on)::date = m.mo),
          'van_hanh', (select coalesce(sum(amount_vnd), 0) from e where group_code = 'van_hanh' and date_trunc('month', spent_on)::date = m.mo),
          'dau_tu', (select coalesce(sum(amount_vnd), 0) from e where group_code = 'dau_tu' and date_trunc('month', spent_on)::date = m.mo)),
        'historical_revenue', (select coalesce(sum(amount_vnd), 0) from historical_entries h where h.outlet_id = p_outlet and h.month = m.mo and h.kind = 'revenue')
      ) order by m.mo) from m), '[]'::jsonb)
  ) into r;
  return r;
end $fn$;
revoke execute on function public.fn_profit_report(uuid, date, date) from public, anon;
revoke execute on function public.fn_net_report(uuid, date, date) from public, anon;
revoke execute on function public.fn_set_expense_period(uuid, date, date) from public, anon;
