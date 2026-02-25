// Gemini: extracción de documento y/o normalización. Sin GEMINI_API_KEY → fallback por palabras clave.
export const CATEGORIAS = ['Supermercado', 'Restaurantes', 'Transporte', 'Servicios', 'Salud', 'Entretenimiento', 'Educación', 'Hogar', 'Bancos', 'Otros'];

function normalizarCategoria(cat) {
  if (!cat || typeof cat !== 'string') return 'Otros';
  const c = cat.trim().toLowerCase();
  return CATEGORIAS.find((k) => k.toLowerCase() === c) || cat.trim() || 'Otros';
}

function normalizarTipo(t) {
  if (t === 'ingreso') return 'ingreso';
  return 'gasto';
}

/** Extrae del texto de un PDF/comprobante cada ítem con su fecha, monto y categoría. No incluye la línea TOTAL. */
export async function extraerConceptosDeDocumento(texto) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || !texto?.trim()) return null;

  const prompt = `Texto de un documento (presupuesto, cotización, recibo, evento, boda, o estado de cuenta bancario). Suele ser una tabla con columnas como Concepto, Costo, Importe (o Cargos/Abonos, Retiros/Depósitos).

REGLAS:
1. Incluye como ítem SOLO las filas que son conceptos/movimientos (cada línea con descripción y/o monto). Una fila = un ítem.
2. NO incluyas: la fila de TOTAL / Total a pagar / Gran total / Saldo; ni bloques solo informativos sin monto (ej. "Incluye"...). Esos no son ítems.
3. MONTO: número siempre positivo (valor absoluto). Si hay signo negativo en el documento, no lo incluyas en el número; usa "tipo" para eso (ver abajo). Si está en blanco, CORTESIA, CLIENTE, etc. → monto = 0.
4. TIPO (gasto o ingreso): 
   - En estados de cuenta: si la columna es Cargos/Retiros/Débitos o el monto aparece negativo → "gasto". Si es Abonos/Depósitos/Créditos o monto positivo en columna de ingresos → "ingreso". Usa los nombres de columnas y el signo para decidir.
   - En presupuestos/recibos/cotizaciones (todo es lo que se paga) → "gasto" para todos.
5. Para cada ítem devuelve: "concepto", "monto" (número >= 0), "fecha" (YYYY-MM-DD), "categoria" (una de: ${CATEGORIAS.join(', ')}) y "tipo" ("gasto" o "ingreso").

Responde solo un JSON array, sin markdown. Ejemplo: [{"concepto":"Paquete Plata...","monto":49500,"fecha":"2027-01-01","categoria":"Restaurantes","tipo":"gasto"},{"concepto":"Depósito nómina","monto":15000,"fecha":"2027-01-15","categoria":"Bancos","tipo":"ingreso"}]

TEXTO:
---
${texto.slice(0, 30000)}
---`;

  try {
    const { GoogleGenerativeAI } = await import('@google/generative-ai');
    const model = new GoogleGenerativeAI(apiKey).getGenerativeModel({ model: process.env.GEMINI_MODEL || 'gemini-1.5-flash' });
    const content = (await model.generateContent(prompt)).response.text?.trim();
    if (!content) return null;
    let jsonStr = content.match(/```(?:json)?\s*([\s\S]*?)```/)?.[1]?.trim() || content;
    const arrayMatch = jsonStr.match(/\[\s*[\s\S]*\s*\]/);
    if (arrayMatch) jsonStr = arrayMatch[0];
    jsonStr = jsonStr.replace(/,(\s*[}\]])/g, '$1');
    const arr = JSON.parse(jsonStr);
    if (!Array.isArray(arr) || arr.length === 0) return null;
    return arr
      .filter((item) => item && (item.concepto != null || item.monto != null))
      .map((item) => ({
        concepto: String(item?.concepto ?? '').trim() || 'Sin concepto',
        monto: Math.max(0, Math.abs(Number(item?.monto) || 0)),
        fecha: item?.fecha ? new Date(item.fecha) : new Date(),
        categoria: normalizarCategoria(item?.categoria),
        tipo: normalizarTipo(item?.tipo),
      }));
  } catch (err) {
    console.error('[aiService] extraerConceptosDeDocumento', err.message);
    return null;
  }
}

export async function interpretarGastosConIA(textos) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || !textos?.length) return null;

  const prompt = `Lista de líneas (gastos o movimientos de cuenta). En cada línea puede haber concepto y monto (ej. 1.234,56 o -500 o 1,234.56).
Devuelve un JSON array, un objeto por línea en el mismo orden, con: "monto" (número positivo, punto decimal), "categoria" (una de [${CATEGORIAS.join(', ')}]) y "tipo": "gasto" o "ingreso".
- Si el monto aparece negativo o la línea sugiere retiro/cargo/débito → tipo "gasto".
- Si el monto es positivo o sugiere depósito/abono/crédito → tipo "ingreso".
- Si no hay pista, usa "gasto".
Solo JSON, sin markdown.

Líneas:
${textos.map((t, i) => `${i + 1}. ${t}`).join('\n')}`;

  try {
    const { GoogleGenerativeAI } = await import('@google/generative-ai');
    const model = new GoogleGenerativeAI(apiKey).getGenerativeModel({ model: process.env.GEMINI_MODEL || 'gemini-1.5-flash' });
    const content = (await model.generateContent(prompt)).response.text?.trim();
    if (!content) return null;
    const jsonStr = content.match(/```(?:json)?\s*([\s\S]*?)```/)?.[1]?.trim() || content;
    const arr = JSON.parse(jsonStr);
    if (!Array.isArray(arr) || arr.length !== textos.length) return null;
    return arr.map((item) => ({
      monto: Math.max(0, Math.abs(Number(item?.monto) || 0)),
      categoria: normalizarCategoria(item?.categoria),
      tipo: normalizarTipo(item?.tipo),
    }));
  } catch (err) {
    console.error('[aiService]', err.message);
    return null;
  }
}
