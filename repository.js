const sqlite = require('./database');

let repository = sqlite;

if (process.env.DATABASE_URL) {
  const { createPostgresDatabase } = require('./database-postgres');
  repository = createPostgresDatabase(process.env.DATABASE_URL);
} else if (process.env.VERCEL) {
  const missingDatabase = async () => {
    const error = new Error(
      'La base de datos de producción no está configurada. Instala Neon en Vercel.'
    );
    error.status = 503;
    throw error;
  };

  repository = {
    insertarRegistro: missingDatabase,
    obtenerRegistrosPorFecha: missingDatabase,
    obtenerAdentroAhora: missingDatabase,
    obtenerResumenDia: missingDatabase
  };
}

module.exports = repository;
