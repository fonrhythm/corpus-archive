// 本地集成测试用的小代理：把 /rest/v1 转给 PostgREST，并模拟 Supabase Auth 的登录接口。
// 仅测试使用；真实项目里这些都由 Supabase 提供。
import http from 'node:http'
import crypto from 'node:crypto'

const SECRET = process.env.JWT_SECRET
const PORT = Number(process.env.PROXY_PORT || 54321)
const ADMIN_ID = '00000000-0000-0000-0000-0000000000a1'

const b64 = (o) => Buffer.from(typeof o === 'string' ? o : JSON.stringify(o)).toString('base64url')
export const sign = (payload) => {
  const h = b64({ alg: 'HS256', typ: 'JWT' }), p = b64(payload)
  return `${h}.${p}.${crypto.createHmac('sha256', SECRET).update(`${h}.${p}`).digest('base64url')}`
}

if (process.argv[2] === 'anon-key') { console.log(sign({ role: 'anon', iss: 'supabase', exp: 4102444800 })); process.exit(0) }

const user = { id: ADMIN_ID, aud: 'authenticated', role: 'authenticated', email: 'admin@test', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() }

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x')
  const json = (code, body) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)) }
  if (url.pathname === '/auth/v1/token') {
    let body = ''
    req.on('data', (c) => (body += c))
    req.on('end', () => {
      const { email, password } = JSON.parse(body || '{}')
      if (email !== 'admin@test' || password !== 'correct-horse') return json(400, { error: 'invalid_grant', error_description: 'Invalid login credentials', message: 'Invalid login credentials' })
      const now = Math.floor(Date.now() / 1000)
      const access_token = sign({ sub: ADMIN_ID, role: 'authenticated', aud: 'authenticated', email, iat: now, exp: now + 3600 })
      json(200, { access_token, token_type: 'bearer', expires_in: 3600, expires_at: now + 3600, refresh_token: 'r', user })
    })
    return
  }
  if (url.pathname === '/auth/v1/user') return json(200, user)
  if (url.pathname === '/auth/v1/logout') { res.writeHead(204); return res.end() }
  if (url.pathname.startsWith('/rest/v1/')) {
    const up = http.request({ host: '127.0.0.1', port: 3000, path: req.url.replace('/rest/v1', ''), method: req.method, headers: { ...req.headers, host: '127.0.0.1:3000' } },
      (r) => { res.writeHead(r.statusCode, r.headers); r.pipe(res) })
    up.on('error', (e) => json(502, { message: String(e) }))
    req.pipe(up)
    return
  }
  json(404, { message: 'not found in test proxy' })
}).listen(PORT, () => console.log('proxy on', PORT))
