import { Router } from 'express';
import multer from 'multer';
import XLSX from 'xlsx';
import { Gasto } from '../models/Gasto.js';
import { extraerDatos, extraerTexto, resolveMime, isSupportedFile } from '../utils/extractors.js';
import { identificarCategoria } from '../utils/categorizer.js';
import { interpretarGastosConIA, extraerConceptosDeDocumento, CATEGORIAS } from '../utils/aiService.js';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => (isSupportedFile(file.originalname) ? cb(null, true) : cb(new Error('Solo CSV, Excel, HTML, PDF, JPG, PNG'), false)),
});

function requireSession(req, res) {
  const sessionId = req.headers['x-session-id'] || '';
  if (!sessionId) res.status(400).json({ ok: false, error: 'Falta X-Session-Id' });
  return sessionId || null;
}

router.post('/', (req, res, next) => {
  upload.single('documento')(req, res, (err) => {
    if (err) return res.status(err.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({ ok: false, error: err.message });
    next();
  });
}, async (req, res) => {
  try {
    const sessionId = requireSession(req, res);
    if (!sessionId) return;
    if (!req.file) return res.status(400).json({ ok: false, error: 'Falta archivo (documento)' });
    const buffer = req.file.buffer;
    const mimetype = req.file.mimetype;
    const filename = req.file.originalname;
    const mime = resolveMime(mimetype, filename);
    const isDocText = /^(application\/pdf|image\/|text\/html)/.test(mime);
    let datos;
    if (isDocText) {
      const texto = await extraerTexto(buffer, mime);
      const extraidos = texto?.trim() ? await extraerConceptosDeDocumento(texto) : null;
      if (extraidos?.length) {
        datos = extraidos.map((e) => ({ ...e, textoOriginal: (e.concepto || '') + ' ' + (e.monto ?? '') }));
      } else {
        datos = await extraerDatos(buffer, mimetype, filename);
      }
    } else {
      datos = await extraerDatos(buffer, mimetype, filename);
    }
    if (!datos.length) datos = [{ fecha: new Date(), monto: 0, concepto: 'Sin concepto', textoOriginal: '' }];
    const yaExtraidoConIA = datos.every((d) => d.categoria && d.categoria.trim());
    const textos = datos.map((d) => d.textoOriginal || `${d.concepto || ''} ${d.monto ?? ''}`.trim() || 'Sin concepto');
    const aiResult = yaExtraidoConIA ? null : await interpretarGastosConIA(textos);
    const saved = [];
    for (let i = 0; i < datos.length; i++) {
      const d = datos[i];
      const ai = aiResult?.[i];
      const monto = (ai?.monto >= 0 ? Math.round(ai.monto * 100) / 100 : null) ?? d.monto ?? 0;
      const categoria = (d.categoria && d.categoria.trim()) || ai?.categoria || identificarCategoria(d.concepto, '');
      const tipo = (d.tipo === 'ingreso' || ai?.tipo === 'ingreso') ? 'ingreso' : 'gasto';
      const gasto = new Gasto({
        sessionId,
        fecha: d.fecha || new Date(),
        monto,
        tipo,
        concepto: d.concepto,
        categoria: categoria.trim() || 'Otros',
        archivo: filename,
        textoExtraido: '',
      });
      await gasto.save();
      saved.push({ id: gasto._id, fecha: gasto.fecha, monto: gasto.monto, tipo: gasto.tipo, concepto: gasto.concepto, categoria: gasto.categoria });
    }
    if (saved.length === 1) {
      return res.status(201).json({ ok: true, id: saved[0].id, fecha: saved[0].fecha, monto: saved[0].monto, tipo: saved[0].tipo, concepto: saved[0].concepto, categoria: saved[0].categoria });
    }
    res.status(201).json({ ok: true, items: saved, count: saved.length });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get('/export/excel', async (req, res) => {
  try {
    const sessionId = requireSession(req, res);
    if (!sessionId) return;
    const idsParam = req.query.ids;
    const filter = { sessionId };
    if (idsParam && typeof idsParam === 'string') {
      const ids = idsParam.split(',').map((id) => id.trim()).filter(Boolean);
      if (ids.length) filter._id = { $in: ids };
    }
    const gastos = await Gasto.find(filter).sort({ creadoEn: -1 }).lean();
    const rows = [
      ['Fecha', 'Tipo', 'Monto (MXN)', 'Concepto', 'Categoría', 'Archivo'],
      ...gastos.map(g => [
        g.fecha ? new Date(g.fecha).toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '',
        g.tipo === 'ingreso' ? 'Ingreso' : 'Gasto',
        g.monto ?? 0,
        g.concepto ?? '',
        g.categoria ?? 'Otros',
        g.archivo ?? '',
      ]),
    ];
    const ws = XLSX.utils.aoa_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Gastos');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=gastos-${new Date().toISOString().slice(0, 10)}.xlsx`);
    res.send(buf);
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get('/', async (req, res) => {
  try {
    const sessionId = req.headers['x-session-id'] || '';
    const gastos = await Gasto.find(sessionId ? { sessionId } : {}).sort({ creadoEn: -1 }).lean();
    res.json({ ok: true, items: gastos });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/bulk-delete', async (req, res) => {
  try {
    const sessionId = requireSession(req, res);
    if (!sessionId) return;
    const { ids } = req.body || {};
    if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ ok: false, error: 'ids (array) requerido' });
    const result = await Gasto.deleteMany({ _id: { $in: ids }, sessionId });
    res.json({ ok: true, deleted: result.deletedCount });
  } catch (err) {
    if (err.name === 'CastError') return res.status(400).json({ ok: false, error: 'ID inválido' });
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get('/categorias', async (req, res) => {
  try {
    const sessionId = req.headers['x-session-id'] || '';
    const custom = sessionId ? await Gasto.distinct('categoria', { sessionId, categoria: { $nin: CATEGORIAS } }) : [];
    res.json({ ok: true, categorias: [...CATEGORIAS, ...custom.filter(Boolean)] });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.patch('/:id', async (req, res) => {
  try {
    const sessionId = req.headers['x-session-id'] || '';
    const { categoria, tipo } = req.body || {};
    const updates = {};
    if (typeof categoria === 'string' && categoria.trim()) updates.categoria = categoria.trim();
    if (tipo === 'ingreso' || tipo === 'gasto') updates.tipo = tipo;
    if (Object.keys(updates).length === 0) return res.status(400).json({ ok: false, error: 'Enviar categoria y/o tipo' });
    const gasto = await Gasto.findOneAndUpdate(
      { _id: req.params.id, ...(sessionId ? { sessionId } : {}) },
      { $set: updates },
      { new: true }
    ).lean();
    if (!gasto) return res.status(404).json({ ok: false, error: 'No encontrado' });
    res.json({ ok: true, item: gasto });
  } catch (err) {
    if (err.name === 'CastError') return res.status(400).json({ ok: false, error: 'ID inválido' });
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const sessionId = req.headers['x-session-id'] || '';
    const gasto = await Gasto.findOne({ _id: req.params.id, ...(sessionId ? { sessionId } : {}) }).lean();
    if (!gasto) return res.status(404).json({ ok: false, error: 'No encontrado' });
    res.json({ ok: true, item: gasto });
  } catch (err) {
    if (err.name === 'CastError') return res.status(400).json({ ok: false, error: 'ID inválido' });
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const sessionId = req.headers['x-session-id'] || '';
    const gasto = await Gasto.findOneAndDelete({ _id: req.params.id, ...(sessionId ? { sessionId } : {}) });
    if (!gasto) return res.status(404).json({ ok: false, error: 'No encontrado' });
    res.json({ ok: true });
  } catch (err) {
    if (err.name === 'CastError') return res.status(400).json({ ok: false, error: 'ID inválido' });
    res.status(500).json({ ok: false, error: err.message });
  }
});

export default router;
