// Pool de conexion a PostgreSQL.
// La cadena viene de DATABASE_URL (.env). En el VPS apunta a postgres_db via
// la red interna postgresql_default (NUNCA a la IP publica: el 5432 solo
// escucha en 127.0.0.1).
const { Pool } = require('pg');

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('FATAL: falta DATABASE_URL en el entorno (.env).');
  process.exit(1);
}

const pool = new Pool({ connectionString, max: 5 });

pool.on('error', (err) => {
  console.error('Error inesperado en el pool de PostgreSQL:', err.message);
});

module.exports = { pool };
