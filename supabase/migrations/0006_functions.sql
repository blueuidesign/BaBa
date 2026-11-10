-- 0006_functions: mọi thao tác ghi đi qua các hàm này (security definer, tự kiểm quyền)

-- Số chai thành phẩm theo món cho một ngày nghiệp vụ
-- carried = chai còn đếm được ở lần chốt gần nhất trước ngày đó + nấu − bán của các ngày chưa chốt ở giữa
create or replace function public.fn_bottles_on_hand(p_outlet uuid, p_date date default public.vn_today())
returns table (product_id uuid, carried int, cooked int, sold int, left_qty int, closed boolean)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare v_d0 date; v_dc0 uuid; v_dc1 uuid;
begin
  if not public.can_access_outlet(p_outlet) then
    raise exception 'Bạn không có quyền xem cơ sở này' using errcode = '42501';
  end if;
  select d.business_date, d.id into v_d0, v_dc0 from day_closes d
   where d.outlet_id = p_outlet and d.is_current and d.business_date < p_date
   order by d.business_date desc limit 1;
  select d.id into v_dc1 from day_closes d
   where d.outlet_id = p_outlet and d.is_current and d.business_date = p_date limit 1;

  return query
  with ck as (
    select l.product_id, c.business_date, sum(l.qty)::int q
    from cook_run_lines l join cook_runs c on c.id = l.cook_run_id
    where c.outlet_id = p_outlet and c.status = 'active' and c.business_date <= p_date
      and (v_d0 is null or c.business_date > v_d0)
    group by 1, 2
  ), sd as (
    select l.product_id, o.business_date, sum(l.qty)::int q
    from order_lines l join orders o on o.id = l.order_id
    where o.outlet_id = p_outlet and o.status = 'active' and o.business_date <= p_date
      and (v_d0 is null or o.business_date > v_d0)
    group by 1, 2
  ), base as (
    select dl.product_id, dl.counted_left from day_close_lines dl where dl.day_close_id = v_dc0
  ), today_close as (
    select dl.product_id, dl.counted_left from day_close_lines dl where dl.day_close_id = v_dc1
  ), prods as (
    select om.product_id from outlet_menu om where om.outlet_id = p_outlet and om.enabled
    union select ck.product_id from ck
    union select sd.product_id from sd
    union select base.product_id from base where base.counted_left > 0
  ), x as (
    select pr.product_id,
      (coalesce((select b.counted_left from base b where b.product_id = pr.product_id), 0)
        + coalesce((select sum(ck.q) from ck where ck.product_id = pr.product_id and ck.business_date < p_date), 0)
        - coalesce((select sum(sd.q) from sd where sd.product_id = pr.product_id and sd.business_date < p_date), 0))::int as carried,
      coalesce((select sum(ck.q) from ck where ck.product_id = pr.product_id and ck.business_date = p_date), 0)::int as cooked,
      coalesce((select sum(sd.q) from sd where sd.product_id = pr.product_id and sd.business_date = p_date), 0)::int as sold,
      (select tc.counted_left from today_close tc where tc.product_id = pr.product_id) as closed_left
    from prods pr
  )
  select x.product_id, x.carried, x.cooked, x.sold,
         coalesce(x.closed_left, x.carried + x.cooked - x.sold)::int,
         v_dc1 is not null
  from x;
end $$;

-- Ghi một đơn. Idempotent theo client_id (gửi lại khi mất mạng không tạo trùng).
create or replace function public.fn_post_order(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_outlet uuid := (p->>'outlet_id')::uuid;
  v_client uuid := nullif(p->>'client_id', '')::uuid;
  v_date date := coalesce(nullif(p->>'business_date', '')::date, public.vn_today());
  v_gift boolean := coalesce((p->>'is_gift')::boolean, false);
  v_ex orders; v_id uuid; v_seq int; v_total int := 0; v_price int; r record;
begin
  if auth.uid() is null or not public.can_access_outlet(v_outlet) then
    raise exception 'Bạn không có quyền ghi đơn ở cơ sở này' using errcode = '42501';
  end if;
  if v_client is not null then
    select * into v_ex from orders where client_id = v_client;
    if found then
      return jsonb_build_object('id', v_ex.id, 'seq_in_day', v_ex.seq_in_day, 'total_vnd', v_ex.total_vnd,
                                'business_date', v_ex.business_date, 'duplicate', true);
    end if;
  end if;
  if coalesce(p->>'channel', 'counter') <> 'aggregate'
     and exists (select 1 from day_closes where outlet_id = v_outlet and business_date = v_date and is_current) then
    raise exception 'Ngày % đã chốt, không ghi thêm đơn được', to_char(v_date, 'DD/MM') using errcode = 'P0001';
  end if;
  if jsonb_array_length(coalesce(p->'lines', '[]'::jsonb)) = 0 then
    raise exception 'Đơn chưa có món nào' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(hashtext(v_outlet::text || v_date::text));
  select coalesce(max(seq_in_day), 0) + 1 into v_seq from orders
   where outlet_id = v_outlet and business_date = v_date and seq_in_day > 0;

  insert into orders (outlet_id, client_id, seq_in_day, business_date, channel, is_gift, note, placed_at)
  values (v_outlet, v_client, v_seq, v_date, coalesce(p->>'channel', 'counter'), v_gift, p->>'note',
          coalesce(nullif(p->>'placed_at', '')::timestamptz, now()))
  returning id into v_id;

  for r in select (x->>'product_id')::uuid as product_id, (x->>'qty')::int as qty
             from jsonb_array_elements(p->'lines') x loop
    continue when r.qty is null or r.qty <= 0;
    if v_gift then v_price := 0;
    else
      v_price := public.current_price(v_outlet, r.product_id, v_date);
      if v_price is null then raise exception 'Món chưa có giá niêm yết' using errcode = 'P0001'; end if;
    end if;
    insert into order_lines (order_id, product_id, qty, unit_price_vnd, recipe_id, line_total_vnd)
    values (v_id, r.product_id, r.qty, v_price, public.current_recipe(r.product_id, v_date), v_price * r.qty);
    v_total := v_total + v_price * r.qty;
    -- bao bì trừ lúc bán (bản 1 chưa có quy tắc nào; dành cho ly xay tại chỗ)
    insert into stock_movements (outlet_id, ingredient_id, qty_delta, reason, ref_table, ref_id, business_date)
    select v_outlet, pr.ingredient_id, -pr.qty_per_unit * r.qty, 'sale_packaging', 'orders', v_id, v_date
      from packaging_rules pr join products pd on pd.kind = pr.product_kind and pd.org_id = pr.org_id
     where pd.id = r.product_id and pr.consume_at = 'sale';
  end loop;

  update orders set total_vnd = v_total where id = v_id;
  return jsonb_build_object('id', v_id, 'seq_in_day', v_seq, 'total_vnd', v_total, 'business_date', v_date);
end $$;

-- Hoàn tác đơn: đánh dấu đơn gốc, thêm bản ghi đảo; không xóa gì
create or replace function public.fn_reverse_order(p_order uuid, p_reason text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v orders; v_rev uuid;
begin
  select * into v from orders where id = p_order for update;
  if not found or not public.can_access_outlet(v.outlet_id) then
    raise exception 'Không tìm thấy đơn' using errcode = '42501';
  end if;
  if v.status <> 'active' then raise exception 'Đơn này đã được hoàn tác' using errcode = 'P0001'; end if;
  if v.created_by is distinct from auth.uid() and not public.can_manage_outlet(v.outlet_id) then
    raise exception 'Chỉ người ghi đơn hoặc chủ cơ sở được hoàn tác' using errcode = '42501';
  end if;
  if exists (select 1 from day_closes where outlet_id = v.outlet_id and business_date = v.business_date and is_current) then
    raise exception 'Ngày % đã chốt; muốn sửa thì chốt lại ngày đó', to_char(v.business_date, 'DD/MM') using errcode = 'P0001';
  end if;
  update orders set status = 'reversed' where id = p_order;
  insert into orders (outlet_id, seq_in_day, business_date, channel, status, reversal_of, reversal_reason, total_vnd)
  values (v.outlet_id, -v.seq_in_day, v.business_date, v.channel, 'reversal', p_order, coalesce(p_reason, 'Hoàn tác'), 0)
  returning id into v_rev;
  insert into stock_movements (outlet_id, ingredient_id, qty_delta, reason, ref_table, ref_id, business_date)
  select outlet_id, ingredient_id, -qty_delta, 'reversal', 'orders', v_rev, business_date
    from stock_movements where ref_table = 'orders' and ref_id = p_order;
  return jsonb_build_object('reversal_id', v_rev);
end $$;

-- Chuyển một đơn thành đơn tặng (giá 0, vẫn tính chai)
create or replace function public.fn_mark_gift(p_order uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v orders; v_lines jsonb;
begin
  select * into v from orders where id = p_order;
  if not found then raise exception 'Không tìm thấy đơn' using errcode = 'P0001'; end if;
  select jsonb_agg(jsonb_build_object('product_id', product_id, 'qty', qty)) into v_lines
    from order_lines where order_id = p_order;
  perform public.fn_reverse_order(p_order, 'Chuyển thành đơn tặng');
  return public.fn_post_order(jsonb_build_object('outlet_id', v.outlet_id, 'business_date', v.business_date,
           'is_gift', true, 'lines', v_lines, 'note', 'Tặng'));
end $$;

-- Ghi đã nấu: trừ nguyên liệu theo công thức và bao bì, cộng chai lên quầy
create or replace function public.fn_post_cook_run(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_outlet uuid := (p->>'outlet_id')::uuid;
  v_client uuid := nullif(p->>'client_id', '')::uuid;
  v_date date := coalesce(nullif(p->>'business_date', '')::date, public.vn_today());
  v_plan uuid := nullif(p->>'plan_id', '')::uuid;
  v_id uuid; v_total int := 0; v_recipe uuid; r record;
begin
  if auth.uid() is null or not public.can_access_outlet(v_outlet) then
    raise exception 'Bạn không có quyền ở cơ sở này' using errcode = '42501';
  end if;
  if v_client is not null then
    select id into v_id from cook_runs where client_id = v_client;
    if found then return jsonb_build_object('id', v_id, 'duplicate', true); end if;
  end if;
  if exists (select 1 from day_closes where outlet_id = v_outlet and business_date = v_date and is_current) then
    raise exception 'Ngày % đã chốt', to_char(v_date, 'DD/MM') using errcode = 'P0001';
  end if;

  insert into cook_runs (outlet_id, client_id, business_date, plan_id, note)
  values (v_outlet, v_client, v_date, v_plan, p->>'note') returning id into v_id;

  for r in select (x->>'product_id')::uuid as product_id, (x->>'qty')::int as qty
             from jsonb_array_elements(coalesce(p->'lines', '[]'::jsonb)) x loop
    continue when r.qty is null or r.qty <= 0;
    v_recipe := public.current_recipe(r.product_id, v_date);
    insert into cook_run_lines (cook_run_id, product_id, qty, recipe_id) values (v_id, r.product_id, r.qty, v_recipe);
    v_total := v_total + r.qty;
    insert into stock_movements (outlet_id, ingredient_id, qty_delta, reason, ref_table, ref_id, business_date)
    select v_outlet, ri.ingredient_id, -ri.qty * r.qty, 'cook', 'cook_runs', v_id, v_date
      from recipe_items ri where ri.recipe_id = v_recipe;
    insert into stock_movements (outlet_id, ingredient_id, qty_delta, reason, ref_table, ref_id, business_date)
    select v_outlet, pr.ingredient_id, -pr.qty_per_unit * r.qty, 'cook_packaging', 'cook_runs', v_id, v_date
      from packaging_rules pr join products pd on pd.kind = pr.product_kind and pd.org_id = pr.org_id
     where pd.id = r.product_id and pr.consume_at = 'cook';
  end loop;

  if v_total = 0 then raise exception 'Chưa có món nào được nấu' using errcode = 'P0001'; end if;
  if v_plan is not null then update cook_plans set status = 'cooked' where id = v_plan and outlet_id = v_outlet; end if;
  return jsonb_build_object('id', v_id, 'bottles', v_total, 'business_date', v_date);
end $$;

-- Hoàn tác mẻ nấu: trong 10 phút và khi ngày đó chưa có đơn
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
  if exists (select 1 from orders where outlet_id = v.outlet_id and business_date = v.business_date and status = 'active') then
    raise exception 'Ngày này đã có đơn bán; hãy sửa bằng đếm chai cuối ngày' using errcode = 'P0001';
  end if;
  update cook_runs set status = 'reversed', reversal_reason = coalesce(p_reason, 'Ghi nhầm') where id = p_run;
  insert into stock_movements (outlet_id, ingredient_id, qty_delta, reason, ref_table, ref_id, business_date)
  select outlet_id, ingredient_id, -qty_delta, 'reversal', 'cook_runs', p_run, business_date
    from stock_movements where ref_table = 'cook_runs' and ref_id = p_run and reason in ('cook', 'cook_packaging');
  if v.plan_id is not null then update cook_plans set status = 'draft' where id = v.plan_id; end if;
  return jsonb_build_object('ok', true);
end $$;

-- Mẻ syrup, cốt cold brew
create or replace function public.fn_post_batch(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_outlet uuid := (p->>'outlet_id')::uuid;
  v_client uuid := nullif(p->>'client_id', '')::uuid;
  v_count numeric := (p->>'batch_count')::numeric;
  v_br batch_recipes; v_shelf int; v_id uuid; v_date date := public.vn_today(); v_exp date;
begin
  if auth.uid() is null or not public.can_access_outlet(v_outlet) then raise exception 'Bạn không có quyền ở cơ sở này' using errcode = '42501'; end if;
  if v_client is not null then
    select id into v_id from production_batches where client_id = v_client;
    if found then return jsonb_build_object('id', v_id, 'duplicate', true); end if;
  end if;
  if v_count is null or v_count <= 0 then raise exception 'Số mẻ phải lớn hơn 0' using errcode = 'P0001'; end if;
  select * into v_br from batch_recipes where id = (p->>'batch_recipe_id')::uuid;
  if not found then raise exception 'Không tìm thấy công thức mẻ' using errcode = 'P0001'; end if;
  select shelf_days into v_shelf from ingredients where id = v_br.output_ingredient_id;
  v_exp := case when v_shelf is null then null else v_date + v_shelf end;

  insert into production_batches (outlet_id, client_id, batch_recipe_id, batch_count, business_date, expires_at)
  values (v_outlet, v_client, v_br.id, v_count, v_date, v_exp) returning id into v_id;
  insert into stock_movements (outlet_id, ingredient_id, qty_delta, reason, ref_table, ref_id, business_date)
  select v_outlet, bi.ingredient_id, -bi.qty * v_count, 'batch_use', 'production_batches', v_id, v_date
    from batch_recipe_items bi where bi.batch_recipe_id = v_br.id;
  insert into stock_movements (outlet_id, ingredient_id, qty_delta, reason, ref_table, ref_id, business_date, lot_id, expires_at)
  values (v_outlet, v_br.output_ingredient_id, v_br.output_qty * v_count, 'batch_in', 'production_batches', v_id, v_date, v_id, v_exp);
  return jsonb_build_object('id', v_id, 'expires_at', v_exp);
end $$;

-- Nhập hàng. qty trong payload đã quy về đơn vị kho (app đổi kg → g).
create or replace function public.fn_post_purchase(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_outlet uuid := (p->>'outlet_id')::uuid;
  v_client uuid := nullif(p->>'client_id', '')::uuid;
  v_id uuid; v_date date := public.vn_today(); v_n int := 0; r record;
begin
  if auth.uid() is null or not public.can_access_outlet(v_outlet) then raise exception 'Bạn không có quyền ở cơ sở này' using errcode = '42501'; end if;
  if v_client is not null then
    select id into v_id from purchases where client_id = v_client;
    if found then return jsonb_build_object('id', v_id, 'duplicate', true); end if;
  end if;
  insert into purchases (outlet_id, client_id, supplier_id, business_date, total_vnd, note, receipt_url)
  values (v_outlet, v_client, nullif(p->>'supplier_id', '')::uuid, v_date, nullif(p->>'total_vnd', '')::int, p->>'note', p->>'receipt_url')
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
  return jsonb_build_object('id', v_id, 'lines', v_n);
end $$;

-- Kiểm kê: ghi chênh lệch thành bản ghi điều chỉnh, không sửa số cũ
create or replace function public.fn_post_count(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_outlet uuid := (p->>'outlet_id')::uuid;
  v_client uuid := nullif(p->>'client_id', '')::uuid;
  v_id uuid; v_date date := public.vn_today(); v_book numeric; v_n int := 0; r record;
begin
  if auth.uid() is null or not public.can_access_outlet(v_outlet) then raise exception 'Bạn không có quyền ở cơ sở này' using errcode = '42501'; end if;
  if v_client is not null then
    select id into v_id from stock_counts where client_id = v_client;
    if found then return jsonb_build_object('id', v_id, 'duplicate', true); end if;
  end if;
  insert into stock_counts (outlet_id, client_id, business_date, reason, note)
  values (v_outlet, v_client, v_date, p->>'reason', p->>'note') returning id into v_id;
  for r in select (x->>'ingredient_id')::uuid as ingredient_id, (x->>'qty_actual')::numeric as qty_actual,
                  coalesce(nullif(x->>'reason', ''), p->>'reason') as reason
             from jsonb_array_elements(coalesce(p->'lines', '[]'::jsonb)) x loop
    continue when r.qty_actual is null or r.qty_actual < 0;
    select coalesce(sum(qty_delta), 0) into v_book from stock_movements
     where outlet_id = v_outlet and ingredient_id = r.ingredient_id;
    insert into stock_count_lines (stock_count_id, ingredient_id, qty_book, qty_actual, reason)
    values (v_id, r.ingredient_id, v_book, r.qty_actual,
            case when r.reason in ('shrink','spoiled','purchase_missed','cook_wrong','other') then r.reason end);
    if r.qty_actual <> v_book then
      insert into stock_movements (outlet_id, ingredient_id, qty_delta, reason, ref_table, ref_id, business_date)
      values (v_outlet, r.ingredient_id, r.qty_actual - v_book, 'count_adjust', 'stock_counts', v_id, v_date);
    end if;
    v_n := v_n + 1;
  end loop;
  if v_n = 0 then raise exception 'Chưa nhập số thực tế nào' using errcode = 'P0001'; end if;
  return jsonb_build_object('id', v_id, 'lines', v_n);
end $$;

-- Đối chiếu cuối ngày. p_commit = false: chỉ tính để hiện E03, không ghi gì.
create or replace function public.fn_close_day(p jsonb, p_commit boolean default true) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_outlet uuid := (p->>'outlet_id')::uuid;
  v_date date := coalesce(nullif(p->>'business_date', '')::date, public.vn_today());
  v_gift int := coalesce((p->>'gift_total')::int, 0);
  v_waste int := coalesce((p->>'waste_total')::int, 0);
  v_cash int := coalesce((p->>'cash_vnd')::int, 0);
  v_transfer int := coalesce((p->>'transfer_vnd')::int, 0);
  v_old day_closes; v_id uuid;
  v_out int := 0; v_sold int := 0; v_rev int := 0; v_diff int; v_remain int; v_take int;
  v_catch jsonb := '[]'::jsonb; v_catch_order jsonb; v_lines jsonb := '[]'::jsonb; r record;
begin
  if auth.uid() is null or not public.can_access_outlet(v_outlet) then raise exception 'Bạn không có quyền ở cơ sở này' using errcode = '42501'; end if;
  if v_gift < 0 or v_waste < 0 or v_cash < 0 or v_transfer < 0 then raise exception 'Số nhập không được âm' using errcode = 'P0001'; end if;

  select * into v_old from day_closes where outlet_id = v_outlet and business_date = v_date and is_current;
  if found and p_commit and coalesce(p->>'reclose_reason', '') = '' then
    raise exception 'Ngày % đã chốt; chốt lại cần ghi lý do', to_char(v_date, 'DD/MM') using errcode = 'P0001';
  end if;

  -- chai đếm được theo món (món không nhập thì coi như đúng số sổ)
  create temp table if not exists _close_calc (product_id uuid, carried int, cooked int, sold int, counted int) on commit drop;
  truncate _close_calc;
  insert into _close_calc
  select b.product_id, b.carried, b.cooked, b.sold,
         coalesce((select (x->>'counted_left')::int from jsonb_array_elements(coalesce(p->'lines', '[]'::jsonb)) x
                   where (x->>'product_id')::uuid = b.product_id), b.carried + b.cooked - b.sold)
    from public.fn_bottles_on_hand(v_outlet, v_date) b
   where b.carried <> 0 or b.cooked <> 0 or b.sold <> 0
      or exists (select 1 from jsonb_array_elements(coalesce(p->'lines', '[]'::jsonb)) x where (x->>'product_id')::uuid = b.product_id);
  -- khi chốt lại, fn_bottles_on_hand trả sold đúng nhưng left theo lần chốt cũ; carried/cooked không đổi nên vẫn dùng được

  select coalesce(sum(carried + cooked - counted), 0), coalesce(sum(sold), 0) into v_out, v_sold from _close_calc;
  v_diff := v_out - v_gift - v_waste - v_sold;

  -- đơn bổ sung cuối ngày cho số chai chưa rõ: chia theo món có chênh lệch dương
  if v_diff > 0 and coalesce((p->>'create_catchup_order')::boolean, false) then
    v_remain := v_gift + v_waste;
    for r in select product_id, (carried + cooked - counted - sold) as d from _close_calc
              where carried + cooked - counted - sold > 0 order by 2 desc loop
      v_take := greatest(0, r.d - v_remain);
      v_remain := greatest(0, v_remain - r.d);
      if v_take > 0 then v_catch := v_catch || jsonb_build_object('product_id', r.product_id, 'qty', v_take); end if;
    end loop;
  end if;

  if p_commit and jsonb_array_length(v_catch) > 0 then
    v_catch_order := public.fn_post_order(jsonb_build_object('outlet_id', v_outlet, 'business_date', v_date,
                       'channel', 'aggregate', 'lines', v_catch, 'note', 'Đơn bổ sung khi đối chiếu'));
    update _close_calc c set sold = c.sold + (x->>'qty')::int
      from jsonb_array_elements(v_catch) x where (x->>'product_id')::uuid = c.product_id;
    select coalesce(sum(sold), 0) into v_sold from _close_calc;
    v_diff := v_out - v_gift - v_waste - v_sold;
  end if;

  select coalesce(sum(l.line_total_vnd) filter (where not o.is_gift), 0) into v_rev
    from orders o join order_lines l on l.order_id = o.id
   where o.outlet_id = v_outlet and o.business_date = v_date and o.status = 'active';
  select coalesce(jsonb_agg(jsonb_build_object('product_id', product_id, 'carried', carried, 'cooked', cooked,
           'sold', sold, 'counted_left', counted, 'out', carried + cooked - counted)), '[]'::jsonb)
    into v_lines from _close_calc;

  if not p_commit then
    return jsonb_build_object('bottles_out', v_out, 'bottles_by_orders', v_sold, 'gift_total', v_gift, 'waste_total', v_waste,
      'diff_bottles', v_diff, 'revenue_by_orders_vnd', v_rev, 'cash_vnd', v_cash, 'transfer_vnd', v_transfer,
      'diff_money_vnd', v_cash + v_transfer - v_rev, 'lines', v_lines, 'already_closed', v_old.id is not null,
      'catchup_preview', v_catch);
  end if;

  if v_old.id is not null then update day_closes set is_current = false where id = v_old.id; end if;
  insert into day_closes (outlet_id, business_date, supersedes, cash_counted_vnd, transfer_counted_vnd,
         revenue_by_orders_vnd, bottles_by_orders, bottles_out, gift_total, waste_total, diff_bottles,
         diff_money_vnd, money_diff_reason, reclose_reason)
  values (v_outlet, v_date, v_old.id, v_cash, v_transfer, v_rev, v_sold, v_out, v_gift, v_waste, v_diff,
          v_cash + v_transfer - v_rev, nullif(p->>'money_diff_reason', ''), nullif(p->>'reclose_reason', ''))
  returning id into v_id;
  insert into day_close_lines (day_close_id, product_id, cooked_qty, carried_qty, sold_qty, counted_left)
  select v_id, product_id, cooked, carried, sold, counted from _close_calc;

  if nullif(p->>'syrup_measured_ml', '') is not null then
    perform public.fn_post_count(jsonb_build_object('outlet_id', v_outlet, 'reason', 'other', 'note', 'Đo syrup khi chốt ngày',
      'lines', jsonb_build_array(jsonb_build_object('ingredient_id',
         (select i.id from ingredients i join outlets o on o.org_id = i.org_id where o.id = v_outlet and i.code = 'syrup'),
         'qty_actual', (p->>'syrup_measured_ml')::numeric))));
  end if;

  return jsonb_build_object('id', v_id, 'bottles_out', v_out, 'bottles_by_orders', v_sold, 'diff_bottles', v_diff,
    'revenue_by_orders_vnd', v_rev, 'diff_money_vnd', v_cash + v_transfer - v_rev, 'catchup_order', v_catch_order);
end $$;

-- Tạo cơ sở mới: người tạo là owner, menu bật theo mô hình
create or replace function public.fn_create_outlet(p_name text, p_model text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_org uuid; v_id uuid;
begin
  if auth.uid() is null then raise exception 'Chưa đăng nhập' using errcode = '42501'; end if;
  if not (public.is_org_admin() or exists (select 1 from public.my_owned_outlets())) then
    raise exception 'Chỉ chủ cơ sở hoặc admin được tạo cơ sở mới' using errcode = '42501';
  end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'Tên cơ sở không được trống' using errcode = 'P0001'; end if;
  select org_id into v_org from org_memberships where user_id = auth.uid() and status = 'active' limit 1;
  if v_org is null then select o.org_id into v_org from outlets o where o.id in (select public.my_owned_outlets()) limit 1; end if;
  if exists (select 1 from outlets where org_id = v_org and lower(name) = lower(trim(p_name))) then
    raise exception 'Đã có cơ sở tên "%"', trim(p_name) using errcode = 'P0001';
  end if;
  insert into outlets (org_id, name, model, created_by, price_list_id)
  values (v_org, trim(p_name), p_model, auth.uid(), (select id from price_lists where org_id = v_org and code = 'default'))
  returning id into v_id;
  insert into memberships (user_id, outlet_id, role, created_by) values (auth.uid(), v_id, 'owner', auth.uid());
  insert into outlet_menu (outlet_id, product_id, sort_order)
  select v_id, p.id, p.sort_order from products p
   where p.org_id = v_org and p.status = 'active'
     and (not exists (select 1 from model_default_menu m where m.org_id = v_org and m.model = p_model)
          or p.id in (select product_id from model_default_menu m where m.org_id = v_org and m.model = p_model));
  insert into notification_settings (outlet_id) values (v_id);
  return v_id;
end $$;

-- Mời người vào cơ sở (dùng bằng SQL ở bản 1; màn hình làm sau)
create or replace function public.fn_invite_member(p_outlet uuid, p_email text, p_role text default 'staff') returns uuid
language plpgsql security definer set search_path = public as $$
declare v_user uuid; v_id uuid;
begin
  if not public.can_manage_outlet(p_outlet) then raise exception 'Chỉ chủ cơ sở được mời người' using errcode = '42501'; end if;
  if p_role = 'owner' and not public.is_org_admin() then raise exception 'Chỉ admin được gán chủ cơ sở' using errcode = '42501'; end if;
  select id into v_user from profiles where email = lower(trim(p_email));
  if v_user is not null then
    insert into memberships (user_id, outlet_id, role, created_by) values (v_user, p_outlet, p_role, auth.uid())
    on conflict (user_id, outlet_id) do update set role = excluded.role, status = 'active'
    returning id into v_id;
  else
    insert into memberships (outlet_id, role, status, invited_email, created_by)
    values (p_outlet, p_role, 'invited', lower(trim(p_email)), auth.uid()) returning id into v_id;
  end if;
  return v_id;
end $$;

-- Tác vụ nền: 06:00 nhắc đặt hàng, hết hạn; 21:00 nhắc chốt ngày
create or replace function public.fn_job_morning_alerts() returns int
language plpgsql security definer set search_path = public as $$
declare v_n int := 0; v_d date := public.vn_today(); r record;
begin
  for r in select outlet_id, coalesce(supplier_name, 'Chưa gán nhà cung cấp') as supplier,
                  count(*) as n, string_agg(name, ', ' order by name) as items
             from v_stock_status s join outlets o on o.id = s.outlet_id and o.status = 'active'
            where needs_order group by 1, 2 loop
    insert into notifications (outlet_id, kind, severity, title, body, link, dedupe_key)
    values (r.outlet_id, 'reorder', 'warn', 'Nên đặt hôm nay: ' || r.supplier || ' (' || r.n || ' món)', r.items, '/kho',
            'reorder:' || r.outlet_id || ':' || r.supplier || ':' || v_d)
    on conflict (dedupe_key) do nothing;
    v_n := v_n + 1;
  end loop;
  for r in select outlet_id, ingredient_id, name, nearest_expiry from v_stock_status where expiring loop
    insert into notifications (outlet_id, kind, severity, title, body, link, dedupe_key)
    values (r.outlet_id, 'expiry', 'warn', r.name || ' sắp hết hạn', 'Hạn ' || to_char(r.nearest_expiry, 'DD/MM'),
            '/kho/' || r.ingredient_id, 'expiry:' || r.outlet_id || ':' || r.ingredient_id || ':' || v_d)
    on conflict (dedupe_key) do nothing;
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

create or replace function public.fn_job_day_close_reminder() returns int
language plpgsql security definer set search_path = public as $$
declare v_n int := 0; v_d date := public.vn_today(); r record;
begin
  for r in select distinct o.outlet_id from orders o
            where o.business_date = v_d and o.status = 'active'
              and not exists (select 1 from day_closes d where d.outlet_id = o.outlet_id and d.business_date = v_d and d.is_current) loop
    insert into notifications (outlet_id, kind, severity, title, body, link, dedupe_key)
    values (r.outlet_id, 'day_close_missing', 'info', 'Chưa đối chiếu cuối ngày ' || to_char(v_d, 'DD/MM'),
            'Đếm chai còn và tiền để chốt ngày.', '/doi-chieu', 'close:' || r.outlet_id || ':' || v_d)
    on conflict (dedupe_key) do nothing;
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

-- Nhật ký kiểm toán cho các bảng có sửa (cài đặt, phân quyền)
create or replace function public.audit_trigger() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into audit_log (actor_id, table_name, row_id, action, old_row, new_row)
  values (auth.uid(), tg_table_name,
          coalesce((to_jsonb(new)->>'id')::uuid, (to_jsonb(old)->>'id')::uuid, (to_jsonb(new)->>'outlet_id')::uuid),
          tg_op, case when tg_op <> 'INSERT' then to_jsonb(old) end, case when tg_op <> 'DELETE' then to_jsonb(new) end);
  return coalesce(new, old);
end $$;
create trigger audit_memberships after insert or update or delete on public.memberships for each row execute function public.audit_trigger();
create trigger audit_org_memberships after insert or update or delete on public.org_memberships for each row execute function public.audit_trigger();
create trigger audit_ois after insert or update or delete on public.outlet_ingredient_settings for each row execute function public.audit_trigger();
create trigger audit_outlets after update on public.outlets for each row execute function public.audit_trigger();
