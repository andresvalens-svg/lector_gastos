// Gemini: extracción de documento y/o normalización. Sin GEMINI_API_KEY → fallback por palabras clave.
export const CATEGORIAS = ['Supermercado', 'Restaurantes', 'Transporte', 'Servicios', 'Salud', 'Entretenimiento', 'Educación', 'Hogar', 'Bancos', 'Otros'];

function normalizarCategoria(cat) {
  if (!cat || typeof cat !== 'string') return 'Otros';
  const c = cat.trim().toLowerCase();
  return CATEGORIAS.find((k) => k.toLowerCase() === c) || cat.trim() || 'Otros';
}

/** Extrae del texto de un PDF/comprobante cada ítem con su fecha, monto y categoría. No incluye la línea TOTAL. */
export async function extraerConceptosDeDocumento(texto) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || !texto?.trim()) return null;

  const prompt = `Texto de un comprobante, recibo o estado de cuenta.

INSTRUCCIONES:
- Extrae cada gasto o movimiento como un ítem separado.
- Cada ítem debe tener: concepto (descripción), monto (número con punto decimal), fecha (la de ese movimiento; formato YYYY-MM-DD) y categoria.
- Categoria debe ser exactamente una de: ${CATEGORIAS.join(', ')}.
- NO incluyas la línea de TOTAL ni "Total a pagar" como ítem; solo los conceptos individuales.
- Los montos pueden venir con coma o punto decimal; devuélvelos como número.
- Si el documento solo muestra un total sin desglose, devuelve un solo ítem con ese monto y concepto "Sin desglose".

Responde ÚNICAMENTE un JSON array, sin markdown: [{ "concepto": "...", "monto": 123.45, "fecha": "YYYY-MM-DD", "categoria": "..." }, ...]

TEXTO:
---
${texto.slice(0, 30000)}
---`;

  try {
    const { GoogleGenerativeAI } = await import('@google/generative-ai');
    const model = new GoogleGenerativeAI(apiKey).getGenerativeModel({ model: process.env.GEMINI_MODEL || 'gemini-1.5-flash' });
    const content = (await model.generateContent(prompt)).response.text?.trim();
    if (!content) return null;
    const jsonStr = content.match(/```(?:json)?\s*([\s\S]*?)```/)?.[1]?.trim() || content;
    const arr = JSON.parse(jsonStr);
    if (!Array.isArray(arr) || arr.length === 0) return null;
    return arr
      .filter((item) => item && (item.concepto != null || item.monto != null))
      .map((item) => ({
        concepto: String(item?.concepto ?? '').trim() || 'Sin concepto',
        monto: Math.max(0, Number(item?.monto) || 0),
        fecha: item?.fecha ? new Date(item.fecha) : new Date(),
        categoria: normalizarCategoria(item?.categoria),
      }));
  } catch (err) {
    console.error('[aiService] extraerConceptosDeDocumento', err.message);
    return null;
  }
}

export async function interpretarGastosConIA(textos) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || !textos?.length) return null;

  const prompt = `Lista de líneas de gastos. En cada línea hay concepto y monto (puede ser 1.234,56 o 1,234.56).
Devuelve un JSON array con un objeto por línea en el mismo orden: { "monto": número con punto decimal, "categoria": una de [${CATEGORIAS.join(', ')}] }.
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
      monto: Math.max(0, (Number(item?.monto) || 0)),
      categoria: normalizarCategoria(item?.categoria),
    }));
  } catch (err) {
    console.error('[aiService]', err.message);
    return null;
  }
}
