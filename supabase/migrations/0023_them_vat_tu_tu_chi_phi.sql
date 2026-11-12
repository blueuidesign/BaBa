-- 0023 · Thêm món mới vào danh mục kho ngay khi ghi chi phí hoặc nhập hàng (Tùng 12/11 15:49).
-- Chủ cơ sở, admin gọi; món mới thuộc cả tổ chức, bật cho mọi cơ sở. Tên trùng (không phân biệt hoa thường) thì trả món cũ.
create or replace function public.fn_create_ingredient(p_outlet uuid, p_name text, p_grp text, p_unit text)
 returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare v_org uuid; v_id uuid; v_name text := trim(p_name);
begin
  if auth.uid() is null or not public.can_manage_outlet(p_outlet) then
    raise exception 'Chỉ chủ cơ sở được thêm món vào kho' using errcode = '42501';
  end if;
  if coalesce(v_name, '') = '' then raise exception 'Nhập tên món' using errcode = 'P0001'; end if;
  if char_length(v_name) > 60 then raise exception 'Tên món dài quá 60 ký tự' using errcode = 'P0001'; end if;
  if p_grp not in ('main', 'additive', 'packaging') then raise exception 'Nhóm kho không hợp lệ' using errcode = 'P0001'; end if;
  if p_unit not in ('g', 'ml', 'cai') then raise exception 'Đơn vị chỉ nhận g, ml hoặc cái' using errcode = 'P0001'; end if;
  select org_id into v_org from outlets where id = p_outlet;
  select id into v_id from ingredients where org_id = v_org and lower(name) = lower(v_name) and status = 'active';
  if v_id is not null then return jsonb_build_object('id', v_id, 'existing', true); end if;
  insert into ingredients (org_id, code, name, grp, unit, purchase_unit, purchase_factor, kind, default_min_qty, sort_order, status)
  values (v_org, 'u_' || substr(md5(random()::text || clock_timestamp()::text), 1, 8), v_name, p_grp, p_unit, p_unit, 1,
          'purchased', 0, 90, 'active')
  returning id into v_id;
  insert into outlet_ingredient_settings (outlet_id, ingredient_id, enabled)
  select o.id, v_id, true from outlets o where o.org_id = v_org
  on conflict do nothing;
  return jsonb_build_object('id', v_id, 'existing', false);
end $function$;

-- Kiểm tra: select fn_create_ingredient('<cơ sở test>', 'Hạt bí', 'main', 'g');  -- trả id; gọi lại cùng tên trả existing = true
