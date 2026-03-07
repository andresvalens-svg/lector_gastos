# Test de extracción de PDFs

## Uso

```bash
cd backend
DEBUG_EXTRACCION=1 npm run test:extraction
```

## Fallback OCR (implementado)

Cuando `pdf-parse` devuelve texto vacío (PDF basado en imágenes), el sistema:
1. Convierte cada página a imagen con `pdf-to-img`
2. Ejecuta Tesseract OCR en cada imagen
3. Concatena el texto y lo pasa a la IA o al parser de líneas

No requiere Ghostscript ni GraphicsMagick.
