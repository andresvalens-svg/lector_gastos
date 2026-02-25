import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { connectDB } from './config/db.js';
import documentosRouter from './routes/documentos.js';
const PORT = process.env.PORT || 4000;

const app = express();
const allowedOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map(s => s.trim())
  : true;
app.use(cors({
  origin: allowedOrigins,
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  credentials: true,
}));
app.use(express.json());

app.use('/api/documentos', documentosRouter);

app.get('/', (_req, res) => res.json({ ok: true, api: '/api/documentos', health: '/health' }));

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'lector-gastos', time: new Date().toISOString() });
});

async function start() {
  if (!process.env.MONGODB_URI) {
    console.error('Define MONGODB_URI en .env (ver .env.example)');
    process.exit(1);
  }
  await connectDB(process.env.MONGODB_URI);
  console.log('MongoDB conectado');
  app.listen(PORT, () => console.log(`Servidor escuchando en puerto ${PORT}`));
}

start().catch((err) => {
  console.error(err);
  process.exit(1);
});
