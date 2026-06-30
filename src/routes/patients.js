// Pacientes (anonimizados): code, age, gender.
const express = require('express');
const { pool } = require('../db');
const { requireApiKey, toIntOrNull } = require('../middleware');

const router = express.Router();

// POST /api/patients -> { code, age, gender }
router.post('/', requireApiKey, async (req, res) => {
  const { code, age, gender } = req.body || {};
  try {
    const r = await pool.query(
      `INSERT INTO patient (code, age, gender) VALUES ($1,$2,$3)
       RETURNING id, code, age, gender, created_at`,
      [code ?? null, toIntOrNull(age), gender ?? null]
    );
    res.status(201).json({ ok: true, patient: r.rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'code de paciente ya existe' });
    console.error('Error crear paciente:', err.message);
    res.status(500).json({ error: 'No se pudo registrar el paciente' });
  }
});

// GET /api/patients
router.get('/', requireApiKey, async (_req, res) => {
  const r = await pool.query('SELECT * FROM patient ORDER BY id DESC');
  res.json({ ok: true, patients: r.rows });
});

module.exports = router;
