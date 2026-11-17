-- Việc chạy theo lịch: nhắc 06:00 và 21:00 chạy được; nhắc 21:00 chỉ gửi cho cơ sở có đơn mà chưa ghi cuối ngày
begin;
do $$
declare f jsonb := t.fixture(); a uuid := (f->>'a')::uuid; b uuid := (f->>'b')::uuid; md uuid := t.product('md'); n int;
begin
  -- Ba lịch tự động được đăng ký
  perform t.eq((select count(*)::int from cron.job where jobname in ('baba-morning-alerts', 'baba-close-reminder', 'baba-audit-retention')), 3, 'đủ 3 lịch tự động');

  -- Nhắc sáng chạy không lỗi (lỗi "column reference is ambiguous" từng lọt vào repo)
  perform fn_job_morning_alerts();

  -- Cơ sở A có đơn, cơ sở B không có đơn
  perform t.login((f->>'staff')::uuid);
  perform fn_post_order(jsonb_build_object('outlet_id', a, 'client_id', gen_random_uuid(), 'lines', jsonb_build_array(jsonb_build_object('product_id', md, 'qty', 1))));
  perform t.logout();
  perform fn_job_day_close_reminder();
  perform t.eq((select count(*)::int from notifications where outlet_id = a and kind = 'day_close_missing'), 1, 'cơ sở có đơn, chưa ghi cuối ngày: có nhắc');
  perform t.eq((select count(*)::int from notifications where outlet_id = b and kind = 'day_close_missing'), 0, 'cơ sở không có đơn: không nhắc');
  perform t.eq((select link from notifications where outlet_id = a and kind = 'day_close_missing'), '/cuoi-ngay', 'nhắc mở đúng màn Ghi cuối ngày');
  perform fn_job_day_close_reminder();
  perform t.eq((select count(*)::int from notifications where outlet_id = a and kind = 'day_close_missing'), 1, 'chạy lại không nhắc trùng');

  -- Đã ghi cuối ngày thì hôm sau mới nhắc lại: xóa nhắc cũ rồi chạy lại, không sinh nhắc mới
  perform t.login((f->>'staff')::uuid);
  perform fn_post_day_end(jsonb_build_object('outlet_id', a, 'client_id', gen_random_uuid(), 'lines', '[]'::jsonb));
  perform t.logout();
  delete from notifications where outlet_id = a and kind = 'day_close_missing';
  perform fn_job_day_close_reminder();
  perform t.eq((select count(*)::int from notifications where outlet_id = a and kind = 'day_close_missing'), 0, 'đã ghi cuối ngày: không nhắc nữa');

  -- Người dùng thường không tự gọi được việc nền
  set local role authenticated;
  perform t.throws('select public.fn_job_morning_alerts()', 'người dùng không gọi được việc nền', 'permission denied');
  reset role;
end $$;
rollback;
