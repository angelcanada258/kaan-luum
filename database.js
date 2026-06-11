const path = require('node:path');
const Database = require('better-sqlite3');

function parseServices(value) {
  try {
    const parsed = JSON.parse(value || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function hydrate(row) {
  if (!row) return row;
  return {
    ...row,
    servicios: parseServices(row.servicios)
  };
}

function createDatabase(filename = path.join(__dirname, 'kaan_luum.db')) {
  const db = new Database(filename);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS registros (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      folio TEXT NOT NULL,
      tipo TEXT NOT NULL CHECK(tipo IN ('adulto', 'niño', 'local')),
      evento TEXT NOT NULL CHECK(evento IN ('entrada', 'salida')),
      timestamp INTEGER NOT NULL,
      fecha TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_fecha ON registros(fecha);
    CREATE INDEX IF NOT EXISTS idx_folio ON registros(folio);
  `);

  const columns = new Set(
    db.prepare('PRAGMA table_info(registros)').all().map((column) => column.name)
  );
  const migrations = [
    ['tarifa', "ALTER TABLE registros ADD COLUMN tarifa TEXT NOT NULL DEFAULT ''"],
    ['precio', 'ALTER TABLE registros ADD COLUMN precio INTEGER NOT NULL DEFAULT 0'],
    ['servicios', "ALTER TABLE registros ADD COLUMN servicios TEXT NOT NULL DEFAULT '[]'"],
    ['total', 'ALTER TABLE registros ADD COLUMN total INTEGER NOT NULL DEFAULT 0']
  ];

  for (const [column, sql] of migrations) {
    if (!columns.has(column)) db.exec(sql);
  }

  const insertStatement = db.prepare(`
    INSERT INTO registros
      (folio, tipo, evento, timestamp, fecha, tarifa, precio, servicios, total)
    VALUES
      (@folio, @tipo, @evento, @timestamp, @fecha, @tarifa, @precio, @servicios, @total)
  `);
  const byDateStatement = db.prepare(`
    SELECT id, folio, tipo, evento, timestamp, fecha, tarifa, precio, servicios, total
    FROM registros
    WHERE fecha = ?
    ORDER BY timestamp ASC, id ASC
  `);

  function insertarRegistro(registro) {
    const info = insertStatement.run({
      folio: registro.folio,
      tipo: registro.tipo,
      evento: registro.evento,
      timestamp: registro.timestamp ?? Date.now(),
      fecha: registro.fecha,
      tarifa: registro.tarifa || '',
      precio: Number(registro.precio) || 0,
      servicios: JSON.stringify(registro.servicios || []),
      total: Number(registro.total) || 0
    });
    return hydrate(
      db.prepare('SELECT * FROM registros WHERE id = ?').get(info.lastInsertRowid)
    );
  }

  function obtenerRegistrosPorFecha(fecha) {
    return byDateStatement.all(fecha).map(hydrate);
  }

  function obtenerAdentroAhora(fecha) {
    const abiertos = new Map();

    for (const registro of obtenerRegistrosPorFecha(fecha)) {
      const cola = abiertos.get(registro.folio) || [];
      if (registro.evento === 'entrada') {
        cola.push(registro);
      } else if (cola.length) {
        cola.shift();
      }
      abiertos.set(registro.folio, cola);
    }

    return [...abiertos.entries()]
      .filter(([, cola]) => cola.length > 0)
      .map(([folio, cola]) => {
        const entrada = cola[cola.length - 1];
        return {
          folio,
          tipo: entrada.tipo,
          entrada_timestamp: entrada.timestamp,
          tarifa: entrada.tarifa,
          precio: entrada.precio,
          servicios: entrada.servicios,
          total: entrada.total
        };
      })
      .sort((a, b) => b.entrada_timestamp - a.entrada_timestamp);
  }

  function obtenerResumenDia(fecha) {
    const registros = obtenerRegistrosPorFecha(fecha);
    const entradas = registros.filter((registro) => registro.evento === 'entrada');
    const salidas = registros.filter((registro) => registro.evento === 'salida');
    const tipos = { adulto: 0, niño: 0, local: 0 };

    for (const registro of entradas) tipos[registro.tipo] += 1;

    return {
      adentro: obtenerAdentroAhora(fecha),
      entradas,
      salidas,
      tipos,
      ultimos: registros.slice(-6).reverse(),
      ingresos: entradas.reduce((sum, registro) => sum + registro.total, 0)
    };
  }

  return {
    close: () => db.close(),
    insertarRegistro,
    obtenerRegistrosPorFecha,
    obtenerAdentroAhora,
    obtenerResumenDia
  };
}

let defaultRepository;
function getDefaultRepository() {
  if (!defaultRepository) defaultRepository = createDatabase();
  return defaultRepository;
}

module.exports = {
  createDatabase,
  insertarRegistro: (...args) => getDefaultRepository().insertarRegistro(...args),
  obtenerRegistrosPorFecha: (...args) =>
    getDefaultRepository().obtenerRegistrosPorFecha(...args),
  obtenerAdentroAhora: (...args) =>
    getDefaultRepository().obtenerAdentroAhora(...args),
  obtenerResumenDia: (...args) => getDefaultRepository().obtenerResumenDia(...args)
};
