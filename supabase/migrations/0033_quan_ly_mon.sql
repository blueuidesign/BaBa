-- 0033 · Đưa Mầm Sáng Trí Tuệ về nhóm Mầm Sáng; admin quản lý món trong app (Tùng 14/11).

-- 1. Sáng Trí Tuệ về nhóm Mầm Sáng (giá giữ nguyên 25.000 đ; thứ tự hiển thị đã nằm cuối nhóm Sáng)
update public.products set line = 'sang' where code = 'stt' and line <> 'sang';

-- 2. Admin thêm, sửa món: tên, tên ngắn, nhóm, giá bán, đang bán hay ngừng.
--    Giá có phiên bản: đổi giá thì đóng dòng giá cũ (valid_to = hôm nay) và mở dòng mới; đơn cũ giữ giá lúc bán.
--    Món mới chưa có công thức, được bật ở mọi cơ sở. Ngừng bán không xóa món: đơn cũ vẫn hiện đúng tên.
create or replace function public.fn_admin_save_product(p jsonb)
 returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare
  v_id uuid := nullif(p->>'id', '')::uuid;
  v_name text := btrim(coalesce(p->>'name', ''));
  v_short text := btrim(coalesce(nullif(btrim(p->>'short_name'), ''), p->>'name', ''));
  v_line text := p->>'line';
  v_status text := coalesce(p->>'status', 'active');
  v_price int := (p->>'price_vnd')::int;
  v_today date := (now() at time zone 'Asia/Ho_Chi_Minh')::date;
  v_org uuid; o products%rowtype; v_new boolean := false; pl record; cur record;
begin
  if auth.uid() is null or not public.is_org_admin() then
    raise exception 'Chỉ admin được sửa danh sách món' using errcode = '42501';
  end if;
  if v_name = '' then raise exception 'Nhập tên món' using errcode = 'P0001'; end if;
  if char_length(v_name) > 60 or char_length(v_short) > 40 then raise exception 'Tên món dài quá (tên 60, tên ngắn 40 ký tự)' using errcode = 'P0001'; end if;
  if v_line not in ('xanh', 'sang', 'lanh', 'tre') then raise exception 'Chọn nhóm món' using errcode = 'P0001'; end if;
  if v_status not in ('active', 'retired') then raise exception 'Trạng thái không hợp lệ' using errcode = 'P0001'; end if;
  if v_price is null or v_price < 0 or v_price > 1000000 then raise exception 'Giá bán phải từ 0 đến 1.000.000 đ' using errcode = 'P0001'; end if;

  if v_id is null then
    select id into v_org from orgs where code = 'baba';
    if exists (select 1 from products where org_id = v_org and lower(name) = lower(v_name)) then
      raise exception 'Đã có món tên "%"', v_name using errcode = 'P0001';
    end if;
    insert into products (org_id, code, name, short_name, line, kind, sort_order, status)
    values (v_org, 'p_' || substr(md5(random()::text || clock_timestamp()::text), 1, 8), v_name, v_short, v_line, 'milk_bottle',
            (select coalesce(max(sort_order), 0) + 1 from products where org_id = v_org and sort_order < 100), v_status)
    returning * into o;
    v_new := true;
  else
    select * into o from products where id = v_id for update;
    if not found then raise exception 'Không tìm thấy món' using errcode = 'P0001'; end if;
    if exists (select 1 from products where org_id = o.org_id and id <> v_id and lower(name) = lower(v_name)) then
      raise exception 'Đã có món khác tên "%"', v_name using errcode = 'P0001';
    end if;
    update products set name = v_name, short_name = v_short, line = v_line, status = v_status where id = v_id;
  end if;

  -- Giá: mọi bảng giá của tổ chức
  for pl in select id from price_lists where org_id = o.org_id loop
    select * into cur from product_prices where price_list_id = pl.id and product_id = o.id and valid_to is null order by valid_from desc limit 1;
    if not found then
      insert into product_prices (price_list_id, product_id, price_vnd, valid_from) values (pl.id, o.id, v_price, v_today);
    elsif cur.price_vnd <> v_price then
      if cur.valid_from >= v_today then
        update product_prices set price_vnd = v_price where id = cur.id;
      else
        update product_prices set valid_to = v_today where id = cur.id;
        insert into product_prices (price_list_id, product_id, price_vnd, valid_from) values (pl.id, o.id, v_price, v_today);
      end if;
    end if;
  end loop;

  -- Đang bán: bảo đảm mọi cơ sở có dòng thực đơn (không bật lại nơi chủ cơ sở đã tự tắt)
  if v_status = 'active' then
    insert into outlet_menu (outlet_id, product_id, enabled, sort_order)
    select ot.id, o.id, true, o.sort_order from outlets ot where ot.org_id = o.org_id
    on conflict (outlet_id, product_id) do nothing;
  end if;

  insert into audit_log (actor_id, table_name, row_id, action, old_row, new_row)
  values (auth.uid(), 'products', o.id, case when v_new then 'create' else 'update' end,
          case when v_new then null else jsonb_build_object('name', o.name, 'short_name', o.short_name, 'line', o.line, 'status', o.status) end,
          jsonb_build_object('name', v_name, 'short_name', v_short, 'line', v_line, 'status', v_status, 'price_vnd', v_price));
  return jsonb_build_object('id', o.id, 'created', v_new);
end $function$;
revoke all on function public.fn_admin_save_product(jsonb) from public, anon;
grant execute on function public.fn_admin_save_product(jsonb) to authenticated;

-- Kiểm tra: select code, name, line from products where code = 'stt';  -- line = sang
