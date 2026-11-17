-- 0055 · Nhân viên xem và thêm được chi phí (Tùng 17/11 08:31).
-- Nhân viên: đọc danh sách chi phí của cơ sở mình, ghi khoản chi mới (kể cả khoản vận hành chia nhiều tháng do chính mình ghi).
-- Sửa, hủy khoản chi, thêm món mới vào kho và xem báo cáo lãi vẫn chỉ chủ cơ sở (fn_edit_expense, fn_reverse_expense, fn_create_ingredient, fn_profit_report, fn_net_report không đổi).
alter policy expenses_read on public.expenses using (public.can_access_outlet(outlet_id));

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
  v_qty numeric := nullif(p->>'qty', '')::numeric;
  v_pur uuid; v_id uuid; v_stock boolean := false;
begin
  if auth.uid() is null or not public.can_access_outlet(v_outlet) then raise exception 'Bạn không có quyền ghi chi phí ở cơ sở này' using errcode = '42501'; end if;
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

create or replace function public.fn_find_duplicate_expense(p_outlet uuid, p_spent_on date, p_category_id uuid, p_amount integer)
returns jsonb language sql stable security definer set search_path to 'public' as $function$
  select coalesce((
    select jsonb_build_object('id', e.id, 'created_at', e.created_at, 'item_name', e.item_name,
                              'by', coalesce(pr.full_name, split_part(pr.email, '@', 1)))
      from expenses e left join profiles pr on pr.id = e.created_by
     where public.can_access_outlet(p_outlet) and e.outlet_id = p_outlet and e.spent_on = p_spent_on
       and e.category_id = p_category_id and e.amount_vnd = p_amount and e.status = 'active'
       and e.created_at > now() - interval '24 hours'
     order by e.created_at desc limit 1), 'null'::jsonb)
$function$;

create or replace function public.fn_set_expense_period(p_client uuid, p_from date, p_to date)
returns jsonb language plpgsql security definer set search_path to 'public' as $fn$
declare v expenses; v_grp text; v_f date; v_t date;
begin
  select * into v from expenses where client_id = p_client and status = 'active' order by created_at desc limit 1;
  if not found or not (public.can_manage_outlet(v.outlet_id) or (v.created_by = auth.uid() and public.can_access_outlet(v.outlet_id))) then raise exception 'Không tìm thấy khoản chi' using errcode = '42501'; end if;
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
