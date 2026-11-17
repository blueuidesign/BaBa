-- 0061: Hà xác nhận 17/11: túi 1 ly và túi 2 ly dùng chung cho cả chai và ly; 70.000 đ/kg, khoảng 200 túi/kg (350 đ/túi).

-- Túi tính theo cả đơn (chai + cốc): n phần → n/2 túi 2 ly (phần nguyên) + 1 túi 1 ly nếu n lẻ.
create or replace function public._apply_sale_stock(p_order uuid)
returns void language plpgsql security definer set search_path to 'public' as $function$
declare v orders; v_parts int; v_org uuid;
begin
  select * into v from orders where id = p_order;
  if not found then return; end if;
  insert into stock_movements (outlet_id, ingredient_id, qty_delta, reason, ref_table, ref_id, business_date)
  select v.outlet_id, n.ingredient_id, -sum(n.qty), 'sale_packaging', 'orders', v.id, v.business_date
    from order_lines l, lateral public._parts_stock_need(l.product_id, l.recipe_id, l.container, l.sugar, l.qty) n
   where l.order_id = p_order
   group by n.ingredient_id having sum(n.qty) > 0;

  select coalesce(sum(qty), 0) into v_parts from order_lines where order_id = p_order;
  if v_parts > 0 then
    select org_id into v_org from outlets where id = v.outlet_id;
    insert into stock_movements (outlet_id, ingredient_id, qty_delta, reason, ref_table, ref_id, business_date)
    select v.outlet_id, i.id, -(case i.code when 'tui_2' then v_parts / 2 else v_parts % 2 end), 'sale_packaging', 'orders', v.id, v.business_date
      from ingredients i
     where i.org_id = v_org and i.code in ('tui', 'tui_2')
       and (case i.code when 'tui_2' then v_parts / 2 else v_parts % 2 end) > 0;
  end if;
end $function$;

update ingredients set name = 'Túi 1 ly (chai hoặc ly)' where code = 'tui' and name = 'Túi đựng 1 ly';
update ingredients set name = 'Túi 2 ly (chai hoặc ly)' where code = 'tui_2' and name = 'Túi đựng 2 ly';

-- Giá chuẩn túi: 70.000 đ/kg ÷ ~200 túi = 350 đ/túi (Hà sẽ đếm lại số túi mỗi kg)
insert into ingredient_std_costs (org_id, ingredient_id, cost_per_unit, valid_from, note)
select i.org_id, i.id, 350, date '2026-11-17', 'Hà 17/11: 70.000 đ/kg, khoảng 200 túi/kg'
  from ingredients i where i.code in ('tui', 'tui_2')
   and not exists (select 1 from ingredient_std_costs c where c.ingredient_id = i.id and c.valid_from = date '2026-11-17');

-- Giá vốn bao bì chai: thêm túi. Tính 1 túi cho mỗi phần (mức cao nhất; đơn nhiều phần dùng ít túi hơn).
insert into container_std_costs (org_id, container, cost_vnd, breakdown, valid_from, note)
select c.org_id, 'chai', c.cost_vnd + 350,
       c.breakdown || '[{"name": "Túi (tính 1 túi mỗi phần)", "cost": 350}]'::jsonb,
       date '2026-11-17', 'Thêm túi theo Hà 17/11'
  from container_std_costs c
 where c.container = 'chai' and c.valid_from = (select max(valid_from) from container_std_costs x where x.org_id = c.org_id and x.container = 'chai')
   and c.valid_from < date '2026-11-17';
