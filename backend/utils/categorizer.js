const REGLAS = [
  { categoria: 'Supermercado', palabras: ['supermercado', 'soriana', 'chedraui', 'heb', 'walmart', 'oxxo', 'seven', '7-eleven', 'minisuper', 'abarrotes'] },
  { categoria: 'Restaurantes', palabras: ['restaurante', 'cafe', 'cafetería', 'comida', 'pizza', 'hamburguesa', 'taquería', 'taqueria', 'uber eats', 'rappi', 'didí food'] },
  { categoria: 'Transporte', palabras: ['gasolina', 'gas', 'uber', 'didi', 'taxi', 'metro', 'transporte', 'estacionamiento', 'caseta', 'peaje'] },
  { categoria: 'Servicios', palabras: ['cfe', 'aguakan', 'telcel', 'movistar', 'totalplay', 'internet', 'luz', 'agua', 'gas natural'] },
  { categoria: 'Salud', palabras: ['farmacia', 'similares', 'hospital', 'clinica', 'medicamento', 'doctor', 'laboratorio'] },
  { categoria: 'Entretenimiento', palabras: ['netflix', 'spotify', 'cine', 'cinépolis', 'cinemex', 'streaming', 'juegos'] },
  { categoria: 'Educación', palabras: ['colegiatura', 'universidad', 'curso', 'libros', 'utiles', 'papelería'] },
  { categoria: 'Hogar', palabras: ['home depot', 'liverpool', 'coppel', 'electrónica', 'ferretería'] },
  { categoria: 'Bancos', palabras: ['comisión', 'interés', 'retiro', 'transferencia', 'estado de cuenta', 'banco'] },
];

export function identificarCategoria(concepto, textoExtraido = '') {
  const busqueda = `${(concepto || '').toLowerCase()} ${(textoExtraido || '').toLowerCase()}`;
  for (const { categoria, palabras } of REGLAS) {
    if (palabras.some(p => busqueda.includes(p))) return categoria;
  }
  return 'Otros';
}
