const STORAGE_KEY = 'reserva_de_mesas';
const OLD_KEY = 'Reserva _de _Mesas';
const TOTAL_MESAS = 12;
const DURACION_MS = 120 * 60000; // cada reserva ocupa la mesa 2 horas
const $ = id => document.getElementById(id);

/* ---------- Almacenamiento ---------- */
function cargarReservas(){
    try {
        const s = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(OLD_KEY);
        const data = s ? JSON.parse(s) : [];
        return Array.isArray(data) ? data.map(r => ({ guests: 2, ...r })) : [];
    } catch(e){ return []; }
}
function guardarReservas(){
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(reservas)); }
    catch(e){ aviso('No se pudo guardar en este navegador.', true); }
}
let reservas = cargarReservas();

/* ---------- Utilidades ---------- */
const idCorto = () => Date.now().toString(36).slice(-4) + Math.random().toString(36).slice(2, 4);
const ts = r => new Date(r.datetime).getTime();
const formatearFechaHora = iso => new Date(iso).toLocaleString('es-CO', { dateStyle:'medium', timeStyle:'short' });
const esc = t => String(t ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function aviso(msg, error = false){
    const t = document.createElement('div');
    t.className = 'toast' + (error ? ' error' : '');
    t.textContent = msg;
    $('toasts').appendChild(t);
    setTimeout(() => t.remove(), 3800);
}
function confirmar(texto){
    return new Promise(res => {
        const d = $('confirmDialog');
        $('confirmText').textContent = texto;
        const fin = v => { d.close(); res(v); };
        $('confirmYes').onclick = () => fin(true);
        $('confirmNo').onclick = () => fin(false);
        d.oncancel = () => res(false);
        d.showModal();
    });
}
function fechaMinima(){
    return new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}
function hayConflicto(mesa, iso){
    const t = new Date(iso).getTime();
    return reservas.some(r => r.table === mesa && r.status !== 'cancelada' && Math.abs(ts(r) - t) < DURACION_MS);
}
function proximaReserva(mesa){
    const ahora = Date.now();
    return reservas
        .filter(r => r.table === mesa && r.status !== 'cancelada' && ts(r) + DURACION_MS > ahora)
        .sort((a, b) => ts(a) - ts(b))[0];
}
function actualizar(){
    guardarReservas();
    renderMesas();
    mostrarReporte();
    renderStats();
}

/* ---------- Validación y creación (compartida por formulario y reserva rápida) ---------- */
function crearReserva({ name, contact, guests, datetime, table }){
    name = name.trim(); contact = contact.trim();
    const dig = contact.replace(/\D/g, '');
    const contactoOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact) || (/^[\d\s+()-]+$/.test(contact) && dig.length >= 7 && dig.length <= 15);

    if(name.length < 2) return aviso('Ingrese un nombre válido.', true), false;
    if(!contactoOk) return aviso('El contacto debe ser un teléfono o un correo válido.', true), false;
    if(!datetime || new Date(datetime).getTime() <= Date.now()) return aviso('Elija una fecha y hora futuras.', true), false;
    if(!(table >= 1 && table <= TOTAL_MESAS)) return aviso(`La mesa debe estar entre 1 y ${TOTAL_MESAS}.`, true), false;
    if(!(guests >= 1 && guests <= 10)) return aviso('Los comensales deben ser entre 1 y 10.', true), false;
    if(hayConflicto(table, datetime)) return aviso(`La mesa ${table} ya está reservada en ese horario (cada reserva dura 2 horas).`, true), false;

    reservas.push({ id: idCorto(), name, contact, guests, datetime, table, status:'reservada', createdAt:new Date().toISOString() });
    actualizar();
    aviso(`Reserva confirmada: ${name} · Mesa ${table}`);
    return true;
}

/* ---------- Estadísticas ---------- */
function renderStats(){
    const ahora = Date.now();
    const activas = reservas.filter(r => r.status !== 'cancelada' && ts(r) + DURACION_MS > ahora);
    const hoy = activas.filter(r => new Date(r.datetime).toDateString() === new Date().toDateString());
    const ocupadas = new Set(activas.filter(r => ts(r) <= ahora).map(r => r.table)).size;
    const datos = [
        [activas.length, 'Reservas activas'],
        [hoy.length, 'Para hoy'],
        [TOTAL_MESAS - ocupadas, 'Mesas libres ahora'],
        [reservas.filter(r => r.status === 'cancelada').length, 'Canceladas']
    ];
    $('stats').innerHTML = datos.map(([n, l]) => `<div class="stat"><b>${n}</b><span>${l}</span></div>`).join('');
}

/* ---------- Mesas ---------- */
const ICONO_MESA = `<svg class="ico" viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="13"/><circle cx="32" cy="8" r="4"/><circle cx="32" cy="56" r="4"/><circle cx="8" cy="32" r="4"/><circle cx="56" cy="32" r="4"/></svg>`;

function renderMesas(){
    const cont = $('tables');
    cont.innerHTML = '';
    const ahora = Date.now();

    for(let i = 1; i <= TOTAL_MESAS; i++){
        const prox = proximaReserva(i);
        const enCurso = prox && ts(prox) <= ahora;
        const card = document.createElement('div');
        card.className = 'tableCard' + (prox ? ' busy' : '');
        card.innerHTML = `
            <img src="mesa.avif" alt="Mesa ${i}">
            <div class="tableName">Mesa ${i}</div>
            <div class="tableDesc">${prox ? (enCurso ? 'Ocupada ahora' : 'Reservada: ' + formatearFechaHora(prox.datetime)) : 'Disponible'}</div>
            <div class="actions">
                <button class="btn small" data-reservar="${i}">Reservar</button>
                ${prox ? `<button class="btn small outline" data-liberar="${prox.id}">Liberar</button>` : ''}
            </div>`;
        // Si no existe mesa.avif, se muestra un icono dibujado
        card.querySelector('img').addEventListener('error', e => e.target.outerHTML = ICONO_MESA);
        cont.appendChild(card);
    }
}

function abrirReservaRapida(mesa){
    $('qTable').value = mesa;
    $('quickTitle').textContent = `Reservar Mesa ${mesa}`;
    $('qDatetime').min = fechaMinima();
    $('quickForm').reset();
    $('qTable').value = mesa;
    $('quickDialog').showModal();
    $('qName').focus();
}

async function cancelarReserva(id){
    const r = reservas.find(x => x.id === id);
    if(!r) return;
    if(!await confirmar(`¿Cancelar la reserva de ${r.name} en la Mesa ${r.table} (${formatearFechaHora(r.datetime)})?`)) return;
    r.status = 'cancelada';
    actualizar();
    aviso('Reserva cancelada');
}

/* ---------- Reporte ---------- */
function listaFiltrada(){
    const from = $('fromDate').value, to = $('toDate').value;
    const estado = $('statusFilter').value;
    const q = $('search').value.trim().toLowerCase();
    return reservas
        .filter(r => !from || ts(r) >= new Date(from + 'T00:00:00').getTime())
        .filter(r => !to || ts(r) <= new Date(to + 'T23:59:59').getTime())
        .filter(r => !estado || r.status === estado)
        .filter(r => !q || (r.name + ' ' + (r.contact || '')).toLowerCase().includes(q))
        .sort((a, b) => ts(a) - ts(b));
}

function mostrarReporte(){
    const area = $('reportArea');
    const lista = listaFiltrada();
    if(!lista.length){
        area.innerHTML = '<p class="empty">No hay reservas con estos filtros. Cree una desde el formulario.</p>';
        return;
    }
    area.innerHTML = lista.map(r => `
        <div class="report-card ${r.status}">
            <h4>Mesa ${r.table} · ${r.id}</h4>
            <p><strong>Cliente:</strong> ${esc(r.name)}</p>
            <p><strong>Contacto:</strong> ${esc(r.contact) || '-'}</p>
            <p><strong>Comensales:</strong> ${r.guests}</p>
            <p><strong>Fecha / Hora:</strong> ${formatearFechaHora(r.datetime)}</p>
            <p><strong>Estado:</strong> ${r.status === 'cancelada' ? 'Cancelada' : 'Activa'}</p>
            ${r.status === 'cancelada' ? '' : `<div class="actions"><button class="btn small outline" data-cancelar="${r.id}">Cancelar</button></div>`}
        </div>`).join('');
}

/* ---------- CSV ---------- */
function generarCSVFiltrado(){
    const lista = listaFiltrada();
    if(!lista.length) return '';
    const celda = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const filas = [['id','mesa','cliente','contacto','comensales','fecha_hora','estado']];
    lista.forEach(r => filas.push([r.id, r.table, r.name, r.contact, r.guests, formatearFechaHora(r.datetime), r.status]));
    return filas.map(f => f.map(celda).join(',')).join('\n');
}

function previsualizarCSV(){
    const csv = generarCSVFiltrado();
    $('csvList').innerHTML = listaFiltrada().map(r =>
        `<div class="item"><strong>Mesa ${r.table}</strong> - ${esc(r.name)}<div style="font-size:12px;color:var(--muted)">${formatearFechaHora(r.datetime)}</div></div>`).join('');
    $('csvText').textContent = csv || 'No hay datos para mostrar';
    $('csvPreview').classList.remove('hidden');
    $('btnDownloadFromPreview').onclick = () => csv ? descargarCSV(csv, 'reservas_preview.csv') : aviso('No hay datos para descargar', true);
}

function descargarCSV(texto, filename){
    const blob = new Blob(['\uFEFF' + texto], { type:'text/csv;charset=utf-8;' }); // BOM: tildes correctas en Excel
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
    aviso('Archivo CSV descargado');
}

/* ---------- Inicio y eventos ---------- */
document.addEventListener('DOMContentLoaded', () => {
    $('datetime').min = fechaMinima();
    renderMesas(); mostrarReporte(); renderStats();

    $('formReservation').addEventListener('submit', ev => {
        ev.preventDefault();
        const ok = crearReserva({
            name: $('name').value, contact: $('contact').value, datetime: $('datetime').value,
            table: parseInt($('table').value, 10), guests: parseInt($('guests').value, 10)
        });
        if(ok){ $('formReservation').reset(); $('datetime').min = fechaMinima(); }
    });
    $('clearBtn').addEventListener('click', () => $('formReservation').reset());

    // Reserva rápida desde la tarjeta de la mesa
    $('tables').addEventListener('click', ev => {
        const r = ev.target.closest('[data-reservar]'), l = ev.target.closest('[data-liberar]');
        if(r) abrirReservaRapida(parseInt(r.dataset.reservar, 10));
        if(l) cancelarReserva(l.dataset.liberar);
    });
    $('quickForm').addEventListener('submit', ev => {
        ev.preventDefault();
        const ok = crearReserva({
            name: $('qName').value, contact: $('qContact').value, datetime: $('qDatetime').value,
            table: parseInt($('qTable').value, 10), guests: parseInt($('qGuests').value, 10)
        });
        if(ok) $('quickDialog').close();
    });
    $('qCancel').addEventListener('click', () => $('quickDialog').close());

    $('reportArea').addEventListener('click', ev => {
        const b = ev.target.closest('[data-cancelar]');
        if(b) cancelarReserva(b.dataset.cancelar);
    });

    $('btnShowReport').addEventListener('click', mostrarReporte);
    ['fromDate','toDate','statusFilter'].forEach(id => $(id).addEventListener('change', mostrarReporte));
    $('search').addEventListener('input', mostrarReporte);
    $('btnResetFilters').addEventListener('click', () => {
        ['fromDate','toDate','statusFilter','search'].forEach(id => $(id).value = '');
        mostrarReporte();
    });

    $('btnPreviewCsv').addEventListener('click', previsualizarCSV);
    $('btnExportCsv').addEventListener('click', () => {
        const csv = generarCSVFiltrado();
        csv ? descargarCSV(csv, 'reserva_export.csv') : aviso('No hay datos para exportar', true);
    });
    $('btnClosePreview').addEventListener('click', () => $('csvPreview').classList.add('hidden'));

    setInterval(() => { renderMesas(); renderStats(); }, 60000);
});