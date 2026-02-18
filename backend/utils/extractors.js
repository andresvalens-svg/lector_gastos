import { createRequire } from 'module';
import Tesseract from 'tesseract.js';
import { extname } from 'path';

const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse');

const MIME_PDF = 'application/pdf';
const MIME_JPEG = 'image/jpeg';
const MIME_JPG = 'image/jpg';

export function isSupportedMime(mimetype) {
  return [MIME_PDF, MIME_JPEG, MIME_JPG].includes(mimetype);
}

export function isSupportedFile(filename) {
  const ext = extname(filename).toLowerCase();
  return ['.pdf', '.jpeg', '.jpg'].includes(ext);
}

export async function extraerTexto(buffer, mimetype) {
  if (mimetype === MIME_PDF) return extraerTextoPdf(buffer);
  if (mimetype === MIME_JPEG || mimetype === MIME_JPG) return extraerTextoImagen(buffer);
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

// Montos: $1,234.56 (US/MX) o 1.234,56 (EU) o 1234.56
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
    if (num > mejorValor) {
      mejorValor = num;
      mejor = num;
    }
  }
  return mejor !== null ? Math.round(mejor * 100) / 100 : null;
}

// Concepto: primeras líneas no numéricas o nombre de comercio
function extraerConcepto(texto) {
  const lineas = texto.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const candidatos = lineas.filter(l => !/^\d+[\-\/\.]?\d*[\-\/\.]?\d*$/.test(l) && !/^\$?\s*[\d,\.]+\s*$/.test(l));
  const primera = candidatos[0] || lineas[0] || '';
  return primera.slice(0, 200);
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
