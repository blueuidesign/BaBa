-- 0016: khóa cho thông báo đẩy tự sinh, không đi qua người hay repo.
-- Khóa hook sinh ngẫu nhiên ngay trong DB. Cặp khóa VAPID do Edge Function send-push tự sinh lần chạy đầu
-- rồi cất vào Vault qua fn_push_init (chỉ service_role gọi được).
do $$ begin
  if not exists (select 1 from vault.secrets where name = 'push_hook_secret') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'push_hook_secret');
  end if;
  if not exists (select 1 from vault.secrets where name = 'vapid_subject') then
    perform vault.create_secret('https://github.com/blueuidesign/BaBa', 'vapid_subject');
  end if;
end $$;

create or replace function public.fn_push_init(p_public text, p_private text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from vault.secrets where name = 'vapid_public_key') then
    perform vault.create_secret(p_public, 'vapid_public_key');
    perform vault.create_secret(p_private, 'vapid_private_key');
  end if;
end $$;
revoke execute on function public.fn_push_init(text, text) from public, anon, authenticated;
grant execute on function public.fn_push_init(text, text) to service_role;
