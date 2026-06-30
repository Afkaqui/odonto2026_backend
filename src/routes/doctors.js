// Odontologos: registro, login (simple, entorno laboratorio), listado.
const express = require('express');
const bcrypt = require('bcryptjs');
const { pool } = require('../db');
const { requireApiKey } = require('../middleware');

const router = express.Router();

// POST /api/doctors  -> registrar odontologo
router.post('/', requireApiKey, async (req, res) => {
  const { name, lastname, username, password } = req.body || {};
  if (!name || !lastname || !username || !password) {
    return res.status(400).json({ error: 'Faltan campos: name, lastname, username, password' });
  }
  try {
    const hash = bcrypt.hashSync(password, 8);
    const r = await pool.query(
      `INSERT INTO doctor (name, lastname, username, password_hash)
       VALUES ($1,$2,$3,$4) RETURNING id, name, lastname, username, created_at`,
      [name, lastname, username, hash]
    );
    res.status(201).json({ ok: true, doctor: r.rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'username ya existe' });
    console.error('Error registrar doctor:', err.message);
    res.status(500).json({ error: 'No se pudo registrar el odontologo' });
  }
});

// GET /api/doctors -> listar (sin hash)
router.get('/', requireApiKey, async (_req, res) => {
  const r = await pool.query('SELECT id, name, lastname, username, created_at FROM doctor ORDER BY id');
  res.json({ ok: true, doctors: r.rows });
});

// POST /api/doctors/login  -> { username, password }
router.post('/login', requireApiKey, async (req, res) => {
  const { username, password } = req.body || {};
  try {
    const r = await pool.query('SELECT * FROM doctor WHERE username = $1', [username]);
    const doc = r.rows[0];
    if (!doc || !bcrypt.compareSync(password || '', doc.password_hash)) {
      return res.status(401).json({ error: 'Credenciales invalidas' });
    }
    res.json({ ok: true, doctor: { id: doc.id, name: doc.name, lastname: doc.lastname, username: doc.username } });
  } catch (err) {
    console.error('Error login:', err.message);
    res.status(500).json({ error: 'No se pudo iniciar sesion' });
  }
});

module.exports = router;
