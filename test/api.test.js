const assert = require('node:assert/strict');
const { afterEach, beforeEach, test } = require('node:test');
const { createDatabase } = require('../database');
const { createApp } = require('../create-app');

let repository;
let server;
let baseUrl;

beforeEach(async () => {
  repository = createDatabase(':memory:');
  server = createApp(repository).listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

afterEach(async () => {
  await new Promise((resolve) => server.close(resolve));
  repository.close();
});

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      'content-type': 'application/json',
      ...(options.headers || {})
    }
  });
  const type = response.headers.get('content-type') || '';
  const body = type.includes('application/json')
    ? await response.json()
    : await response.text();
  return { response, body };
}

test('server exports the Express handler expected by Vercel', () => {
  const handler = require('../index');

  assert.equal(typeof handler, 'function');
  assert.equal(typeof handler.use, 'function');
});

test('database stores required fields and calculates who is inside', () => {
  repository.insertarRegistro({
    folio: 'KL-001',
    tipo: 'adulto',
    evento: 'entrada',
    timestamp: 1718100000000,
    fecha: '2024-06-11',
    tarifa: 'mexicano',
    precio: 250,
    servicios: [],
    total: 250
  });

  const registros = repository.obtenerRegistrosPorFecha('2024-06-11');
  const adentro = repository.obtenerAdentroAhora('2024-06-11');

  assert.equal(registros.length, 1);
  assert.equal(registros[0].folio, 'KL-001');
  assert.equal(adentro.length, 1);
  assert.equal(adentro[0].entrada_timestamp, 1718100000000);
});

test('POST entrada normalizes folio and rejects a duplicate open entry', async () => {
  const first = await request('/api/entrada', {
    method: 'POST',
    body: JSON.stringify({
      folio: ' kl-100 ',
      tipo: 'adulto',
      tarifa: 'mexicano',
      servicios: ['dron']
    })
  });
  const duplicate = await request('/api/entrada', {
    method: 'POST',
    body: JSON.stringify({ folio: 'KL-100', tipo: 'adulto' })
  });

  assert.equal(first.response.status, 201);
  assert.equal(first.body.folio, 'KL-100');
  assert.equal(first.body.precio_total, 500);
  assert.equal(duplicate.response.status, 409);
  assert.equal(duplicate.body.success, false);
});

test('POST salida returns visit duration and prevents a second exit', async () => {
  await request('/api/entrada', {
    method: 'POST',
    body: JSON.stringify({ folio: 'KL-200', tipo: 'niño', tarifa: 'nino' })
  });
  const exit = await request('/api/salida', {
    method: 'POST',
    body: JSON.stringify({ folio: 'KL-200' })
  });
  const duplicate = await request('/api/salida', {
    method: 'POST',
    body: JSON.stringify({ folio: 'KL-200' })
  });

  assert.equal(exit.response.status, 200);
  assert.equal(exit.body.success, true);
  assert.equal(typeof exit.body.duracion_minutos, 'number');
  assert.equal(duplicate.response.status, 409);
});

test('entry is rejected when capacity reaches 50 people', async () => {
  const fecha = new Date();
  const yyyyMmDd = [
    fecha.getFullYear(),
    String(fecha.getMonth() + 1).padStart(2, '0'),
    String(fecha.getDate()).padStart(2, '0')
  ].join('-');

  for (let index = 0; index < 50; index += 1) {
    repository.insertarRegistro({
      folio: `CAP-${index}`,
      tipo: 'adulto',
      evento: 'entrada',
      timestamp: Date.now() + index,
      fecha: yyyyMmDd
    });
  }

  const result = await request('/api/entrada', {
    method: 'POST',
    body: JSON.stringify({ folio: 'CAP-51', tipo: 'adulto' })
  });

  assert.equal(result.response.status, 409);
  assert.match(result.body.error, /aforo/i);
});

test('dashboard, history, reports and CSV expose daily operation', async () => {
  await request('/api/entrada', {
    method: 'POST',
    body: JSON.stringify({ folio: 'KL-300', tipo: 'local', tarifa: 'tulumense' })
  });

  const dashboard = await request('/api/dashboard');
  const history = await request('/api/historial?evento=entrada&tipo=local&folio=300');
  const reports = await request('/api/reportes');
  const csv = await request('/api/exportar');

  assert.equal(dashboard.body.adentro, 1);
  assert.equal(dashboard.body.tipos.local, 1);
  assert.equal(history.body.length, 1);
  assert.equal(reports.body.por_tipo.local.adentro, 1);
  assert.match(csv.response.headers.get('content-disposition'), /attachment/);
  assert.match(csv.body, /Folio,Tipo,Evento,Fecha,Hora/);
});

test('all API failures use the JSON error contract', async () => {
  const invalid = await request('/api/entrada', {
    method: 'POST',
    body: JSON.stringify({ folio: '', tipo: 'visitante' })
  });
  const missing = await request('/api/no-existe');

  assert.equal(invalid.response.status, 400);
  assert.deepEqual(Object.keys(invalid.body).sort(), ['error', 'success']);
  assert.equal(missing.response.status, 404);
  assert.equal(missing.body.success, false);
});
