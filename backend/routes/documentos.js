import { Router } from 'express';
import multer from 'multer';
import { Gasto } from '../models/Gasto.js';
import { extraerTexto, parsearDatos, isSupportedFile } from '../utils/extractors.js';
import { identificarCategoria } from '../utils/categorizer.js';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (_req, file, cb) => {
    if (!isSupportedFile(file.originalname)) {
      return cb(new Error('Solo se permiten PDF, JPEG o JPG'), false);
    }
    cb(null, true);
  },
});

// POST /api/documentos — subir y procesar (n8n: body form-data con campo "documento")
router.post('/', (req, res, next) => {
  upload.single('documento')(req, res, (err) => {
    if (err) return res.status(400).json({ ok: false, error: err.message });
    next();
  });
}, async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ ok: false, error: 'Falta el archivo (campo: documento)' });
    }
    const buffer = req.file.buffer;
    const texto = await extraerTexto(buffer, req.file.mimetype);
    const { fecha, monto, concepto } = parsearDatos(texto);
    const categoria = identificarCategoria(concepto, texto);
    const gasto = new Gasto({
      fecha,
      monto,
      concepto,
      categoria,
      archivo: req.file.originalname,
      textoExtraido: texto.slice(0, 2000),
    });
    await gasto.save();
    res.status(201).json({
      ok: true,
      id: gasto._id,
      fecha: gasto.fecha,
      monto: gasto.monto,
      concepto: gasto.concepto,
      categoria: gasto.categoria,
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /api/documentos — listar todos (n8n: GET sin body)
router.get('/', async (_req, res) => {
  try {
    const gastos = await Gasto.find().sort({ creadoEn: -1 }).lean();
    res.json({ ok: true, items: gastos });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /api/documentos/:id — uno por id (n8n: GET con id en URL)
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
