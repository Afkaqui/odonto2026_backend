-- =====================================================================
--  Esquema BD pulsera_db  (Pulsera PPG - deteccion de ansiedad en consulta)
--  Modelo relacional: doctor / patient / bracelet / consultation / record
--  Objetivo: medir duracion de la atencion y registrar, en momentos clave,
--  el estado del paciente (cada vez que el odontologo presiona "Guardar").
--  Idempotente: se ejecuta al arrancar el backend.
-- =====================================================================

-- Limpieza del modelo plano anterior (estaba vacio).
DROP TABLE IF EXISTS sesiones_clinicas;

-- ---------- Tipos enumerados (segun la maqueta) ----------
DO $$ BEGIN
  CREATE TYPE anxiety_status AS ENUM ('a1','a2','a3','a4','a5');  -- estado del paciente
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE consult_phase AS ENUM ('m1','m2','m3','m4','m5','m6'); -- momento de la consulta
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ---------- Odontologo ----------
CREATE TABLE IF NOT EXISTS doctor (
  id            BIGSERIAL PRIMARY KEY,
  name          TEXT NOT NULL,
  lastname      TEXT NOT NULL,
  username      TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,              -- bcrypt (no texto plano)
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- Paciente (anonimizado) ----------
CREATE TABLE IF NOT EXISTS patient (
  id          BIGSERIAL PRIMARY KEY,
  code        TEXT UNIQUE,                  -- codigo de estudio, ej. PAC-2025-001
  age         INTEGER,
  gender      TEXT,                         -- 'M' | 'F' | 'O'
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- Pulsera ----------
CREATE TABLE IF NOT EXISTS bracelet (
  id          BIGSERIAL PRIMARY KEY,
  code        TEXT UNIQUE,                  -- ej. 'Pulsera001'
  type        TEXT DEFAULT 'ppg',           -- tipo/modelo de pulsera
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- Consulta / atencion (agrupa records, mide duracion) ----------
CREATE TABLE IF NOT EXISTS consultation (
  id           BIGSERIAL PRIMARY KEY,
  patient_id   BIGINT REFERENCES patient(id),
  doctor_id    BIGINT REFERENCES doctor(id),
  bracelet_id  BIGINT REFERENCES bracelet(id),
  started_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at     TIMESTAMPTZ,                 -- NULL = consulta en curso
  notes        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- Registro puntual (cada "Guardar" del odontologo) ----------
CREATE TABLE IF NOT EXISTS record (
  id              BIGSERIAL PRIMARY KEY,
  consultation_id BIGINT NOT NULL REFERENCES consultation(id) ON DELETE CASCADE,
  captured_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  device_time     TEXT,                     -- HH:MM:SS que envia el ESP32
  ppg             REAL,                     -- valor BPM/PPG
  bpm_raw         TEXT,                     -- string crudo "HH:MM:SS,BPM,SRC"
  source          TEXT,                     -- 'OK' real | 'EST' especulado
  phase           consult_phase,            -- momento (m1..m6)
  status          anxiety_status,           -- estado del paciente (a1..a5)
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Soporte de sincronizacion offline: id generado en el celular para deduplicar
-- (si la app reintenta subir la misma sesion, no se duplica).
ALTER TABLE consultation ADD COLUMN IF NOT EXISTS client_uuid TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_consultation_client_uuid
  ON consultation (client_uuid) WHERE client_uuid IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_record_consultation  ON record (consultation_id);
CREATE INDEX IF NOT EXISTS idx_consultation_patient ON consultation (patient_id);
CREATE INDEX IF NOT EXISTS idx_consultation_doctor  ON consultation (doctor_id);

-- ---------- Vista resumen: duracion + nro de momentos por consulta ----------
CREATE OR REPLACE VIEW consultation_summary AS
SELECT
  c.id,
  c.patient_id,
  c.doctor_id,
  c.bracelet_id,
  c.started_at,
  c.ended_at,
  (c.ended_at - c.started_at)               AS duration,
  EXTRACT(EPOCH FROM (c.ended_at - c.started_at))::INT AS duration_seconds,
  COUNT(r.id)                                AS num_records
FROM consultation c
LEFT JOIN record r ON r.consultation_id = c.id
GROUP BY c.id;
