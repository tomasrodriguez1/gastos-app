import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { getCookie, setCookie, deleteCookie } from 'hono/cookie'
import {
  getValidSessionByHash,
  touchSession,
  revokeSessionByHash,
} from './db/auth-queries.js'

// ─── CONFIGURACIÓN WEBAUTHN ────────────────────────────────────────────────────

const isProd = process.env.NODE_ENV === 'production'

export const PASSKEY_RP_ID = process.env.PASSKEY_RP_ID || (isProd ? undefined : 'localhost')
export const PASSKEY_RP_NAME = process.env.PASSKEY_RP_NAME || 'Gastos App'
export const PASSKEY_ORIGIN = process.env.PASSKEY_ORIGIN || (isProd ? undefined : 'http://localhost:6001')
export const PASSKEY_BOOTSTRAP_SECRET = process.env.PASSKEY_BOOTSTRAP_SECRET
export const PASSKEY_BOOTSTRAP_OVERRIDE_UNTIL = process.env.PASSKEY_BOOTSTRAP_OVERRIDE_UNTIL
export const SESSION_MAX_AGE_SECONDS = process.env.SESSION_MAX_AGE_SECONDS
  ? parseInt(process.env.SESSION_MAX_AGE_SECONDS)
  : 60 * 60 * 24 * 30 // 30 días

if (isProd && (!PASSKEY_RP_ID || !PASSKEY_ORIGIN)) {
  console.warn('[auth] PASSKEY_RP_ID/PASSKEY_ORIGIN no configurados en producción — passkeys no funcionarán hasta configurarlos.')
}

export const SESSION_COOKIE_NAME = 'gastos_session'
export const LEGACY_COOKIE_NAME = 'gastos_access'

const COOKIE_SECURE = process.env.COOKIE_SECURE !== 'false'

// ─── SECRETOS: COMPARACIÓN TIMING-SAFE ─────────────────────────────────────────

function sha256(value) {
  return createHash('sha256').update(value).digest()
}

export function timingSafeEqualString(a, b) {
  const hashA = sha256(a ?? '')
  const hashB = sha256(b ?? '')
  return timingSafeEqual(hashA, hashB)
}

export function verifyBootstrapSecret(provided) {
  if (!PASSKEY_BOOTSTRAP_SECRET || !provided) return false
  return timingSafeEqualString(provided, PASSKEY_BOOTSTRAP_SECRET)
}

/**
 * Procedimiento de recuperación: si PASSKEY_BOOTSTRAP_OVERRIDE_UNTIL es un timestamp ISO
 * futuro, permite volver a usar el secreto de bootstrap aunque ya existan passkeys (p.ej.
 * el owner perdió acceso a todos sus dispositivos). Requiere acceso directo al servidor para
 * setear la variable, y se desactiva solo al vencer — no es un bypass permanente.
 * Ver docs/operations/runbook.md → Recuperación.
 */
export function isBootstrapOverrideActive() {
  if (!PASSKEY_BOOTSTRAP_OVERRIDE_UNTIL) return false
  const until = Date.parse(PASSKEY_BOOTSTRAP_OVERRIDE_UNTIL)
  return Number.isFinite(until) && until > Date.now()
}

// ─── SESIONES ───────────────────────────────────────────────────────────────────

export function generateSessionToken() {
  return randomBytes(32).toString('base64url')
}

export function hashSessionToken(token) {
  return createHash('sha256').update(token).digest('hex')
}

export function setSessionCookie(c, token) {
  setCookie(c, SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: COOKIE_SECURE,
    sameSite: 'Strict',
    maxAge: SESSION_MAX_AGE_SECONDS,
    path: '/',
  })
}

export function clearSessionCookie(c) {
  deleteCookie(c, SESSION_COOKIE_NAME, { path: '/' })
}

// Desliza expires_at, pero como máximo 1 vez por hora por sesión para no escribir en cada request.
const TOUCH_THROTTLE_MS = 60 * 60 * 1000
const lastTouch = new Map()

async function maybeTouchSession(tokenHash, session) {
  const last = lastTouch.get(tokenHash) ?? 0
  const now = Date.now()
  if (now - last < TOUCH_THROTTLE_MS) return
  lastTouch.set(tokenHash, now)
  await touchSession(tokenHash, SESSION_MAX_AGE_SECONDS).catch((e) => {
    console.error('[auth] error al renovar sesión:', e.message)
  })
  void session
}

/** Retorna `true` si el request trae una sesión válida (y la renueva de forma throttleada). */
export async function checkSession(c) {
  const token = getCookie(c, SESSION_COOKIE_NAME)
  if (!token) return false
  const tokenHash = hashSessionToken(token)
  const session = await getValidSessionByHash(tokenHash)
  if (!session) return false
  await maybeTouchSession(tokenHash, session)
  return true
}

export async function logoutCurrentSession(c) {
  const token = getCookie(c, SESSION_COOKIE_NAME)
  if (token) {
    await revokeSessionByHash(hashSessionToken(token))
    lastTouch.delete(hashSessionToken(token))
  }
  clearSessionCookie(c)
}

/** Middleware Hono: exige sesión válida. Usar en rutas de gestión de passkeys/logout. */
export async function requireSession(c, next) {
  const ok = await checkSession(c)
  if (!ok) return c.json({ error: 'No autenticado' }, 401)
  return next()
}

// ─── RATE LIMITING (en memoria, por proceso) ───────────────────────────────────

const buckets = new Map()

export function getClientIp(c) {
  // GAP: la extracción real detrás del proxy de Coolify debe confirmarse en despliegue
  // (X-Forwarded-For vs cabecera de confianza equivalente).
  const forwarded = c.req.header('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0].trim()
  return c.req.header('x-real-ip') || 'unknown'
}

/** Retorna `true` si la request está dentro del límite; `false` si debe rechazarse con 429. */
export function checkRateLimit(key, { windowMs, max }) {
  const now = Date.now()
  const bucket = buckets.get(key)
  if (!bucket || now > bucket.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs })
    return true
  }
  if (bucket.count >= max) return false
  bucket.count++
  return true
}

export function rateLimited(c, key, opts) {
  if (checkRateLimit(key, opts)) return null
  return c.json({ error: 'Demasiados intentos, esperá un momento' }, 429)
}

// ─── MIDDLEWARE COMBINADO (sesión passkey O ACCESS_TOKEN legacy) ──────────────

/**
 * Reemplaza el middleware global de ACCESS_TOKEN. Deja pasar si:
 *  1. Hay una sesión de passkey válida (nuevo mecanismo), o
 *  2. Se cumple el flujo legacy de ACCESS_TOKEN (cookie o `?t=`), idéntico al anterior.
 * Las rutas bajo /api/auth/* quedan exentas: cada endpoint aplica su propio gate interno.
 */
export function createAuthMiddleware(accessToken) {
  return async (c, next) => {
    const path = new URL(c.req.url).pathname
    if (path.startsWith('/api/auth/')) return next()

    if (await checkSession(c)) return next()

    // Sin ACCESS_TOKEN configurado o en dev → acceso libre (comportamiento preexistente).
    if (!accessToken || process.env.NODE_ENV !== 'production') return next()

    const cookieToken = getCookie(c, LEGACY_COOKIE_NAME)
    if (cookieToken === accessToken) return next()

    const queryToken = c.req.query('t')
    if (queryToken === accessToken) {
      setCookie(c, LEGACY_COOKIE_NAME, accessToken, {
        httpOnly: true,
        secure: COOKIE_SECURE,
        sameSite: 'Lax',
        maxAge: 60 * 60 * 24 * 365,
        path: '/',
      })
      const url = new URL(c.req.url)
      url.searchParams.delete('t')
      return c.redirect(url.toString(), 302)
    }

    return c.text('Acceso no autorizado. Usá el link con el token o ingresá con tu passkey.', 401)
  }
}
