-- 0024 · Thêm admin sualanhtubaba@gmail.com (Tùng 13/11).
-- Chưa đăng nhập lần nào: ghi vào bootstrap_admins, trigger handle_new_user gán quyền admin ở lần đăng nhập đầu.
-- Nếu đã có tài khoản: gán quyền admin ngay.
insert into public.bootstrap_admins (email) values ('sualanhtubaba@gmail.com') on conflict (email) do nothing;

insert into public.org_memberships (user_id, org_id, role)
select u.id, o.id, 'admin' from auth.users u cross join public.orgs o
 where lower(u.email) = 'sualanhtubaba@gmail.com' and o.code = 'baba'
on conflict (user_id, org_id) do nothing;

-- Kiểm tra: select * from bootstrap_admins;  -- có sualanhtubaba@gmail.com
