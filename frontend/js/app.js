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
  mensaje.className = `mt-4 text-sm text-center ${isError ? 'text-red-600' : 'text-stone-600'}`;
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

function renderLista(items) {
  if (!items || items.length === 0) {
    empty.textContent = 'Aún no hay gastos registrados.';
    empty.classList.remove('hidden');
    lista.replaceChildren(empty);
    return;
  }
  empty.classList.add('hidden');
  lista.replaceChildren(
    ...items.map((g) => {
      const card = document.createElement('div');
      card.className = 'flex justify-between items-start gap-3 py-2 px-3 rounded-lg bg-stone-50 border border-stone-100';
      const archivo = g.archivo ? ` · ${escapeHtml(g.archivo)}` : '';
      card.innerHTML = `
        <div class="min-w-0 flex-1">
          <p class="font-medium text-stone-900 truncate">${escapeHtml(g.concepto || 'Sin concepto')}</p>
          <p class="text-xs text-stone-500 mt-0.5">${formatFecha(g.fecha)} · ${escapeHtml(g.categoria || 'Otros')}${archivo}</p>
        </div>
        <span class="text-emerald-700 font-semibold shrink-0">${formatMonto(g.monto ?? 0)}</span>
      `;
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

async function procesarArchivo(file) {
  if (!file) return;
  const nombreArchivo = file.name;
  hideMsg();
  showMsg(`Procesando «${escapeHtml(nombreArchivo)}»…`, false);
  dropZone.classList.add('opacity-75', 'pointer-events-none');
  try {
    const fd = new FormData();
    fd.append('documento', file);
    const res = await fetch(API, fetchOpts({ method: 'POST', body: fd }));
    const ct = res.headers.get('content-type') || '';
    const data = ct.includes('application/json') ? await res.json() : { ok: false, error: 'Error del servidor' };
    if (!data.ok) throw new Error(data.error || 'Error al procesar');
    archivoInfo.textContent = `Archivo procesado: ${escapeHtml(nombreArchivo)}`;
    await listar();
    goToStep2();
  } catch (err) {
    showMsg(`«${escapeHtml(nombreArchivo)}»: ${escapeHtml(err.message || 'Error al subir')}`, true);
  } finally {
    dropZone.classList.remove('opacity-75', 'pointer-events-none');
  }
}

function handleFiles(files) {
  const file = files?.[0];
  if (!file) return;
  procesarArchivo(file);
}

dropZone.addEventListener('click', () => fileInput.click());

dropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  e.stopPropagation();
  dropZone.classList.add('border-amber-500', 'bg-amber-50');
});

dropZone.addEventListener('dragleave', (e) => {
  e.preventDefault();
  dropZone.classList.remove('border-amber-500', 'bg-amber-50');
});

dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  e.stopPropagation();
  dropZone.classList.remove('border-amber-500', 'bg-amber-50');
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
