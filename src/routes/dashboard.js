// Endpoints de apoyo al dashboard web.
const express = require('express');
const { pool } = require('../db');
const { requireApiKey, toIntOrNull } = require('../middleware');

const router = express.Router();

// GET /api/dashboard/summary
// Conteos globales + actividad de la jornada (hoy) + ultimos registros.
router.get('/summary', requireApiKey, async (_req, res) => {
  try {
    const counts = await pool.query(`
      SELECT
        (SELECT count(*) FROM doctor)       AS doctores,
        (SELECT count(*) FROM patient)      AS pacientes,
        (SELECT count(*) FROM bracelet)     AS pulseras,
        (SELECT count(*) FROM consultation) AS consultas_total,
        (SELECT count(*) FROM consultation WHERE started_at::date = CURRENT_DATE) AS consultas_hoy,
        (SELECT count(*) FROM record       WHERE captured_at::date = CURRENT_DATE) AS registros_hoy,
        (SELECT count(*) FROM record)        AS registros_total
    `);

    const ultimos = await pool.query(`
      SELECT r.id, r.captured_at, r.ppg, r.phase_num, r.phase_label, r.status, r.source,
             r.consultation_id, p.code AS paciente_code, p.name AS paciente_name,
             d.name AS doctor_name, d.lastname AS doctor_lastname
      FROM record r
      JOIN consultation c ON c.id = r.consultation_id
      LEFT JOIN patient p ON p.id = c.patient_id
      LEFT JOIN doctor  d ON d.id = c.doctor_id
      ORDER BY r.captured_at DESC
      LIMIT 20
    `);

    res.json({
      ok: true,
      counts: counts.rows[0],
      ultimos_registros: ultimos.rows,
    });
  } catch (err) {
    console.error('Error dashboard summary:', err.message);
    res.status(500).json({ error: 'No se pudo obtener el resumen' });
  }
});

// GET /api/dashboard/session?date=YYYY-MM-DD  (jornada; por defecto hoy)
// Consultas de ese dia con su resumen (duracion + nro de registros).
router.get('/session', requireApiKey, async (req, res) => {
  const date = req.query.date || null; // null = hoy
  try {
    const r = await pool.query(`
      SELECT cs.*, p.code AS paciente_code, p.name AS paciente_name, p.age AS paciente_edad,
             d.name AS doctor_name, d.lastname AS doctor_lastname,
             b.code AS pulsera_code
      FROM consultation_summary cs
      LEFT JOIN patient  p ON p.id = cs.patient_id
      LEFT JOIN doctor   d ON d.id = cs.doctor_id
      LEFT JOIN bracelet b ON b.id = cs.bracelet_id
      WHERE cs.started_at::date = COALESCE($1::date, CURRENT_DATE)
      ORDER BY cs.started_at DESC
    `, [date]);
    res.json({ ok: true, date: date || 'hoy', total: r.rowCount, consultas: r.rows });
  } catch (err) {
    console.error('Error dashboard session:', err.message);
    res.status(500).json({ error: 'No se pudo obtener la jornada' });
  }
});

module.exports = router;
