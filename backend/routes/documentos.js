import { Router } from 'express';
import multer from 'multer';
import XLSX from 'xlsx';
import { Gasto } from '../models/Gasto.js';
import { extraerDatos, isSupportedFile } from '../utils/extractors.js';
import { identificarCategoria } from '../utils/categorizer.js';
import { interpretarGastosConIA } from '../utils/aiService.js';

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
    const datos = await extraerDatos(buffer, mimetype, filename);
    const textos = datos.map((d) => d.textoOriginal || `${d.concepto || ''} ${d.monto ?? ''}`.trim() || 'Sin concepto');
    const aiResult = await interpretarGastosConIA(textos);
    const saved = [];
    for (let i = 0; i < datos.length; i++) {
      const d = datos[i];
      const ai = aiResult?.[i];
      const monto = (ai?.monto >= 0 ? Math.round(ai.monto * 100) / 100 : null) ?? d.monto ?? 0;
      const categoria = ai?.categoria || identificarCategoria(d.concepto, '');
      const gasto = new Gasto({
        sessionId,
        fecha: d.fecha,
        monto,
        concepto: d.concepto,
        categoria,
        archivo: filename,
        textoExtraido: '',
      });
      await gasto.save();
      saved.push({ id: gasto._id, fecha: gasto.fecha, monto: gasto.monto, concepto: gasto.concepto, categoria: gasto.categoria });
    }
    if (saved.length === 1) {
      return res.status(201).json({ ok: true, id: saved[0].id, fecha: saved[0].fecha, monto: saved[0].monto, concepto: saved[0].concepto, categoria: saved[0].categoria });
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
    const gastos = await Gasto.find({ sessionId }).sort({ creadoEn: -1 }).lean();
    const rows = [
      ['Fecha', 'Monto (MXN)', 'Concepto', 'Categoría', 'Archivo'],
      ...gastos.map(g => [
        g.fecha ? new Date(g.fecha).toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '',
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
