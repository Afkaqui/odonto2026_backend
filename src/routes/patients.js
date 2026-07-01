// Pacientes: code, age, gender, name. Gestión para el dashboard (listar, buscar,
// editar, borrar, y detalle con sus consultas + records).
const express = require('express');
const { pool } = require('../db');
const { requireApiKey, toIntOrNull } = require('../middleware');

const router = express.Router();

// POST /api/patients -> { code, age, gender, name }
router.post('/', requireApiKey, async (req, res) => {
  const { code, age, gender, name } = req.body || {};
  try {
    const r = await pool.query(
      `INSERT INTO patient (code, age, gender, name) VALUES ($1,$2,$3,$4)
       RETURNING id, code, age, gender, name, created_at`,
      [code ?? null, toIntOrNull(age), gender ?? null, name ?? null]
    );
    res.status(201).json({ ok: true, patient: r.rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'code de paciente ya existe' });
    console.error('Error crear paciente:', err.message);
    res.status(500).json({ error: 'No se pudo registrar el paciente' });
  }
});

// GET /api/patients?q=texto  -> lista (con búsqueda por code o name) + nº de consultas
router.get('/', requireApiKey, async (req, res) => {
  const q = (req.query.q || '').toString().trim();
  const params = [];
  let where = '';
  if (q) { params.push(`%${q}%`); where = 'WHERE p.code ILIKE $1 OR p.name ILIKE $1'; }
  const r = await pool.query(
    `SELECT p.*, COUNT(c.id) AS consultas
     FROM patient p LEFT JOIN consultation c ON c.patient_id = p.id
     ${where}
     GROUP BY p.id ORDER BY p.id DESC LIMIT 300`, params
  );
  res.json({ ok: true, patients: r.rows });
});

// GET /api/patients/:id -> paciente + sus consultas (con nº de records y duración)
router.get('/:id', requireApiKey, async (req, res) => {
  try {
    const p = await pool.query('SELECT * FROM patient WHERE id = $1', [req.params.id]);
    if (!p.rowCount) return res.status(404).json({ error: 'Paciente no encontrado' });
    const cs = await pool.query(
      `SELECT cs.*, d.name AS doctor_name, d.lastname AS doctor_lastname, b.code AS pulsera_code
       FROM consultation_summary cs
       LEFT JOIN doctor d ON d.id = cs.doctor_id
       LEFT JOIN bracelet b ON b.id = cs.bracelet_id
       WHERE cs.patient_id = $1 ORDER BY cs.started_at DESC`, [req.params.id]
    );
    res.json({ ok: true, patient: p.rows[0], consultations: cs.rows });
  } catch (err) {
    console.error('Error detalle paciente:', err.message);
    res.status(500).json({ error: 'No se pudo obtener el paciente' });
  }
});

// PATCH /api/patients/:id -> editar name, code, age, gender
router.patch('/:id', requireApiKey, async (req, res) => {
  const b = req.body || {};
  try {
    const r = await pool.query(
      `UPDATE patient SET
         name   = COALESCE($2, name),
         code   = COALESCE($3, code),
         age    = COALESCE($4, age),
         gender = COALESCE($5, gender)
       WHERE id = $1 RETURNING id, code, age, gender, name`,
      [req.params.id, b.name ?? null, b.code ?? null, toIntOrNull(b.age), b.gender ?? null]
    );
    if (!r.rowCount) return res.status(404).json({ error: 'Paciente no encontrado' });
    res.json({ ok: true, patient: r.rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'code de paciente ya existe' });
    console.error('Error editar paciente:', err.message);
    res.status(500).json({ error: 'No se pudo editar el paciente' });
  }
});

// DELETE /api/patients/:id -> solo si no tiene consultas (protección)
router.delete('/:id', requireApiKey, async (req, res) => {
  try {
    const c = await pool.query('SELECT count(*) FROM consultation WHERE patient_id = $1', [req.params.id]);
    if (parseInt(c.rows[0].count, 10) > 0) {
      return res.status(409).json({ error: 'El paciente tiene consultas; no se puede borrar' });
    }
    const r = await pool.query('DELETE FROM patient WHERE id = $1 RETURNING id', [req.params.id]);
    if (!r.rowCount) return res.status(404).json({ error: 'Paciente no encontrado' });
    res.json({ ok: true, deleted: r.rows[0].id });
  } catch (err) {
    console.error('Error borrar paciente:', err.message);
    res.status(500).json({ error: 'No se pudo borrar el paciente' });
  }
});

module.exports = router;
