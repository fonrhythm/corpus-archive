#!/usr/bin/env bash
# 本地验证：建一个临时库，依次执行 stubs → 迁移 → 测试。需要本机有 Postgres（含 pg_trgm）。
set -euo pipefail
DB=${1:-corpus_test}
HERE="$(cd "$(dirname "$0")" && pwd)"
PSQL="psql -v ON_ERROR_STOP=1 -q"
su postgres -c "dropdb --if-exists $DB && createdb $DB"
run() { su postgres -c "$PSQL -d $DB -f $1"; }
run "$HERE/stubs.sql"
for f in "$HERE"/../migrations/*.sql; do echo "== $f"; run "$f"; done
echo "== rls.test.sql"; run "$HERE/rls.test.sql"
echo "ALL OK"
