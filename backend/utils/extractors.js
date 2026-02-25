import { createRequire } from 'module';
import Tesseract from 'tesseract.js';
import XLSX from 'xlsx';
import { extname } from 'path';

const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse');

const MIME_PDF = 'application/pdf';
const MIME_JPEG = 'image/jpeg';
const MIME_JPG = 'image/jpg';
const MIME_PNG = 'image/png';
const MIME_CSV = 'text/csv';
const MIME_HTML = 'text/html';
const MIME_EXCEL_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const MIME_EXCEL_XLS = 'application/vnd.ms-excel';
const MIME_PLAIN = 'text/plain';

export function isSupportedMime(mimetype) {
  return [MIME_PDF, MIME_JPEG, MIME_JPG, MIME_PNG, MIME_CSV, MIME_HTML, MIME_EXCEL_XLSX, MIME_EXCEL_XLS, MIME_PLAIN].includes(mimetype);
}

export function resolveMime(mimetype, filename) {
  if (mimetype && mimetype !== 'application/octet-stream') return mimetype;
  const ext = extname(filename || '').toLowerCase();
  const map = { '.csv': MIME_CSV, '.xlsx': MIME_EXCEL_XLSX, '.xls': MIME_EXCEL_XLS, '.html': MIME_HTML, '.htm': MIME_HTML };
  return map[ext] || mimetype;
}

export function isSupportedFile(filename) {
  const ext = extname(filename).toLowerCase();
  return ['.pdf', '.jpeg', '.jpg', '.png', '.csv', '.xlsx', '.xls', '.html', '.htm'].includes(ext);
}

/** Extrae texto para PDF/imágenes. Para CSV/Excel/HTML retorna datos estructurados vía extraerDatos. */
export async function extraerTexto(buffer, mimetype) {
  if (mimetype === MIME_PDF) return extraerTextoPdf(buffer);
  if (mimetype === MIME_JPEG || mimetype === MIME_JPG || mimetype === MIME_PNG) return extraerTextoImagen(buffer);
  if (mimetype === MIME_HTML) return extraerTextoHtml(buffer);
  return '';
}

async function extraerTextoPdf(buffer) {
  const data = await pdfParse(buffer);
  return data.text || '';
}

async function extraerTextoImagen(buffer) {
  const { data } = await Tesseract.recognize(buffer, 'spa+eng');
  return data.text || '';
}

function extraerTextoHtml(buffer) {
  const html = buffer.toString('utf-8');
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Retorna array de { fecha, monto, concepto } para guardar múltiples gastos. */
export async function extraerDatos(buffer, mimetype, filename = '') {
  const mime = resolveMime(mimetype, filename);
  if (mime === MIME_CSV || (mime === MIME_PLAIN && /\.csv$/i.test(filename))) return extraerDatosCsv(buffer);
  if (mime === MIME_EXCEL_XLSX || mime === MIME_EXCEL_XLS) return extraerDatosExcel(buffer);
  const texto = await extraerTexto(buffer, mime);
  const multiples = parsearMultiplesConceptos(texto);
  if (multiples.length > 0) return multiples;
  const { fecha, monto, concepto } = parsearDatos(texto);
  return [{ fecha, monto, concepto }];
}

function parseCsvLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') inQuotes = !inQuotes;
    else if ((c === ',' && !inQuotes) || c === '\n') {
      result.push(current.trim());
      current = '';
      if (c === '\n') break;
    } else current += c;
  }
  result.push(current.trim());
  return result;
}

function extraerDatosCsv(buffer) {
  const text = buffer.toString('utf-8');
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (lines.length === 0) return [];
  const rows = lines.map(l => parseCsvLine(l));
  const header = rows[0].map(h => (h || '').toLowerCase());
  const idxFecha = header.findIndex(h => /fecha|date/i.test(h));
  const idxMonto = header.findIndex(h => /monto|total|amount|importe/i.test(h));
  const idxConcepto = header.findIndex(h => /concepto|descripcion|descripción|detalle|concept/i.test(h));
  const datos = [];
  const { parsearFecha, parsearMonto } = getParsers();
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const fechaVal = idxFecha >= 0 ? row[idxFecha] : null;
    const montoVal = idxMonto >= 0 ? row[idxMonto] : row.find(c => /^\$?[\d.,]+$/.test((c || '').trim()));
    const conceptoVal = idxConcepto >= 0 ? row[idxConcepto] : row.join(' ');
    const fecha = parsearFecha(fechaVal) || new Date();
    const monto = parsearMonto(montoVal) ?? 0;
    const concepto = (conceptoVal || '').trim() || 'Sin concepto';
    if (monto > 0 || concepto !== 'Sin concepto') datos.push({ fecha, monto, concepto });
  }
  if (datos.length === 0 && rows.length >= 1) {
    const joined = rows.map(r => r.join(' ')).join('\n');
    const { fecha, monto, concepto } = parsearDatos(joined);
    datos.push({ fecha, monto, concepto });
  }
  return datos;
}

function extraerDatosExcel(buffer) {
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const sh = wb.Sheets[wb.SheetNames[0]];
  if (!sh) return [];
  const rows = XLSX.utils.sheet_to_json(sh, { header: 1, defval: '' });
  if (rows.length === 0) return [];
  const header = (rows[0] || []).map(h => String(h || '').toLowerCase());
  const idxFecha = header.findIndex(h => /fecha|date/i.test(h));
  const idxMonto = header.findIndex(h => /monto|total|amount|importe/i.test(h));
  const idxConcepto = header.findIndex(h => /concepto|descripcion|descripción|detalle|concept/i.test(h));
  const datos = [];
  const { parsearFecha, parsearMonto } = getParsers();
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!Array.isArray(row)) continue;
    const fechaVal = idxFecha >= 0 ? row[idxFecha] : null;
    const montoVal = idxMonto >= 0 ? row[idxMonto] : row.find(c => /^\$?[\d.,]+$/.test(String(c || '').trim()));
    const conceptoVal = idxConcepto >= 0 ? row[idxConcepto] : row.join(' ');
    let fecha = parsearFecha(String(fechaVal || ''));
    if (!fecha && fechaVal instanceof Date) fecha = fechaVal;
    if (!fecha && typeof fechaVal === 'number') {
      try {
        const pd = XLSX.SSF.parse_date_code(fechaVal);
        if (pd) fecha = new Date(pd.y, (pd.m || 1) - 1, pd.d || 1);
      } catch (_) {}
      if (!fecha) fecha = new Date();
    }
    if (!fecha) fecha = new Date();
    const monto = parsearMonto(String(montoVal || '')) ?? (typeof montoVal === 'number' && montoVal > 0 ? montoVal : 0);
    const concepto = (String(conceptoVal || '').trim()) || 'Sin concepto';
    if (monto > 0 || concepto !== 'Sin concepto') datos.push({ fecha, monto, concepto });
  }
  if (datos.length === 0 && rows.length >= 1) {
    const joined = rows.map(r => (Array.isArray(r) ? r.join(' ') : String(r))).join('\n');
    const { fecha, monto, concepto } = parsearDatos(joined);
    datos.push({ fecha, monto, concepto });
  }
  return datos;
}

function getParsers() {
  const REGEX_FECHA = [
    /(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/,
    /(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/,
    /(\d{1,2})\s+(ene|feb|mar|abr|may|jun|jul|ago|sep|oct|nov|dic)[a-z]*\.?\s+(\d{2,4})/i,
  ];
  const MESES = { ene: 0, feb: 1, mar: 2, abr: 3, may: 4, jun: 5, jul: 6, ago: 7, sep: 8, oct: 9, nov: 10, dic: 11 };
  function parsearFecha(str) {
    if (!str || !String(str).trim()) return null;
    const s = String(str).trim();
    for (const re of REGEX_FECHA) {
      const m = s.match(re);
      if (!m) continue;
      if (m[2] && MESES[m[2].toLowerCase().slice(0, 3)] !== undefined) {
        const dia = parseInt(m[1], 10);
        const mes = MESES[m[2].toLowerCase().slice(0, 3)];
        let anio = parseInt(m[3], 10);
        if (anio < 100) anio += 2000;
        const d = new Date(anio, mes, dia);
        if (!isNaN(d.getTime())) return d;
      }
      const n1 = parseInt(m[1], 10);
      const n2 = parseInt(m[2], 10);
      const n3 = parseInt(m[3], 10);
      let dia, mes, anio;
      if (n1 > 31) { anio = n1; mes = n2 - 1; dia = n3; }
      else if (n3 > 31) { dia = n1; mes = n2 - 1; anio = n3 >= 100 ? n3 : 2000 + n3; }
      else { dia = n1; mes = n2 - 1; anio = n3 >= 100 ? n3 : 2000 + n3; }
      const d = new Date(anio, mes, dia);
      if (!isNaN(d.getTime()) && d.getDate() === dia) return d;
    }
    return null;
  }
  function normalizarMontoStr(s) {
    s = String(s).replace(/\s/g, '');
    if (/,\d{2}$/.test(s)) return s.replace(/\./g, '').replace(',', '.');
    return s.replace(/,/g, '');
  }
  const REGEX_MONTO = /\$?\s*([\d.,]+)\s*\$?/g;
  function parsearMonto(str) {
    if (!str || !String(str).trim()) return null;
    let mejor = null;
    let mejorValor = -1;
    let match;
    REGEX_MONTO.lastIndex = 0;
    while ((match = REGEX_MONTO.exec(String(str))) !== null) {
      const num = parseFloat(normalizarMontoStr(match[1]));
      if (isNaN(num) || num <= 0 || num > 1e7) continue;
      if (num > mejorValor) { mejorValor = num; mejor = num; }
    }
    return mejor !== null ? Math.round(mejor * 100) / 100 : null;
  }
  return { parsearFecha, parsearMonto };
}

// Fechas: DD/MM/YYYY, DD-MM-YYYY, YYYY-MM-DD, "17 feb 2026", etc. (México)
const REGEX_FECHA = [
  /(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/,
  /(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/,
  /(\d{1,2})\s+(ene|feb|mar|abr|may|jun|jul|ago|sep|oct|nov|dic)[a-z]*\.?\s+(\d{2,4})/i,
];
const MESES = { ene: 0, feb: 1, mar: 2, abr: 3, may: 4, jun: 5, jul: 6, ago: 7, sep: 8, oct: 9, nov: 10, dic: 11 };

function parsearFecha(str) {
  if (!str || !str.trim()) return null;
  const s = str.trim();
  for (const re of REGEX_FECHA) {
    const m = s.match(re);
    if (!m) continue;
    if (m[2] && MESES[m[2].toLowerCase().slice(0, 3)] !== undefined) {
      const dia = parseInt(m[1], 10);
      const mes = MESES[m[2].toLowerCase().slice(0, 3)];
      let anio = parseInt(m[3], 10);
      if (anio < 100) anio += 2000;
      const d = new Date(anio, mes, dia);
      if (!isNaN(d.getTime())) return d;
    }
    const n1 = parseInt(m[1], 10);
    const n2 = parseInt(m[2], 10);
    const n3 = parseInt(m[3], 10);
    let dia, mes, anio;
    if (n1 > 31) {
      anio = n1;
      mes = n2 - 1;
      dia = n3;
    } else if (n3 > 31) {
      dia = n1;
      mes = n2 - 1;
      anio = n3 >= 100 ? n3 : 2000 + n3;
    } else {
      dia = n1;
      mes = n2 - 1;
      anio = n3 >= 100 ? n3 : 2000 + n3;
    }
    const d = new Date(anio, mes, dia);
    if (!isNaN(d.getTime()) && d.getDate() === dia) return d;
  }
  return null;
}

function normalizarMontoStr(s) {
  s = s.replace(/\s/g, '');
  if (/,\d{2}$/.test(s)) return s.replace(/\./g, '').replace(',', '.');
  return s.replace(/,/g, '');
}
const REGEX_MONTO = /\$?\s*([\d.,]+)\s*\$?/g;

function parsearMonto(str) {
  if (!str || !str.trim()) return null;
  let mejor = null;
  let mejorValor = -1;
  let match;
  REGEX_MONTO.lastIndex = 0;
  while ((match = REGEX_MONTO.exec(str)) !== null) {
    const num = parseFloat(normalizarMontoStr(match[1]));
    if (isNaN(num) || num <= 0 || num > 1e7) continue;
    if (num > mejorValor) { mejorValor = num; mejor = num; }
  }
  return mejor !== null ? Math.round(mejor * 100) / 100 : null;
}

function extraerConcepto(texto) {
  const lineas = texto.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const candidatos = lineas.filter(l => !/^\d+[\-\/\.]?\d*[\-\/\.]?\d*$/.test(l) && !/^\$?\s*[\d,\.]+\s*$/.test(l));
  const primera = candidatos[0] || lineas[0] || '';
  return primera.slice(0, 200);
}

/** Extrae varios conceptos de un texto libre (PDF, imagen, HTML): cada línea con monto → un gasto. */
function parsearMultiplesConceptos(texto) {
  if (!texto || !String(texto).trim()) return [];
  const fechaGlobal = buscarEnTexto(texto, parsearFecha, 150) || new Date();
  const lineas = texto.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const resultados = [];
  for (const linea of lineas) {
    if (linea.length > 500) continue;
    const monto = parsearMonto(linea);
    if (monto == null || monto <= 0) continue;
    let concepto = linea
      .replace(/\$?\s*[\d.,]+\s*\$?/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!concepto || concepto.length < 2) concepto = `Concepto ${resultados.length + 1}`;
    concepto = concepto.slice(0, 200);
    resultados.push({ fecha: fechaGlobal, monto, concepto });
  }
  return resultados;
}

export function parsearDatos(texto) {
  const fecha = buscarEnTexto(texto, parsearFecha, 150);
  const monto = parsearMonto(texto);
  const concepto = extraerConcepto(texto);
  return {
    fecha: fecha || new Date(),
    monto: monto ?? 0,
    concepto: concepto || 'Sin concepto',
  };
}

function buscarEnTexto(texto, fn, maxLen = 500) {
  const len = Math.min(texto.length, maxLen);
  for (let i = 0; i < texto.length; i += 100) {
    const chunk = texto.slice(i, i + len);
    const r = fn(chunk);
    if (r != null) return r;
  }
  return fn(texto.slice(0, 2000));
}
