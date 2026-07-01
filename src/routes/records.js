// Records: cada "Guardar" del odontologo en un momento clave de la consulta.
const express = require('express');
const { pool } = require('../db');
const { requireApiKey, toFloatOrNull } = require('../middleware');

const router = express.Router();

// POST /api/records
// body: { consultation_id, ppg, bpm_raw, source, device_time, phase, status }
//   phase  ∈ m1..m6   status ∈ a1..a5
router.post('/', requireApiKey, async (req, res) => {
  const b = req.body || {};
  if (!b.consultation_id) {
    return res.status(400).json({ error: 'Falta consultation_id' });
  }
  try {
    const r = await pool.query(
      `INSERT INTO record
         (consultation_id, device_time, ppg, bpm_raw, source, phase, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       RETURNING id, consultation_id, captured_at, ppg, phase, status`,
      [
        b.consultation_id,
        b.device_time ?? null,
        toFloatOrNull(b.ppg),
        b.bpm_raw ?? null,
        b.source ?? null,
        b.phase ?? null,    // si no es m1..m6 PostgreSQL rechaza (enum)
        b.status ?? null,   // si no es a1..a5 PostgreSQL rechaza (enum)
      ]
    );
    res.status(201).json({ ok: true, record: r.rows[0] });
  } catch (err) {
    if (err.code === '22P02') return res.status(400).json({ error: 'phase debe ser m1..m6 y status a1..a5' });
    if (err.code === '23503') return res.status(400).json({ error: 'consultation_id no existe' });
    console.error('Error crear record:', err.message);
    res.status(500).json({ error: 'No se pudo guardar el record' });
  }
});

// DELETE /api/records/:id -> elimina un record (para el dashboard)
router.delete('/:id', requireApiKey, async (req, res) => {
  try {
    const r = await pool.query('DELETE FROM record WHERE id = $1 RETURNING id', [req.params.id]);
    if (!r.rowCount) return res.status(404).json({ error: 'Record no encontrado' });
    res.json({ ok: true, deleted: r.rows[0].id });
  } catch (err) {
    console.error('Error borrar record:', err.message);
    res.status(500).json({ error: 'No se pudo borrar el record' });
  }
});

// GET /api/records?consultation_id=NN
router.get('/', requireApiKey, async (req, res) => {
  const cid = req.query.consultation_id;
  if (!cid) return res.status(400).json({ error: 'Falta ?consultation_id=' });
  const r = await pool.query(
    'SELECT * FROM record WHERE consultation_id = $1 ORDER BY captured_at', [cid]
  );
  res.json({ ok: true, total: r.rowCount, records: r.rows });
});

module.exports = router;
