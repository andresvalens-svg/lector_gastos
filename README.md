# Lector de Gastos

Aplicación web que extrae **fecha**, **monto** y **concepto** de recibos, tickets, facturas y estados de cuenta (PDF, JPEG, JPG) y asigna una categoría. Pensada para México (feb 2026).

- **Frontend:** JavaScript moderno + Tailwind CSS  
- **Backend:** Node.js (ESM)  
- **Base de datos:** MongoDB Atlas  

## Estructura

```
backend/   # API REST (Express + Mongoose)
frontend/  # SPA estática (HTML + JS + Tailwind)
```

## Uso rápido

### Backend

```bash
cd backend
cp .env.example .env
# Editar .env y poner tu MONGODB_URI de Atlas
npm install
npm run dev
```

Servidor en `http://localhost:4000`.

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Abre `http://localhost:3000` y sube un PDF o imagen (JPG/JPEG).

### Variables de entorno (backend)

| Variable     | Descripción                          |
|-------------|--------------------------------------|
| `PORT`      | Puerto del servidor (default 4000)   |
| `MONGODB_URI` | URI de MongoDB Atlas               |

## API (compatible con n8n)

- **POST /api/documentos** — Subir y procesar un documento  
  - Body: `multipart/form-data`, campo **`documento`** (archivo PDF, JPG o JPEG).  
  - Respuesta: `{ ok, id, fecha, monto, concepto, categoria }`

- **GET /api/documentos** — Listar todos los gastos  
  - Respuesta: `{ ok, items: [...] }`

- **GET /api/documentos/:id** — Obtener un gasto por ID  
  - Respuesta: `{ ok, item: {...} }`

- **GET /health** — Estado del servicio  

En n8n puedes usar el nodo **HTTP Request**:  
- Para subir: método POST, body type "Form-Data", key `documento` tipo File.  
- Para listar: GET a `http://tu-servidor:4000/api/documentos`.

## Categorías

Se asignan por palabras clave en concepto/texto: Supermercado, Restaurantes, Transporte, Servicios, Salud, Entretenimiento, Educación, Hogar, Bancos; si no coincide, **Otros**.
