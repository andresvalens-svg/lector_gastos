// Claude o Gemini: extracción de documento y normalización. Prioridad: ANTHROPIC_API_KEY (Claude), luego GEMINI_API_KEY.
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

/** Llama a Claude o Gemini con el prompt. Retorna texto o null. */
async function llamarIA(prompt) {
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;
  if (anthropicKey) {
    try {
      const Anthropic = (await import('@anthropic-ai/sdk')).default;
      const client = new Anthropic({ apiKey: anthropicKey });
      const message = await client.messages.create({
        model: process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-20241022',
        max_tokens: 4096,
        messages: [{ role: 'user', content: prompt }],
      });
      const block = message.content?.find((b) => b.type === 'text');
      return block?.text?.trim() || null;
    } catch (err) {
      console.error('[aiService] Claude', err.message);
      if (geminiKey) {
        try {
          const { GoogleGenerativeAI } = await import('@google/generative-ai');
          const model = new GoogleGenerativeAI(geminiKey).getGenerativeModel({ model: process.env.GEMINI_MODEL || 'gemini-1.5-flash' });
          const res = (await model.generateContent(prompt)).response;
          return res.text?.trim() || null;
        } catch (e) {
          console.error('[aiService] Gemini fallback', e.message);
        }
      }
      return null;
    }
  }
  if (geminiKey) {
    try {
      const { GoogleGenerativeAI } = await import('@google/generative-ai');
      const model = new GoogleGenerativeAI(geminiKey).getGenerativeModel({ model: process.env.GEMINI_MODEL || 'gemini-1.5-flash' });
      const res = (await model.generateContent(prompt)).response;
      return res.text?.trim() || null;
    } catch (err) {
      console.error('[aiService] Gemini', err.message);
      return null;
    }
  }
  return null;
}

/** Parsea monto aunque venga como "300,00" o "1.234,56" (coma decimal). Number("300,00") = NaN, por eso fallaba. */
function parsearMontoRobusto(val) {
  if (val == null) return 0;
  const n = Number(val);
  if (!Number.isNaN(n)) return Math.abs(n);
  const s = String(val).replace(/\s/g, '').replace(/[$€MXN]/g, '');
  if (!s) return 0;
  const eu = s.match(/^[\d.]+\s*,\s*\d+$/); // 1.234,56
  const us = s.match(/^[\d,]+\.\d+$/); // 1,234.56
  if (eu) return Math.abs(parseFloat(s.replace(/\./g, '').replace(',', '.')));
  if (us) return Math.abs(parseFloat(s.replace(/,/g, '')));
  const simple = s.replace(',', '.');
  const parsed = parseFloat(simple);
  return Number.isNaN(parsed) ? 0 : Math.abs(parsed);
}

/** Extrae del texto de un PDF/comprobante cada ítem con su fecha, monto y categoría. No incluye la línea TOTAL. */
export async function extraerConceptosDeDocumento(texto) {
  const apiKey = process.env.ANTHROPIC_API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey || !texto?.trim()) return null;

  const prompt = `El texto siguiente puede ser CUALQUIERA de estos tipos de documento. Debes detectar el tipo y extraer ítems (concepto, monto, fecha, categoria, tipo) aplicando las reglas que correspondan.

=== TIPOS DE DOCUMENTO ===

A) PRESUPUESTO / COTIZACIÓN / EVENTO / BODA (tabla con servicios)
   - Suele tener columnas: descripción del servicio, a veces "Costo" (por persona/unidad) y una columna de TOTAL por línea.
   - Nombres que puede tener la columna de DESCRIPCIÓN: Concepto, Descripción, Servicio, Item, Detalle.
   - Nombres que puede tener la columna de TOTAL DE LA LÍNEA (esta SÍ es "monto"): Importe, Total, Monto, Amount, Total línea, Subtotal, Precio total, Suma.
   - Nombres que NO debes usar como monto (son unitarios o cantidad): Costo, Costo por persona, P. unit., Precio unitario, Por persona, # Invitados, Cantidad, Qty.
   - Regla: "monto" = siempre la columna que sea el total a pagar por esa fila. Si hay dos números (ej. 3 y 49500), el monto es el grande (49500), no el unitario (3).
   - CONCEPTO: solo la descripción del servicio (ej. "Paquete Plata 3 tiempos...", "DJ Básico"). NUNCA "Concepto 3", "Concepto 5", "FECHA: ENERO", "HORA: PM A AM" ni listas "Incluye...".

B) TICKET / RESUMEN DEL PEDIDO / ORDER SUMMARY
   - Puede ser tabla con columnas O bloques donde cada producto junta descripción + cantidad + precio en el mismo bloque.
   - Si cada ítem tiene estructura como: "Envío de Documentos Institucionales... Cant: 1 pza(s) $300,00" → CONCEPTO = la descripción larga del producto/servicio (ej. "Envío de Documentos Institucionales en México Campus Monterrey"), NUNCA "Cant: 1 pza(s)" ni "Producto(s)" ni "Resumen del pedido".
   - MONTO: el valor con $ o moneda (ej. $300,00 o $600,00). Formato puede ser coma o punto decimal.
   - Sin columnas explícitas: la frase larga que describe el producto/servicio es el concepto; el número con $ es el monto.

C) ESTADO DE CUENTA BANCARIO
   - Puede tener columnas: Fecha, Concepto/Descripción/Movimiento/Referencia, Cargos/Débitos/Retiros, Abonos/Créditos/Depósitos, Saldo. Con o sin líneas separadoras entre secciones.
   - Cada fila de movimiento = un ítem. CONCEPTO = la descripción del movimiento (ej. "Transferencia recibida", "Pago con tarjeta").
   - MONTO: el valor en la columna que tenga el número (Cargos o Abonos). Usa valor absoluto (siempre positivo).
   - TIPO: si el monto está en Cargos/Débitos/Retiros → "gasto". Si está en Abonos/Créditos/Depósitos → "ingreso".
   - No crees ítems para: encabezados, líneas de "Saldo anterior", "Saldo", subtotales, ni filas que sean solo separadores o guiones.

D) RECIBO A MANO / NOTA / COMPROBANTE LIBRE
   - Texto libre, sin tabla: "Recibí $500 por concepto de...", "Pagado: renta marzo - $12000", listas con ítem y monto.
   - Extrae cada pago o ítem que tenga descripción y monto. CONCEPTO = lo que se pagó o recibió. MONTO = el valor. TIPO = "gasto" si es un pago, "ingreso" si es un cobro.

E) FORMATO DESCONOCIDO O NO RECONOCIBLE (fallback universal)
   - Si el documento no encaja claramente en A-D, usa esta heurística: busca cada PAR lógico (descripción + monto) en el texto.
   - CONCEPTO: la frase más larga y coherente que describa un producto, servicio o movimiento (evita encabezados, "Cant:", "Total", números de fila).
   - MONTO: cualquier número que represente un precio/importe (con $ o sin él). Suele ser el número más grande en la fila o el que esté junto a la descripción. Si hay varios, el que sea total de línea, no cantidad ni unitario.
   - Acepta múltiples formatos de moneda: $300,00 / $300.00 / 300,00 / 300.00 / $1,234.56 / $1.234,56. El monto final debe ser número (sin símbolos).
   - Ante duda: extrae el par (concepto + monto) que tenga más sentido. Es preferible incluir un ítem dudoso que omitirlo; el usuario puede corregir.

=== REGLAS UNIVERSALES ===
1. CONCEPTO: siempre la descripción del producto/servicio (la frase que explica QUÉ es). NUNCA uses como concepto: números de fila ("Concepto 3"), encabezados ("FECHA:", "HORA:", "Incluye", "Producto(s)", "Resumen del pedido"), líneas de cantidad ("Cant: 1 pza(s)"), la palabra "TOTAL" ni nombres de columnas. Si solo hay monto y no descripción clara → usa "Compra" o "Pago" como concepto.
2. MONTO: siempre el valor que representa el total a pagar o el movimiento (total de la línea/fila). Si hay varias columnas numéricas, elige la que sea el TOTAL/Importe final, no la unitaria ni la cantidad. Número positivo (sin $ ni comas de miles). Acepta formatos: $300,00 → 300; $1.234,56 → 1234.56; $1,234.56 → 1234.56. Si está vacío o dice CORTESÍA/CLIENTE → 0.
3. No crees ítems para: fila de TOTAL general, subtotales, encabezados, líneas en blanco, "Incluye" sin monto, separadores.
4. FECHA: infiere del documento (ej. "Enero 2027" → 2027-01-01); si no hay, usa la fecha actual. Categoría: una de [${CATEGORIAS.join(', ')}].
5. TIPO: en presupuestos/tickets/recibos de pago → "gasto". En estados de cuenta → según columna (Cargos=gasto, Abonos=ingreso). En recibos de cobro → "ingreso".
6. TABLAS COMPLEJAS (celdas combinadas, varias columnas, layouts raros): extrae por FILA LÓGICA, no por posición de columna. Cada fila/ítem = un par (concepto + monto). Si la descripción ocupa varias líneas, une todo el texto en el concepto.
7. TOLERANCIA A ERRORES: si el texto está corrupto o mal OCR, ignora caracteres ilegibles e infiere por contexto. Si detectas un ítem probable, inclúyelo antes que omitirlo.
8. NOMBRES DE COLUMNAS EN CUALQUIER IDIOMA: Concepto/Descripción/Item/Producto/Servicio/Produto/Artikel/Service = columna de descripción. Importe/Total/Monto/Amount/Preis/Valor/Preço = columna de monto. Aplica la misma lógica: descripción → concepto, total → monto.

Responde ÚNICAMENTE un JSON array válido, sin markdown ni explicaciones. Un objeto por ítem/movimiento real. Cada objeto: concepto (string descriptivo del producto/servicio, nunca "0" ni solo números), monto (número positivo: el valor que tenga el documento para ese ítem, sea cual sea). Extrae CADA monto numérico que represente un precio/importe en el documento y asígnale su concepto correspondiente. Nunca devuelvas monto: 0 para productos/servicios que tengan precio en el texto; usa siempre el número real que aparece ($X, XX → X; $1.234,56 → 1234.56, etc.).

Ejemplos de formato: [{"concepto":"Envío de Documentos Institucionales...","monto":300,"fecha":"2027-01-01","categoria":"Servicios","tipo":"gasto"},{"concepto":"Traducción de Certificado...","monto":600,"fecha":"2027-01-01","categoria":"Servicios","tipo":"gasto"}]

TEXTO DEL DOCUMENTO:
---
${texto.slice(0, 30000)}
---`;

  try {
    const content = await llamarIA(prompt);
    if (!content) return null;
    let jsonStr = content.match(/```(?:json)?\s*([\s\S]*?)```/)?.[1]?.trim() || content;
    const arrayMatch = jsonStr.match(/\[\s*[\s\S]*\s*\]/);
    if (arrayMatch) jsonStr = arrayMatch[0];
    jsonStr = jsonStr.replace(/,(\s*[}\]])/g, '$1');
    const arr = JSON.parse(jsonStr);
    if (!Array.isArray(arr) || arr.length === 0) return null;
    return arr
      .filter((item) => item && (item.concepto != null || item.monto != null))
      .map((item) => {
        let concepto = String(item?.concepto ?? '').trim();
        if (!concepto || /^[\d.,]+$/.test(concepto) || concepto === '0') concepto = 'Sin concepto';
        const monto = Math.max(0, parsearMontoRobusto(item?.monto));
        return {
        concepto,
        monto,
        fecha: item?.fecha ? new Date(item.fecha) : new Date(),
        categoria: normalizarCategoria(item?.categoria),
        tipo: normalizarTipo(item?.tipo),
      };
      });
  } catch (err) {
    console.error('[aiService] extraerConceptosDeDocumento', err.message);
    return null;
  }
}

export async function interpretarGastosConIA(textos) {
  const apiKey = process.env.ANTHROPIC_API_KEY || process.env.GEMINI_API_KEY;
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
    const content = await llamarIA(prompt);
    if (!content) return null;
    const jsonStr = content.match(/```(?:json)?\s*([\s\S]*?)```/)?.[1]?.trim() || content;
    const arr = JSON.parse(jsonStr);
    if (!Array.isArray(arr) || arr.length !== textos.length) return null;
    return arr.map((item) => ({
      monto: Math.max(0, parsearMontoRobusto(item?.monto)),
      categoria: normalizarCategoria(item?.categoria),
      tipo: normalizarTipo(item?.tipo),
    }));
  } catch (err) {
    console.error('[aiService]', err.message);
    return null;
  }
}
