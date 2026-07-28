import { describe, test, expect, beforeAll, afterAll } from 'bun:test'
import { chromium } from 'playwright'
import sql from '../../server/db/client.js'

// E2E completo del flujo de passkeys, manejado con un autenticador virtual de
// Chrome DevTools Protocol (criptografía WebAuthn real, sin dispositivo físico).
// Corre contra `bun run dev` (Vite :6001 + API :3001) para que el origin coincida
// con PASSKEY_ORIGIN por defecto en dev ('http://localhost:6001'). Limpia todo lo
// que crea al final — no debe dejar residuos en la DB compartida.

const BASE_URL = 'http://localhost:6001'
const BOOTSTRAP_SECRET = process.env.PASSKEY_BOOTSTRAP_SECRET
const STARTUP_TIMEOUT_MS = 30_000

let serverProc, browser, context, page, cdp

async function waitForServer() {
  const start = Date.now()
  while (Date.now() - start < STARTUP_TIMEOUT_MS) {
    try {
      const res = await fetch(`${BASE_URL}/api/auth/status`)
      if (res.ok) return
    } catch {
      // Todavía no está arriba.
    }
    await new Promise((r) => setTimeout(r, 300))
  }
  throw new Error('El servidor de dev no levantó a tiempo')
}

beforeAll(async () => {
  if (!BOOTSTRAP_SECRET) throw new Error('Falta PASSKEY_BOOTSTRAP_SECRET en el entorno (ver .env)')

  serverProc = Bun.spawn(['bun', 'run', 'dev'], {
    cwd: new URL('../..', import.meta.url).pathname,
    stdout: 'ignore',
    stderr: 'ignore',
  })
  await waitForServer()

  browser = await chromium.launch()
  context = await browser.newContext()
  page = await context.newPage()
  page.on('console', (msg) => console.log('[browser]', msg.type(), msg.text()))
  page.on('pageerror', (err) => console.log('[pageerror]', err.message))
  cdp = await context.newCDPSession(page)
  await cdp.send('WebAuthn.enable')
  await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: {
      protocol: 'ctap2',
      transport: 'internal',
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
    },
  })
}, STARTUP_TIMEOUT_MS + 10_000)

afterAll(async () => {
  await browser?.close()
  serverProc?.kill()

  // Limpieza: restaura la DB al estado previo (sin passkeys/sesiones/challenges de prueba).
  await sql`DELETE FROM passkey_credentials WHERE name LIKE '__e2e_%'`.catch(() => {})
  await sql`DELETE FROM auth_sessions`.catch(() => {})
  await sql`DELETE FROM webauthn_challenges WHERE created_at > NOW() - INTERVAL '1 hour'`.catch(() => {})
})

describe('Flujo completo de passkeys (UI real + autenticador virtual)', () => {
  test('bootstrap: sin passkeys configuradas se muestra la pantalla inicial', async () => {
    await page.goto(BASE_URL)
    await page.getByText('Configuración inicial de acceso').waitFor({ state: 'visible', timeout: 10000 })
  })

  test('bootstrap con secreto incorrecto muestra error y no crea passkey', async () => {
    await page.getByPlaceholder('PASSKEY_BOOTSTRAP_SECRET').fill('secreto-incorrecto')
    await page.getByRole('button', { name: 'Crear passkey' }).click()
    await page.getByText(/No autorizado|incorrecto/i).waitFor({ state: 'visible', timeout: 5000 })
  })

  test('bootstrap con secreto correcto crea la primera passkey y loguea', async () => {
    await page.getByPlaceholder('PASSKEY_BOOTSTRAP_SECRET').fill(BOOTSTRAP_SECRET)
    await page.getByPlaceholder(/1Password, MacBook, iPhone/).fill('__e2e_first__')
    await page.getByRole('button', { name: 'Crear passkey' }).click()
    await page.getByRole('heading', { name: 'Dashboard' }).waitFor({ state: 'visible', timeout: 10000 })
  })

  test('/api/auth/passkeys exige sesión real (no acepta requests sin cookie)', async () => {
    const res = await fetch(`${BASE_URL}/api/auth/passkeys`)
    expect(res.status).toBe(401)
  })

  test('logout vuelve a la pantalla de login', async () => {
    await page.getByRole('button', { name: 'Cerrar sesión' }).click()
    await page.getByText('Acceso con passkey').waitFor({ state: 'visible', timeout: 5000 })
  })

  test('login con la passkey ya registrada funciona sin escribir nada', async () => {
    await page.getByRole('button', { name: 'Ingresar con passkey' }).click()
    await page.getByRole('heading', { name: 'Dashboard' }).waitFor({ state: 'visible', timeout: 10000 })
  })

  test('la sección de passkeys lista la creada en el bootstrap', async () => {
    await page.goto(`${BASE_URL}/passkeys`)
    await page.getByText('__e2e_first__').waitFor({ state: 'visible', timeout: 5000 })
    const disabled = await page.getByRole('button', { name: 'Eliminar' }).isDisabled()
    expect(disabled).toBe(true)
  })

  test('se puede agregar una segunda passkey con sesión activa', async () => {
    // Un segundo autenticador virtual simula un dispositivo distinto (p.ej. iCloud Keychain
    // vs. 1Password) — excludeCredentials impide registrar dos veces en el mismo autenticador,
    // que es el comportamiento correcto y esperado del primero. Chrome solo permite un
    // autenticador 'internal' por entorno, así que el segundo usa transporte 'usb'
    // (equivalente a una llave de seguridad o un dispositivo distinto).
    await cdp.send('WebAuthn.addVirtualAuthenticator', {
      options: {
        protocol: 'ctap2',
        transport: 'usb',
        hasResidentKey: true,
        hasUserVerification: true,
        isUserVerified: true,
      },
    })
    await page.getByPlaceholder('iCloud Keychain').fill('__e2e_second__')
    await page.getByRole('button', { name: 'Agregar' }).click()
    await page.getByText('__e2e_second__').waitFor({ state: 'visible', timeout: 10000 })
    const disabled = await page.getByRole('button', { name: 'Eliminar' }).first().isDisabled()
    expect(disabled).toBe(false)
  })

  test('se puede eliminar una passkey cuando hay 2+ (borra específicamente la segunda)', async () => {
    const row = page.getByText('__e2e_second__').locator('xpath=ancestor::div[contains(@class, "rounded-xl")]')
    await row.getByRole('button', { name: 'Eliminar' }).click()
    await row.getByRole('button', { name: 'Sí, eliminar' }).click()
    await page.getByText('__e2e_second__').waitFor({ state: 'detached', timeout: 5000 })
    // Queda solo __e2e_first__: el único botón "Eliminar" visible debe estar deshabilitado.
    const disabled = await page.getByRole('button', { name: 'Eliminar' }).isDisabled()
    expect(disabled).toBe(true)
  })

  test('el servidor bloquea eliminar la última passkey aunque se llame directo a la API', async () => {
    const [{ id }] = await sql`SELECT id FROM passkey_credentials WHERE name = '__e2e_first__'`
    const cookies = await context.cookies()
    const sessionCookie = cookies.find((c) => c.name === 'gastos_session')
    const res = await fetch(`${BASE_URL}/api/auth/passkeys/${id}`, {
      method: 'DELETE',
      headers: { Cookie: `gastos_session=${sessionCookie.value}` },
    })
    expect(res.status).toBe(400)
  })

  test('una vez bootstrapeado, el secreto de bootstrap queda completamente inutilizable (401, no 200)', async () => {
    // Con ≥1 passkey ya registrada, register/options exige sesión — el secreto de
    // bootstrap deja de aceptarse aunque sea el correcto (no solo se rechaza con 409,
    // se ignora del todo salvo que además haya una sesión válida).
    const res = await fetch(`${BASE_URL}/api/auth/passkey/register/options`, {
      method: 'POST',
      headers: { 'X-Bootstrap-Secret': BOOTSTRAP_SECRET },
    })
    expect(res.status).toBe(401)
  })
})
