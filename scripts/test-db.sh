#!/usr/bin/env bash
# Dựng một database trống từ toàn bộ migration rồi chạy các file kiểm thử trong tests/db.
# Dùng: PGHOST=localhost PGPORT=5432 PGUSER=postgres scripts/test-db.sh
# Cần psql và một máy chủ Postgres mà PGUSER có quyền tạo database.
set -euo pipefail
cd "$(dirname "$0")/.."
DB="${TEST_DB:-baba_test}"
PSQL=(psql -X -q -v ON_ERROR_STOP=1)

"${PSQL[@]}" -d postgres -c "drop database if exists $DB" -c "create database $DB"
"${PSQL[@]}" -d postgres -c "alter database $DB set search_path = \"\$user\", public, extensions" -c "alter database $DB set timezone = 'UTC'"
"${PSQL[@]}" -d "$DB" -f tests/db/00_shim.sql

echo "== Chạy migration =="
n=0
for f in supabase/migrations/*.sql; do
  # pg_cron và pg_net không có trên Postgres trần; 00_shim.sql đã giả lập schema cron và net
  if ! sed -E '/^[[:space:]]*create extension if not exists (pg_cron|pg_net)\b.*;[[:space:]]*$/d' "$f" \
      | "${PSQL[@]}" -d "$DB" --single-transaction -f - >/dev/null; then
    echo "LỖI ở migration: $f" >&2
    exit 1
  fi
  n=$((n + 1))
  # Dữ liệu ở production được tạo qua app giữa các migration: tests/db/after_<số>.sql
  hook="tests/db/after_$(basename "$f" | cut -c1-4).sql"
  if [ -e "$hook" ]; then "${PSQL[@]}" -d "$DB" -f "$hook" >/dev/null; fi
done
echo "Đã chạy $n migration."

"${PSQL[@]}" -d "$DB" -f tests/db/01_helpers.sql >/dev/null

echo "== Chạy kiểm thử =="
fail=0
for t in tests/db/t_*.sql; do
  [ -e "$t" ] || continue
  if out=$("${PSQL[@]}" -d "$DB" -f "$t" 2>&1); then
    echo "ĐẠT   $(basename "$t")"
  else
    echo "HỎNG  $(basename "$t")"
    echo "$out" | sed 's/^/      /'
    fail=1
  fi
done
exit $fail
