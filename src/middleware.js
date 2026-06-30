// Utilidades y middleware compartidos.

// Exige el header X-API-Key (app/dispositivo). Entorno de laboratorio: una sola
// clave para todas las rutas /api.
function requireApiKey(req, res, next) {
  if (!process.env.API_KEY) {
    return res.status(500).json({ error: 'API_KEY no configurada en el servidor' });
  }
  if (req.header('X-API-Key') !== process.env.API_KEY) {
    return res.status(401).json({ error: 'X-API-Key invalida o ausente' });
  }
  next();
}

function toIntOrNull(v) {
  if (v === undefined || v === null || v === '') return null;
  const n = parseInt(v, 10);
  return Number.isNaN(n) ? null : n;
}

function toFloatOrNull(v) {
  if (v === undefined || v === null || v === '') return null;
  const n = parseFloat(v);
  return Number.isNaN(n) ? null : n;
}

module.exports = { requireApiKey, toIntOrNull, toFloatOrNull };
