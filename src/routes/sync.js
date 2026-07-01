// Sincronizacion offline: la app sube una sesion COMPLETA (consulta + records)
// en un solo POST. Idempotente por client_uuid (reintentos no duplican).
const express = require('express');
const { pool } = require('../db');
const { requireApiKey, toIntOrNull, toFloatOrNull } = require('../middleware');

const router = express.Router();

// POST /api/sync/consultation
// body: {
//   client_uuid, started_at, ended_at,
//   doctor:   { username },
//   patient:  { code, age, gender },
//   bracelet: { code },
//   records: [ { captured_at, ppg, bpm_raw, source, device_time, phase, status } ]
// }
router.post('/consultation', requireApiKey, async (req, res) => {
  const b = req.body || {};
  if (!b.client_uuid) return res.status(400).json({ error: 'Falta client_uuid' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1) Dedupe: si ya se subio esta sesion, devolverla sin re-insertar.
    const dup = await client.query(
      'SELECT id FROM consultation WHERE client_uuid = $1', [b.client_uuid]
    );
    if (dup.rowCount) {
      await client.query('COMMIT');
      return res.json({ ok: true, already: true, consultation_id: dup.rows[0].id });
    }

    // 2) Resolver doctor por username (debe existir; si no, queda null).
    let doctorId = null;
    if (b.doctor?.username) {
      const d = await client.query('SELECT id FROM doctor WHERE username = $1', [b.doctor.username]);
      if (d.rowCount) doctorId = d.rows[0].id;
    }

    // 3) find-or-create paciente por code.
    let patientId = null;
    if (b.patient?.code) {
      const p = await client.query('SELECT id FROM patient WHERE code = $1', [b.patient.code]);
      if (p.rowCount) {
        patientId = p.rows[0].id;
      } else {
        const np = await client.query(
          'INSERT INTO patient (code, age, gender, name) VALUES ($1,$2,$3,$4) RETURNING id',
          [b.patient.code, toIntOrNull(b.patient.age), b.patient.gender ?? null, b.patient.name ?? null]
        );
        patientId = np.rows[0].id;
      }
    }

    // 4) find-or-create pulsera por code.
    let braceletId = null;
    if (b.bracelet?.code) {
      const br = await client.query('SELECT id FROM bracelet WHERE code = $1', [b.bracelet.code]);
      if (br.rowCount) {
        braceletId = br.rows[0].id;
      } else {
        const nb = await client.query(
          "INSERT INTO bracelet (code, type) VALUES ($1,'ppg') RETURNING id",
          [b.bracelet.code]
        );
        braceletId = nb.rows[0].id;
      }
    }

    // 5) Insertar la consulta.
    const c = await client.query(
      `INSERT INTO consultation (client_uuid, patient_id, doctor_id, bracelet_id, started_at, ended_at)
       VALUES ($1,$2,$3,$4, COALESCE($5, now()), $6) RETURNING id`,
      [b.client_uuid, patientId, doctorId, braceletId, b.started_at ?? null, b.ended_at ?? null]
    );
    const consultationId = c.rows[0].id;

    // 6) Insertar los records.
    const recs = Array.isArray(b.records) ? b.records : [];
    for (const r of recs) {
      await client.query(
        `INSERT INTO record
           (consultation_id, captured_at, device_time, ppg, bpm_raw, source, phase, status)
         VALUES ($1, COALESCE($2, now()), $3, $4, $5, $6, $7, $8)`,
        [consultationId, r.captured_at ?? null, r.device_time ?? null,
         toFloatOrNull(r.ppg), r.bpm_raw ?? null, r.source ?? null,
         r.phase ?? null, r.status ?? null]
      );
    }

    await client.query('COMMIT');
    res.status(201).json({ ok: true, already: false, consultation_id: consultationId, records: recs.length });
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '22P02') return res.status(400).json({ error: 'phase debe ser m1..m6 y status a1..a5' });
    console.error('Error sync consultation:', err.message);
    res.status(500).json({ error: 'No se pudo sincronizar la sesion' });
  } finally {
    client.release();
  }
});

module.exports = router;
