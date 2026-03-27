# FAKTIO 2026 — Documento Técnico
**Sistema de Facturación y Presupuestos para Autónomos y PYMEs**
Versión 1.0 · Marzo 2026 · Desarrollado por Josefa Morejon Rodriguez / Mago Blanco Digital

---

## 1. Descripción General

Faktio 2026 es una aplicación web full-stack de gestión fiscal y facturación diseñada para autónomos y pequeñas empresas españolas. Cubre el ciclo de vida completo del documento fiscal: presupuesto → factura emitida → cobro → abono rectificativo, con cumplimiento de la normativa española vigente (RGPD, LOPDGDD, Ley Antifraude, preparación para VeriFactu RD 1007/2023).

---

## 2. Stack Tecnológico

### Frontend
| Tecnología | Versión | Rol |
|-----------|---------|-----|
| React | 19.0 | UI framework |
| TypeScript | 5.8 | Tipado estático |
| Vite | 6.2 | Bundler y dev server |
| Tailwind CSS | 4.1 | Estilos utilitarios |
| Motion (Framer) | 12.x | Animaciones y transiciones |
| Lucide React | 0.546 | Sistema de iconografía |
| jsPDF + html2canvas | 4.2 / 1.4 | Generación de PDF en cliente |
| qrcode.react | 4.2 | Generación de QR en documentos |

### Backend
| Tecnología | Versión | Rol |
|-----------|---------|-----|
| Node.js | 22.x | Runtime del servidor |
| Express | 4.21 | Framework HTTP |
| TypeScript (tsx) | 5.8 / 4.21 | Ejecución directa TS en servidor |
| PostgreSQL | 15+ | Base de datos relacional |
| pg (node-postgres) | 8.20 | Driver PostgreSQL |
| bcryptjs | 3.0 | Hash de contraseñas |
| jsonwebtoken | 9.0 | Autenticación JWT |
| multer | 2.1 | Upload de archivos (tickets, logos) |
| dotenv | 17.x | Variables de entorno |

### Infraestructura
- Servidor único (monorepo): Express sirve tanto la API REST como el frontend compilado
- Base de datos: PostgreSQL con pool de conexiones
- Archivos estáticos: carpeta `/uploads` servida directamente por Express
- PWA: Service Worker + Web Manifest para instalación en dispositivos

---

## 3. Arquitectura del Sistema

```
┌─────────────────────────────────────────────────────────────┐
│                        CLIENTE (Browser)                      │
│  React 19 · TypeScript · Tailwind · Motion · jsPDF           │
│                                                               │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────┐   │
│  │AuthView  │ │Dashboard │ │DocumentEd│ │HistoryView   │   │
│  │PIN+Seed  │ │KPIs+IA   │ │itor      │ │Abonos/Presu  │   │
│  └──────────┘ └──────────┘ └──────────┘ └──────────────┘   │
└──────────────────────┬──────────────────────────────────────┘
                       │ HTTP/REST (JWT Bearer Token)
                       ▼
┌─────────────────────────────────────────────────────────────┐
│                    SERVIDOR (Express + Node.js)               │
│                                                               │
│  ┌────────────────┐  ┌─────────────────┐  ┌─────────────┐  │
│  │ authMiddleware │  │inalterabilityMW │  │ Vite SSR/   │  │
│  │ JWT validation │  │ Protección legal│  │ Static serve│  │
│  └────────────────┘  └─────────────────┘  └─────────────┘  │
│                                                               │
│  REST API Endpoints:                                          │
│  /api/auth/*  · /api/documents/*  · /api/expenses/*          │
│  /api/settings · /api/reports/* · /api/next-number/:type     │
└──────────────────────┬──────────────────────────────────────┘
                       │ pg pool
                       ▼
┌─────────────────────────────────────────────────────────────┐
│                    PostgreSQL Database                         │
│  tenants · documents · expenses                               │
└─────────────────────────────────────────────────────────────┘
```

---

## 4. Modelo de Datos

### Tabla: `tenants`
Representa a cada empresa/autónomo registrado (modelo multi-tenant).

| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | SERIAL PK | Identificador único |
| email | TEXT UNIQUE | Email de acceso |
| password_hash | TEXT | Contraseña cifrada con bcrypt |
| security_pin | TEXT | PIN de 4 dígitos (verificación 2FA) |
| recovery_seed | TEXT | Frase de recuperación de 12 palabras |
| company_name | TEXT | Razón social |
| owner_name | TEXT | Nombre del titular |
| cif | TEXT | CIF/NIF fiscal |
| phone | TEXT | Teléfono de contacto |
| email_contact | TEXT | Email fiscal |
| address / city / province / zip | TEXT | Dirección fiscal |
| logo_url | TEXT | Ruta al logotipo subido |
| account_type | TEXT | 'autonomo' o 'sl' |
| irpf_rate | NUMERIC | Tipo de retención IRPF |
| created_at | TIMESTAMP | Fecha de alta |

### Tabla: `documents`
Facturas, presupuestos y abonos.

| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | SERIAL PK | Identificador único |
| tenant_id | INTEGER FK | Propietario (tenant) |
| type | TEXT | 'invoice' / 'quote' / 'abono' |
| number | TEXT | Número correlativo (FAC-YYYY-NNN) |
| date | TEXT | Fecha de emisión |
| client_name / client_dni | TEXT | Datos del cliente |
| client_address / city / zip / province | TEXT | Dirección del cliente |
| items | JSONB | Array de líneas de concepto |
| subtotal | NUMERIC | Base imponible |
| iva_rate / iva_amount | NUMERIC | IVA aplicado |
| irpf_rate / irpf_amount | NUMERIC | Retención IRPF |
| total | NUMERIC | Total final |
| status | TEXT | Estado del documento |
| is_rectificative | BOOLEAN | Es factura rectificativa |
| original_invoice_id | INTEGER FK | Factura original (para abonos/rectificativas) |
| created_at | TIMESTAMP | Fecha de creación |

### Tabla: `expenses`
Gastos deducibles con soporte para ticket digital.

| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | SERIAL PK | Identificador único |
| tenant_id | INTEGER FK | Propietario |
| description | TEXT | Descripción del gasto |
| provider / nif | TEXT | Datos del proveedor |
| amount / base_amount | NUMERIC | Importe total y base |
| iva_amount / iva_rate | NUMERIC | IVA soportado |
| category | TEXT | Categoría fiscal |
| date | TEXT | Fecha del gasto |
| ticket_image_url | TEXT | Ruta al ticket/factura digitalizado |

---

## 5. API REST — Endpoints

### Autenticación
| Método | Endpoint | Descripción |
|--------|----------|-------------|
| POST | `/api/auth/register` | Registro de nuevo tenant |
| POST | `/api/auth/login` | Login email+password, devuelve JWT |
| POST | `/api/auth/verify-pin` | Verificación PIN (requiere JWT) |
| PATCH | `/api/auth/pin` | Crear/cambiar PIN |
| POST | `/api/auth/seed/save` | Guardar frase de recuperación |
| POST | `/api/auth/recover` | Recuperar acceso con seed phrase |

### Documentos
| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/api/documents` | Listar todos los documentos del tenant |
| POST | `/api/documents` | Crear factura/presupuesto/abono |
| PUT | `/api/documents/:id` | Editar documento (bloqueado si emitido) |
| DELETE | `/api/documents/:id` | Eliminar (bloqueado si emitido/pagado) |
| PATCH | `/api/documents/:id/status` | Cambiar estado |
| POST | `/api/documents/rectify/:id` | Crear factura rectificativa |
| POST | `/api/documents/convert/:id` | Convertir presupuesto en factura |
| GET | `/api/next-number/:type` | Obtener siguiente número correlativo |

### Gastos
| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/api/expenses` | Listar gastos |
| POST | `/api/expenses` | Registrar gasto |
| PUT | `/api/expenses/:id` | Editar gasto |
| DELETE | `/api/expenses/:id` | Eliminar gasto |
| POST | `/api/expenses/upload-ticket` | Subir imagen de ticket |

### Configuración e Informes
| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/api/settings` | Obtener configuración del tenant |
| PUT | `/api/settings` | Guardar configuración |
| POST | `/api/settings/logo` | Subir logotipo |
| DELETE | `/api/settings/logo` | Eliminar logotipo |
| GET | `/api/reports/real-income` | Informe fiscal: IVA, IRPF, beneficio |

---

## 6. Seguridad

### Autenticación y Acceso
- **JWT (JSON Web Tokens)**: cada request autenticado incluye un Bearer token en la cabecera `Authorization`
- **bcrypt**: las contraseñas se almacenan con hash bcrypt (factor de coste 10)
- **PIN de 4 dígitos**: capa adicional de verificación en cada inicio de sesión
- **Frase de recuperación**: 12 palabras generadas en cliente, almacenadas en servidor, permiten recuperar acceso sin contraseña
- **Timeout de sesión**: cierre automático por inactividad a los 10 minutos

### Inalterabilidad Fiscal (Pre-VeriFactu)
- Middleware `inalterabilityMiddleware` aplicado a todos los DELETE/PUT/PATCH sobre documentos
- Las facturas con estado `Emitida`, `Pagada` o `Rectificativa` **no pueden ser modificadas ni eliminadas**
- Para anular una factura emitida es obligatorio emitir una Factura Rectificativa (abono)
- Este mecanismo cumple con el principio de **trazabilidad e inalterabilidad** exigido por la Ley 11/2021 y el RD 1007/2023

### Aislamiento Multi-tenant
- Todas las consultas SQL incluyen `WHERE tenant_id = $X` para garantizar que cada empresa solo accede a sus propios datos
- El `tenant_id` se extrae del JWT validado en servidor, nunca del cuerpo de la request

### Cumplimiento Legal
- **RGPD / LOPDGDD**: política de privacidad, checkbox de consentimiento en registro, derechos ARCO
- **Retención de datos**: las facturas emitidas no pueden borrarse (obligación de conservación 5 años según LIRPF)
- **Numeración correlativa**: el sistema garantiza numeración secuencial sin saltos para documentos oficiales

---

## 7. Módulos Funcionales

### 7.1 Autenticación (AuthView)
Flujo de registro multi-paso:
1. Email + contraseña
2. Visualización y copia de frase de recuperación (12 palabras)
3. Verificación de una palabra aleatoria
4. Creación de PIN de 4 dígitos
5. Redirección a Ajustes para completar perfil fiscal

Flujo de login:
1. Email + contraseña → JWT
2. Verificación de PIN → acceso concedido

### 7.2 Dashboard (DashboardView)
- **Liquidez Real**: ingresos netos descontando IVA e IRPF
- **IVA Neto (Mod. 303)**: IVA repercutido − IVA soportado
- **IRPF Retenido**: total retenido por clientes (solo autónomos)
- **Pendiente de Cobro**: facturas emitidas sin pagar
- **Actividad Reciente**: últimos 6 documentos
- **Alertas Fiscales IA**: avisos automáticos si IVA > 3.000€ o gastos bajos
- **Roadmap VeriFactu**: estado de integración con AEAT

### 7.3 Facturación (DocumentEditor)
- Tipos: Factura (`FAC-YYYY-NNN`), Presupuesto (`PRE-YYYY-NNN`), Abono (`ABO-YYYY-NNN`)
- Numeración automática correlativa por tipo y año
- Cálculo automático de IVA (4%, 10%, 21%) e IRPF (7%, 15%, 19%, 21%)
- Múltiples líneas de concepto con cantidad y precio unitario
- Estados: Borrador → Emitida → Pagada / Rectificativa

### 7.4 Historial (HistoryView)
- Listado filtrable de todas las facturas
- Cambio de estado (Borrador → Emitida → Pagada)
- Acceso a previsualización y descarga PDF
- Emisión de factura rectificativa (abono parcial o total)
- Protección: no se puede editar/borrar si está emitida

### 7.5 Presupuestos (BudgetsView)
- Gestión independiente de presupuestos
- Conversión directa de presupuesto a factura oficial con un clic
- Estados: Pendiente / Aceptado / Rechazado / Convertido

### 7.6 Abonos (AbonosView)
- Abonos vinculados a facturas originales
- Trazabilidad: referencia al número de factura original
- Numeración propia `ABO-YYYY-NNN`

### 7.7 Gastos (ExpensesView)
- Registro de gastos deducibles con categorización fiscal
- Upload de ticket/factura digital (imagen)
- Visualización del ticket desde el registro
- Cálculo automático de IVA soportado
- Categorías: Material, Servicios, Transporte, Software, Alquiler, Otros

### 7.8 Ajustes (SettingsView)
- **Perfil Empresa**: razón social, CIF, dirección, logotipo, tipo de cuenta
- **Seguridad**: cambio de PIN con confirmación, visualización de frase de recuperación (requiere PIN)
- **Legal**: enlace a política de privacidad y derechos ARCO

---

## 8. Generación de PDF

Los PDFs se generan 100% en el cliente usando `jsPDF` + `html2canvas`:
1. El componente `DocumentPreview` renderiza el documento con diseño visual completo
2. `html2canvas` captura el DOM como imagen
3. `jsPDF` embebe la imagen en un PDF descargable
4. El PDF incluye QR code con los datos de la factura (generado con `qrcode.react`)

Ventajas: no requiere servidor para PDFs, funciona offline una vez cargada la app.

---

## 9. Numeración Correlativa

El sistema garantiza numeración correlativa por tipo y año fiscal:

```
FAC-2026-001, FAC-2026-002, FAC-2026-003...
PRE-2026-001, PRE-2026-002...
ABO-2026-001, ABO-2026-002...
```

Algoritmo:
1. Consulta el último número del tipo y año en curso (`ORDER BY number DESC LIMIT 1`)
2. Extrae el sufijo numérico y suma 1
3. Formatea con cero-padding a 3 dígitos (`padStart(3, '0')`)
4. Las facturas con estado Emitida/Pagada no pueden borrarse, garantizando que no hay huecos en la numeración oficial

---

## 10. PWA (Progressive Web App)

- **Manifest**: nombre, iconos, colores, modo standalone
- **Service Worker**: caché de assets para funcionamiento offline (desactivado en desarrollo)
- **Instalable**: puede añadirse a la pantalla de inicio en móvil y escritorio
- **Theme color**: `#0F172A` (slate-950)

---

## 11. Roadmap — VeriFactu (RD 1007/2023)

El Real Decreto 1007/2023 establece la obligación de sistemas de trazabilidad fiscal para software de facturación. Faktio 2026 tiene previsto:

| Fase | Estado | Descripción |
|------|--------|-------------|
| Inalterabilidad | ✅ Implementado | Middleware que impide modificar facturas emitidas |
| Hash de documentos | 🔄 En desarrollo | Firma SHA-256 de cada factura en el momento de emisión |
| Registro de eventos | 🔄 En desarrollo | Log inmutable de creación/modificación de documentos |
| Envío a AEAT | 📅 Planificado | Integración con el sistema VeriFactu de la Agencia Tributaria |
| Código QR de verificación | ✅ Implementado | QR en cada factura con datos fiscales verificables |

---

## 12. Variables de Entorno

```env
DATABASE_URL=postgresql://user:password@host:5432/faktio
JWT_SECRET=clave_secreta_larga_y_segura
PORT=3000
```

---

## 13. Instalación y Ejecución

```bash
# Instalar dependencias
npm install

# Configurar variables de entorno
cp .env.example .env
# Editar .env con DATABASE_URL y JWT_SECRET

# Modo desarrollo (frontend + backend juntos)
npm run dev

# Compilar para producción
npm run build

# Ejecutar en producción
NODE_ENV=production node dist/server.js
```

---

## 14. Estructura de Carpetas

```
/
├── server.ts                 # Servidor Express completo (API REST)
├── src/
│   ├── main.tsx              # Punto de entrada React
│   ├── App.tsx               # Routing, sidebar, layout principal
│   ├── types.ts              # Interfaces TypeScript compartidas
│   ├── index.css             # Estilos globales y clases glass
│   └── components/
│       ├── AuthView.tsx      # Login, registro, PIN, seed, recuperación
│       ├── DashboardView.tsx # KPIs fiscales y actividad reciente
│       ├── DocumentEditor.tsx# Editor de facturas/presupuestos/abonos
│       ├── DocumentPreview.tsx# Vista previa y generación PDF
│       ├── HistoryView.tsx   # Historial de facturas
│       ├── BudgetsView.tsx   # Gestión de presupuestos
│       ├── AbonosView.tsx    # Gestión de abonos
│       ├── ExpensesView.tsx  # Gastos deducibles
│       ├── SettingsView.tsx  # Configuración y seguridad
│       └── common/
│           ├── Card.tsx      # Componente base de tarjeta
│           ├── Header.tsx    # Cabecera con notificaciones
│           └── ErrorBoundary.tsx # Captura de errores React
├── public/
│   ├── logo-512.png          # Logotipo de la aplicación
│   ├── politicas.html        # Política de privacidad y términos
│   ├── manifest.json         # PWA manifest
│   └── sw.js                 # Service Worker
└── uploads/                  # Tickets y logos subidos (gitignored)
```

---

## 15. Cumplimiento Normativo

| Norma | Estado | Implementación |
|-------|--------|---------------|
| RGPD (UE) 2016/679 | ✅ | Consentimiento en registro, política de privacidad, derechos ARCO |
| LOPDGDD (LO 3/2018) | ✅ | Adaptación española del RGPD |
| Ley 11/2021 (Antifraude) | ✅ | Inalterabilidad de facturas emitidas |
| RD 1007/2023 (VeriFactu) | 🔄 | En desarrollo — inalterabilidad implementada |
| Modelo 303 IVA | ✅ | Cálculo automático IVA repercutido/soportado |
| Modelo 130 IRPF | ✅ | Cálculo retenciones para autónomos |
| Factura Rectificativa | ✅ | Flujo completo de abono con trazabilidad |

---

*Faktio 2026 · Mago Blanco Digital · Madrid, España*
*Repositorio: github.com/MAGOBLANCO28/sistema-facturacion-presupuesto*
