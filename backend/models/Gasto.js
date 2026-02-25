import mongoose from 'mongoose';

const gastoSchema = new mongoose.Schema({
  sessionId: { type: String, required: true, index: true },
  fecha: { type: Date, required: true },
  monto: { type: Number, required: true },
  concepto: { type: String, default: '' },
  categoria: { type: String, default: 'Otros' },
  archivo: { type: String, default: '' },
  textoExtraido: { type: String, default: '' },
  creadoEn: { type: Date, default: Date.now },
}, { collection: 'gastos' });

export const Gasto = mongoose.model('Gasto', gastoSchema);
