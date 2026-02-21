const API = 'https://lector-gastos.onrender.com/api/documentos';

function fetchOpts(extra = {}) {
  return { ...extra };
}

const step1 = document.getElementById('step1');
const step2 = document.getElementById('step2');
const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');
const mensaje = document.getElementById('mensaje');
const archivoInfo = document.getElementById('archivoInfo');
const lista = document.getElementById('lista');
const empty = document.getElementById('empty');
const btnOtro = document.getElementById('btnOtro');
const btnExport = document.getElementById('btnExport');
const exportStatus = document.getElementById('exportStatus');

function showMsg(text, isError = false) {
  mensaje.textContent = text;
  mensaje.className = `mt-5 text-sm text-center ${isError ? 'text-red-600' : 'text-[var(--nodo-text-muted)]'}`;
  mensaje.hidden = false;
}

function hideMsg() {
  mensaje.hidden = true;
}

function setExportStatus(text) {
  exportStatus.textContent = text || '';
}

function goToStep2() {
  step1.classList.remove('visible');
  step1.classList.add('hidden', 'next');
  step2.classList.remove('hidden', 'next');
  step2.classList.add('visible');
}

function goToStep1() {
  step2.classList.remove('visible');
  step2.classList.add('hidden', 'next');
  step1.classList.remove('hidden', 'next');
  step1.classList.add('visible');
  hideMsg();
  fileInput.value = '';
}

function formatFecha(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatMonto(n) {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(n ?? 0);
}

function escapeHtml(s) {
  const div = document.createElement('div');
  div.textContent = s ?? '';
  return div.innerHTML;
}

async function eliminarGasto(id) {
  try {
    const res = await fetch(`${API}/${id}`, fetchOpts({ method: 'DELETE' }));
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) throw new Error(data.error || 'Error al eliminar');
    await listar();
  } catch (err) {
    setExportStatus(err.message || 'No se pudo eliminar.');
    setTimeout(() => setExportStatus(''), 3000);
  }
}

function renderLista(items) {
  if (!items || items.length === 0) {
    empty.textContent = 'Aún no hay gastos registrados. Sube archivos para comenzar.';
    empty.classList.remove('hidden');
    lista.replaceChildren(empty);
    return;
  }
  empty.classList.add('hidden');
  lista.replaceChildren(
    ...items.map((g) => {
      const card = document.createElement('div');
      card.className = 'flex justify-between items-start gap-3 py-3 px-4 rounded-xl bg-[#fafaf9] border border-[var(--nodo-border)] card-hover transition-colors group';
      const archivo = g.archivo ? ` · ${escapeHtml(g.archivo)}` : '';
      const id = g._id || g.id;
      card.innerHTML = `
        <div class="min-w-0 flex-1">
          <p class="font-medium text-[var(--nodo-text)] truncate">${escapeHtml(g.concepto || 'Sin concepto')}</p>
          <p class="text-xs text-[var(--nodo-text-muted)] mt-0.5">${formatFecha(g.fecha)} · ${escapeHtml(g.categoria || 'Otros')}${archivo}</p>
        </div>
        <div class="flex items-center gap-2 shrink-0">
          <span class="text-[var(--nodo-accent)] font-semibold">${formatMonto(g.monto ?? 0)}</span>
          <button type="button" data-id="${escapeHtml(String(id))}" class="p-1.5 rounded-lg text-[var(--nodo-text-muted)] hover:bg-red-100 hover:text-red-600 transition-colors" title="Eliminar (no incluir en Excel)">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
          </button>
        </div>
      `;
      const btnDel = card.querySelector('button[data-id]');
      if (btnDel) btnDel.addEventListener('click', () => eliminarGasto(id));
      return card;
    })
  );
}

async function listar() {
  try {
    const res = await fetch(API, fetchOpts());
    const ct = res.headers.get('content-type') || '';
    const data = ct.includes('application/json') ? await res.json() : { ok: false };
    if (!data.ok) throw new Error('Error al listar');
    renderLista(data.items || []);
  } catch (_) {
    renderLista([]);
  }
}

async function procesarUnArchivo(file) {
  const fd = new FormData();
  fd.append('documento', file);
  const res = await fetch(API, fetchOpts({ method: 'POST', body: fd }));
  const ct = res.headers.get('content-type') || '';
  const data = ct.includes('application/json') ? await res.json() : { ok: false, error: 'Error del servidor' };
  if (!data.ok) throw new Error(data.error || 'Error al procesar');
  return data;
}

async function procesarArchivos(files) {
  const arr = Array.from(files || []).filter(f => f && f.name);
  if (arr.length === 0) return;
  hideMsg();
  dropZone.classList.add('opacity-75', 'pointer-events-none');
  const nombres = arr.map(f => f.name);
  const exitosos = [];
  const errores = [];
  for (let i = 0; i < arr.length; i++) {
    const file = arr[i];
    showMsg(`Procesando ${i + 1}/${arr.length}: «${escapeHtml(file.name)}»…`, false);
    try {
      await procesarUnArchivo(file);
      exitosos.push(file.name);
    } catch (err) {
      errores.push(`${file.name}: ${err.message}`);
    }
  }
  dropZone.classList.remove('opacity-75', 'pointer-events-none');
  archivoInfo.textContent = exitosos.length > 0
    ? `Archivos procesados: ${exitosos.join(', ')}${errores.length > 0 ? ` · Errores: ${errores.join('; ')}` : ''}`
    : (errores.length > 0 ? `No se procesó ningún archivo. ${errores.join('; ')}` : '');
  if (errores.length > 0) showMsg(errores.join(' · '), true);
  else hideMsg();
  await listar();
  goToStep2();
}

function handleFiles(files) {
  const arr = Array.from(files || []).filter(f => f && f.name);
  if (arr.length === 0) return;
  procesarArchivos(arr);
}

dropZone.addEventListener('click', () => fileInput.click());

dropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  e.stopPropagation();
  dropZone.classList.add('drop-zone-active');
});

dropZone.addEventListener('dragleave', (e) => {
  e.preventDefault();
  dropZone.classList.remove('drop-zone-active');
});

dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  e.stopPropagation();
  dropZone.classList.remove('drop-zone-active');
  handleFiles(e.dataTransfer?.files);
});

fileInput.addEventListener('change', (e) => {
  handleFiles(e.target.files);
  e.target.value = '';
});

btnOtro.addEventListener('click', goToStep1);

btnExport.addEventListener('click', async (e) => {
  e.preventDefault();
  btnExport.disabled = true;
  setExportStatus('Generando…');
  try {
    const res = await fetch(API.replace('/documentos', '/documentos/export/excel'), fetchOpts());
    if (!res.ok) throw new Error('Error al exportar');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `gastos-${new Date().toISOString().slice(0, 10)}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
    setExportStatus('Descargado.');
  } catch (err) {
    setExportStatus(err.message || 'No se pudo descargar.');
  } finally {
    setTimeout(() => { setExportStatus(''); btnExport.disabled = false; }, 2000);
  }
});
