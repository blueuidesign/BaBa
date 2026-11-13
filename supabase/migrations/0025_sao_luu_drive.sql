-- 0025 · Xuất toàn bộ dữ liệu ra JSON để Apps Script của Tùng lưu lên Google Drive mỗi đêm (13/11).
-- Gói Supabase Free không có sao lưu tự động. Hàm này chỉ ĐỌC, không sửa gì.
-- Bảo vệ: người gọi phải đưa đúng mã bí mật; DB chỉ giữ SHA-256 của mã (bảng backup_tokens, không policy nào nên không đọc được qua API).
-- Không xuất: push_subscriptions (khóa đẩy thông báo của từng máy), mật khẩu/phiên trong auth.
create extension if not exists pgcrypto with schema extensions;

create table if not exists public.backup_tokens (
  token_sha256 text primary key,
  note text,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);
alter table public.backup_tokens enable row level security;
comment on table public.backup_tokens is 'SHA-256 của mã cho Apps Script sao lưu. Không mở qua API.';

create or replace function public.fn_backup_export(p_token text)
 returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare v_out jsonb := '{}'::jsonb; v_rows jsonb; r record;
begin
  if p_token is null or not exists (
    select 1 from backup_tokens
     where revoked_at is null
       and token_sha256 = encode(extensions.digest(p_token, 'sha256'), 'hex')) then
    raise exception 'Mã sao lưu không đúng' using errcode = '42501';
  end if;
  for r in
    select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind in ('r', 'p')
       and c.relname not in ('push_subscriptions', 'backup_tokens')
     order by c.relname
  loop
    execute format('select coalesce(jsonb_agg(to_jsonb(t)), ''[]''::jsonb) from public.%I t', r.relname) into v_rows;
    v_out := v_out || jsonb_build_object(r.relname, v_rows);
  end loop;
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'email', email, 'created_at', created_at, 'last_sign_in_at', last_sign_in_at)), '[]'::jsonb)
    into v_rows from auth.users;
  return jsonb_build_object(
    'exported_at', now(),
    'business_date', (now() at time zone 'Asia/Ho_Chi_Minh')::date,
    'migration', '0025',
    'auth_users', v_rows,
    'tables', v_out);
end $function$;

revoke all on function public.fn_backup_export(text) from public;
grant execute on function public.fn_backup_export(text) to anon, authenticated;

-- Mã được thêm riêng (không ghi vào repo):
--   insert into backup_tokens (token_sha256, note) values (encode(extensions.digest('<mã>', 'sha256'), 'hex'), 'Apps Script Drive');
-- Đổi mã: update backup_tokens set revoked_at = now(); rồi thêm mã mới.
-- Kiểm tra: select jsonb_object_keys(fn_backup_export('<mã>')->'tables');
