const state = {
  page: 'dashboard',
  catalog: {
    tarifas: {
      nino: { nombre: 'Niño 3 a 11 años', tipo: 'niño', precio: 100 },
      inapam: { nombre: 'INAPAM', tipo: 'adulto', precio: 150 },
      tulumense: { nombre: 'Tulumnense con INE', tipo: 'local', precio: 150 },
      mexicano: { nombre: 'Mexicano / residente', tipo: 'adulto', precio: 250 },
      discapacidad: { nombre: 'Persona con discapacidad', tipo: 'adulto', precio: 250 },
      extranjero: { nombre: 'Extranjero', tipo: 'adulto', precio: 350 }
    },
    servicios: {
      dron: { nombre: 'Vuelo de dron', precio: 250 },
      apnea: { nombre: 'Apnea', precio: 300 },
      buzo: { nombre: 'Buzo', precio: 350 }
    }
  },
  tariff: 'mexicano',
  historyEvent: 'todos',
  refreshTimer: null
};

const pageTitles = {
  dashboard: 'Panel de control',
  entrada: 'Registrar entrada',
  salida: 'Registrar salida',
  historial: 'Historial',
  reportes: 'Reportes'
};

const money = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
  maximumFractionDigits: 0
});

function localDate(date = new Date()) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0')
  ].join('-');
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

async function api(path, options = {}) {
  try {
    const response = await fetch(path, {
      ...options,
      headers: {
        'content-type': 'application/json',
        ...(options.headers || {})
      }
    });
    const payload = await response.json();
    setConnection(true);
    if (!response.ok) throw new Error(payload.error || 'No fue posible completar la operación.');
    return payload;
  } catch (error) {
    if (error instanceof TypeError) setConnection(false);
    throw error;
  }
}

function setConnection(online) {
  const dot = document.querySelector('#status-dot');
  const label = document.querySelector('#connection-label');
  dot.className = `status-dot ${online ? 'online' : 'offline'}`;
  label.textContent = online ? 'Base de datos conectada' : 'Servidor sin conexión';
}

function showToast(message, type = 'success') {
  const toast = document.querySelector('#toast');
  toast.textContent = message;
  toast.className = `toast ${type === 'error' ? 'error' : ''} show`;
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => {
    toast.className = 'toast';
  }, 3200);
}

function showFormAlert(id, message, type) {
  const alert = document.querySelector(`#${id}`);
  alert.textContent = message;
  alert.className = `form-alert show ${type}`;
  clearTimeout(alert.hideTimer);
  alert.hideTimer = setTimeout(() => {
    alert.className = 'form-alert';
  }, 4500);
}

function typeBadge(type) {
  return `<span class="badge badge-${escapeHtml(type)}">${escapeHtml(type)}</span>`;
}

function eventBadge(event) {
  return `<span class="badge badge-${event}">${event}</span>`;
}

function timeLabel(timestamp) {
  return new Date(timestamp).toLocaleTimeString('es-MX', {
    hour: '2-digit',
    minute: '2-digit'
  });
}

function elapsedLabel(timestamp) {
  const minutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60000));
  if (minutes < 1) return 'Entró hace menos de un minuto';
  if (minutes < 60) return `Entró hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return `Entró hace ${hours} h${rest ? ` ${rest} min` : ''}`;
}

function emptyRow(columns, title, detail) {
  return `<tr><td colspan="${columns}" class="empty-state"><strong>${title}</strong>${detail}</td></tr>`;
}

function setPage(page) {
  state.page = page;
  document.querySelectorAll('.page').forEach((element) => {
    element.classList.toggle('active', element.id === `page-${page}`);
  });
  document.querySelectorAll('.nav-item').forEach((element) => {
    element.classList.toggle('active', element.dataset.page === page);
  });
  document.querySelector('#page-title').textContent = pageTitles[page];
  window.scrollTo({ top: 0, behavior: 'smooth' });

  if (page === 'dashboard') loadDashboard();
  if (page === 'entrada') setTimeout(() => document.querySelector('#entry-folio').focus(), 80);
  if (page === 'salida') {
    loadInside();
    setTimeout(() => document.querySelector('#exit-folio').focus(), 80);
  }
  if (page === 'historial') loadHistory();
  if (page === 'reportes') loadReports();
}

async function loadDashboard() {
  try {
    const data = await api('/api/dashboard');
    document.querySelector('#dash-inside').textContent = data.adentro;
    document.querySelector('#dash-entries').textContent = data.entradas_hoy;
    document.querySelector('#dash-exits').textContent = data.salidas_hoy;
    document.querySelector('#dash-max').textContent = data.aforo_max;
    document.querySelector('#dash-revenue').textContent = money.format(data.ingresos_hoy);
    document.querySelector('#dash-percentage').textContent = `${data.porcentaje_aforo}%`;
    document.querySelector('#type-adult').textContent = data.tipos.adulto;
    document.querySelector('#type-child').textContent = data.tipos.niño;
    document.querySelector('#type-local').textContent = data.tipos.local;

    const bar = document.querySelector('#dash-capacity-bar');
    bar.style.width = `${Math.min(100, data.porcentaje_aforo)}%`;
    bar.className = data.porcentaje_aforo >= 90
      ? 'danger'
      : data.porcentaje_aforo >= 70 ? 'warning' : '';
    document.querySelector('#dash-capacity-label').textContent =
      data.porcentaje_aforo >= 90 ? 'Aforo casi completo'
        : data.porcentaje_aforo >= 70 ? 'Aforo elevado' : 'Aforo tranquilo';

    document.querySelector('#dash-recent').innerHTML = data.ultimos.length
      ? data.ultimos.map((record) => `
        <tr>
          <td><span class="folio">${escapeHtml(record.folio)}</span></td>
          <td>${typeBadge(record.tipo)}</td>
          <td>${eventBadge(record.evento)}</td>
          <td>${timeLabel(record.timestamp)}</td>
        </tr>`).join('')
      : emptyRow(4, 'Aún no hay movimientos', 'El primer escaneo aparecerá aquí.');
  } catch (error) {
    showToast(error.message, 'error');
  }
}

function renderCatalog() {
  const tariffGrid = document.querySelector('#tariff-grid');
  tariffGrid.innerHTML = Object.entries(state.catalog.tarifas).map(([code, tariff]) => `
    <button class="wristband ${code === state.tariff ? 'selected' : ''}"
      type="button" data-tariff="${code}" aria-pressed="${code === state.tariff}">
      <strong>${escapeHtml(tariff.nombre)}</strong>
      <span>${money.format(tariff.precio)}</span>
    </button>`).join('');

  document.querySelector('#service-grid').innerHTML =
    Object.entries(state.catalog.servicios).map(([code, service]) => `
      <div class="service-chip">
        <input id="service-${code}" type="checkbox" value="${code}">
        <label for="service-${code}">
          ${escapeHtml(service.nombre)} <span>+${money.format(service.precio)}</span>
        </label>
      </div>`).join('');

  tariffGrid.addEventListener('click', (event) => {
    const button = event.target.closest('[data-tariff]');
    if (!button) return;
    selectTariff(button.dataset.tariff);
  });
  document.querySelector('#service-grid').addEventListener('change', updateTicket);
  selectTariff(state.tariff);
}

function selectTariff(code) {
  const tariff = state.catalog.tarifas[code];
  if (!tariff) return;
  state.tariff = code;
  document.querySelector('#entry-type').value = tariff.tipo;
  document.querySelectorAll('[data-tariff]').forEach((button) => {
    const selected = button.dataset.tariff === code;
    button.classList.toggle('selected', selected);
    button.setAttribute('aria-pressed', String(selected));
  });
  updateTicket();
}

function selectedServices() {
  return [...document.querySelectorAll('#service-grid input:checked')]
    .map((input) => input.value);
}

function updateTicket() {
  const tariff = state.catalog.tarifas[state.tariff];
  const services = selectedServices();
  const extras = services.reduce((sum, code) => sum + state.catalog.servicios[code].precio, 0);
  const total = tariff.precio + extras;

  document.querySelector('#ticket-access').textContent = money.format(tariff.precio);
  document.querySelector('#ticket-services').innerHTML = services.map((code) => {
    const service = state.catalog.servicios[code];
    return `<div class="ticket-line"><span>${escapeHtml(service.nombre)}</span><strong>${money.format(service.precio)}</strong></div>`;
  }).join('');
  document.querySelector('#ticket-total').textContent = money.format(total);
  document.querySelector('#entry-button-total').textContent = money.format(total);
}

async function submitEntry(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector('[type="submit"]');
  const folioInput = document.querySelector('#entry-folio');
  const folio = folioInput.value.trim();
  if (!folio) {
    showFormAlert('entry-alert', 'Escanea o escribe un folio antes de registrar.', 'error');
    folioInput.focus();
    return;
  }

  button.disabled = true;
  try {
    const result = await api('/api/entrada', {
      method: 'POST',
      body: JSON.stringify({
        folio,
        tipo: document.querySelector('#entry-type').value,
        tarifa: state.tariff,
        servicios: selectedServices()
      })
    });
    showFormAlert(
      'entry-alert',
      `Entrada registrada: ${result.folio}. Cobro ${money.format(result.precio_total)}.`,
      'success'
    );
    showToast(`${result.folio} ingresó correctamente`);
    folioInput.value = '';
    document.querySelectorAll('#service-grid input').forEach((input) => {
      input.checked = false;
    });
    updateTicket();
    loadDashboard();
  } catch (error) {
    showFormAlert('entry-alert', error.message, 'error');
  } finally {
    button.disabled = false;
    folioInput.focus();
  }
}

async function submitExit(event, quickFolio) {
  if (event) event.preventDefault();
  const input = document.querySelector('#exit-folio');
  const folio = quickFolio || input.value.trim();
  if (!folio) {
    showFormAlert('exit-alert', 'Escanea o escribe el folio de salida.', 'error');
    input.focus();
    return;
  }

  try {
    const result = await api('/api/salida', {
      method: 'POST',
      body: JSON.stringify({ folio })
    });
    const duration = result.duracion_minutos < 60
      ? `${result.duracion_minutos} min`
      : `${Math.floor(result.duracion_minutos / 60)} h ${result.duracion_minutos % 60} min`;
    showFormAlert('exit-alert', `Salida registrada: ${result.folio}. Visita de ${duration}.`, 'success');
    showToast(`${result.folio} salió correctamente`);
    input.value = '';
    await Promise.all([loadInside(), loadDashboard()]);
  } catch (error) {
    showFormAlert('exit-alert', error.message, 'error');
  } finally {
    input.focus();
  }
}

async function loadInside() {
  try {
    const visitors = await api('/api/adentro');
    document.querySelector('#exit-inside-count').textContent = visitors.length;
    document.querySelector('#inside-list').innerHTML = visitors.length
      ? visitors.map((visitor) => `
        <article class="inside-item">
          <div>
            <h3>${escapeHtml(visitor.folio)}</h3>
            <p>${typeBadge(visitor.tipo)} &nbsp; ${elapsedLabel(visitor.entrada_timestamp)}</p>
          </div>
          <button class="quick-exit" data-quick-exit="${escapeHtml(visitor.folio)}">Dar salida</button>
        </article>`).join('')
      : `<div class="empty-state"><strong>El cenote está vacío</strong>No hay brazaletes con entrada abierta.</div>`;
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function loadHistory() {
  const date = document.querySelector('#history-date').value || localDate();
  const type = document.querySelector('#history-type').value;
  const folio = document.querySelector('#history-folio').value.trim();
  const query = new URLSearchParams({
    fecha: date,
    evento: state.historyEvent,
    tipo,
    folio
  });

  try {
    const records = await api(`/api/historial?${query}`);
    document.querySelector('#history-body').innerHTML = records.length
      ? records.map((record) => `
        <tr>
          <td><span class="folio">${escapeHtml(record.folio)}</span></td>
          <td>${typeBadge(record.tipo)}</td>
          <td>${eventBadge(record.evento)}</td>
          <td>${timeLabel(record.timestamp)}</td>
          <td>${record.duracion_minutos === null ? '—' : `${record.duracion_minutos} min`}</td>
        </tr>`).join('')
      : emptyRow(5, 'Sin resultados', 'Prueba con otros filtros o una fecha diferente.');
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function loadReports() {
  const date = document.querySelector('#report-date').value || localDate();
  document.querySelector('#download-csv').href = `/api/exportar?fecha=${encodeURIComponent(date)}`;
  try {
    const report = await api(`/api/reportes?fecha=${encodeURIComponent(date)}`);
    document.querySelector('#report-entries').textContent = report.total_entradas;
    document.querySelector('#report-exits').textContent = report.total_salidas;
    document.querySelector('#report-inside').textContent = report.adentro_actual;
    document.querySelector('#report-capacity').textContent =
      `${Math.round((report.adentro_actual / 50) * 100)}%`;

    renderHourChart(report.por_hora);
    const labels = { adulto: 'Adulto', niño: 'Niño', local: 'Local' };
    document.querySelector('#report-types').innerHTML =
      Object.entries(report.por_tipo).map(([type, values]) => `
        <tr>
          <td>${typeBadge(type)} ${labels[type]}</td>
          <td>${values.entradas}</td>
          <td>${values.salidas}</td>
          <td><strong>${values.adentro}</strong></td>
        </tr>`).join('');
  } catch (error) {
    showToast(error.message, 'error');
  }
}

function renderHourChart(hourData) {
  const hours = Array.from({ length: 12 }, (_, index) => index + 8);
  const max = Math.max(1, ...hours.map((hour) => hourData[String(hour)] || 0));
  document.querySelector('#hour-chart').innerHTML = hours.map((hour) => {
    const value = hourData[String(hour)] || 0;
    const height = Math.max(3, Math.round((value / max) * 145));
    return `<div class="bar-column" title="${value} entradas a las ${hour}:00">
      <span class="bar-value">${value || ''}</span>
      <span class="bar" style="height:${height}px"></span>
      <span class="bar-label">${hour}h</span>
    </div>`;
  }).join('');
}

async function initialize() {
  const today = localDate();
  document.querySelector('#today-label').textContent = new Date().toLocaleDateString('es-MX', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });
  document.querySelector('#history-date').value = today;
  document.querySelector('#report-date').value = today;

  try {
    state.catalog = await api('/api/catalogo');
  } catch {
    setConnection(false);
  }
  renderCatalog();

  document.querySelectorAll('.nav-item').forEach((button) => {
    button.addEventListener('click', () => setPage(button.dataset.page));
  });
  document.querySelectorAll('[data-go]').forEach((button) => {
    button.addEventListener('click', () => setPage(button.dataset.go));
  });
  document.querySelector('#entry-form').addEventListener('submit', submitEntry);
  document.querySelector('#exit-form').addEventListener('submit', (event) => submitExit(event));
  document.querySelector('#entry-type').addEventListener('change', (event) => {
    const match = Object.entries(state.catalog.tarifas)
      .find(([, tariff]) => tariff.tipo === event.target.value);
    if (match) selectTariff(match[0]);
  });
  document.querySelector('#inside-list').addEventListener('click', (event) => {
    const button = event.target.closest('[data-quick-exit]');
    if (button) submitExit(null, button.dataset.quickExit);
  });
  document.querySelector('#refresh-inside').addEventListener('click', loadInside);
  document.querySelectorAll('.tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      state.historyEvent = tab.dataset.event;
      document.querySelectorAll('.tab').forEach((item) => item.classList.toggle('active', item === tab));
      loadHistory();
    });
  });
  document.querySelector('#history-type').addEventListener('change', loadHistory);
  document.querySelector('#history-date').addEventListener('change', loadHistory);
  document.querySelector('#history-folio').addEventListener('input', () => {
    clearTimeout(initialize.searchTimer);
    initialize.searchTimer = setTimeout(loadHistory, 180);
  });
  document.querySelector('#report-date').addEventListener('change', loadReports);

  await loadDashboard();
  state.refreshTimer = setInterval(() => {
    if (state.page === 'dashboard') loadDashboard();
    if (state.page === 'salida') loadInside();
  }, 15000);
}

initialize();
