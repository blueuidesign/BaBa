-- 0011_security_hardening: theo cảnh báo của Supabase advisor
alter function public.vn_today() set search_path = public;
alter function public.set_updated_at() set search_path = public;

-- Hàm trigger không được gọi qua API
revoke execute on function public.audit_trigger() from public, anon, authenticated;

-- Hàm trợ giúp phân quyền: chỉ người đã đăng nhập (policy RLS cần quyền này), không cho anon
do $$ declare f text; begin
  foreach f in array array['can_access_outlet(uuid)','can_manage_outlet(uuid)','is_org_admin()','my_outlets()',
    'my_owned_outlets()','current_price(uuid,uuid,date)','current_recipe(uuid,date)']
  loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

-- bootstrap_admins bật RLS và cố ý không có policy: không ai đọc được qua API.
comment on table public.bootstrap_admins is 'Danh sách email được gán admin khi đăng nhập lần đầu. Không mở qua API.';
