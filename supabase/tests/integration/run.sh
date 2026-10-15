#!/usr/bin/env bash
# 接口层集成测试：真实 PostgreSQL + 真实 PostgREST + 前端数据层代码。
# 需要：本机 Postgres 16（含 pg_trgm）、PostgREST 可执行文件（环境变量 POSTGREST_BIN）、Node。
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"; ROOT="$HERE/../../.."
DB=corpus_it; SECRET='super-secret-jwt-token-with-at-least-32-characters-long'
PGREST=${POSTGREST_BIN:-/tmp/postgrest-bin}
sq() { su postgres -c "psql -v ON_ERROR_STOP=1 -q -d ${2:-postgres} -c \"$1\""; }
rebuild() {
su postgres -c "dropdb --force --if-exists $DB && createdb $DB"
for f in "$HERE/../stubs.sql" "$HERE"/../../migrations/*.sql; do su postgres -c "psql -v ON_ERROR_STOP=1 -q -d $DB -f $f"; done
sq "insert into auth.users(id,email) values ('00000000-0000-0000-0000-0000000000a1','admin@test'); insert into public.profiles(user_id,role) values ('00000000-0000-0000-0000-0000000000a1','admin');" $DB
}
rebuild
su postgres -c "psql -q -d $DB -c \"do \\\$\\\$ begin if not exists (select 1 from pg_roles where rolname='authenticator') then create role authenticator login noinherit password 'pw'; end if; end \\\$\\\$; grant anon, authenticated to authenticator;\""
cat > /tmp/pgrst.conf <<CONF
db-uri = "postgres://authenticator:pw@127.0.0.1:5432/$DB"
db-schemas = "public"
db-anon-role = "anon"
jwt-secret = "$SECRET"
server-port = 3000
CONF
JWT_SECRET=$SECRET node "$HERE/proxy.mjs" > /tmp/proxy.log 2>&1 & P2=$!
trap 'kill ${P1:-} $P2 2>/dev/null || true' EXIT
ANON=$(JWT_SECRET=$SECRET node "$HERE/proxy.mjs" anon-key)
cd "$ROOT"
for T in api ui; do
  echo "=== $T ==="
  [ -n "${P1:-}" ] && kill $P1 2>/dev/null && wait $P1 2>/dev/null || true
  rebuild
  "$PGREST" /tmp/pgrst.conf > /tmp/pgrest.log 2>&1 & P1=$!
  sleep 2
  VITE_SUPABASE_URL=http://127.0.0.1:54321 VITE_SUPABASE_ANON_KEY=$ANON VITE_INTEGRATION=1 npx vitest run src/integration/$T.integration.test.ts
done
