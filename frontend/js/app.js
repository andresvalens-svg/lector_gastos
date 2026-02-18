const API = (window.APP_API_URL || 'https://lector-gastos.onrender.com') + '/api/documentos';

const form = document.getElementById('form');
const btnSubmit = document.getElementById('btnSubmit');
const mensaje = document.getElementById('mensaje');
const lista = document.getElementById('lista');
const empty = document.getElementById('empty');
const listStatus = document.getElementById('listStatus');

function showMsg(text, isError = false) {
  mensaje.textContent = text;
  mensaje.className = `mt-3 text-sm ${isError ? 'text-red-600' : 'text-stone-600'}`;
  mensaje.hidden = false;
}

function hideMsg() {
  mensaje.hidden = true;
}

async function listar() {
  if (listStatus) listStatus.textContent = 'Cargando…';
  try {
    const res = await fetch(API);
    const ct = res.headers.get('content-type') || '';
    const data = ct.includes('application/json') ? await res.json() : { ok: false, error: 'Respuesta no válida' };
    if (!data.ok) throw new Error(data.error || 'Error al listar');
    const items = data.items || [];
    renderLista(items);
    if (listStatus) listStatus.textContent = items.length ? `${items.length} gasto(s)` : '';
  } catch (err) {
    if (listStatus) listStatus.textContent = '';
    empty.textContent = 'No se pudo conectar al backend.';
    empty.classList.remove('hidden');
    lista.replaceChildren(empty);
  }
}

function formatFecha(d) {
  if (!d) return '—';
  const date = new Date(d);
  return date.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatMonto(n) {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(n);
}

function renderLista(items) {
  if (items.length === 0) {
    empty.textContent = 'Aún no hay gastos. Sube un documento arriba.';
    empty.classList.remove('hidden');
    lista.replaceChildren(empty);
    return;
  }
  empty.classList.add('hidden');
  lista.replaceChildren(
    ...items.map((g) => {
      const card = document.createElement('div');
      card.className = 'flex justify-between items-start gap-3 p-3 rounded-lg bg-stone-50 border border-stone-200';
      const archivo = g.archivo ? ` · ${escapeHtml(g.archivo)}` : '';
      card.innerHTML = `
        <div class="min-w-0 flex-1">
          <p class="font-medium text-stone-900 truncate">${escapeHtml(g.concepto || 'Sin concepto')}</p>
          <p class="text-xs text-stone-500 mt-0.5">${formatFecha(g.fecha)} · ${escapeHtml(g.categoria || 'Otros')}${archivo}</p>
        </div>
        <span class="text-amber-700 font-semibold shrink-0">${formatMonto(g.monto ?? 0)}</span>
      `;
      return card;
    })
  );
}

function escapeHtml(s) {
  const div = document.createElement('div');
  div.textContent = s ?? '';
  return div.innerHTML;
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const input = form.documento;
  const file = input?.files?.[0];
  if (!file) {
    showMsg('Elige un archivo.', true);
    return;
  }
  hideMsg();
  btnSubmit.disabled = true;
  btnSubmit.textContent = 'Procesando…';
  try {
    const fd = new FormData();
    fd.append('documento', file);
    const res = await fetch(API, { method: 'POST', body: fd });
    const ct = res.headers.get('content-type') || '';
    const data = ct.includes('application/json') ? await res.json() : { ok: false, error: 'Error del servidor' };
    if (!data.ok) throw new Error(data.error || 'Error al procesar');
    showMsg(`Guardado en la base de datos: ${data.concepto || 'Sin concepto'} — ${formatMonto(data.monto ?? 0)}`);
    input.value = '';
    await listar();
  } catch (err) {
    showMsg(err.message || 'Error al subir', true);
  } finally {
    btnSubmit.disabled = false;
    btnSubmit.textContent = 'Procesar';
  }
});

listar();
