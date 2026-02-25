const API = 'https://lector-gastos.onrender.com/api/documentos';

const SESSION_KEY = 'lector-gastos-session';

function getSessionId() {
  let id = sessionStorage.getItem(SESSION_KEY);
  if (!id) {
    id = crypto.randomUUID && crypto.randomUUID() || [1e7, 1e3, 4e3, 8e3, 1e11].map(() => Math.floor(Math.random() * 16).toString(16)).join('');
    sessionStorage.setItem(SESSION_KEY, id);
  }
  return id;
}

function fetchOpts(extra = {}) {
  const headers = { ...(extra.headers || {}) };
  headers['X-Session-Id'] = getSessionId();
  return { ...extra, headers };
}

const step1 = document.getElementById('step1');
const step2 = document.getElementById('step2');
const dropZone = document.getElementById('dropZone');
const dropZone2 = document.getElementById('dropZone2');
const fileInput = document.getElementById('fileInput');
const fileInput2 = document.getElementById('fileInput2');
const mensaje = document.getElementById('mensaje');
const step1Actions = document.getElementById('step1Actions');
const btnVerResultados = document.getElementById('btnVerResultados');
const btnInicio = document.getElementById('btnInicio');
const archivoInfo = document.getElementById('archivoInfo');
const lista = document.getElementById('lista');
const empty = document.getElementById('empty');
const btnExport = document.getElementById('btnExport');
const exportStatus = document.getElementById('exportStatus');
const progressContainer = document.getElementById('progressContainer');
const progressLabel = document.getElementById('progressLabel');
const progressBar = document.getElementById('progressBar');
const selectionToolbar = document.getElementById('selectionToolbar');
const checkAll = document.getElementById('checkAll');
const selectedCount = document.getElementById('selectedCount');
const btnEliminarSeleccion = document.getElementById('btnEliminarSeleccion');
const btnExportLabel = document.getElementById('btnExportLabel');

let selectedIds = new Set();

function showProgress(label, percent = null) {
  progressLabel.textContent = label || 'Cargando…';
  progressBar.classList.toggle('indeterminate', percent == null);
  progressBar.style.width = percent != null ? `${Math.min(100, Math.max(0, percent))}%` : '30%';
  progressContainer.hidden = false;
}
function hideProgress() {
  progressContainer.hidden = true;
  progressBar.classList.remove('indeterminate');
  progressBar.style.width = '0%';
}

function showMsg(text, isError = false) {
  mensaje.textContent = text;
  mensaje.className = `mt-5 text-sm text-center ${isError ? 'text-red-600' : 'text-muted'}`;
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
  step1Actions.classList.add('hidden');
  fileInput.value = '';
  fileInput2.value = '';
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

async function actualizarGasto(id, payload) {
  try {
    const res = await fetch(`${API}/${id}`, fetchOpts({
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }));
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) throw new Error(data.error || 'Error al actualizar');
    await listar();
  } catch (err) {
    setExportStatus(err.message || 'No se pudo actualizar.');
    setTimeout(() => setExportStatus(''), 3000);
  }
}

function updateSelectionUI(total) {
  if (!selectionToolbar) return;
  if (total === 0) {
    selectionToolbar.classList.add('hidden');
    return;
  }
  selectionToolbar.classList.remove('hidden');
  const n = selectedIds.size;
  if (checkAll) {
    checkAll.checked = n === total && total > 0;
    checkAll.indeterminate = n > 0 && n < total;
  }
  if (selectedCount) selectedCount.textContent = n ? `${n} seleccionado${n !== 1 ? 's' : ''}` : '';
  if (btnEliminarSeleccion) btnEliminarSeleccion.disabled = n === 0;
  if (btnExportLabel) btnExportLabel.textContent = n ? `Descargar Excel (${n})` : 'Descargar Excel';
}

function renderLista(items, categorias = []) {
  if (!items || items.length === 0) {
    empty.textContent = 'Aún no hay gastos registrados. Sube archivos para comenzar.';
    empty.classList.remove('hidden');
    lista.replaceChildren(empty);
    if (selectionToolbar) selectionToolbar.classList.add('hidden');
    return;
  }
  empty.classList.add('hidden');
  const baseCat = categorias.length ? categorias : ['Supermercado', 'Restaurantes', 'Transporte', 'Servicios', 'Salud', 'Entretenimiento', 'Educación', 'Hogar', 'Bancos', 'Otros'];
  lista.replaceChildren(
    ...items.map((g) => {
      const card = document.createElement('div');
      card.className = 'flex justify-between items-start gap-3 py-3 px-4 rounded-xl border card-hover transition-colors group';
      card.style.backgroundColor = 'var(--bg-card)';
      card.style.borderColor = 'var(--border)';
      const archivo = g.archivo ? ` · ${escapeHtml(g.archivo)}` : '';
      const id = g._id || g.id;
      const checked = selectedIds.has(String(id));
      const cat = g.categoria || 'Otros';
      const tipo = g.tipo === 'ingreso' ? 'ingreso' : 'gasto';
      const opts = [...baseCat];
      if (cat && !opts.includes(cat)) opts.push(cat);
      const selectId = `cat-${String(id).replace(/[^a-zA-Z0-9-]/g, '_')}`;
      const inputId = `newcat-${String(id).replace(/[^a-zA-Z0-9-]/g, '_')}`;
      const tipoSelectId = `tipo-${String(id).replace(/[^a-zA-Z0-9-]/g, '_')}`;
      const optionsHtml = opts.map((c) => `<option value="${escapeHtml(c)}" ${c === cat ? 'selected' : ''}>${escapeHtml(c)}</option>`).join('');
      card.innerHTML = `
        <div class="flex items-start gap-3 min-w-0 flex-1">
          <label class="flex items-center shrink-0 cursor-pointer pt-0.5" title="Seleccionar">
            <input type="checkbox" class="row-check rounded border-gray-400" data-id="${escapeHtml(String(id))}" ${checked ? 'checked' : ''} />
          </label>
          <div class="min-w-0 flex-1">
          <p class="font-medium truncate" style="color: var(--text);">${escapeHtml(g.concepto || 'Sin concepto')}</p>
          <p class="text-xs text-muted mt-0.5">${formatFecha(g.fecha)}${archivo}</p>
          <div class="mt-2 flex items-center gap-2 flex-wrap">
            <select id="${tipoSelectId}" class="text-xs rounded-lg border px-2 py-1.5 bg-white" style="border-color: var(--border); color: var(--text);">
              <option value="gasto" ${tipo === 'gasto' ? 'selected' : ''}>Gasto</option>
              <option value="ingreso" ${tipo === 'ingreso' ? 'selected' : ''}>Ingreso</option>
            </select>
            <select id="${selectId}" class="text-xs rounded-lg border px-2 py-1.5 bg-white" style="border-color: var(--border); color: var(--text); max-width: 100%;">
              ${optionsHtml}
              <option value="__nueva__">—— Crear categoría ——</option>
            </select>
            <input type="text" id="${inputId}" placeholder="Nueva categoría" class="hidden text-xs rounded-lg border px-2 py-1.5 w-32" style="border-color: var(--border);" />
          </div>
          </div>
        </div>
        <div class="flex items-center gap-2 shrink-0">
          <span class="font-semibold ${tipo === 'ingreso' ? 'text-green-600' : 'text-accent'}">${tipo === 'ingreso' ? '+' : ''}${formatMonto(g.monto ?? 0)}</span>
          <button type="button" data-id="${escapeHtml(String(id))}" class="p-1.5 rounded-lg text-muted hover:bg-red-100 hover:text-red-600 transition-colors" title="Eliminar">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
          </button>
        </div>
      `;
      const sel = card.querySelector(`#${selectId}`);
      const inp = card.querySelector(`#${inputId}`);
      const tipoSel = card.querySelector(`#${tipoSelectId}`);
      const btnDel = card.querySelector('button[data-id]');
      if (btnDel) btnDel.addEventListener('click', () => eliminarGasto(id));
      if (tipoSel) tipoSel.addEventListener('change', () => actualizarGasto(id, { tipo: tipoSel.value }));
      sel.addEventListener('change', () => {
        if (sel.value === '__nueva__') {
          inp.classList.remove('hidden');
          inp.focus();
        } else {
          actualizarGasto(id, { categoria: sel.value });
        }
      });
      inp.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          const v = inp.value.trim();
          if (v) actualizarGasto(id, { categoria: v });
          inp.classList.add('hidden');
          inp.value = '';
        }
      });
      inp.addEventListener('blur', () => {
        const v = inp.value.trim();
        if (v) actualizarGasto(id, { categoria: v });
        inp.classList.add('hidden');
        inp.value = '';
      });
      const rowCheck = card.querySelector('.row-check');
      if (rowCheck) {
        rowCheck.addEventListener('change', () => {
          const sid = String(id);
          if (rowCheck.checked) selectedIds.add(sid);
          else selectedIds.delete(sid);
          updateSelectionUI(items.length);
        });
      }
      return card;
    })
  );
  updateSelectionUI(items.length);
  if (checkAll) {
    checkAll.onclick = () => {
      const allIds = items.map((g) => String(g._id || g.id));
      if (checkAll.checked) allIds.forEach((sid) => selectedIds.add(sid));
      else allIds.forEach((sid) => selectedIds.delete(sid));
      lista.querySelectorAll('.row-check').forEach((cb) => { cb.checked = checkAll.checked; });
      updateSelectionUI(items.length);
    };
  }
}

async function listar() {
  showProgress('Cargando gastos…', null);
  try {
    const [resGastos, resCat] = await Promise.all([
      fetch(API, fetchOpts()),
      fetch(`${API}/categorias`, fetchOpts()),
    ]);
    const data = resGastos.headers.get('content-type')?.includes('application/json') ? await resGastos.json() : { ok: false };
    const dataCat = resCat.ok && resCat.headers.get('content-type')?.includes('application/json') ? await resCat.json() : null;
    if (!data.ok) throw new Error('Error al listar');
    renderLista(data.items || [], dataCat?.categorias || []);
  } catch (_) {
    renderLista([]);
  } finally {
    hideProgress();
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

async function procesarArchivos(files, options = {}) {
  const { goToResults = true } = options;
  const arr = Array.from(files || []).filter(f => f && f.name);
  if (arr.length === 0) return;
  const zone = options.zone || dropZone;
  const isStep2 = zone === dropZone2;
  if (!isStep2) hideMsg();
  zone.classList.add('opacity-75', 'pointer-events-none');
  showProgress(`Procesando 0/${arr.length} archivos…`, 0);
  const exitosos = [];
  const errores = [];
  for (let i = 0; i < arr.length; i++) {
    const file = arr[i];
    const pct = ((i + 1) / arr.length) * 100;
    const msg = `Procesando ${i + 1}/${arr.length}: «${escapeHtml(file.name)}»…`;
    showProgress(msg, pct);
    if (isStep2) setExportStatus(msg); else showMsg(msg, false);
    try {
      await procesarUnArchivo(file);
      exitosos.push(file.name);
    } catch (err) {
      errores.push(`${file.name}: ${err.message}`);
    }
  }
  zone.classList.remove('opacity-75', 'pointer-events-none');
  hideProgress();
  const info = exitosos.length > 0
    ? `Archivos procesados: ${exitosos.join(', ')}${errores.length > 0 ? ` · Errores: ${errores.join('; ')}` : ''}`
    : (errores.length > 0 ? `No se procesó ningún archivo. ${errores.join('; ')}` : '');
  archivoInfo.textContent = info;
  if (errores.length > 0) {
    if (isStep2) setExportStatus(errores.join(' · ')); else showMsg(errores.join(' · '), true);
  } else if (goToResults) {
    if (!isStep2) hideMsg();
    if (isStep2) setExportStatus('');
  } else {
    if (isStep2) setExportStatus(''); else showMsg(`${exitosos.length} archivo(s) listo(s). Puedes agregar más o ver resultados.`, false);
  }
  await listar();
  if (goToResults) goToStep2();
  else step1Actions.classList.remove('hidden');
}

function handleFiles(files, options = {}) {
  const arr = Array.from(files || []).filter(f => f && f.name);
  if (arr.length === 0) return;
  procesarArchivos(arr, options);
}

function setupDropZone(el, input, options = {}) {
  el.addEventListener('click', () => input.click());
  el.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.stopPropagation();
    el.classList.add('drop-zone-active');
  });
  el.addEventListener('dragleave', (e) => {
    e.preventDefault();
    el.classList.remove('drop-zone-active');
  });
  el.addEventListener('drop', (e) => {
    e.preventDefault();
    e.stopPropagation();
    el.classList.remove('drop-zone-active');
    handleFiles(e.dataTransfer?.files, options);
  });
  input.addEventListener('change', (e) => {
    handleFiles(e.target.files, options);
    e.target.value = '';
  });
}

setupDropZone(dropZone, fileInput, { goToResults: false });
setupDropZone(dropZone2, fileInput2, { goToResults: false, zone: dropZone2 });

btnVerResultados.addEventListener('click', goToStep2);
btnInicio.addEventListener('click', () => { selectedIds.clear(); goToStep1(); });

if (btnEliminarSeleccion) {
  btnEliminarSeleccion.addEventListener('click', async () => {
    if (selectedIds.size === 0) return;
    try {
      const res = await fetch(`${API}/bulk-delete`, fetchOpts({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [...selectedIds] }),
      }));
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) throw new Error(data.error || 'Error al eliminar');
      selectedIds.clear();
      setExportStatus(`${data.deleted ?? selectedIds.size} eliminado(s).`);
      await listar();
    } catch (err) {
      setExportStatus(err.message || 'No se pudo eliminar.');
    }
    setTimeout(() => setExportStatus(''), 3000);
  });
}

btnExport.addEventListener('click', async (e) => {
  e.preventDefault();
  btnExport.disabled = true;
  setExportStatus('Generando…');
  showProgress('Generando Excel…', null);
  try {
    let url = API.replace('/documentos', '/documentos/export/excel');
    if (selectedIds.size > 0) url += '?ids=' + encodeURIComponent([...selectedIds].join(','));
    const res = await fetch(url, fetchOpts());
    if (!res.ok) throw new Error('Error al exportar');
    const blob = await res.blob();
    const link = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = link;
    a.download = `gastos-${new Date().toISOString().slice(0, 10)}.xlsx`;
    a.click();
    URL.revokeObjectURL(link);
    setExportStatus('Descargado.');
  } catch (err) {
    setExportStatus(err.message || 'No se pudo descargar.');
  } finally {
    hideProgress();
    setTimeout(() => { setExportStatus(''); btnExport.disabled = false; }, 2000);
  }
});
