-- 0022 · Chi phí 1.1: ghi khoản chi theo loại mới, kèm cộng kho; sửa = đảo + ghi mới; đảo phiếu nhập; kiểm tra trùng.
-- Nhập kho (D03) chia tiền phiếu theo nhóm của từng dòng hàng thay cho một khoản "nhập hàng" chung.
-- Đặc tả: claude/BaBa_Chi_phi_DB1.3_US1.2_thay_doi.md mục 1.4, 1.5. Kiểm tra: cuối file.

-- 1. Khoản chi ghi bằng đường nào cũng có category_id (kể cả code cũ gọi fn_post_expense, và dòng đảo)
create or replace function public.trg_expense_category() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.category_id is null then
    select c.id into new.category_id
      from outlets o join expense_categories c on c.org_id = o.org_id and c.valid_to is null
     where o.id = new.outlet_id
       and c.code = case new.category when 'nhap_hang' then 'nl_chinh' when 'mat_bang' then 'mat_bang'
                                      when 'luong' then 'luong' when 'dien_nuoc' then 'dien_nuoc' else 'khac' end;
  end if;
  new.item_name := coalesce(new.item_name, new.note);
  return new;
end $$;
drop trigger if exists expenses_category on public.expenses;
create trigger expenses_category before insert on public.expenses for each row execute function public.trg_expense_category();

-- 2. Phiếu nhập đảo được
alter table public.purchases
  add column if not exists status text not null default 'posted',
  add column if not exists reversal_of uuid references public.purchases(id),
  add column if not exists reversal_reason text;
alter table public.purchases drop constraint if exists purchases_status_check;
alter table public.purchases add constraint purchases_status_check check (status in ('posted','reversed','reversal'));

-- 3. Hàm nội bộ: mã loại chi theo nhóm kho
create or replace function public.expense_code_for_grp(p_grp text) returns text
language sql immutable as $$
  select case p_grp when 'main' then 'nl_chinh' when 'packaging' then 'vat_tu' else 'phu_lieu' end
$$;

-- 4. Nhập kho: thêm ngày (không cho tương lai) và tự ghi chi phí theo nhóm của từng dòng.
--    skip_expense = true khi fn_post_expense_v2 gọi (khoản chi do màn Chi phí tự ghi).
drop trigger if exists purchases_expense on public.purchases;   -- việc ghi chi phí chuyển vào hàm dưới
create or replace function public.fn_post_purchase(p jsonb)
 returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare
  v_outlet uuid := (p->>'outlet_id')::uuid;
  v_client uuid := nullif(p->>'client_id', '')::uuid;
  v_date date := coalesce(nullif(p->>'business_date', '')::date, public.vn_today());
  v_total int := nullif(p->>'total_vnd', '')::int;
  v_skip boolean := coalesce((p->>'skip_expense')::boolean, false);
  v_id uuid; v_n int := 0; r record; v_sum numeric; v_left int; v_cnt int; v_i int := 0; v_amt int;
  v_sup text;
begin
  if auth.uid() is null or not public.can_access_outlet(v_outlet) then raise exception 'Bạn không có quyền ở cơ sở này' using errcode = '42501'; end if;
  if v_client is not null then
    select id into v_id from purchases where client_id = v_client;
    if found then return jsonb_build_object('id', v_id, 'duplicate', true); end if;
  end if;
  if v_date > public.vn_today() then raise exception 'Không nhập hàng cho ngày chưa tới' using errcode = 'P0001'; end if;
  insert into purchases (outlet_id, client_id, supplier_id, business_date, total_vnd, note, receipt_url)
  values (v_outlet, v_client, nullif(p->>'supplier_id', '')::uuid, v_date, v_total, p->>'note', p->>'receipt_url')
  returning id into v_id;
  for r in select (x->>'ingredient_id')::uuid as ingredient_id, (x->>'qty')::numeric as qty,
                  nullif(x->>'unit_cost_vnd', '')::int as unit_cost_vnd, nullif(x->>'expires_at', '')::date as expires_at
             from jsonb_array_elements(coalesce(p->'lines', '[]'::jsonb)) x loop
    continue when r.qty is null or r.qty <= 0;
    insert into purchase_lines (purchase_id, ingredient_id, qty, unit_cost_vnd, expires_at)
    values (v_id, r.ingredient_id, r.qty, r.unit_cost_vnd, r.expires_at);
    insert into stock_movements (outlet_id, ingredient_id, qty_delta, reason, ref_table, ref_id, business_date, lot_id, expires_at, unit_cost_vnd)
    values (v_outlet, r.ingredient_id, r.qty, 'purchase', 'purchases', v_id, v_date, v_id, r.expires_at, r.unit_cost_vnd);
    update outlet_ingredient_settings set on_order_until = null where outlet_id = v_outlet and ingredient_id = r.ingredient_id;
    v_n := v_n + 1;
  end loop;
  if v_n = 0 then raise exception 'Chưa có vật tư nào để nhập' using errcode = 'P0001'; end if;

  if coalesce(v_total, 0) > 0 and not v_skip then
    select s.name into v_sup from suppliers s join purchases pu on pu.supplier_id = s.id where pu.id = v_id;
    -- giá trị từng nhóm = tổng (qty × đơn giá) các dòng; dòng không giá tính 0
    create temp table if not exists _pg (code text, val numeric, names text, n int, ing uuid, qty numeric, first_ord int) on commit drop;
    truncate _pg;
    insert into _pg
    select public.expense_code_for_grp(i.grp), sum(pl.qty * coalesce(pl.unit_cost_vnd, 0)),
           string_agg(i.name, ', ' order by pl.id), count(*),
           case when count(*) = 1 then min(i.id::text)::uuid end,
           case when count(*) = 1 then round(sum(pl.qty / nullif(i.purchase_factor, 0)), 3) end,
           min(i.sort_order)
      from purchase_lines pl join ingredients i on i.id = pl.ingredient_id
     where pl.purchase_id = v_id
     group by 1;
    select coalesce(sum(val), 0), count(*) into v_sum, v_cnt from _pg;
    v_left := v_total;
    for r in select * from _pg order by val desc, first_ord loop
      v_i := v_i + 1;
      v_amt := case when v_i = v_cnt then v_left
                    when v_sum > 0 then round(v_total * r.val / v_sum)::int
                    else 0 end;                       -- không dòng nào có giá: cả tiền vào nhóm cuối vòng lặp
      if v_sum = 0 and v_i < v_cnt then continue; end if;
      v_left := v_left - v_amt;
      continue when v_amt = 0;
      insert into expenses (outlet_id, spent_on, category, amount_vnd, note, source, ref_id, purchase_id, category_id,
                            item_name, ingredient_id, qty, created_by)
      select v_outlet, v_date, 'nhap_hang', v_amt, coalesce('Nhập hàng · ' || v_sup, 'Nhập hàng'), 'purchase', v_id, v_id, c.id,
             r.names, r.ing, r.qty, auth.uid()
        from outlets o join expense_categories c on c.org_id = o.org_id and c.code = r.code and c.valid_to is null
       where o.id = v_outlet;
    end loop;
  end if;
  return jsonb_build_object('id', v_id, 'lines', v_n);
end $function$;

-- 5. Đảo phiếu nhập: phiếu đảo âm, tồn kho trừ lại, khoản chi đi kèm cũng đảo
create or replace function public.fn_reverse_purchase(p_id uuid, p_reason text)
 returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare v purchases; v_rev uuid; e record; v_neg jsonb;
begin
  select * into v from purchases where id = p_id for update;
  if not found or not public.can_manage_outlet(v.outlet_id) then raise exception 'Không tìm thấy phiếu nhập' using errcode = '42501'; end if;
  if v.status <> 'posted' then raise exception 'Phiếu nhập này đã được hủy' using errcode = 'P0001'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'Cần ghi lý do' using errcode = 'P0001'; end if;
  update purchases set status = 'reversed', reversal_reason = trim(p_reason) where id = p_id;
  insert into purchases (outlet_id, supplier_id, business_date, total_vnd, note, status, reversal_of, reversal_reason)
  values (v.outlet_id, v.supplier_id, v.business_date, -coalesce(v.total_vnd, 0), v.note, 'reversal', p_id, trim(p_reason))
  returning id into v_rev;
  insert into stock_movements (outlet_id, ingredient_id, qty_delta, reason, ref_table, ref_id, business_date)
  select outlet_id, ingredient_id, -qty_delta, 'reversal', 'purchases', v_rev, business_date
    from stock_movements where ref_table = 'purchases' and ref_id = p_id;
  for e in select id from expenses where purchase_id = p_id and status = 'active' loop
    perform public.fn_reverse_expense_inner(e.id, p_reason);
  end loop;
  -- tồn kho âm sau khi đảo: trả về để app nhắc kiểm kê
  select coalesce(jsonb_agg(jsonb_build_object('ingredient_id', b.ingredient_id, 'qty', b.qty)), '[]'::jsonb) into v_neg
    from (select sm.ingredient_id, sum(sm.qty_delta) qty from stock_movements sm
           where sm.outlet_id = v.outlet_id
             and sm.ingredient_id in (select ingredient_id from purchase_lines where purchase_id = p_id)
           group by 1 having sum(sm.qty_delta) < 0) b;
  return jsonb_build_object('reversal_id', v_rev, 'negative_stock', v_neg);
end $function$;

-- 6. Hủy khoản chi: dòng đảo chép đủ cột mới; khoản có phiếu nhập kèm (ghi từ màn Chi phí) thì đảo luôn phiếu
create or replace function public.fn_reverse_expense_inner(p_id uuid, p_reason text)
 returns uuid language plpgsql security definer set search_path to 'public' as $function$
declare v expenses; v_rev uuid;
begin
  select * into v from expenses where id = p_id for update;
  if v.status <> 'active' then return null; end if;
  update expenses set status = 'reversed', reversal_reason = trim(p_reason) where id = p_id;
  insert into expenses (outlet_id, spent_on, category, amount_vnd, note, source, ref_id, status, reversal_of, reversal_reason,
                        category_id, item_name, ingredient_id, qty, purchase_id, import_ref, import_row, created_by)
  values (v.outlet_id, v.spent_on, v.category, -v.amount_vnd, v.note, v.source, v.ref_id, 'reversal', v.id, trim(p_reason),
          v.category_id, v.item_name, v.ingredient_id, v.qty, v.purchase_id, v.import_ref, v.import_row, auth.uid())
  returning id into v_rev;
  return v_rev;
end $function$;
revoke execute on function public.fn_reverse_expense_inner(uuid, text) from public, anon, authenticated;

create or replace function public.fn_reverse_expense(p_id uuid, p_reason text)
 returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare v expenses; v_neg jsonb := '[]'::jsonb; v_r jsonb;
begin
  select * into v from expenses where id = p_id;
  if not found or not public.can_manage_outlet(v.outlet_id) then raise exception 'Không tìm thấy khoản chi' using errcode = '42501'; end if;
  if v.status <> 'active' then raise exception 'Khoản chi này đã được hủy' using errcode = 'P0001'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'Cần ghi lý do hủy' using errcode = 'P0001'; end if;
  if v.source = 'manual' and v.purchase_id is not null
     and exists (select 1 from purchases where id = v.purchase_id and status = 'posted') then
    v_r := public.fn_reverse_purchase(v.purchase_id, p_reason);   -- đảo phiếu, phiếu đảo luôn khoản chi này
    v_neg := v_r->'negative_stock';
  else
    perform public.fn_reverse_expense_inner(p_id, p_reason);
  end if;
  return jsonb_build_object('ok', true, 'negative_stock', v_neg);
end $function$;

-- 7. Ghi khoản chi 1.1
create or replace function public.fn_post_expense_v2(p jsonb)
 returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare
  v_outlet uuid := (p->>'outlet_id')::uuid;
  v_client uuid := nullif(p->>'client_id', '')::uuid;
  v_amount int := (p->>'amount_vnd')::int;
  v_date date := coalesce(nullif(p->>'spent_on', '')::date, public.vn_today());
  v_cat expense_categories;
  v_name text := nullif(trim(p->>'item_name'), '');
  v_ing ingredients;
  v_qty numeric := nullif(p->>'qty', '')::numeric;       -- theo đơn vị mua (kg, cái)
  v_pur uuid; v_id uuid; v_stock boolean := false;
begin
  if auth.uid() is null or not public.can_manage_outlet(v_outlet) then raise exception 'Chỉ chủ cơ sở được ghi chi phí' using errcode = '42501'; end if;
  if v_client is not null then
    select id into v_id from expenses where client_id = v_client;
    if found then return jsonb_build_object('id', v_id, 'duplicate', true); end if;
  end if;
  if v_amount is null or v_amount <= 0 then raise exception 'Số tiền phải lớn hơn 0' using errcode = 'P0001'; end if;
  if v_date > public.vn_today() then raise exception 'Không ghi chi phí cho ngày chưa tới' using errcode = 'P0001'; end if;
  select c.* into v_cat from expense_categories c join outlets o on o.org_id = c.org_id
   where c.id = (p->>'category_id')::uuid and o.id = v_outlet and c.valid_to is null and c.status = 'active';
  if v_cat.id is null then raise exception 'Chọn loại chi' using errcode = 'P0001'; end if;
  if v_cat.code = 'dau_tu' then
    select * into v_cat from expense_categories where org_id = v_cat.org_id and code = 'dt_may' and valid_to is null;
  end if;
  if v_name is null then v_name := v_cat.name; end if;
  if char_length(v_name) > 120 then raise exception 'Tên khoản chi dài quá 120 ký tự' using errcode = 'P0001'; end if;

  if nullif(p->>'ingredient_id', '') is not null then
    select i.* into v_ing from ingredients i join outlets o on o.org_id = i.org_id
     where i.id = (p->>'ingredient_id')::uuid and o.id = v_outlet;
    if v_ing.id is null then raise exception 'Không tìm thấy món trong kho' using errcode = 'P0001'; end if;
    if v_cat.ingredient_grp is null or v_ing.grp <> v_cat.ingredient_grp then
      raise exception '% không thuộc loại %', v_ing.name, v_cat.name using errcode = 'P0001';
    end if;
  end if;
  if v_qty is not null and v_qty <= 0 then raise exception 'Số lượng phải lớn hơn 0' using errcode = 'P0001'; end if;

  -- Có món trong kho và số lượng: tạo phiếu nhập cùng ngày (không tự ghi chi phí), rồi khoản chi trỏ về phiếu
  if v_ing.id is not null and v_qty is not null then
    v_pur := (public.fn_post_purchase(jsonb_build_object(
      'outlet_id', v_outlet, 'business_date', v_date, 'total_vnd', v_amount, 'skip_expense', true,
      'note', coalesce(nullif(trim(p->>'note'), ''), 'Ghi từ màn Chi phí'),
      'lines', jsonb_build_array(jsonb_build_object(
         'ingredient_id', v_ing.id, 'qty', v_qty * v_ing.purchase_factor,
         'unit_cost_vnd', round(v_amount / (v_qty * v_ing.purchase_factor))::int)))) ->> 'id')::uuid;
    v_stock := true;
  end if;

  insert into expenses (outlet_id, client_id, spent_on, category, amount_vnd, note, source, category_id, item_name,
                        ingredient_id, qty, purchase_id, replaces_id, created_by)
  values (v_outlet, v_client, v_date, v_cat.legacy_category, v_amount, nullif(trim(p->>'note'), ''), 'manual', v_cat.id, v_name,
          v_ing.id, case when v_stock then v_qty end, v_pur, nullif(p->>'replaces_id', '')::uuid, auth.uid())
  returning id into v_id;
  return jsonb_build_object('id', v_id, 'stock_applied', v_stock, 'purchase_id', v_pur);
end $function$;

-- 8. Sửa khoản chi = hủy khoản cũ (và phiếu kèm theo) + ghi khoản mới trỏ về khoản cũ
create or replace function public.fn_edit_expense(p_id uuid, p jsonb)
 returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare v expenses; v_r jsonb; v_new jsonb;
begin
  select * into v from expenses where id = p_id;
  if not found or not public.can_manage_outlet(v.outlet_id) then raise exception 'Không tìm thấy khoản chi' using errcode = '42501'; end if;
  if v.status <> 'active' then raise exception 'Khoản chi này đã được sửa hoặc hủy' using errcode = 'P0001'; end if;
  if v.source = 'purchase' then raise exception 'Khoản này tự ghi từ phiếu nhập kho. Sửa ở phiếu nhập trong Lịch sử.' using errcode = 'P0001'; end if;
  v_r := public.fn_reverse_expense(p_id, coalesce(nullif(trim(p->>'reason'), ''), 'Sửa khoản chi'));
  v_new := public.fn_post_expense_v2((p - 'reason') || jsonb_build_object('outlet_id', v.outlet_id, 'replaces_id', p_id));
  return v_new || jsonb_build_object('negative_stock', v_r->'negative_stock');
end $function$;

-- 9. Có vẻ đã ghi rồi: cùng cơ sở, ngày, loại, số tiền, ghi trong 24 giờ qua
create or replace function public.fn_find_duplicate_expense(p_outlet uuid, p_spent_on date, p_category_id uuid, p_amount int)
 returns jsonb language sql stable security definer set search_path to 'public' as $function$
  select coalesce((
    select jsonb_build_object('id', e.id, 'created_at', e.created_at, 'item_name', e.item_name,
                              'by', coalesce(pr.full_name, split_part(pr.email, '@', 1)))
      from expenses e left join profiles pr on pr.id = e.created_by
     where public.can_manage_outlet(p_outlet) and e.outlet_id = p_outlet and e.spent_on = p_spent_on
       and e.category_id = p_category_id and e.amount_vnd = p_amount and e.status = 'active'
       and e.created_at > now() - interval '24 hours'
     order by e.created_at desc limit 1), 'null'::jsonb)
$function$;

-- 10. Lãi lỗ theo ngày và nhóm (đọc cho Báo cáo, Quản trị). Đơn: v_daily_sales; tháng cũ nhập tay: historical_entries.
create or replace view public.v_daily_pnl_groups with (security_invoker = true) as
with s as (select outlet_id, business_date, revenue_vnd from public.v_daily_sales),
e as (
  select outlet_id, business_date,
         sum(amount_vnd) filter (where group_code = 'nguyen_lieu')::int as nguyen_lieu,
         sum(amount_vnd) filter (where group_code = 'vat_tu')::int as vat_tu,
         sum(amount_vnd) filter (where group_code = 'van_hanh')::int as van_hanh,
         sum(amount_vnd) filter (where group_code = 'dau_tu')::int as dau_tu
    from public.v_daily_expenses_by_group group by 1, 2),
h as (
  select outlet_id, month as business_date,
         sum(amount_vnd) filter (where kind = 'revenue')::int as revenue_vnd,
         sum(amount_vnd) filter (where kind <> 'revenue' and category = 'nhap_hang')::int as nguyen_lieu,
         sum(amount_vnd) filter (where kind <> 'revenue' and category <> 'nhap_hang')::int as van_hanh
    from public.historical_entries group by 1, 2)   -- như v_monthly_pnl: bản gốc + bản đảo tự triệt tiêu
select coalesce(s.outlet_id, e.outlet_id, h.outlet_id) as outlet_id,
       coalesce(s.business_date, e.business_date, h.business_date) as business_date,
       coalesce(s.revenue_vnd, 0) + coalesce(h.revenue_vnd, 0) as revenue_vnd,
       coalesce(e.nguyen_lieu, 0) + coalesce(h.nguyen_lieu, 0) as nguyen_lieu,
       coalesce(e.vat_tu, 0) as vat_tu,
       coalesce(e.van_hanh, 0) + coalesce(h.van_hanh, 0) as van_hanh,
       coalesce(e.dau_tu, 0) as dau_tu,
       (h.outlet_id is not null) as has_historical
from s
full join e on e.outlet_id = s.outlet_id and e.business_date = s.business_date
full join h on h.outlet_id = coalesce(s.outlet_id, e.outlet_id) and h.business_date = coalesce(s.business_date, e.business_date);

-- Kiểm tra (tài khoản chủ cơ sở, cơ sở test):
--   fn_post_expense_v2 {category_id: nl_chinh, item_name:'Óc chó', ingredient_id: oc_cho, qty: 1, amount_vnd: 420000}
--     → stock_applied = true, purchases có 1 phiếu, kho óc chó +1000 g, expenses 1 dòng có purchase_id.
--   fn_edit_expense đổi qty 2, 840000 → khoản cũ reversed, phiếu cũ reversed (kho −1000 g), phiếu mới +2000 g.
--   fn_post_purchase 2 dòng (óc chó 200.000, ly 50.000), total 250.000 → 2 khoản: nl_chinh 200.000, vat_tu 50.000.
--   fn_reverse_expense khoản nhập tay có purchase_id → phiếu kèm theo cũng reversed.
--   select sum(amount_vnd) from v_daily_expenses_by_group  ==  select sum(amount_vnd) from expenses
