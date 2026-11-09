-- 0007_policies: Row Level Security. Không có policy DELETE cho người dùng.
do $$ declare t text; begin
  foreach t in array array['orgs','profiles','org_memberships','outlets','memberships','bootstrap_admins',
    'ingredients','products','price_lists','product_prices','outlet_menu','model_default_menu','recipes','recipe_items',
    'packaging_rules','batch_recipes','batch_recipe_items','sweetness_levels',
    'suppliers','outlet_ingredient_settings','notification_settings','push_subscriptions',
    'orders','order_lines','cook_plans','cook_plan_lines','cook_runs','cook_run_lines','production_batches',
    'purchases','purchase_lines','stock_counts','stock_count_lines','stock_movements',
    'day_closes','day_close_lines','notifications','notification_reads','audit_log']
  loop execute format('alter table public.%I enable row level security', t); end loop;
end $$;

-- Tổ chức và hồ sơ
create policy orgs_read on public.orgs for select to authenticated using (true);
create policy profiles_read on public.profiles for select to authenticated using (
  id = auth.uid() or public.is_org_admin()
  or exists (select 1 from public.memberships m where m.user_id = profiles.id and m.outlet_id in (select public.my_outlets())));
create policy profiles_update_self on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
create policy org_memberships_read on public.org_memberships for select to authenticated using (true);
create policy org_memberships_admin on public.org_memberships for all to authenticated using (public.is_org_admin()) with check (public.is_org_admin());
-- bootstrap_admins: không ai đọc qua API

-- Cơ sở và thành viên
create policy outlets_read on public.outlets for select to authenticated using (public.can_access_outlet(id));
create policy outlets_update on public.outlets for update to authenticated using (public.can_manage_outlet(id)) with check (public.can_manage_outlet(id));
create policy memberships_read on public.memberships for select to authenticated using (
  user_id = auth.uid() or public.can_access_outlet(outlet_id));
create policy memberships_write on public.memberships for insert to authenticated with check (
  public.is_org_admin() or (public.can_manage_outlet(outlet_id) and role = 'staff'));
create policy memberships_update on public.memberships for update to authenticated
  using (public.is_org_admin() or (public.can_manage_outlet(outlet_id) and role = 'staff'))
  with check (public.is_org_admin() or (public.can_manage_outlet(outlet_id) and role = 'staff'));

-- Danh mục chung: ai đăng nhập cũng đọc; chỉ admin sửa
do $$ declare t text; begin
  foreach t in array array['ingredients','products','price_lists','product_prices','model_default_menu','recipes',
    'recipe_items','packaging_rules','batch_recipes','batch_recipe_items','sweetness_levels']
  loop
    execute format('create policy %I on public.%I for select to authenticated using (true)', t || '_read', t);
    execute format('create policy %I on public.%I for all to authenticated using (public.is_org_admin()) with check (public.is_org_admin())', t || '_admin', t);
  end loop;
end $$;

-- Cài đặt theo cơ sở: thành viên đọc, chủ cơ sở sửa
create policy outlet_menu_read on public.outlet_menu for select to authenticated using (public.can_access_outlet(outlet_id));
create policy outlet_menu_write on public.outlet_menu for all to authenticated using (public.can_manage_outlet(outlet_id)) with check (public.can_manage_outlet(outlet_id));
create policy suppliers_read on public.suppliers for select to authenticated using (public.can_access_outlet(outlet_id));
create policy suppliers_insert on public.suppliers for insert to authenticated with check (public.can_access_outlet(outlet_id));
create policy suppliers_update on public.suppliers for update to authenticated using (public.can_manage_outlet(outlet_id)) with check (public.can_manage_outlet(outlet_id));
create policy ois_read on public.outlet_ingredient_settings for select to authenticated using (public.can_access_outlet(outlet_id));
create policy ois_write on public.outlet_ingredient_settings for insert to authenticated with check (public.can_manage_outlet(outlet_id));
create policy ois_update on public.outlet_ingredient_settings for update to authenticated using (public.can_manage_outlet(outlet_id)) with check (public.can_manage_outlet(outlet_id));
create policy ns_read on public.notification_settings for select to authenticated using (public.can_access_outlet(outlet_id));
create policy ns_write on public.notification_settings for all to authenticated using (public.can_manage_outlet(outlet_id)) with check (public.can_manage_outlet(outlet_id));
create policy push_own on public.push_subscriptions for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Kế hoạch nấu: bản nháp, thành viên sửa được
create policy cook_plans_rw on public.cook_plans for all to authenticated using (public.can_access_outlet(outlet_id)) with check (public.can_access_outlet(outlet_id));
create policy cook_plan_lines_rw on public.cook_plan_lines for all to authenticated
  using (exists (select 1 from public.cook_plans c where c.id = plan_id and public.can_access_outlet(c.outlet_id)))
  with check (exists (select 1 from public.cook_plans c where c.id = plan_id and public.can_access_outlet(c.outlet_id)));

-- Sổ cái: chỉ đọc qua API; ghi qua hàm fn_*
create policy orders_read on public.orders for select to authenticated using (public.can_access_outlet(outlet_id));
create policy order_lines_read on public.order_lines for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id and public.can_access_outlet(o.outlet_id)));
create policy cook_runs_read on public.cook_runs for select to authenticated using (public.can_access_outlet(outlet_id));
create policy cook_run_lines_read on public.cook_run_lines for select to authenticated
  using (exists (select 1 from public.cook_runs c where c.id = cook_run_id and public.can_access_outlet(c.outlet_id)));
create policy batches_read on public.production_batches for select to authenticated using (public.can_access_outlet(outlet_id));
create policy purchases_read on public.purchases for select to authenticated using (public.can_access_outlet(outlet_id));
create policy purchase_lines_read on public.purchase_lines for select to authenticated
  using (exists (select 1 from public.purchases p where p.id = purchase_id and public.can_access_outlet(p.outlet_id)));
create policy counts_read on public.stock_counts for select to authenticated using (public.can_access_outlet(outlet_id));
create policy count_lines_read on public.stock_count_lines for select to authenticated
  using (exists (select 1 from public.stock_counts s where s.id = stock_count_id and public.can_access_outlet(s.outlet_id)));
create policy movements_read on public.stock_movements for select to authenticated using (public.can_access_outlet(outlet_id));
create policy closes_read on public.day_closes for select to authenticated using (public.can_access_outlet(outlet_id));
create policy close_lines_read on public.day_close_lines for select to authenticated
  using (exists (select 1 from public.day_closes d where d.id = day_close_id and public.can_access_outlet(d.outlet_id)));

-- Thông báo: đã đọc theo từng người
create policy notifications_read on public.notifications for select to authenticated using (public.can_access_outlet(outlet_id));
create policy notification_reads_own on public.notification_reads for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy audit_admin on public.audit_log for select to authenticated using (public.is_org_admin());

-- Quyền gọi hàm: chỉ người đã đăng nhập; hàm job chỉ chạy nội bộ
revoke execute on function public.fn_job_morning_alerts() from public, anon, authenticated;
revoke execute on function public.fn_job_day_close_reminder() from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
do $$ declare f text; begin
  foreach f in array array['fn_post_order(jsonb)','fn_reverse_order(uuid,text)','fn_mark_gift(uuid)','fn_post_cook_run(jsonb)',
    'fn_reverse_cook_run(uuid,text)','fn_post_batch(jsonb)','fn_post_purchase(jsonb)','fn_post_count(jsonb)',
    'fn_close_day(jsonb,boolean)','fn_create_outlet(text,text)','fn_invite_member(uuid,text,text)','fn_bottles_on_hand(uuid,date)']
  loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
