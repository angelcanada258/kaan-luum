const path = require('node:path');
const express = require('express');
const cors = require('cors');
const database = require('./database');

const PORT = Number(process.env.PORT) || 3000;
const AFORO_MAX = 50;
const TIPOS = new Set(['adulto', 'niño', 'local']);
const TARIFAS = {
  nino: { nombre: 'Niño 3 a 11 años', tipo: 'niño', precio: 100 },
  inapam: { nombre: 'INAPAM', tipo: 'adulto', precio: 150 },
  tulumense: { nombre: 'Tulumnense con INE', tipo: 'local', precio: 150 },
  mexicano: { nombre: 'Mexicano / residente', tipo: 'adulto', precio: 250 },
  discapacidad: {
    nombre: 'Persona con discapacidad',
    tipo: 'adulto',
    precio: 250
  },
  extranjero: { nombre: 'Extranjero', tipo: 'adulto', precio: 350 }
};
const SERVICIOS = {
  dron: { nombre: 'Vuelo de dron', precio: 250 },
  apnea: { nombre: 'Apnea', precio: 300 },
  buzo: { nombre: 'Buzo', precio: 350 }
};
const DEFAULT_TARIFF = {
  adulto: 'mexicano',
  niño: 'nino',
  local: 'tulumense'
};

function fechaLocal(timestamp = Date.now()) {
  const date = new Date(timestamp);
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0')
  ].join('-');
}

function horaLocal(timestamp) {
  return new Date(timestamp).toLocaleTimeString('es-MX', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

function normalizarFolio(value) {
  return String(value || '').trim().toUpperCase();
}

function fechaValida(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function apiError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function calcularDuraciones(registros) {
  const colas = new Map();
  return registros.map((registro) => {
    const cola = colas.get(registro.folio) || [];
    if (registro.evento === 'entrada') {
      cola.push(registro.timestamp);
      colas.set(registro.folio, cola);
      return { ...registro, duracion_minutos: null };
    }

    const entradaTimestamp = cola.shift();
    colas.set(registro.folio, cola);
    return {
      ...registro,
      duracion_minutos:
        entradaTimestamp === undefined
          ? null
          : Math.max(0, Math.round((registro.timestamp - entradaTimestamp) / 60000))
    };
  });
}

function csvValue(value) {
  const text = String(value ?? '');
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function createApp(repository = database) {
  const app = express();
  app.disable('x-powered-by');
  app.use(cors());
  app.use(express.json({ limit: '32kb' }));

  app.post('/api/entrada', (req, res, next) => {
    try {
      const folio = normalizarFolio(req.body?.folio);
      const tipo = req.body?.tipo;
      const fecha = fechaLocal();

      if (!folio) throw apiError(400, 'El folio es obligatorio.');
      if (!TIPOS.has(tipo)) {
        throw apiError(400, 'El tipo debe ser adulto, niño o local.');
      }

      const adentro = repository.obtenerAdentroAhora(fecha);
      if (adentro.some((registro) => registro.folio === folio)) {
        throw apiError(409, `El folio ${folio} ya está adentro.`);
      }
      if (adentro.length >= AFORO_MAX) {
        throw apiError(409, `Aforo máximo alcanzado (${AFORO_MAX} personas).`);
      }

      const tarifaCodigo = req.body?.tarifa || DEFAULT_TARIFF[tipo];
      const tarifa = TARIFAS[tarifaCodigo];
      if (!tarifa) throw apiError(400, 'La tarifa seleccionada no es válida.');
      if (tarifa.tipo !== tipo) {
        throw apiError(400, 'La tarifa no corresponde al tipo de brazalete.');
      }

      const servicios = [...new Set(req.body?.servicios || [])];
      if (!Array.isArray(req.body?.servicios || [])) {
        throw apiError(400, 'Los servicios deben enviarse como una lista.');
      }
      if (servicios.some((servicio) => !SERVICIOS[servicio])) {
        throw apiError(400, 'Uno o más servicios seleccionados no son válidos.');
      }

      const serviciosTotal = servicios.reduce(
        (sum, servicio) => sum + SERVICIOS[servicio].precio,
        0
      );
      const timestamp = Date.now();
      const total = tarifa.precio + serviciosTotal;
      repository.insertarRegistro({
        folio,
        tipo,
        evento: 'entrada',
        timestamp,
        fecha,
        tarifa: tarifaCodigo,
        precio: tarifa.precio,
        servicios,
        total
      });

      res.status(201).json({
        success: true,
        folio,
        tipo,
        tarifa: tarifaCodigo,
        servicios,
        precio_total: total,
        hora: horaLocal(timestamp)
      });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/salida', (req, res, next) => {
    try {
      const folio = normalizarFolio(req.body?.folio);
      const fecha = fechaLocal();
      if (!folio) throw apiError(400, 'El folio es obligatorio.');

      const registros = repository.obtenerRegistrosPorFecha(fecha);
      const entradas = registros.filter(
        (registro) => registro.folio === folio && registro.evento === 'entrada'
      );
      if (!entradas.length) {
        throw apiError(404, `El folio ${folio} no tiene entrada registrada hoy.`);
      }

      const visitante = repository
        .obtenerAdentroAhora(fecha)
        .find((registro) => registro.folio === folio);
      if (!visitante) {
        throw apiError(409, `El folio ${folio} ya registró su salida.`);
      }

      const timestamp = Date.now();
      const duracion = Math.max(
        0,
        Math.round((timestamp - visitante.entrada_timestamp) / 60000)
      );
      repository.insertarRegistro({
        folio,
        tipo: visitante.tipo,
        evento: 'salida',
        timestamp,
        fecha,
        tarifa: visitante.tarifa,
        precio: 0,
        servicios: [],
        total: 0
      });

      res.json({
        success: true,
        folio,
        duracion_minutos: duracion
      });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/dashboard', (req, res, next) => {
    try {
      const fecha = fechaLocal();
      const resumen = repository.obtenerResumenDia(fecha);
      const porcentaje = Math.round((resumen.adentro.length / AFORO_MAX) * 100);
      res.json({
        adentro: resumen.adentro.length,
        entradas_hoy: resumen.entradas.length,
        salidas_hoy: resumen.salidas.length,
        aforo_max: AFORO_MAX,
        porcentaje_aforo: porcentaje,
        tipos: resumen.tipos,
        ingresos_hoy: resumen.ingresos,
        ultimos: resumen.ultimos
      });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/historial', (req, res, next) => {
    try {
      const fecha = req.query.fecha || fechaLocal();
      const evento = req.query.evento || 'todos';
      const tipo = req.query.tipo || 'todos';
      const folio = normalizarFolio(req.query.folio);

      if (!fechaValida(fecha)) throw apiError(400, 'La fecha no es válida.');
      if (!['todos', 'entrada', 'salida'].includes(evento)) {
        throw apiError(400, 'El filtro de evento no es válido.');
      }
      if (!['todos', 'adulto', 'niño', 'local'].includes(tipo)) {
        throw apiError(400, 'El filtro de tipo no es válido.');
      }

      const registros = calcularDuraciones(
        repository.obtenerRegistrosPorFecha(fecha)
      )
        .filter((registro) => evento === 'todos' || registro.evento === evento)
        .filter((registro) => tipo === 'todos' || registro.tipo === tipo)
        .filter((registro) => !folio || registro.folio.includes(folio))
        .reverse();

      res.json(registros);
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/adentro', (req, res, next) => {
    try {
      res.json(repository.obtenerAdentroAhora(fechaLocal()));
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/reportes', (req, res, next) => {
    try {
      const fecha = req.query.fecha || fechaLocal();
      if (!fechaValida(fecha)) throw apiError(400, 'La fecha no es válida.');

      const registros = repository.obtenerRegistrosPorFecha(fecha);
      const adentro = repository.obtenerAdentroAhora(fecha);
      const porHora = Object.fromEntries(
        Array.from({ length: 24 }, (_, hour) => [String(hour), 0])
      );
      const porTipo = {
        adulto: { entradas: 0, salidas: 0, adentro: 0 },
        niño: { entradas: 0, salidas: 0, adentro: 0 },
        local: { entradas: 0, salidas: 0, adentro: 0 }
      };

      for (const registro of registros) {
        porTipo[registro.tipo][`${registro.evento}s`] += 1;
        if (registro.evento === 'entrada') {
          porHora[String(new Date(registro.timestamp).getHours())] += 1;
        }
      }
      for (const visitante of adentro) porTipo[visitante.tipo].adentro += 1;

      res.json({
        por_hora: porHora,
        por_tipo: porTipo,
        total_entradas: registros.filter((r) => r.evento === 'entrada').length,
        total_salidas: registros.filter((r) => r.evento === 'salida').length,
        adentro_actual: adentro.length
      });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/exportar', (req, res, next) => {
    try {
      const fecha = req.query.fecha || fechaLocal();
      if (!fechaValida(fecha)) throw apiError(400, 'La fecha no es válida.');

      const rows = [['Folio', 'Tipo', 'Evento', 'Fecha', 'Hora']];
      for (const registro of repository.obtenerRegistrosPorFecha(fecha)) {
        rows.push([
          registro.folio,
          registro.tipo,
          registro.evento,
          registro.fecha,
          horaLocal(registro.timestamp)
        ]);
      }
      const csv = `\uFEFF${rows.map((row) => row.map(csvValue).join(',')).join('\r\n')}`;
      res.set({
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="kaan-luum-${fecha}.csv"`
      });
      res.send(csv);
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/catalogo', (_req, res) => {
    res.json({ tarifas: TARIFAS, servicios: SERVICIOS });
  });

  app.use(express.static(path.join(__dirname, 'public')));

  app.use('/api', (_req, res) => {
    res.status(404).json({ success: false, error: 'Endpoint no encontrado.' });
  });

  app.get('*', (_req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  });

  app.use((error, _req, res, _next) => {
    const status =
      error.status ||
      (error instanceof SyntaxError && 'body' in error ? 400 : 500);
    const message =
      status === 500 ? 'Ocurrió un error interno en el servidor.' : error.message;
    if (status === 500) console.error(error);
    res.status(status).json({ success: false, error: message });
  });

  return app;
}

if (require.main === module) {
  createApp().listen(PORT, '0.0.0.0', () => {
    console.log(`Kaan Luum disponible en http://localhost:${PORT}`);
  });
}

module.exports = {
  AFORO_MAX,
  SERVICIOS,
  TARIFAS,
  createApp,
  fechaLocal
};
