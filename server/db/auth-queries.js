import sql from './client.js'

// ─── CONFIG (webauthn_user_id) ────────────────────────────────────────────────

export async function getOrCreateWebauthnUserId() {
  const [existing] = await sql`SELECT valor FROM config WHERE clave = 'webauthn_user_id'`
  if (existing) return existing.valor

  const id = crypto.randomUUID()
  await sql`
    INSERT INTO config (clave, valor) VALUES ('webauthn_user_id', ${id})
    ON CONFLICT (clave) DO NOTHING
  `
  const [row] = await sql`SELECT valor FROM config WHERE clave = 'webauthn_user_id'`
  return row.valor
}

// ─── PASSKEY CREDENTIALS ───────────────────────────────────────────────────────

export async function countCredentials() {
  const [row] = await sql`SELECT COUNT(*)::int AS n FROM passkey_credentials`
  return row.n
}

export async function listCredentialsPublic() {
  return sql`
    SELECT id, name, device_type, backed_up, created_at, last_used_at
    FROM passkey_credentials ORDER BY created_at ASC
  `
}

export async function listCredentialDescriptors() {
  return sql`SELECT credential_id, transports FROM passkey_credentials`
}

export async function getCredentialByCredentialId(credentialId) {
  const [row] = await sql`
    SELECT * FROM passkey_credentials WHERE credential_id = ${credentialId}
  `
  return row ?? null
}

export async function insertCredential({ credentialId, publicKey, counter, transports, deviceType, backedUp, name }) {
  const [row] = await sql`
    INSERT INTO passkey_credentials
      (credential_id, public_key, counter, transports, device_type, backed_up, name)
    VALUES (
      ${credentialId}, ${publicKey}, ${counter},
      ${transports ?? null}, ${deviceType ?? null}, ${backedUp ?? null}, ${name ?? null}
    )
    RETURNING id
  `
  return row.id
}

export async function updateCredentialAfterLogin(credentialId, counter) {
  await sql`
    UPDATE passkey_credentials
    SET counter = ${counter}, last_used_at = NOW()
    WHERE credential_id = ${credentialId}
  `
}

export async function deleteCredential(id) {
  const rows = await sql`DELETE FROM passkey_credentials WHERE id = ${id} RETURNING id`
  return rows.length > 0
}

// ─── WEBAUTHN CHALLENGES ────────────────────────────────────────────────────────

export async function createChallenge(challenge, type, ttlMs) {
  await sql`
    INSERT INTO webauthn_challenges (challenge, type, expires_at)
    VALUES (${challenge}, ${type}, NOW() + (${ttlMs}::text || ' milliseconds')::interval)
  `
  // Limpieza oportunista de challenges viejos, sin cron/timer dedicado.
  await sql`DELETE FROM webauthn_challenges WHERE expires_at < NOW() - INTERVAL '1 day'`
}

export async function claimChallenge(challenge, type) {
  const rows = await sql`
    UPDATE webauthn_challenges
    SET consumed_at = NOW()
    WHERE challenge = ${challenge} AND type = ${type}
      AND consumed_at IS NULL AND expires_at > NOW()
    RETURNING id
  `
  return rows.length > 0
}

// ─── AUTH SESSIONS ──────────────────────────────────────────────────────────────

export async function createSession(tokenHash, maxAgeSeconds) {
  await sql`
    INSERT INTO auth_sessions (token_hash, expires_at)
    VALUES (${tokenHash}, NOW() + (${maxAgeSeconds}::text || ' seconds')::interval)
  `
}

export async function getValidSessionByHash(tokenHash) {
  const [row] = await sql`
    SELECT * FROM auth_sessions
    WHERE token_hash = ${tokenHash} AND revoked_at IS NULL AND expires_at > NOW()
  `
  return row ?? null
}

export async function touchSession(tokenHash, maxAgeSeconds) {
  await sql`
    UPDATE auth_sessions
    SET last_used_at = NOW(), expires_at = NOW() + (${maxAgeSeconds}::text || ' seconds')::interval
    WHERE token_hash = ${tokenHash}
  `
}

export async function revokeSessionByHash(tokenHash) {
  await sql`
    UPDATE auth_sessions SET revoked_at = NOW()
    WHERE token_hash = ${tokenHash} AND revoked_at IS NULL
  `
}
