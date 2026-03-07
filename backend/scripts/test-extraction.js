import 'dotenv/config';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { extraerTexto, extraerDatos } from '../utils/extractors.js';
import { extraerConceptosDeDocumento } from '../utils/aiService.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const PDFS = [
  'c:/Users/andre/AppData/Roaming/Cursor/User/workspaceStorage/26568bb7de45c8227d14ea8f450bd115/pdfs/31619f7f-d9ea-431e-b98f-88ddb6ad8d08/n8n receipt.pdf',
  'c:/Users/andre/AppData/Roaming/Cursor/User/workspaceStorage/26568bb7de45c8227d14ea8f450bd115/pdfs/39ea4ba8-ca41-467a-9a7d-070a94575979/COMPROBANTE PAGO TRANSCRIPT Y ENVIO.pdf',
];

function log(section, data) {
  console.log('\n' + '='.repeat(60));
  console.log(section);
  console.log('='.repeat(60));
  if (typeof data === 'string' && data.length > 2000) {
    console.log(data.slice(0, 2000) + '\n...[truncado ' + (data.length - 2000) + ' chars]');
  } else {
    console.log(JSON.stringify(data, null, 2));
  }
}

async function testPdf(path) {
  const name = path.split(/[/\\]/).pop();
  console.log('\n\n### PROBANDO:', name);
  try {
    const buffer = readFileSync(path);
    const mime = 'application/pdf';

    const texto = await extraerTexto(buffer, mime);
    log('1. TEXTO EXTRAÍDO (longitud ' + texto?.length + ')', texto || '(vacío)' );

    const extraidos = texto?.trim() ? await extraerConceptosDeDocumento(texto) : null;
    log('2. IA extraerConceptosDeDocumento', extraidos || '(null)');

    const fallback = await extraerDatos(buffer, mime, name);
    log('3. FALLBACK extraerDatos', fallback || []);

    const tieneMontosIA = extraidos?.some((e) => (e?.monto ?? 0) > 0);
    const usaFallback = !extraidos?.length || !tieneMontosIA;
    const causa = !texto || texto.length === 0
      ? 'PDF sin texto extraíble (basado en imágenes/escaneo). pdf-parse solo lee texto incrustado. Solución: convertir PDF a imagen + OCR, o usar PDF con capa de texto.'
      : !extraidos?.length
        ? 'IA devolvió null o vacío.'
        : !tieneMontosIA
          ? 'IA devolvió ítems pero todos con monto 0.'
          : 'OK: IA devolvió ítems con montos.';
    log('4. DIAGNÓSTICO', causa);
    log('5. DECISIÓN', { extraidosLength: extraidos?.length, tieneMontosIA, usaFallback, datosFinales: usaFallback ? fallback : extraidos });
  } catch (err) {
    console.error('ERROR:', err.message);
    console.error(err.stack);
  }
}

async function main() {
  console.log('DEBUG_EXTRACCION=' + process.env.DEBUG_EXTRACCION);
  console.log('ANTHROPIC_API_KEY=', process.env.ANTHROPIC_API_KEY ? 'SET' : 'NOT SET');
  console.log('GEMINI_API_KEY=', process.env.GEMINI_API_KEY ? 'SET' : 'NOT SET');
  for (const p of PDFS) {
    await testPdf(p);
  }
}

main();
