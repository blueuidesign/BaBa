-- 0009_jobs: lịch chạy nền (giờ UTC; Việt Nam = UTC+7)
create extension if not exists pg_cron;

select cron.schedule('baba-morning-alerts', '0 23 * * *', $$ select public.fn_job_morning_alerts() $$);   -- 06:00 VN
select cron.schedule('baba-close-reminder', '0 14 * * *', $$ select public.fn_job_day_close_reminder() $$); -- 21:00 VN
select cron.schedule('baba-audit-retention', '30 20 * * 0', $$ delete from public.audit_log where at < now() - interval '12 months' $$);
