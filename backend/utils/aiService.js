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

  const prompt = `El texto siguiente puede ser CUALQUIERA de estos tipos de documento. Debes detectar el tipo y extraer ítems (concepto, monto, fecha, categoria, tipo) aplicando las reglas que correspondan.

=== TIPOS DE DOCUMENTO ===

A) PRESUPUESTO / COTIZACIÓN / EVENTO / BODA (tabla con servicios)
   - Suele tener columnas: descripción del servicio, a veces "Costo" (por persona/unidad) y una columna de TOTAL por línea.
   - Nombres que puede tener la columna de DESCRIPCIÓN: Concepto, Descripción, Servicio, Item, Detalle.
   - Nombres que puede tener la columna de TOTAL DE LA LÍNEA (esta SÍ es "monto"): Importe, Total, Monto, Amount, Total línea, Subtotal, Precio total, Suma.
   - Nombres que NO debes usar como monto (son unitarios o cantidad): Costo, Costo por persona, P. unit., Precio unitario, Por persona, # Invitados, Cantidad, Qty.
   - Regla: "monto" = siempre la columna que sea el total a pagar por esa fila. Si hay dos números (ej. 3 y 49500), el monto es el grande (49500), no el unitario (3).
   - CONCEPTO: solo la descripción del servicio (ej. "Paquete Plata 3 tiempos...", "DJ Básico"). NUNCA "Concepto 3", "Concepto 5", "FECHA: ENERO", "HORA: PM A AM" ni listas "Incluye...".

B) TICKET (super, gasolinera, restaurante, tienda)
   - Pocas líneas; a veces sin columnas claras. Cada línea suele ser: descripción del producto/servicio + precio, o un solo total al final.
   - CONCEPTO: lo que describe el ítem (ej. "Café americano", "Gasolina 95", "Total"). Si solo hay un total, concepto puede ser "Compra" o el nombre del establecimiento si aparece.
   - MONTO: el precio o total de esa línea. Un solo número por ítem.

C) ESTADO DE CUENTA BANCARIO
   - Puede tener columnas: Fecha, Concepto/Descripción/Movimiento/Referencia, Cargos/Débitos/Retiros, Abonos/Créditos/Depósitos, Saldo. Con o sin líneas separadoras entre secciones.
   - Cada fila de movimiento = un ítem. CONCEPTO = la descripción del movimiento (ej. "Transferencia recibida", "Pago con tarjeta").
   - MONTO: el valor en la columna que tenga el número (Cargos o Abonos). Usa valor absoluto (siempre positivo).
   - TIPO: si el monto está en Cargos/Débitos/Retiros → "gasto". Si está en Abonos/Créditos/Depósitos → "ingreso".
   - No crees ítems para: encabezados, líneas de "Saldo anterior", "Saldo", subtotales, ni filas que sean solo separadores o guiones.

D) RECIBO A MANO / NOTA / COMPROBANTE LIBRE
   - Texto libre, sin tabla: "Recibí $500 por concepto de...", "Pagado: renta marzo - $12000", listas con ítem y monto.
   - Extrae cada pago o ítem que tenga descripción y monto. CONCEPTO = lo que se pagó o recibió. MONTO = el valor. TIPO = "gasto" si es un pago, "ingreso" si es un cobro.

=== REGLAS UNIVERSALES ===
1. CONCEPTO: siempre una descripción legible del ítem/movimiento. NUNCA uses como concepto: números de fila ("Concepto 3"), encabezados ("FECHA:", "HORA:", "Incluye"), la palabra "TOTAL" como único texto, ni nombres de columnas.
2. MONTO: siempre el valor que representa el total a pagar o el movimiento (total de la línea/fila). Si hay varias columnas numéricas, elige la que sea el TOTAL/Importe final, no la unitaria ni la cantidad. Número positivo. Si está vacío o dice CORTESÍA/CLIENTE → 0.
3. No crees ítems para: fila de TOTAL general, subtotales, encabezados, líneas en blanco, "Incluye" sin monto, separadores.
4. FECHA: infiere del documento (ej. "Enero 2027" → 2027-01-01); si no hay, usa la fecha actual. Categoría: una de [${CATEGORIAS.join(', ')}].
5. TIPO: en presupuestos/tickets/recibos de pago → "gasto". En estados de cuenta → según columna (Cargos=gasto, Abonos=ingreso). En recibos de cobro → "ingreso".

Responde ÚNICAMENTE un JSON array, sin markdown. Un objeto por ítem/movimiento real. Ejemplo: [{"concepto":"Paquete Plata 3 tiempos...","monto":49500,"fecha":"2027-01-01","categoria":"Restaurantes","tipo":"gasto"},{"concepto":"Transferencia recibida","monto":15000,"fecha":"2027-01-15","categoria":"Bancos","tipo":"ingreso"}]

TEXTO DEL DOCUMENTO:
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
