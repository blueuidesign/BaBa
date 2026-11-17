-- Hàm trợ giúp cho các file kiểm thử t_*.sql. Chỉ dùng trong database kiểm thử.
create schema if not exists t;
grant usage on schema t to anon, authenticated, service_role;

-- Đóng vai một người dùng đã đăng nhập (giống JWT mà Supabase gắn vào mỗi lời gọi API)
create or replace function t.login(p_uid uuid) returns void language sql as
$$ select set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true) $$;
create or replace function t.logout() returns void language sql as
$$ select set_config('request.jwt.claims', '', true) $$;

-- Tạo người dùng (trigger của app tự tạo profile)
create or replace function t.mk_user(p_email text) returns uuid language plpgsql as $$
declare v uuid;
begin
  insert into auth.users (email) values (p_email) returning id into v;
  return v;
end $$;

-- So sánh; sai thì dừng cả file với thông báo rõ
create or replace function t.eq(p_actual anyelement, p_expected anyelement, p_label text) returns void language plpgsql as $$
begin
  if p_actual is distinct from p_expected then
    raise exception 'SAI: % | mong đợi: % | thực tế: %', p_label, p_expected, p_actual;
  end if;
end $$;
create or replace function t.ok(p_cond boolean, p_label text) returns void language plpgsql as $$
begin
  if p_cond is not true then raise exception 'SAI: %', p_label; end if;
end $$;

-- Câu lệnh phải báo lỗi (ví dụ: bị chặn quyền). Không lỗi thì kiểm thử hỏng.
create or replace function t.throws(p_sql text, p_label text, p_like text default null) returns void language plpgsql as $$
declare v_msg text;
begin
  begin
    execute p_sql;
  exception when others then
    v_msg := sqlerrm;
  end;
  if v_msg is null then raise exception 'SAI: % | lẽ ra phải bị chặn nhưng lại chạy được', p_label; end if;
  if p_like is not null and v_msg not ilike '%' || p_like || '%' then
    raise exception 'SAI: % | lỗi không như mong đợi: %', p_label, v_msg;
  end if;
end $$;

-- Tồn kho của một vật tư ở một cơ sở, theo mã vật tư
create or replace function t.stock(p_outlet uuid, p_code text) returns numeric language sql as $$
  select coalesce(sum(m.qty_delta), 0) from stock_movements m join ingredients i on i.id = m.ingredient_id
   where m.outlet_id = p_outlet and i.code = p_code
$$;
create or replace function t.product(p_code text) returns uuid language sql as
$$ select id from products where code = p_code $$;

-- Bộ dữ liệu chuẩn cho mỗi file: 2 cơ sở, 1 chủ, 1 nhân viên, 1 người ngoài. Trả về JSON các mã.
create or replace function t.fixture() returns jsonb language plpgsql as $$
declare v_admin uuid := '2e8b7277-123f-4b66-8475-eb01a5266e0d'; v_owner uuid; v_staff uuid; v_other uuid; v_a uuid; v_b uuid; v_org uuid;
begin
  select id into v_org from orgs order by created_at limit 1;
  v_owner := t.mk_user('chu@test.local');
  v_staff := t.mk_user('nhanvien@test.local');
  v_other := t.mk_user('nguoila@test.local');
  perform t.login(v_admin);
  v_a := fn_create_outlet('Cơ sở kiểm thử A', 'M2_street');
  v_b := fn_create_outlet('Cơ sở kiểm thử B', 'M2_street');
  perform t.logout();
  insert into memberships (user_id, outlet_id, role, status) values (v_owner, v_a, 'owner', 'active'), (v_staff, v_a, 'staff', 'active');
  return jsonb_build_object('admin', v_admin, 'owner', v_owner, 'staff', v_staff, 'other', v_other, 'a', v_a, 'b', v_b, 'org', v_org);
end $$;
