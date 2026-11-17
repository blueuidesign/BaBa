-- Dựng lại những thứ ở production được tạo qua app (không qua migration) trước khi các migration nhập dữ liệu chạy:
-- tài khoản admin đầu tiên và cơ sở Phan Văn Hớn. Các migration từ 0019 trỏ thẳng tới hai mã này.
insert into auth.users (id, email) values ('2e8b7277-123f-4b66-8475-eb01a5266e0d', 'mr.tungvx@gmail.com')
on conflict do nothing;
insert into public.outlets (id, org_id, name, model, created_by)
select '3e1f4df8-6dcb-4593-85a4-2bef47468f42', o.id, 'Phan Văn Hớn', 'M2_street', '2e8b7277-123f-4b66-8475-eb01a5266e0d'
  from public.orgs o order by o.created_at limit 1
on conflict do nothing;
