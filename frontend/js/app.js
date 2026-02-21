const API = 'https://lector-gastos.onrender.com/api/documentos';

function fetchOpts(extra = {}) {
  return { ...extra };
}

const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');
const mensaje = document.getElementById('mensaje');
const btnExport = document.getElementById('btnExport');
const exportStatus = document.getElementById('exportStatus');

function showMsg(text, isError = false) {
  mensaje.textContent = text;
  mensaje.className = `mt-3 text-sm ${isError ? 'text-red-600' : 'text-stone-600'}`;
  mensaje.hidden = false;
}

function hideMsg() {
  mensaje.hidden = true;
}

function setExportStatus(text) {
  exportStatus.textContent = text || '';
}

async function procesarArchivo(file) {
  if (!file) return;
  hideMsg();
  dropZone.classList.add('opacity-75', 'pointer-events-none');
  try {
    const fd = new FormData();
    fd.append('documento', file);
    const res = await fetch(API, fetchOpts({ method: 'POST', body: fd }));
    const ct = res.headers.get('content-type') || '';
    const data = ct.includes('application/json') ? await res.json() : { ok: false, error: 'Error del servidor' };
    if (!data.ok) throw new Error(data.error || 'Error al procesar');
    const items = Array.isArray(data.items) ? data.items : [data];
    const n = items.length;
    showMsg(n === 1
      ? `Guardado: ${data.concepto || 'Sin concepto'} — ${formatMonto(data.monto ?? 0)}`
      : `Guardados ${n} gasto(s)`);
  } catch (err) {
    showMsg(err.message || 'Error al subir', true);
  } finally {
    dropZone.classList.remove('opacity-75', 'pointer-events-none');
  }
}

function formatMonto(n) {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(n ?? 0);
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
    btnExport.disabled = false;
  } finally {
    setTimeout(() => { setExportStatus(''); btnExport.disabled = false; }, 2000);
  }
});
