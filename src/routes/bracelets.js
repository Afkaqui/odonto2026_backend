// Pulseras.
const express = require('express');
const { pool } = require('../db');
const { requireApiKey } = require('../middleware');

const router = express.Router();

// POST /api/bracelets -> { code, type }
router.post('/', requireApiKey, async (req, res) => {
  const { code, type } = req.body || {};
  try {
    const r = await pool.query(
      `INSERT INTO bracelet (code, type) VALUES ($1,$2)
       RETURNING id, code, type, created_at`,
      [code ?? null, type ?? 'ppg']
    );
    res.status(201).json({ ok: true, bracelet: r.rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'code de pulsera ya existe' });
    console.error('Error crear pulsera:', err.message);
    res.status(500).json({ error: 'No se pudo registrar la pulsera' });
  }
});

// GET /api/bracelets
router.get('/', requireApiKey, async (_req, res) => {
  const r = await pool.query('SELECT * FROM bracelet ORDER BY id');
  res.json({ ok: true, bracelets: r.rows });
});

module.exports = router;
