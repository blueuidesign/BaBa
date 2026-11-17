-- 0060: bao bì cốc theo Hà/Tùng 17/11: thêm lót ly và túi (1 ly, 2 ly) vào phần trừ kho; ngừng theo dõi nắp ly, quai lá.

-- Danh mục vật tư
update ingredients set name = 'Túi đựng 1 ly' where code = 'tui' and name = 'Túi đựng';
update ingredients set name = 'Lót ly' where code = 'giay_chong_tran' and name = 'Giấy chống tràn';
update ingredients set name = 'Nhãn dán (chai và cốc)' where code = 'nhan' and name = 'Nhãn dán chai';
update ingredients set status = 'retired' where code in ('nap_ly', 'quai_la') and status = 'active';
insert into ingredients (org_id, grp, code, kind, name, unit, status, sort_order, purchase_unit, default_min_qty, purchase_factor)
select i.org_id, 'packaging', 'tui_2', 'purchased', 'Túi đựng 2 ly', 'cai', 'active', 55, 'cai', 0, 1
  from ingredients i where i.code = 'tui'
   and not exists (select 1 from ingredients x where x.org_id = i.org_id and x.code = 'tui_2');

-- Mỗi cốc: 1 ly giấy (nắp đi kèm), 1 ống hút, 1 nhãn, 1 lót ly. Túi tính theo đơn ở _apply_sale_stock.
create or replace function public._parts_stock_need(p_product uuid, p_recipe uuid, p_container text, p_sugar text, p_qty numeric)
returns table(ingredient_id uuid, qty numeric)
language sql stable security definer set search_path to 'public' as $function$
  select ri.ingredient_id, ri.qty * p_qty from recipe_items ri where ri.recipe_id = p_recipe
  union all
  select i.id, (case when p_sugar = 'less' then least(pd.cost_syrup_ml, 20) else pd.cost_syrup_ml end) * p_qty
    from products pd join ingredients i on i.org_id = pd.org_id and i.code = 'syrup'
   where pd.id = p_product and pd.cost_syrup_ml > 0
  union all
  select i.id, p_qty from products pd join ingredients i on i.org_id = pd.org_id
   where pd.id = p_product and i.code = any (case when coalesce(p_container, 'chai') = 'coc'
         then array['ly_giay', 'ong_hut', 'nhan', 'giay_chong_tran'] else array['chai_330', 'nhan', 'card', 'day_gai'] end)
$function$;

-- Túi cho cốc tính theo đơn: n cốc → n/2 túi 2 ly (lấy phần nguyên) + 1 túi 1 ly nếu n lẻ.
create or replace function public._apply_sale_stock(p_order uuid)
returns void language plpgsql security definer set search_path to 'public' as $function$
declare v orders; v_cups int; v_org uuid;
begin
  select * into v from orders where id = p_order;
  if not found then return; end if;
  insert into stock_movements (outlet_id, ingredient_id, qty_delta, reason, ref_table, ref_id, business_date)
  select v.outlet_id, n.ingredient_id, -sum(n.qty), 'sale_packaging', 'orders', v.id, v.business_date
    from order_lines l, lateral public._parts_stock_need(l.product_id, l.recipe_id, l.container, l.sugar, l.qty) n
   where l.order_id = p_order
   group by n.ingredient_id having sum(n.qty) > 0;

  select coalesce(sum(qty), 0) into v_cups from order_lines where order_id = p_order and container = 'coc';
  if v_cups > 0 then
    select org_id into v_org from outlets where id = v.outlet_id;
    insert into stock_movements (outlet_id, ingredient_id, qty_delta, reason, ref_table, ref_id, business_date)
    select v.outlet_id, i.id, -(case i.code when 'tui_2' then v_cups / 2 else v_cups % 2 end), 'sale_packaging', 'orders', v.id, v.business_date
      from ingredients i
     where i.org_id = v_org and i.code in ('tui', 'tui_2')
       and (case i.code when 'tui_2' then v_cups / 2 else v_cups % 2 end) > 0;
  end if;
end $function$;
