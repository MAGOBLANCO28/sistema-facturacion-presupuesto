---
title: Faktio 2026
emoji: ⚡
colorFrom: purple
colorTo: blue
sdk: docker
pinned: false
---

# Faktio 2026

Sistema de facturación y presupuestos conforme a la normativa española (RGPD · LOPDGDD · Pre-VeriFactu RD 1007/2023).

**Demo en producción:** https://magoblancodigital-faktio-2026.hf.space

---

## Stack Tecnológico

### Frontend
| Tecnología | Versión | Uso |
|---|---|---|
| React | 19 | Componentes y vistas de la interfaz |
| TypeScript | 5.8 | Tipado estático para mayor seguridad y mantenibilidad |
| Vite | 6.2 | Compilación y build del proyecto |
| Tailwind CSS | 4.1 | Estilos y diseño responsive (mobile-first) |
| jsPDF + html2canvas | — | Generación de PDFs en el navegador sin pasar por el servidor |
| Framer Motion | — | Animaciones de interfaz |

### Backend
| Tecnología | Versión | Uso |
|---|---|---|
| Node.js + Express | — | Servidor REST API |
| TypeScript | 5.8 | Tipado en el servidor |
| PostgreSQL | 15 | Base de datos relacional en la nube (Neon) |
| Multer | — | Gestión de subida de archivos |
| Google Gemini API | — | OCR para extracción de datos de tickets de gastos |

### Infraestructura
| Tecnología | Uso |
|---|---|
| Docker | Contenerización del servidor y build de producción |
| HuggingFace Spaces | Hosting de la aplicación en producción |
| Neon (PostgreSQL cloud) | Base de datos persistente en la nube |

---

## Funcionalidades

- **Facturación** — Creación, edición y numeración automática de facturas (FAC-YYYY-XXX)
- **Presupuestos** — Gestión de presupuestos con conversión a factura (PRE-YYYY-XXX)
- **Abonos** — Documentos de abono vinculados a facturas (ABO-YYYY-XXX)
- **Gastos** — Registro de gastos con OCR automático desde foto o PDF de ticket
- **Generación de PDF** — Exportación de documentos al instante en el navegador
- **Dashboard** — Resumen financiero con métricas de ingresos y gastos
- **Configuración** — Datos de empresa, logo, pie de página personalizable
- **Diseño responsive** — Funciona en escritorio y móvil

---

## Seguridad

- **Autenticación obligatoria** — No se puede acceder a ningún dato sin usuario y contraseña válidos
- **HTTPS** — Toda la comunicación está cifrada (provisto por HuggingFace Spaces)
- **Variables de entorno** — Las credenciales de base de datos y API keys nunca están en el código fuente ni en el frontend; se configuran como secretos en el servidor
- **Entorno aislado** — La aplicación corre en un contenedor Docker, separada del sistema operativo del host
- **Base de datos privada** — PostgreSQL no es accesible públicamente; solo el servidor puede conectarse a ella

---

## Arquitectura

```
navegador (React + Vite)
        │
        │  HTTPS
        ▼
  servidor Express (Docker / HuggingFace)
        │
        │  conexión privada TLS
        ▼
  PostgreSQL 15 (Neon Cloud)
```

El frontend se compila como archivos estáticos que el propio servidor Express sirve en producción. No hay separación de hosts: todo corre en el mismo contenedor Docker.

---

## Instalación local

```bash
# 1. Clonar el repositorio
git clone https://github.com/tu-usuario/sistema-facturacion-presupuesto.git
cd sistema-facturacion-presupuesto

# 2. Instalar dependencias
npm install

# 3. Configurar variables de entorno
cp .env.example .env
# Editar .env con los datos de tu base de datos PostgreSQL

# 4. Iniciar en modo desarrollo
npm run dev        # frontend (Vite)
npm run server     # backend (Express)
```

## Despliegue con Docker

```bash
docker build -t faktio .
docker run -p 7860:7860 --env-file .env faktio
```

---

## Normativa aplicada

- **RGPD / LOPDGDD** — Protección de datos de clientes
- **RD 1007/2023 (Pre-VeriFactu)** — Formato y requisitos de facturación electrónica española
- **Numeración correlativa** — Series independientes por tipo de documento (FAC / PRE / ABO)
