// Records: cada "Guardar" del odontologo en un momento de la consulta.
// Momento = phase_num (contador) + phase_label (editable: tamizaje, limpieza...).
// status = a1..a5 (nivel de ansiedad, a1 menor ... a5 mayor).
const express = require('express');
const { pool } = require('../db');
const { requireApiKey, toIntOrNull, toFloatOrNull } = require('../middleware');

const router = express.Router();

// POST /api/records
router.post('/', requireApiKey, async (req, res) => {
  const b = req.body || {};
  if (!b.consultation_id) return res.status(400).json({ error: 'Falta consultation_id' });
  try {
    const r = await pool.query(
      `INSERT INTO record
         (consultation_id, device_time, ppg, bpm_raw, source, phase_num, phase_label, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING id, consultation_id, captured_at, ppg, phase_num, phase_label, status`,
      [
        b.consultation_id, b.device_time ?? null, toFloatOrNull(b.ppg),
        b.bpm_raw ?? null, b.source ?? null,
        toIntOrNull(b.phase_num), b.phase_label ?? null, b.status ?? null,
      ]
    );
    res.status(201).json({ ok: true, record: r.rows[0] });
  } catch (err) {
    if (err.code === '22P02') return res.status(400).json({ error: 'status debe ser a1..a5' });
    if (err.code === '23503') return res.status(400).json({ error: 'consultation_id no existe' });
    console.error('Error crear record:', err.message);
    res.status(500).json({ error: 'No se pudo guardar el record' });
  }
});

// PATCH /api/records/:id -> editar etiqueta de momento y/o nivel de ansiedad
router.patch('/:id', requireApiKey, async (req, res) => {
  const b = req.body || {};
  try {
    const r = await pool.query(
      `UPDATE record SET
         phase_label = COALESCE($2, phase_label),
         phase_num   = COALESCE($3, phase_num),
         status      = COALESCE($4, status)
       WHERE id = $1
       RETURNING id, phase_num, phase_label, status`,
      [req.params.id, b.phase_label ?? null, toIntOrNull(b.phase_num), b.status ?? null]
    );
    if (!r.rowCount) return res.status(404).json({ error: 'Record no encontrado' });
    res.json({ ok: true, record: r.rows[0] });
  } catch (err) {
    if (err.code === '22P02') return res.status(400).json({ error: 'status debe ser a1..a5' });
    console.error('Error editar record:', err.message);
    res.status(500).json({ error: 'No se pudo editar el record' });
  }
});

// DELETE /api/records/:id
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
