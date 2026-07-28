import { Hono } from 'hono'
import { z } from 'zod'
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server'
import {
  PASSKEY_RP_ID,
  PASSKEY_RP_NAME,
  PASSKEY_ORIGIN,
  SESSION_MAX_AGE_SECONDS,
  verifyBootstrapSecret,
  isBootstrapOverrideActive,
  generateSessionToken,
  hashSessionToken,
  setSessionCookie,
  logoutCurrentSession,
  requireSession,
  checkSession,
  rateLimited,
  getClientIp,
} from '../auth.js'
import {
  getOrCreateWebauthnUserId,
  countCredentials,
  listCredentialsPublic,
  listCredentialDescriptors,
  getCredentialByCredentialId,
  insertCredential,
  updateCredentialAfterLogin,
  deleteCredential,
  createChallenge,
  claimChallenge,
  createSession,
} from '../db/auth-queries.js'

export const authRouter = new Hono()

const REGISTRATION_CHALLENGE_TTL_MS = 2 * 60 * 1000
const AUTHENTICATION_CHALLENGE_TTL_MS = 2 * 60 * 1000

// ─── Validación estructural (Zod) ─────────────────────────────────────────────

const credentialResponseSchema = z.object({
  clientDataJSON: z.string().min(1),
}).passthrough()

const registrationVerifyBodySchema = z.object({
  id: z.string().min(1),
  rawId: z.string().min(1),
  type: z.literal('public-key'),
  response: credentialResponseSchema,
  name: z.string().trim().max(60).optional(),
}).passthrough()

const authenticationVerifyBodySchema = z.object({
  id: z.string().min(1),
  rawId: z.string().min(1),
  type: z.literal('public-key'),
  response: credentialResponseSchema,
}).passthrough()

function requireJson(c) {
  const contentType = c.req.header('content-type') || ''
  return contentType.includes('application/json')
}

// ─── GET /api/auth/status ─────────────────────────────────────────────────────

authRouter.get('/status', async (c) => {
  const [passkeyCount, authenticated] = await Promise.all([
    countCredentials(),
    checkSession(c),
  ])
  return c.json({
    authenticated,
    passkeyConfigured: passkeyCount > 0,
    bootstrapRequired: passkeyCount === 0,
  })
})

// ─── Gate compartido: bootstrap secret (sin passkeys) O sesión válida ────────

async function resolveRegistrationMode(c) {
  const existing = await countCredentials()
  const provided = c.req.header('x-bootstrap-secret')

  if (existing === 0 || isBootstrapOverrideActive()) {
    if (!verifyBootstrapSecret(provided)) return { mode: null, error: c.json({ error: 'No autorizado' }, 401) }
    return { mode: 'bootstrap' }
  }
  const hasSession = await checkSession(c)
  if (!hasSession) return { mode: null, error: c.json({ error: 'No autenticado' }, 401) }
  return { mode: 'session' }
}

// ─── POST /api/auth/passkey/register/options ─────────────────────────────────

authRouter.post('/passkey/register/options', async (c) => {
  const limited = rateLimited(c, `reg-opts:${getClientIp(c)}`, { windowMs: 15 * 60 * 1000, max: 15 })
  if (limited) return limited

  const { mode, error } = await resolveRegistrationMode(c)
  if (!mode) return error

  if (!PASSKEY_RP_ID || !PASSKEY_ORIGIN) {
    return c.json({ error: 'WebAuthn no está configurado en el servidor' }, 500)
  }

  const webauthnUserId = await getOrCreateWebauthnUserId()
  const existingDescriptors = await listCredentialDescriptors()

  const options = await generateRegistrationOptions({
    rpName: PASSKEY_RP_NAME,
    rpID: PASSKEY_RP_ID,
    userID: new TextEncoder().encode(webauthnUserId),
    userName: 'Tomás',
    attestationType: 'none',
    excludeCredentials: existingDescriptors.map((d) => ({
      id: d.credential_id,
      transports: d.transports ?? undefined,
    })),
    authenticatorSelection: {
      residentKey: 'required',
      userVerification: 'required',
    },
  })

  await createChallenge(options.challenge, 'registration', REGISTRATION_CHALLENGE_TTL_MS)

  return c.json(options)
})

// ─── POST /api/auth/passkey/register/verify ──────────────────────────────────

authRouter.post('/passkey/register/verify', async (c) => {
  const limited = rateLimited(c, `reg-verify:${getClientIp(c)}`, { windowMs: 15 * 60 * 1000, max: 15 })
  if (limited) return limited

  if (!requireJson(c)) return c.json({ error: 'Content-Type inválido' }, 400)

  const { mode, error } = await resolveRegistrationMode(c)
  if (!mode) return error

  const parsed = registrationVerifyBodySchema.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return c.json({ error: 'Cuerpo de solicitud inválido' }, 400)
  const body = parsed.data

  let clientData
  try {
    clientData = JSON.parse(Buffer.from(body.response.clientDataJSON, 'base64url').toString('utf-8'))
  } catch {
    return c.json({ error: 'Cuerpo de solicitud inválido' }, 400)
  }

  const claimed = await claimChallenge(clientData.challenge, 'registration')
  if (!claimed) return c.json({ error: 'Challenge inválido o expirado' }, 400)

  let verification
  try {
    verification = await verifyRegistrationResponse({
      response: body,
      expectedChallenge: clientData.challenge,
      expectedOrigin: PASSKEY_ORIGIN,
      expectedRPID: PASSKEY_RP_ID,
      requireUserVerification: true,
    })
  } catch (e) {
    console.error('[auth] error verificando registro:', e.message)
    return c.json({ error: 'No se pudo verificar el registro' }, 400)
  }

  if (!verification.verified || !verification.registrationInfo) {
    return c.json({ error: 'No se pudo verificar el registro' }, 400)
  }

  const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo
  const passkeyId = await insertCredential({
    credentialId: credential.id,
    publicKey: Buffer.from(credential.publicKey),
    counter: credential.counter,
    transports: credential.transports ?? null,
    deviceType: credentialDeviceType,
    backedUp: credentialBackedUp,
    name: body.name || null,
  })

  let sessionCreated = false
  if (mode === 'bootstrap') {
    const token = generateSessionToken()
    await createSession(hashSessionToken(token), SESSION_MAX_AGE_SECONDS)
    setSessionCookie(c, token)
    sessionCreated = true
  }

  return c.json({ verified: true, passkeyId, sessionCreated })
})

// ─── POST /api/auth/passkey/login/options ────────────────────────────────────

authRouter.post('/passkey/login/options', async (c) => {
  const limited = rateLimited(c, `login-opts:${getClientIp(c)}`, { windowMs: 5 * 60 * 1000, max: 20 })
  if (limited) return limited

  const total = await countCredentials()
  if (total === 0) return c.json({ error: 'No hay passkeys configuradas' }, 409)

  if (!PASSKEY_RP_ID || !PASSKEY_ORIGIN) {
    return c.json({ error: 'WebAuthn no está configurado en el servidor' }, 500)
  }

  const options = await generateAuthenticationOptions({
    rpID: PASSKEY_RP_ID,
    userVerification: 'required',
    allowCredentials: [],
  })

  await createChallenge(options.challenge, 'authentication', AUTHENTICATION_CHALLENGE_TTL_MS)

  return c.json(options)
})

// ─── POST /api/auth/passkey/login/verify ─────────────────────────────────────

authRouter.post('/passkey/login/verify', async (c) => {
  const limited = rateLimited(c, `login-verify:${getClientIp(c)}`, { windowMs: 5 * 60 * 1000, max: 20 })
  if (limited) return limited

  if (!requireJson(c)) return c.json({ error: 'Content-Type inválido' }, 400)

  const parsed = authenticationVerifyBodySchema.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return c.json({ error: 'Cuerpo de solicitud inválido' }, 400)
  const body = parsed.data

  const stored = await getCredentialByCredentialId(body.id)
  if (!stored) return c.json({ error: 'No se pudo verificar el inicio de sesión' }, 401)

  let clientData
  try {
    clientData = JSON.parse(Buffer.from(body.response.clientDataJSON, 'base64url').toString('utf-8'))
  } catch {
    return c.json({ error: 'Cuerpo de solicitud inválido' }, 400)
  }

  const claimed = await claimChallenge(clientData.challenge, 'authentication')
  if (!claimed) return c.json({ error: 'El desafío expiró, intentá de nuevo' }, 400)

  let verification
  try {
    verification = await verifyAuthenticationResponse({
      response: body,
      expectedChallenge: clientData.challenge,
      expectedOrigin: PASSKEY_ORIGIN,
      expectedRPID: PASSKEY_RP_ID,
      credential: {
        id: stored.credential_id,
        publicKey: new Uint8Array(stored.public_key),
        counter: Number(stored.counter),
        transports: stored.transports ?? undefined,
      },
      requireUserVerification: true,
    })
  } catch (e) {
    console.error('[auth] error verificando login:', e.message)
    return c.json({ error: 'No se pudo verificar el inicio de sesión' }, 401)
  }

  if (!verification.verified) {
    return c.json({ error: 'No se pudo verificar el inicio de sesión' }, 401)
  }

  await updateCredentialAfterLogin(stored.credential_id, verification.authenticationInfo.newCounter)

  const token = generateSessionToken()
  await createSession(hashSessionToken(token), SESSION_MAX_AGE_SECONDS)
  setSessionCookie(c, token)

  return c.json({ authenticated: true })
})

// ─── POST /api/auth/logout ────────────────────────────────────────────────────

authRouter.post('/logout', async (c) => {
  await logoutCurrentSession(c)
  return c.json({ loggedOut: true })
})

// ─── GET /api/auth/passkeys ────────────────────────────────────────────────────

authRouter.get('/passkeys', requireSession, async (c) => {
  const rows = await listCredentialsPublic()
  return c.json({
    passkeys: rows.map((r) => ({
      id: r.id,
      name: r.name,
      deviceType: r.device_type,
      backedUp: r.backed_up,
      createdAt: r.created_at,
      lastUsedAt: r.last_used_at,
    })),
  })
})

// ─── DELETE /api/auth/passkeys/:id ─────────────────────────────────────────────

authRouter.delete('/passkeys/:id', requireSession, async (c) => {
  const id = parseInt(c.req.param('id'), 10)
  if (!Number.isInteger(id)) return c.json({ error: 'id inválido' }, 400)

  const total = await countCredentials()
  if (total <= 1) return c.json({ error: 'No podés eliminar la última passkey' }, 400)

  const deleted = await deleteCredential(id)
  if (!deleted) return c.json({ error: 'Passkey no encontrada' }, 404)
  return c.json({ deleted: true })
})
