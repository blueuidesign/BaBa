-- 0015: gửi thông báo đẩy khi có dòng mới trong notifications.
-- Trigger gọi Edge Function send-push qua pg_net (không chờ kết quả, không làm chậm job 06:00/21:00).
-- Khóa bí mật của hook nằm trong Vault, tên 'push_hook_secret' (tạo tay, không để trong repo).
-- Chưa có khóa trong Vault thì trigger bỏ qua, thông báo vẫn ghi vào bảng như cũ.
create extension if not exists pg_net with schema extensions;

create or replace function public.trg_notification_push() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_secret text;
begin
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'push_hook_secret' limit 1;
  if v_secret is null then return new; end if;
  perform net.http_post(
    url := 'https://fsqpajvjjmpyrgllrhgz.supabase.co/functions/v1/send-push',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', v_secret),
    body := jsonb_build_object('notification_id', new.id)
  );
  return new;
exception when others then
  -- Gửi push hỏng thì không được làm hỏng việc ghi thông báo
  raise warning 'push hook failed: %', sqlerrm;
  return new;
end $$;
revoke execute on function public.trg_notification_push() from public, anon, authenticated;

create trigger notifications_push after insert on public.notifications
for each row execute function public.trg_notification_push();

-- Edge Function send-push đọc khóa VAPID và khóa hook từ Vault qua hàm này (chỉ service_role gọi được),
-- nên không cần đặt secret riêng cho Edge Function. Tên trong Vault:
-- vapid_public_key, vapid_private_key, vapid_subject, push_hook_secret.
create or replace function public.fn_push_config() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_object_agg(name, decrypted_secret), '{}'::jsonb)
  from vault.decrypted_secrets
  where name in ('vapid_public_key', 'vapid_private_key', 'vapid_subject', 'push_hook_secret')
$$;
revoke execute on function public.fn_push_config() from public, anon, authenticated;
grant execute on function public.fn_push_config() to service_role;
