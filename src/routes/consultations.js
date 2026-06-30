// Consultas / atenciones: inicio, fin, listado, detalle con records y duracion.
const express = require('express');
const { pool } = require('../db');
const { requireApiKey, toIntOrNull } = require('../middleware');

const router = express.Router();

// POST /api/consultations -> INICIA una consulta
// body: { patient_id, doctor_id, bracelet_id, notes? }
router.post('/', requireApiKey, async (req, res) => {
  const { patient_id, doctor_id, bracelet_id, notes } = req.body || {};
  try {
    const r = await pool.query(
      `INSERT INTO consultation (patient_id, doctor_id, bracelet_id, notes)
       VALUES ($1,$2,$3,$4)
       RETURNING id, patient_id, doctor_id, bracelet_id, started_at, ended_at, notes`,
      [toIntOrNull(patient_id), toIntOrNull(doctor_id), toIntOrNull(bracelet_id), notes ?? null]
    );
    res.status(201).json({ ok: true, consultation: r.rows[0] });
  } catch (err) {
    console.error('Error iniciar consulta:', err.message);
    res.status(500).json({ error: 'No se pudo iniciar la consulta' });
  }
});

// PATCH /api/consultations/:id/end -> TERMINA la consulta (ended_at = now)
router.patch('/:id/end', requireApiKey, async (req, res) => {
  try {
    const r = await pool.query(
      `UPDATE consultation SET ended_at = now()
       WHERE id = $1 RETURNING *`,
      [req.params.id]
    );
    if (!r.rowCount) return res.status(404).json({ error: 'Consulta no encontrada' });
    res.json({ ok: true, consultation: r.rows[0] });
  } catch (err) {
    console.error('Error terminar consulta:', err.message);
    res.status(500).json({ error: 'No se pudo terminar la consulta' });
  }
});

// GET /api/consultations -> listado con resumen (duracion + nro records)
router.get('/', requireApiKey, async (_req, res) => {
  const r = await pool.query('SELECT * FROM consultation_summary ORDER BY started_at DESC');
  res.json({ ok: true, consultations: r.rows });
});

// GET /api/consultations/:id -> detalle con sus records
router.get('/:id', requireApiKey, async (req, res) => {
  try {
    const c = await pool.query('SELECT * FROM consultation_summary WHERE id = $1', [req.params.id]);
    if (!c.rowCount) return res.status(404).json({ error: 'Consulta no encontrada' });
    const recs = await pool.query(
      'SELECT * FROM record WHERE consultation_id = $1 ORDER BY captured_at', [req.params.id]
    );
    res.json({ ok: true, consultation: c.rows[0], records: recs.rows });
  } catch (err) {
    console.error('Error detalle consulta:', err.message);
    res.status(500).json({ error: 'No se pudo obtener la consulta' });
  }
});

module.exports = router;
