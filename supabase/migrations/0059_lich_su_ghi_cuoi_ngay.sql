-- 0059: đưa Ghi cuối ngày (day_ends) vào v_activity để hiện ở Lịch sử bản ghi.
-- Nối thêm vào định nghĩa hiện có của view, không đổi các nhánh cũ.
do $mig$
declare v_def text := pg_get_viewdef('public.v_activity'::regclass, true);
begin
  if position('day_ends' in v_def) > 0 then return; end if;
  v_def := regexp_replace(v_def, ';\s*$', '');
  execute 'create or replace view public.v_activity with (security_invoker = true) as ' || v_def || $sql$
UNION ALL
 SELECT d.outlet_id,
    d.created_at AS at,
    'close'::text AS kind,
    d.id AS ref_id,
    'Ghi cuối ngày '::text || to_char(d.business_date::timestamp with time zone, 'DD/MM'::text) AS title,
    ('Hủy '::text || d.waste_total || ' chai · tồn ' || d.left_total || ' chai · ' ||
        CASE
            WHEN d.cash_counted_vnd IS NULL AND d.transfer_counted_vnd IS NULL THEN 'không kiểm tiền'::text
            ELSE 'tiền lệch '::text || TRIM(BOTH FROM to_char(
                 COALESCE(d.cash_counted_vnd, 0) - CASE WHEN d.cash_counted_vnd IS NULL THEN 0 ELSE COALESCE(d.cash_open_vnd, 0) END
                 + COALESCE(d.transfer_counted_vnd, 0) - COALESCE(d.expected_cash_vnd, 0) - COALESCE(d.expected_transfer_vnd, 0), 'FM999G999G990'::text)) || ' đ'::text
        END) ||
        CASE WHEN d.status = 'reversed'::text THEN ' · đã thay hoặc hoàn tác'::text ELSE ''::text END
        || COALESCE(' · '::text || d.money_note, ''::text) AS detail,
    NULL::integer AS amount_vnd,
    d.status,
    d.created_by AS actor_id,
    d.business_date
   FROM day_ends d
UNION ALL
 SELECT d.outlet_id,
    d.reversed_at AS at,
    'close'::text AS kind,
    md5(d.id::text || ':reversal')::uuid AS ref_id,
    'Hoàn tác ghi cuối ngày '::text || to_char(d.business_date::timestamp with time zone, 'DD/MM'::text) AS title,
    'Bản ghi lúc '::text || to_char(d.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh', 'HH24:MI DD/MM'::text) || ' · hủy ' || d.waste_total || ' · tồn ' || d.left_total AS detail,
    NULL::integer AS amount_vnd,
    'reversal'::text AS status,
    d.reversed_by AS actor_id,
    d.business_date
   FROM day_ends d
  WHERE d.status = 'reversed'::text AND d.reversed_at IS NOT NULL
$sql$;
end $mig$;
