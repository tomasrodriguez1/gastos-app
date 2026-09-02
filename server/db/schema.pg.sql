-- ─── GASTOS ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS gastos (
  id                       TEXT PRIMARY KEY,
  sync_key                 TEXT UNIQUE,
  fecha                    TEXT NOT NULL,
  mes                      TEXT NOT NULL,
  ciclo_financiero         TEXT NOT NULL,
  motivo                   TEXT NOT NULL,
  banco                    TEXT DEFAULT '',
  tipos                    JSONB DEFAULT '[]',
  contexto                 TEXT DEFAULT '',
  monto                    NUMERIC DEFAULT 0,
  monto_real               NUMERIC DEFAULT 0,
  usd                      NUMERIC DEFAULT 0,
  monto_clp_manual         NUMERIC,
  split                    NUMERIC DEFAULT 0,
  presupuesto_manual       JSONB,
  contexto_override        TEXT,
  monto_presupuesto_manual NUMERIC,
  es_manual                BOOLEAN DEFAULT FALSE,
  pagado                   BOOLEAN DEFAULT FALSE,
  plata_en_cuenta          BOOLEAN NOT NULL DEFAULT FALSE,
  en_presupuesto           BOOLEAN NOT NULL DEFAULT TRUE,
  conciliado               BOOLEAN NOT NULL DEFAULT FALSE,
  financiado_por           TEXT,
  estado                   TEXT NOT NULL DEFAULT 'confirmado',
  origen                   TEXT NOT NULL DEFAULT 'manual',
  fuente_id                TEXT,
  payload_raw              JSONB,
  created_at               TIMESTAMPTZ DEFAULT NOW(),
  updated_at               TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gastos_mes ON gastos(mes);
CREATE INDEX IF NOT EXISTS idx_gastos_ciclo_financiero ON gastos(ciclo_financiero);
CREATE INDEX IF NOT EXISTS idx_gastos_fecha ON gastos(fecha);
CREATE INDEX IF NOT EXISTS idx_gastos_sync_key ON gastos(sync_key) WHERE sync_key IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_gastos_fuente_id ON gastos(fuente_id) WHERE fuente_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_gastos_estado ON gastos(estado) WHERE estado != 'confirmado';
CREATE INDEX IF NOT EXISTS idx_gastos_financiado_por ON gastos(financiado_por) WHERE financiado_por IS NOT NULL;

-- ─── PRESUPUESTO ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS presupuesto_ciclo (
  ciclo      TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS presupuesto_ingreso (
  id     SERIAL PRIMARY KEY,
  ciclo  TEXT NOT NULL REFERENCES presupuesto_ciclo(ciclo) ON DELETE CASCADE,
  fuente TEXT NOT NULL,
  monto  NUMERIC NOT NULL DEFAULT 0,
  UNIQUE(ciclo, fuente)
);

CREATE TABLE IF NOT EXISTS presupuesto_categoria (
  id           SERIAL PRIMARY KEY,
  ciclo        TEXT NOT NULL REFERENCES presupuesto_ciclo(ciclo) ON DELETE CASCADE,
  grupo        TEXT NOT NULL,
  subcategoria TEXT NOT NULL,
  previsto     NUMERIC NOT NULL DEFAULT 0,
  fgp          BOOLEAN NOT NULL DEFAULT FALSE,
  UNIQUE(ciclo, grupo, subcategoria)
);

CREATE TABLE IF NOT EXISTS presupuesto_fondo (
  id               SERIAL PRIMARY KEY,
  ciclo            TEXT NOT NULL REFERENCES presupuesto_ciclo(ciclo) ON DELETE CASCADE,
  nombre           TEXT NOT NULL,
  previsto_aportar NUMERIC DEFAULT 0,
  acumulado        NUMERIC DEFAULT 0,
  objetivo         NUMERIC,
  fecha_meta       TEXT,
  vinculado        JSONB,
  emoji            TEXT DEFAULT '💰',
  estado           TEXT NOT NULL DEFAULT 'activo',
  UNIQUE(ciclo, nombre)
);

-- ─── CATÁLOGOS ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS catalogo_grupo (
  id     TEXT PRIMARY KEY,
  nombre TEXT NOT NULL,
  orden  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS catalogo_subcategoria (
  id        TEXT PRIMARY KEY,
  grupo_id  TEXT NOT NULL REFERENCES catalogo_grupo(id) ON DELETE CASCADE,
  nombre    TEXT NOT NULL,
  orden     INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS catalogo_tipo (
  id     TEXT PRIMARY KEY,
  nombre TEXT NOT NULL,
  orden  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS catalogo_banco (
  id     TEXT PRIMARY KEY,
  nombre TEXT NOT NULL,
  orden  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS catalogo_contexto (
  id     TEXT PRIMARY KEY,
  nombre TEXT NOT NULL,
  orden  INTEGER NOT NULL DEFAULT 0
);

-- ─── REGLAS DE MAPEO ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS regla_mapeo (
  id           SERIAL PRIMARY KEY,
  prioridad    INTEGER NOT NULL,
  contexto     TEXT,
  tipo         TEXT,
  banco        TEXT,
  motivo_regex TEXT,
  grupo_dest   TEXT,
  subcat_dest  TEXT,
  descripcion  TEXT,
  activa       BOOLEAN DEFAULT TRUE
);

CREATE INDEX IF NOT EXISTS idx_regla_prioridad ON regla_mapeo(prioridad) WHERE activa = TRUE;

-- ─── MEMORIA DE COMERCIOS ────────────────────────────────────────────────────
-- Aprendida de las confirmaciones humanas en /bandeja y /log. Se consulta antes
-- del LLM al clasificar un gasto nuevo, venga de mail o del agente conversacional.
-- La clave es el motivo normalizado (ver src/utils/comercio.js).

CREATE TABLE IF NOT EXISTS comercio_mapeo (
  comercio_normalizado TEXT PRIMARY KEY,
  comercio_ejemplo     TEXT NOT NULL,
  tipos                JSONB NOT NULL DEFAULT '[]',
  contexto             TEXT DEFAULT '',
  presupuesto_manual   JSONB,
  banco_habitual       TEXT DEFAULT '',
  veces_confirmado     INTEGER NOT NULL DEFAULT 1,
  ultima_confirmacion  TIMESTAMPTZ DEFAULT NOW(),
  created_at           TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_comercio_veces ON comercio_mapeo(veces_confirmado DESC);

-- ─── HISTORIAL DEL AGENTE CONVERSACIONAL (F3) ───────────────────────────────
-- Una conversación = una sesión de /agente; los mensajes guardan sus UIMessage
-- parts (texto, adjuntos, tool-calls) tal cual llegan del stream, para poder
-- reconstruir tanto el diálogo como las acciones (crear/editar gasto) al reabrir.

CREATE TABLE IF NOT EXISTS agente_conversaciones (
  id          TEXT PRIMARY KEY,
  titulo      TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS agente_mensajes (
  id               TEXT PRIMARY KEY,
  conversacion_id  TEXT NOT NULL REFERENCES agente_conversaciones(id) ON DELETE CASCADE,
  role             TEXT NOT NULL,
  parts            JSONB NOT NULL,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agente_mensajes_conversacion ON agente_mensajes(conversacion_id, created_at);
CREATE INDEX IF NOT EXISTS idx_agente_conversaciones_updated ON agente_conversaciones(updated_at DESC);

-- ─── DUPLICADOS ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS duplicado_exclusion (
  gasto_id_a TEXT NOT NULL,
  gasto_id_b TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (gasto_id_a, gasto_id_b)
);

-- ─── CONFIG ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS config (
  clave      TEXT PRIMARY KEY,
  valor      TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─── RESERVA TARJETA ─────────────────────────────────────────────────────────
-- Saldo reservado (ej. en Mercado Pago) para pagar cada tarjeta. Standalone,
-- no vinculado a presupuesto_fondo: evita duplicar el gasto (ya registrado en
-- `gastos`) como aporte a un fondo. Ver docs/context/data_model_context.md.

CREATE TABLE IF NOT EXISTS reserva_tarjeta (
  banco      TEXT PRIMARY KEY,
  monto      NUMERIC NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─── CICLO DE FACTURACIÓN DE TARJETA ────────────────────────────────────────
-- Día de cierre configurable por tarjeta, usado para calcular (derivado, no
-- persistido en `gastos`) si un movimiento ya quedó en un estado de cuenta
-- cerrado ("facturado") o si todavía puede aparecer en el próximo corte. Sin
-- fila para un banco = sin ciclo configurado. Ver data_model_context.md.

CREATE TABLE IF NOT EXISTS tarjeta_ciclo (
  banco      TEXT PRIMARY KEY,
  dia_cierre SMALLINT NOT NULL CHECK (dia_cierre BETWEEN 1 AND 28),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─── RESERVAS DE AHORRO (F6) ─────────────────────────────────────────────────
-- Bolsillos de ahorro externos (ej. Mercado Pago: mantención auto, patente,
-- vacaciones, plata para terceros). NO es lo mismo que reserva_tarjeta (arriba):
-- reserva_tarjeta es un valor único por banco sin historial, standalone porque
-- ya cuenta el cargo de tarjeta en `gastos`. `reserva` es un catálogo persistente
-- con historial de saldos (`reserva_saldo`), también standalone y por el mismo
-- motivo — no se fusiona con presupuesto_fondo (per-ciclo, se recrea cada mes).
-- Ver docs/context/data_model_context.md.

CREATE TABLE IF NOT EXISTS reserva (
  id          SERIAL PRIMARY KEY,
  nombre      TEXT NOT NULL UNIQUE,
  emoji       TEXT DEFAULT '💰',
  vinculado   JSONB NOT NULL,        -- {grupo, subcategoria?} — subcategoria ausente = todo el grupo cuenta
  tasa_anual  NUMERIC DEFAULT 0.03,  -- crecimiento estimado (MP ~3% anual); 0 si no aplica
  activa      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reserva_activa ON reserva(activa) WHERE activa = TRUE;

-- Snapshots del saldo real vs esperado. UNIQUE(reserva_id, fecha) permite
-- "corregir" una lectura del mismo día vía upsert simple, sin tabla ni tool de
-- corrección aparte.
CREATE TABLE IF NOT EXISTS reserva_saldo (
  id             SERIAL PRIMARY KEY,
  reserva_id     INTEGER NOT NULL REFERENCES reserva(id) ON DELETE CASCADE,
  fecha          TEXT NOT NULL CHECK (fecha ~ '^\d{4}-\d{2}-\d{2}$'),
  monto_leido    NUMERIC NOT NULL,
  monto_esperado NUMERIC,   -- NULL = primera lectura de la reserva, sin línea base
  diferencia     NUMERIC,   -- monto_leido - monto_esperado
  origen         TEXT NOT NULL DEFAULT 'foto_agente' CHECK (origen IN ('foto_agente', 'manual')),
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (reserva_id, fecha)
);

CREATE INDEX IF NOT EXISTS idx_reserva_saldo_reserva_fecha ON reserva_saldo(reserva_id, fecha DESC);

-- ─── AUTENTICACIÓN (WebAuthn / Passkeys) ────────────────────────────────────
-- Reemplaza ACCESS_TOKEN. Ver docs/architecture/decisions.md DEC-009.
-- `config` (arriba en este archivo, ver sección CONFIG) guarda además una fila
-- clave='webauthn_user_id' con el handle de usuario WebAuthn (single-owner).

CREATE TABLE IF NOT EXISTS passkey_credentials (
  id            SERIAL PRIMARY KEY,
  credential_id TEXT UNIQUE NOT NULL,
  public_key    BYTEA NOT NULL,
  counter       BIGINT NOT NULL DEFAULT 0,
  transports    TEXT[],
  device_type   TEXT,
  backed_up     BOOLEAN,
  name          TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at  TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS webauthn_challenges (
  id          SERIAL PRIMARY KEY,
  challenge   TEXT UNIQUE NOT NULL,
  type        TEXT NOT NULL CHECK (type IN ('registration', 'authentication')),
  expires_at  TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_webauthn_challenges_expires ON webauthn_challenges(expires_at);

CREATE TABLE IF NOT EXISTS auth_sessions (
  id           SERIAL PRIMARY KEY,
  token_hash   TEXT UNIQUE NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at   TIMESTAMPTZ NOT NULL,
  last_used_at TIMESTAMPTZ,
  revoked_at   TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_auth_sessions_expires
  ON auth_sessions(expires_at) WHERE revoked_at IS NULL;
