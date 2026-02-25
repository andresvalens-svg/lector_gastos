// Gemini: montos (coma/punto) y categoría. Sin GEMINI_API_KEY → fallback por palabras clave.
const CATEGORIAS = ['Supermercado', 'Restaurantes', 'Transporte', 'Servicios', 'Salud', 'Entretenimiento', 'Educación', 'Hogar', 'Bancos', 'Otros'];

function normalizarCategoria(cat) {
  if (!cat || typeof cat !== 'string') return 'Otros';
  const c = cat.trim().toLowerCase();
  return CATEGORIAS.find((k) => k.toLowerCase() === c) || 'Otros';
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
