// =====================================================================
//  BACKEND PULSERA PPG - API REST (Node.js + Express) + dashboard estatico
//  Recibe sesiones clinicas de la app Flutter y las guarda en PostgreSQL.
// =====================================================================
const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const { pool } = require('./db');
const doctorsRouter = require('./routes/doctors');
const patientsRouter = require('./routes/patients');
const braceletsRouter = require('./routes/bracelets');
const consultationsRouter = require('./routes/consultations');
const recordsRouter = require('./routes/records');
const dashboardRouter = require('./routes/dashboard');
const syncRouter = require('./routes/sync');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());                          // la app movil consume desde otro origen
app.use(express.json({ limit: '256kb' }));

// --- Health check (publico, sin API key) ---
app.get('/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', db: 'up' });
  } catch (e) {
    res.status(503).json({ status: 'degraded', db: 'down' });
  }
});

// --- API ---
app.use('/api/doctors', doctorsRouter);
app.use('/api/patients', patientsRouter);
app.use('/api/bracelets', braceletsRouter);
app.use('/api/consultations', consultationsRouter);
app.use('/api/records', recordsRouter);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/sync', syncRouter);

// --- Dashboard web estatico (la web la termina el usuario) ---
app.use('/', express.static(path.join(__dirname, '..', 'public')));

// --- Arranque: crea la tabla si no existe y levanta el servidor ---
async function init() {
  try {
    const schema = fs.readFileSync(path.join(__dirname, '..', 'sql', 'schema.sql'), 'utf8');
    await pool.query(schema);
    console.log('Esquema verificado/creado.');
  } catch (e) {
    console.error('Aviso: no se pudo aplicar el esquema al iniciar:', e.message);
  }
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Backend Pulsera escuchando en http://0.0.0.0:${PORT}`);
  });
}

init();
