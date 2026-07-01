// Pacientes: code, age, gender, name (name opcional para modo "detallado").
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

// GET /api/patients?q=texto  -> lista (con búsqueda opcional por code o name)
router.get('/', requireApiKey, async (req, res) => {
  const q = (req.query.q || '').toString().trim();
  let r;
  if (q) {
    r = await pool.query(
      `SELECT * FROM patient
       WHERE code ILIKE $1 OR name ILIKE $1
       ORDER BY id DESC LIMIT 100`,
      [`%${q}%`]
    );
  } else {
    r = await pool.query('SELECT * FROM patient ORDER BY id DESC LIMIT 200');
  }
  res.json({ ok: true, patients: r.rows });
});

module.exports = router;
