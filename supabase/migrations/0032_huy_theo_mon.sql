-- 0032 · Chai hủy (hỏng, đổ, hết hạn) ghi theo từng món khi đối chiếu cuối ngày, để thống kê món nào hủy nhiều (Tùng 13/11).
-- Không sửa fn_close_day: tổng hủy vẫn nằm ở day_closes.waste_total; bảng này là phần chia theo món của tổng đó.
create table if not exists public.day_close_wastes (
  day_close_id uuid not null references public.day_closes(id) on delete cascade,
  product_id uuid not null references public.products(id),
  qty int not null check (qty > 0),
  primary key (day_close_id, product_id)
);
alter table public.day_close_wastes enable row level security;
drop policy if exists day_close_wastes_select on public.day_close_wastes;
create policy day_close_wastes_select on public.day_close_wastes for select to authenticated
  using (exists (select 1 from public.day_closes c where c.id = day_close_id and public.can_access_outlet(c.outlet_id)));
grant select on public.day_close_wastes to authenticated;

-- Ghi phần chia theo món cho một lần chốt vừa tạo. Chỉ ghi một lần; tổng phải bằng waste_total của lần chốt.
create or replace function public.fn_set_close_wastes(p_close uuid, p_lines jsonb)
 returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare c day_closes%rowtype; v_sum int;
begin
  select * into c from day_closes where id = p_close;
  if not found then raise exception 'Không tìm thấy lần đối chiếu' using errcode = 'P0001'; end if;
  if auth.uid() is null or not public.can_access_outlet(c.outlet_id) then
    raise exception 'Bạn không có quyền ở cơ sở này' using errcode = '42501';
  end if;
  if exists (select 1 from day_close_wastes where day_close_id = p_close) then
    return jsonb_build_object('id', p_close, 'existing', true);
  end if;
  select coalesce(sum((x->>'qty')::int), 0) into v_sum from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) x;
  if v_sum <> c.waste_total then
    raise exception 'Tổng chai hủy theo món (%) khác tổng đã chốt (%)', v_sum, c.waste_total using errcode = 'P0001';
  end if;
  insert into day_close_wastes (day_close_id, product_id, qty)
  select p_close, (x->>'product_id')::uuid, sum((x->>'qty')::int)
    from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) x
   where (x->>'qty')::int > 0
   group by 2;
  return jsonb_build_object('id', p_close, 'existing', false);
end $function$;
revoke all on function public.fn_set_close_wastes(uuid, jsonb) from public, anon;
grant execute on function public.fn_set_close_wastes(uuid, jsonb) to authenticated;

-- Kiểm tra: select p.name, sum(w.qty) from day_close_wastes w join day_closes c on c.id = w.day_close_id and c.is_current join products p on p.id = w.product_id group by 1;
