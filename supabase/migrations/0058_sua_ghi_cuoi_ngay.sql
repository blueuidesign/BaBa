-- 0058: Ghi cuối ngày: nhân viên chỉ ghi, sửa, hoàn tác trong ngày; chủ cơ sở làm được mọi ngày.
-- Thêm fn_edit_day_end (đảo bản cũ + ghi bản mới trong một giao dịch). Đổi lời nhắc 21:00.

create or replace function public.fn_post_day_end(p jsonb) returns jsonb
language plpgsql security definer set search_path to 'public' as $fn$
declare
  v_outlet uuid := (p->>'outlet_id')::uuid;
  v_client uuid := nullif(p->>'client_id', '')::uuid;
  v_date date := coalesce(nullif(p->>'business_date', '')::date, public.vn_today());
  v_cash int := nullif(p->>'cash_counted_vnd', '')::int;
  v_tr int := nullif(p->>'transfer_counted_vnd', '')::int;
  v_id uuid; v_left int; v_waste int; v_ecash int; v_etr int; v_open int;
begin
  if auth.uid() is null or not public.can_access_outlet(v_outlet) then
    raise exception 'Bạn không có quyền ghi cuối ngày ở cơ sở này' using errcode = '42501';
  end if;
  if v_client is not null then
    select id into v_id from day_ends where client_id = v_client;
    if found then return jsonb_build_object('id', v_id, 'duplicate', true); end if;
  end if;
  if v_date <> public.vn_today() and not public.can_manage_outlet(v_outlet) then
    raise exception 'Nhân viên chỉ ghi cuối ngày cho hôm nay. Ngày khác thì nhờ chủ cơ sở.' using errcode = '42501';
  end if;
  if v_date > public.vn_today() then raise exception 'Không ghi cuối ngày cho ngày chưa tới' using errcode = 'P0001'; end if;
  if exists (select 1 from day_ends where outlet_id = v_outlet and business_date = v_date and status = 'active') then
    raise exception 'Ngày % đã ghi cuối ngày. Hoàn tác bản đó trước khi ghi lại.', to_char(v_date, 'DD/MM') using errcode = 'P0001';
  end if;
  if exists (select 1 from jsonb_array_elements(coalesce(p->'lines', '[]'::jsonb)) x
              where coalesce((x->>'left_qty')::int, 0) < 0 or coalesce((x->>'waste_qty')::int, 0) < 0) then
    raise exception 'Số chai không được âm' using errcode = 'P0001';
  end if;
  select coalesce(sum(total_vnd) filter (where payment_method = 'cash'), 0), coalesce(sum(total_vnd) filter (where payment_method = 'transfer'), 0)
    into v_ecash, v_etr from orders where outlet_id = v_outlet and business_date = v_date and status = 'active' and not is_gift;
  select amount_vnd into v_open from cash_opens where outlet_id = v_outlet and business_date = v_date order by created_at desc limit 1;

  insert into day_ends (outlet_id, client_id, business_date, cash_counted_vnd, transfer_counted_vnd, cash_open_vnd, expected_cash_vnd, expected_transfer_vnd, money_note)
  values (v_outlet, v_client, v_date, v_cash, v_tr, v_open, v_ecash, v_etr, nullif(btrim(coalesce(p->>'money_note', '')), ''))
  returning id into v_id;
  insert into day_end_lines (day_end_id, product_id, left_qty, waste_qty)
  select v_id, (x->>'product_id')::uuid, coalesce((x->>'left_qty')::int, 0), coalesce((x->>'waste_qty')::int, 0)
    from jsonb_array_elements(coalesce(p->'lines', '[]'::jsonb)) x
   where coalesce((x->>'left_qty')::int, 0) > 0 or coalesce((x->>'waste_qty')::int, 0) > 0;
  select coalesce(sum(left_qty), 0), coalesce(sum(waste_qty), 0) into v_left, v_waste from day_end_lines where day_end_id = v_id;
  update day_ends set left_total = v_left, waste_total = v_waste where id = v_id;

  -- Chai hủy: đã nấu, không bán được, nên trừ nguyên liệu, syrup và bao bì chai theo công thức đang dùng
  insert into stock_movements (outlet_id, ingredient_id, qty_delta, reason, ref_table, ref_id, business_date)
  select v_outlet, n.ingredient_id, -sum(n.qty), 'waste', 'day_ends', v_id, v_date
    from day_end_lines l, lateral public._parts_stock_need(l.product_id, public.current_recipe(l.product_id, v_date), 'chai', null, l.waste_qty) n
   where l.day_end_id = v_id and l.waste_qty > 0
   group by n.ingredient_id having sum(n.qty) > 0;
  return jsonb_build_object('id', v_id, 'left_total', v_left, 'waste_total', v_waste, 'expected_cash_vnd', v_ecash, 'expected_transfer_vnd', v_etr, 'cash_open_vnd', v_open);
end $fn$;

create or replace function public.fn_reverse_day_end(p_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v day_ends;
begin
  select * into v from day_ends where id = p_id for update;
  if not found or auth.uid() is null or not public.can_access_outlet(v.outlet_id) then
    raise exception 'Không tìm thấy bản ghi cuối ngày' using errcode = '42501';
  end if;
  if v.business_date <> public.vn_today() and not public.can_manage_outlet(v.outlet_id) then
    raise exception 'Nhân viên chỉ sửa được bản ghi cuối ngày của hôm nay. Ngày khác thì nhờ chủ cơ sở.' using errcode = '42501';
  end if;
  if v.status <> 'active' then raise exception 'Bản ghi này đã hoàn tác rồi' using errcode = 'P0001'; end if;
  update day_ends set status = 'reversed', reversed_by = auth.uid(), reversed_at = now() where id = p_id;
  insert into stock_movements (outlet_id, ingredient_id, qty_delta, reason, ref_table, ref_id, business_date)
  select outlet_id, ingredient_id, -qty_delta, 'reversal', 'day_ends', p_id, business_date
    from stock_movements where ref_table = 'day_ends' and ref_id = p_id and reason = 'waste';
  return jsonb_build_object('id', p_id, 'reversed', true);
end $$;

-- Sửa = đảo bản cũ rồi ghi bản mới cùng ngày, cùng cơ sở (sổ cái nối thêm, không sửa đè)
create or replace function public.fn_edit_day_end(p_id uuid, p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v day_ends; v_new uuid;
begin
  select * into v from day_ends where id = p_id;
  if not found then raise exception 'Không tìm thấy bản ghi cuối ngày' using errcode = '42501'; end if;
  -- gửi lại lúc mất mạng: bản mới đã có thì trả về luôn
  select id into v_new from day_ends where client_id = nullif(p->>'client_id', '')::uuid;
  if found then return jsonb_build_object('id', v_new, 'duplicate', true); end if;
  perform public.fn_reverse_day_end(p_id);
  return public.fn_post_day_end(p || jsonb_build_object('outlet_id', v.outlet_id, 'business_date', v.business_date));
end $$;
revoke all on function public.fn_edit_day_end(uuid, jsonb) from public, anon;
grant execute on function public.fn_edit_day_end(uuid, jsonb) to authenticated;

-- Nhắc 21:00: cơ sở có đơn hôm nay mà chưa ghi cuối ngày (không bắt buộc)
create or replace function public.fn_job_day_close_reminder()
returns integer language plpgsql security definer set search_path = public as $$
declare v_n int := 0; v_d date := public.vn_today(); r record;
begin
  for r in select distinct o.outlet_id from orders o
            where o.business_date = v_d and o.status = 'active'
              and not exists (select 1 from day_ends d where d.outlet_id = o.outlet_id and d.business_date = v_d and d.status = 'active') loop
    insert into notifications (outlet_id, kind, severity, title, body, link, dedupe_key)
    values (r.outlet_id, 'day_close_missing', 'info', 'Chưa ghi cuối ngày ' || to_char(v_d, 'DD/MM'),
            'Ghi chai hủy, chai tồn và kiểm tiền nếu cần. Không ghi cũng không sao.', '/cuoi-ngay', 'close:' || r.outlet_id || ':' || v_d)
    on conflict (dedupe_key) do nothing;
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;
