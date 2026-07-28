import { describe, test, expect, afterAll } from 'bun:test'
import { Hono } from 'hono'
import sql from '../db/client.js'
import { authRouter } from './auth.js'
import { hashSessionToken, generateSessionToken } from '../auth.js'
import { createChallenge, claimChallenge, createSession, insertCredential, deleteCredential } from '../db/auth-queries.js'

// Corre contra la DB configurada en DATABASE_URL (ver .env). No asume que esté vacía:
// cada test crea sus propios datos marcados y los borra al terminar, sin depender de
// ni alterar passkeys/sesiones reales ya existentes.

const app = new Hono()
app.route('/api/auth', authRouter)

const createdCredentialIds = []
const createdSessionHashes = []

afterAll(async () => {
  for (const id of createdCredentialIds) await deleteCredential(id).catch(() => {})
  for (const hash of createdSessionHashes) {
    await sql`DELETE FROM auth_sessions WHERE token_hash = ${hash}`.catch(() => {})
  }
})

async function sessionCookie() {
  const token = generateSessionToken()
  const hash = hashSessionToken(token)
  await createSession(hash, 3600)
  createdSessionHashes.push(hash)
  return `gastos_session=${token}`
}

async function fakeCredential(name) {
  const id = await insertCredential({
    credentialId: `test-${crypto.randomUUID()}`,
    publicKey: Buffer.from('test-public-key'),
    counter: 0,
    transports: null,
    deviceType: 'singleDevice',
    backedUp: false,
    name,
  })
  createdCredentialIds.push(id)
  return id
}

describe('GET /api/auth/status', () => {
  test('nunca expone secretos, solo flags booleanos', async () => {
    const res = await app.request('/api/auth/status')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(typeof body.authenticated).toBe('boolean')
    expect(typeof body.passkeyConfigured).toBe('boolean')
    expect(typeof body.bootstrapRequired).toBe('boolean')
    expect(body.bootstrapRequired).toBe(!body.passkeyConfigured)
    expect(Object.keys(body).sort()).toEqual(['authenticated', 'bootstrapRequired', 'passkeyConfigured'])
  })
})

describe('POST /api/auth/passkey/register/options', () => {
  test('sin bootstrap secret y sin sesión → 401', async () => {
    const res = await app.request('/api/auth/passkey/register/options', { method: 'POST' })
    expect(res.status).toBe(401)
  })

  test('bootstrap secret incorrecto → 401', async () => {
    const res = await app.request('/api/auth/passkey/register/options', {
      method: 'POST',
      headers: { 'X-Bootstrap-Secret': 'esto-no-es-el-secreto-correcto' },
    })
    expect(res.status).toBe(401)
  })
})

describe('POST /api/auth/passkey/register/verify', () => {
  test('Content-Type inválido → 400', async () => {
    const res = await app.request('/api/auth/passkey/register/verify', {
      method: 'POST',
      headers: { 'X-Bootstrap-Secret': process.env.PASSKEY_BOOTSTRAP_SECRET || 'x' },
      body: 'no-json',
    })
    expect(res.status).toBe(400)
  })

  test('cuerpo mal formado (sin sesión ni secreto) → 401 antes de validar el cuerpo', async () => {
    const res = await app.request('/api/auth/passkey/register/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ foo: 'bar' }),
    })
    expect(res.status).toBe(401)
  })
})

describe('POST /api/auth/passkey/login/options', () => {
  test('responde 409 si no hay passkeys, o 200 con opciones si ya hay alguna', async () => {
    const [{ n }] = await sql`SELECT COUNT(*)::int AS n FROM passkey_credentials`
    const res = await app.request('/api/auth/passkey/login/options', { method: 'POST' })
    if (n === 0) {
      expect(res.status).toBe(409)
    } else {
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(typeof body.challenge).toBe('string')
      expect(body.allowCredentials).toEqual([])
    }
  })
})

describe('POST /api/auth/passkey/login/verify', () => {
  test('Content-Type inválido → 400', async () => {
    const res = await app.request('/api/auth/passkey/login/verify', {
      method: 'POST',
      body: 'no-json',
    })
    expect(res.status).toBe(400)
  })

  test('credential_id desconocido → 401 genérico (sin oráculo de enumeración)', async () => {
    const res = await app.request('/api/auth/passkey/login/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: 'credencial-que-no-existe',
        rawId: 'credencial-que-no-existe',
        type: 'public-key',
        response: { clientDataJSON: Buffer.from(JSON.stringify({ challenge: 'x' })).toString('base64url') },
      }),
    })
    expect(res.status).toBe(401)
  })
})

describe('POST /api/auth/logout', () => {
  test('sin sesión → no-op, sigue respondiendo ok', async () => {
    const res = await app.request('/api/auth/logout', { method: 'POST' })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.loggedOut).toBe(true)
  })

  test('revoca una sesión válida', async () => {
    const cookie = await sessionCookie()
    const before = await app.request('/api/auth/passkeys', { headers: { Cookie: cookie } })
    expect(before.status).toBe(200)

    const logoutRes = await app.request('/api/auth/logout', { method: 'POST', headers: { Cookie: cookie } })
    expect(logoutRes.status).toBe(200)

    const after = await app.request('/api/auth/passkeys', { headers: { Cookie: cookie } })
    expect(after.status).toBe(401)
  })
})

describe('GET/DELETE /api/auth/passkeys — protección de rutas', () => {
  test('GET sin sesión → 401', async () => {
    const res = await app.request('/api/auth/passkeys')
    expect(res.status).toBe(401)
  })

  test('DELETE sin sesión → 401', async () => {
    const res = await app.request('/api/auth/passkeys/1', { method: 'DELETE' })
    expect(res.status).toBe(401)
  })

  test('GET con sesión válida nunca expone credential_id ni public_key', async () => {
    const cookie = await sessionCookie()
    const id = await fakeCredential('__test_visible__')
    const res = await app.request('/api/auth/passkeys', { headers: { Cookie: cookie } })
    expect(res.status).toBe(200)
    const body = await res.json()
    const json = JSON.stringify(body)
    expect(json).not.toContain('credential_id')
    expect(json).not.toContain('public_key')
    const mine = body.passkeys.find((p) => p.id === id)
    expect(mine).toBeDefined()
    expect(Object.keys(mine).sort()).toEqual(['backedUp', 'createdAt', 'deviceType', 'id', 'lastUsedAt', 'name'])
  })
})

describe('Regla: no se puede eliminar la última passkey', () => {
  test('bloquea el borrado cuando solo queda 1 (aunque sea la única real o una de prueba)', async () => {
    const cookie = await sessionCookie()
    const id = await fakeCredential('__test_last_guard__')

    const [{ n }] = await sql`SELECT COUNT(*)::int AS n FROM passkey_credentials`
    const res = await app.request(`/api/auth/passkeys/${id}`, { method: 'DELETE', headers: { Cookie: cookie } })

    if (n <= 1) {
      expect(res.status).toBe(400)
      const body = await res.json()
      expect(body.error).toMatch(/última/i)
    } else {
      // Había otras passkeys además de la de prueba: el borrado de la de prueba es válido.
      expect(res.status).toBe(200)
      createdCredentialIds.splice(createdCredentialIds.indexOf(id), 1)
    }
  })

  test('permite borrar cuando hay 2+ (con una de prueba extra de por medio)', async () => {
    const cookie = await sessionCookie()
    const idA = await fakeCredential('__test_extra_a__')
    const idB = await fakeCredential('__test_extra_b__')

    const res = await app.request(`/api/auth/passkeys/${idA}`, { method: 'DELETE', headers: { Cookie: cookie } })
    expect(res.status).toBe(200)
    createdCredentialIds.splice(createdCredentialIds.indexOf(idA), 1)

    // idB queda para el cleanup en afterAll.
    void idB
  })
})

describe('Challenges WebAuthn: single-use y expiración (server/db/auth-queries.js)', () => {
  test('un challenge solo puede reclamarse una vez', async () => {
    const challenge = `test-challenge-${crypto.randomUUID()}`
    await createChallenge(challenge, 'registration', 60_000)

    const first = await claimChallenge(challenge, 'registration')
    expect(first).toBe(true)

    const second = await claimChallenge(challenge, 'registration')
    expect(second).toBe(false)
  })

  test('un challenge expirado no puede reclamarse', async () => {
    const challenge = `test-challenge-expired-${crypto.randomUUID()}`
    await createChallenge(challenge, 'authentication', -1000) // ya vencido al crearse

    const claimed = await claimChallenge(challenge, 'authentication')
    expect(claimed).toBe(false)
  })

  test('el tipo importa: un challenge de registro no sirve para login', async () => {
    const challenge = `test-challenge-type-${crypto.randomUUID()}`
    await createChallenge(challenge, 'registration', 60_000)

    const wrongType = await claimChallenge(challenge, 'authentication')
    expect(wrongType).toBe(false)

    const rightType = await claimChallenge(challenge, 'registration')
    expect(rightType).toBe(true)
  })
})
