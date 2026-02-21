import { Router } from 'express';
import multer from 'multer';
import XLSX from 'xlsx';
import { Gasto } from '../models/Gasto.js';
import { extraerDatos, isSupportedFile } from '../utils/extractors.js';
import { identificarCategoria } from '../utils/categorizer.js';

const router = Router();
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (_req, file, cb) => {
    if (!isSupportedFile(file.originalname)) {
      return cb(new Error('Solo se permiten CSV, Excel, HTML, PDF, JPG, JPEG, PNG'), false);
    }
    cb(null, true);
  },
});

// POST /api/documentos — subir y procesar
router.post('/', (req, res, next) => {
  upload.single('documento')(req, res, (err) => {
    if (err) {
      const status = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
      return res.status(status).json({ ok: false, error: err.message || 'Archivo no válido' });
    }
    next();
  });
}, async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ ok: false, error: 'Falta el archivo (campo: documento)' });
    }
    const buffer = req.file.buffer;
    const mimetype = req.file.mimetype;
    const filename = req.file.originalname;
    const datos = await extraerDatos(buffer, mimetype, filename);
    const saved = [];
    for (const { fecha, monto, concepto } of datos) {
      const categoria = identificarCategoria(concepto, '');
      const gasto = new Gasto({
        fecha,
        monto,
        concepto,
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

// GET /api/documentos/export/excel — exportar gastos a Excel
router.get('/export/excel', async (_req, res) => {
  try {
    const gastos = await Gasto.find().sort({ creadoEn: -1 }).lean();
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

// GET /api/documentos — listar todos
router.get('/', async (_req, res) => {
  try {
    const gastos = await Gasto.find().sort({ creadoEn: -1 }).lean();
    res.json({ ok: true, items: gastos });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /api/documentos/:id — uno por id
router.get('/:id', async (req, res) => {
  try {
    const gasto = await Gasto.findById(req.params.id).lean();
    if (!gasto) return res.status(404).json({ ok: false, error: 'No encontrado' });
    res.json({ ok: true, item: gasto });
  } catch (err) {
    if (err.name === 'CastError') return res.status(400).json({ ok: false, error: 'ID inválido' });
    res.status(500).json({ ok: false, error: err.message });
  }
});

export default router;
