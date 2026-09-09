import 'dotenv/config';
import express from "express";
import { createServer as createViteServer } from "vite";
import { Pool } from "pg";
import path from "path";
import { fileURLToPath } from "url";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import multer from "multer";
import { GoogleGenerativeAI } from "@google/generative-ai";
import fs from "fs";
import nodemailer from "nodemailer";
import cron from "node-cron";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const JWT_SECRET = process.env.JWT_SECRET || "fallback_secret";

// Carpeta uploads
const uploadsDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir);

// Configuración multer
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (req: any, file, cb) => {
    const ext = path.extname(file.originalname);
    if (file.fieldname === 'logo') {
      cb(null, `logo_${req.tenantId}${ext}`);
    } else {
      cb(null, `ticket_${req.tenantId}_${Date.now()}${ext}`);
    }
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB máximo (cubre PDFs grandes)
  fileFilter: (_req, file, cb) => {
    const allowed = [
      'image/jpeg', 'image/png', 'image/webp', 'image/gif',
      'application/pdf'
    ];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Formato no soportado: ${file.mimetype}. Usa JPG, PNG, WEBP o PDF.`));
    }
  },
});

// Inicializar tablas
async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tenants (
      id SERIAL PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      security_pin TEXT, -- PIN de 4 dígitos
      recovery_seed TEXT, -- Frase de 12 palabras (hash)
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS settings (
      id SERIAL PRIMARY KEY,
      tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE,
      company_name TEXT,
      owner_name TEXT,
      cif TEXT,
      phone TEXT,
      email TEXT,
      address TEXT,
      city TEXT,
      province TEXT,
      zip TEXT, -- Añadido para CP
      logo_url TEXT,
      UNIQUE(tenant_id)
    );

    CREATE TABLE IF NOT EXISTS documents (
      id SERIAL PRIMARY KEY,
      tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE,
      type TEXT,
      number TEXT,
      date TEXT,
      client_name TEXT,
      client_dni TEXT,
      client_address TEXT,
      client_city TEXT,
      client_zip TEXT, -- Añadido para CP
      client_province TEXT, -- Añadido para Provincia
      items JSONB,
      subtotal REAL,
      iva_rate REAL,
      iva_amount REAL,
      total REAL,
      status TEXT DEFAULT 'Borrador',
      is_rectificative BOOLEAN DEFAULT FALSE,
      original_invoice_id INTEGER REFERENCES documents(id),
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS expenses (
      id SERIAL PRIMARY KEY,
      tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE,
      description TEXT,
      amount REAL,
      iva_amount REAL,
      iva_rate REAL,
      category TEXT,
      date TEXT,
      ticket_image_url TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  // Migraciones / Actualizaciones de esquema
  await pool.query(`
    ALTER TABLE tenants ADD COLUMN IF NOT EXISTS security_pin TEXT;
    ALTER TABLE tenants ADD COLUMN IF NOT EXISTS recovery_seed TEXT;
    ALTER TABLE documents ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'Borrador';
    ALTER TABLE documents ADD COLUMN IF NOT EXISTS is_rectificative BOOLEAN DEFAULT FALSE;
    ALTER TABLE documents ADD COLUMN IF NOT EXISTS original_invoice_id INTEGER REFERENCES documents(id);
    ALTER TABLE settings ADD COLUMN IF NOT EXISTS logo_url TEXT;
    ALTER TABLE settings ADD COLUMN IF NOT EXISTS zip TEXT;
    ALTER TABLE settings ADD COLUMN IF NOT EXISTS account_type TEXT DEFAULT 'autonomo';
    ALTER TABLE settings ADD COLUMN IF NOT EXISTS irpf_rate INTEGER DEFAULT 15;
    ALTER TABLE documents ADD COLUMN IF NOT EXISTS client_zip TEXT;
    ALTER TABLE documents ADD COLUMN IF NOT EXISTS client_province TEXT;
    ALTER TABLE documents DROP CONSTRAINT IF EXISTS documents_status_check;
    ALTER TABLE documents DROP CONSTRAINT IF EXISTS documents_type_check;
    ALTER TABLE documents ADD COLUMN IF NOT EXISTS irpf_rate REAL DEFAULT 0;
    ALTER TABLE documents ADD COLUMN IF NOT EXISTS irpf_amount REAL DEFAULT 0;
    ALTER TABLE expenses ADD COLUMN IF NOT EXISTS provider TEXT;
    ALTER TABLE expenses ADD COLUMN IF NOT EXISTS nif TEXT;
    ALTER TABLE expenses ADD COLUMN IF NOT EXISTS base_amount REAL;
    ALTER TABLE documents ADD COLUMN IF NOT EXISTS fecha_vencimiento DATE;
    ALTER TABLE documents ADD COLUMN IF NOT EXISTS recordatorio_cobro_at TIMESTAMPTZ;
    ALTER TABLE documents ADD COLUMN IF NOT EXISTS client_email TEXT;
    ALTER TABLE settings ADD COLUMN IF NOT EXISTS notification_email TEXT;
    ALTER TABLE settings ADD COLUMN IF NOT EXISTS recordatorios_cobros BOOLEAN DEFAULT true;
    ALTER TABLE settings ADD COLUMN IF NOT EXISTS recordatorios_impuestos BOOLEAN DEFAULT true;
    ALTER TABLE settings ADD COLUMN IF NOT EXISTS dias_aviso_cobro INTEGER DEFAULT 3;
    ALTER TABLE settings ADD COLUMN IF NOT EXISTS website TEXT;
  `);

  console.log("✅ Base de datos lista");
}

// ── EMAIL UTILITY (via n8n webhook) ───────────────────
async function enviarEmail(to: string, subject: string, html: string): Promise<boolean> {
  const n8nUrl = process.env.N8N_WEBHOOK_URL || 'https://automation.magoblancodigital.link/webhook/faktio-email';
  try {
    const response = await fetch(n8nUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to, subject, html }),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    console.log(`[EMAIL] ✅ Enviado via n8n a ${to}: ${subject}`);
    return true;
  } catch (err) {
    console.error(`[EMAIL] ❌ Error enviando via n8n a ${to}:`, err);
    return false;
  }
}

// ── GEMINI: GENERADOR EMAIL COBRO ─────────────────────
async function generarEmailCobro(
  companyName: string,
  clientName: string,
  invoiceNumber: string,
  total: number,
  diasDiff: number,
  fechaVencimientoStr: string,
  companyPhone?: string,
  companyEmail?: string,
  companyWebsite?: string
): Promise<{ subject: string; html: string }> {
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
  const estado = diasDiff > 0 ? `vencida hace ${diasDiff} días` : diasDiff === 0 ? 'vence HOY' : `vence en ${Math.abs(diasDiff)} días`;
  const contactParts = [companyPhone, companyEmail, companyWebsite].filter(Boolean);
  const contactoInfo = contactParts.length > 0
    ? `- Datos de contacto de la empresa: ${contactParts.join(' | ')}`
    : '- Contacto: el cliente puede responder a este correo';
  const prompt = `Eres el sistema de cobros de una empresa. Genera un email profesional y cordial de recordatorio de pago en español.

Datos:
- Empresa emisora: ${companyName}
- Cliente: ${clientName}
- Número de factura: ${invoiceNumber}
- Importe total: ${total.toFixed(2)} €
- Fecha de vencimiento: ${fechaVencimientoStr} (${estado})
${contactoInfo}

Instrucciones:
- Si la factura está vencida: tono firme pero respetuoso
- Si vence pronto: tono amable y preventivo
- Incluir número de factura e importe
- Para contactar, usar SOLO los datos de contacto proporcionados arriba. NO inventar teléfonos, webs ni emails
- HTML con estilos inline, sin DOCTYPE/html/body, solo contenido interior

Responde ÚNICAMENTE con JSON válido sin markdown:
{"subject":"asunto","body":"html_del_cuerpo"}`;

  try {
    const result = await model.generateContent(prompt);
    const text = result.response.text().trim().replace(/^```json\n?|```$/g, '');
    const json = JSON.parse(text);
    return { subject: json.subject, html: json.body };
  } catch {
    const tono = diasDiff > 0 ? 'le recordamos que tiene pendiente el pago' : 'le informamos que próximamente vence';
    return {
      subject: `Recordatorio de pago — Factura ${invoiceNumber}`,
      html: `<div style="font-family:Arial,sans-serif;color:#1e293b;max-width:600px;margin:0 auto">
        <div style="background:#4f46e5;padding:24px;border-radius:8px 8px 0 0">
          <h2 style="color:#fff;margin:0">Recordatorio de Pago</h2>
        </div>
        <div style="padding:24px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 8px 8px">
          <p>Estimado/a <strong>${clientName}</strong>,</p>
          <p>${tono} de la factura <strong>${invoiceNumber}</strong> por importe de <strong>${total.toFixed(2)} €</strong>, con fecha de vencimiento el ${fechaVencimientoStr}.</p>
          <p>Si ya realizó el pago, ignore este mensaje. En caso contrario, le rogamos que lo gestione a la mayor brevedad posible.</p>
          <p>Muchas gracias por su colaboración.</p>
          <p style="color:#64748b">Atentamente,<br><strong>${companyName}</strong></p>
        </div>
      </div>`
    };
  }
}

// ── GEMINI: GENERADOR EMAIL IMPUESTO ─────────────────
async function generarEmailImpuesto(
  companyName: string,
  modeloNombre: string,
  diasRestantes: number,
  fechaVencimientoStr: string,
  accountType: 'autonomo' | 'sl' = 'autonomo',
  ivaNeto?: number,
  irpfTotal?: number
): Promise<{ subject: string; html: string }> {
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
  const urgencia = diasRestantes <= 3 ? 'MUY URGENTE' : diasRestantes <= 7 ? 'URGENTE' : 'AVISO PREVENTIVO';
  const tipoEntidad = accountType === 'sl' ? 'Sociedad Limitada' : 'autónomo/a';
  const prompt = `Eres el asistente fiscal de Faktio. Genera un email de alerta fiscal en español para una ${tipoEntidad}.

Datos:
- Empresa: ${companyName} (${tipoEntidad})
- Modelo fiscal a presentar: ${modeloNombre}
- Fecha límite: ${fechaVencimientoStr}
- Días restantes: ${diasRestantes} (${urgencia})
${ivaNeto !== undefined ? `- IVA neto a pagar estimado (Modelo 303): ${ivaNeto.toFixed(2)} €` : ''}
${irpfTotal !== undefined ? `- IRPF retenido acumulado (Modelo 130): ${irpfTotal.toFixed(2)} €` : ''}

El email debe:
1. Alertar sobre el vencimiento con urgencia proporcional a los días restantes
2. Explicar qué modelo presentar y ante qué organismo (AEAT) y qué implica para este tipo de empresa
3. Listar 3-4 pasos prácticos para preparar la presentación
4. Si hay importes, mencionar las cifras estimadas

HTML con estilos inline, sin DOCTYPE/html/body.
Responde ÚNICAMENTE con JSON válido sin markdown:
{"subject":"asunto","body":"html_del_cuerpo"}`;

  try {
    const result = await model.generateContent(prompt);
    const text = result.response.text().trim().replace(/^```json\n?|```$/g, '');
    const json = JSON.parse(text);
    return { subject: json.subject, html: json.body };
  } catch {
    const emoji = diasRestantes <= 3 ? '🚨' : diasRestantes <= 7 ? '⚠️' : '📅';
    return {
      subject: `${emoji} Vencimiento fiscal: ${modeloNombre} — ${diasRestantes} días`,
      html: `<div style="font-family:Arial,sans-serif;color:#1e293b;max-width:600px;margin:0 auto">
        <div style="background:#dc2626;padding:24px;border-radius:8px 8px 0 0">
          <h2 style="color:#fff;margin:0">${emoji} Alerta Fiscal — Faktio</h2>
        </div>
        <div style="padding:24px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 8px 8px">
          <p>Estimado/a <strong>${companyName}</strong>,</p>
          <p>Le recordamos que el plazo para presentar el <strong>${modeloNombre}</strong> vence el <strong>${fechaVencimientoStr}</strong> (en <strong>${diasRestantes} días</strong>).</p>
          ${ivaNeto !== undefined ? `<p>IVA neto estimado a ingresar: <strong>${ivaNeto.toFixed(2)} €</strong></p>` : ''}
          ${irpfTotal !== undefined ? `<p>IRPF retenido acumulado: <strong>${irpfTotal.toFixed(2)} €</strong></p>` : ''}
          <p><strong>Pasos a seguir:</strong></p>
          <ol>
            <li>Reúna todas las facturas emitidas y gastos del trimestre</li>
            <li>Acceda a la sede electrónica de la AEAT (sede.agenciatributaria.gob.es)</li>
            <li>Complete y presente el modelo antes de la fecha límite</li>
            <li>Guarde el justificante de presentación</li>
          </ol>
          <p style="color:#64748b">Un saludo,<br><strong>Faktio — Tu Copiloto Fiscal</strong></p>
        </div>
      </div>`
    };
  }
}

// ── VENCIMIENTOS FISCALES ESPAÑOLES ──────────────────
function getVencimientosFiscales(accountType: 'autonomo' | 'sl' = 'autonomo') {
  const hoy = new Date();
  const year = hoy.getFullYear();

  // Returns next upcoming occurrence of a given month/day (advances to next year if past)
  const proxima = (month: number, day: number): Date => {
    const d = new Date(year, month - 1, day);
    return d >= hoy ? d : new Date(year + 1, month - 1, day);
  };

  // Modelo 303 (IVA trimestral) — obligatorio para todos
  const q303 = [
    { nombre: 'Modelo 303 — IVA Trimestral (Q1: ene–mar)', fecha: proxima(4, 20), trimestre: 'Q1' },
    { nombre: 'Modelo 303 — IVA Trimestral (Q2: abr–jun)', fecha: proxima(7, 20), trimestre: 'Q2' },
    { nombre: 'Modelo 303 — IVA Trimestral (Q3: jul–sep)', fecha: proxima(10, 20), trimestre: 'Q3' },
    { nombre: 'Modelo 303 — IVA Trimestral (Q4: oct–dic)', fecha: proxima(1, 30), trimestre: 'Q4' },
  ];

  // Modelos exclusivos de autónomos (estimación directa)
  const autonomoModels = [
    ...q303,
    { nombre: 'Modelo 130 — IRPF Trimestral (Q1: ene–mar)', fecha: proxima(4, 20), trimestre: 'Q1' },
    { nombre: 'Modelo 130 — IRPF Trimestral (Q2: abr–jun)', fecha: proxima(7, 20), trimestre: 'Q2' },
    { nombre: 'Modelo 130 — IRPF Trimestral (Q3: jul–sep)', fecha: proxima(10, 20), trimestre: 'Q3' },
    { nombre: 'Modelo 130 — IRPF Trimestral (Q4: oct–dic)', fecha: proxima(1, 30), trimestre: 'Q4' },
    { nombre: 'Modelo 100 — Declaración de la Renta (IRPF anual)', fecha: proxima(6, 30), trimestre: 'Anual' },
    { nombre: 'Modelo 390 — Resumen anual de IVA', fecha: proxima(1, 30), trimestre: 'Anual' },
  ];

  // Modelos exclusivos de Sociedades Limitadas / S.A.
  const slModels = [
    ...q303,
    { nombre: 'Modelo 202 — IS 1er pago fraccionado (abr)', fecha: proxima(4, 20), trimestre: 'IS-P1' },
    { nombre: 'Modelo 202 — IS 2º pago fraccionado (oct)', fecha: proxima(10, 20), trimestre: 'IS-P2' },
    { nombre: 'Modelo 202 — IS 3er pago fraccionado (dic)', fecha: proxima(12, 20), trimestre: 'IS-P3' },
    { nombre: 'Modelo 200 — Impuesto sobre Sociedades (anual)', fecha: proxima(7, 25), trimestre: 'Anual' },
    { nombre: 'Modelo 390 — Resumen anual de IVA', fecha: proxima(1, 30), trimestre: 'Anual' },
  ];

  const deadlines = accountType === 'sl' ? slModels : autonomoModels;

  return deadlines
    .filter(d => d.fecha >= hoy)
    .map(d => ({
      ...d,
      fecha: d.fecha.toISOString().split('T')[0],
      diasRestantes: Math.ceil((d.fecha.getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24)),
    }))
    .sort((a, b) => a.diasRestantes - b.diasRestantes);
}

// ── AGENTE IA: RECORDATORIO DE COBROS ────────────────
async function ejecutarAgenteCobros() {
  console.log('[AGENTE COBROS] Iniciando revision...');
  try {
    const tenants = await pool.query(`
      SELECT t.id, s.company_name, s.notification_email, s.email, s.phone, s.website,
             s.recordatorios_cobros, s.dias_aviso_cobro
      FROM tenants t
      JOIN settings s ON t.id = s.tenant_id
      WHERE (s.recordatorios_cobros IS NULL OR s.recordatorios_cobros = true)
    `);

    console.log(`[AGENTE COBROS] Tenants encontrados: ${tenants.rows.length}`);

    for (const tenant of tenants.rows) {
      const destinatario = tenant.notification_email || tenant.email;
      console.log(`[AGENTE COBROS] Tenant ${tenant.id} | email: ${destinatario || 'SIN EMAIL'} | recordatorios: ${tenant.recordatorios_cobros}`);
      if (!destinatario) { console.log('[AGENTE COBROS] Saltando tenant sin email'); continue; }

      const diasAviso = tenant.dias_aviso_cobro ?? 3;
      const docs = await pool.query(`
        SELECT * FROM documents
        WHERE tenant_id = $1
          AND type = 'invoice'
          AND status = 'Emitida'
          AND fecha_vencimiento IS NOT NULL
          AND fecha_vencimiento <= CURRENT_DATE + INTERVAL '${diasAviso} days'
          AND (recordatorio_cobro_at IS NULL OR recordatorio_cobro_at < NOW() - INTERVAL '3 days')
        ORDER BY fecha_vencimiento ASC
        LIMIT 20
      `, [tenant.id]);

      console.log(`[AGENTE COBROS] Facturas encontradas: ${docs.rows.length} (dias_aviso: ${diasAviso})`);
      if (docs.rows.length === 0) {
        const allDocs = await pool.query(
          `SELECT number, status, fecha_vencimiento FROM documents WHERE tenant_id = $1 AND type = 'invoice' LIMIT 10`,
          [tenant.id]
        );
        console.log('[AGENTE COBROS] Facturas en BD:', JSON.stringify(allDocs.rows));
      }

      for (const doc of docs.rows) {
        const vencimiento = new Date(doc.fecha_vencimiento);
        const hoy = new Date();
        hoy.setHours(0, 0, 0, 0);
        const diasDiff = Math.floor((hoy.getTime() - vencimiento.getTime()) / (1000 * 60 * 60 * 24));
        const fechaStr = new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: 'long', year: 'numeric' }).format(vencimiento);

        const { subject, html } = await generarEmailCobro(
          tenant.company_name || 'Tu empresa',
          doc.client_name,
          doc.number,
          doc.total,
          diasDiff,
          fechaStr,
          tenant.phone || undefined,
          tenant.email || undefined,
          tenant.website || undefined
        );

        const emailDestino = doc.client_email || destinatario;
        await enviarEmail(emailDestino, subject, html);
        await pool.query(
          'UPDATE documents SET recordatorio_cobro_at = NOW() WHERE id = $1',
          [doc.id]
        );
        console.log(`[AGENTE COBROS] 📧 Recordatorio enviado — Factura ${doc.number} — Cliente: ${doc.client_name}`);
      }
    }
    console.log('[AGENTE COBROS] ✅ Revisión completada.');
  } catch (err) {
    console.error('[AGENTE COBROS] ❌ Error:', err);
  }
}

// ── AGENTE IA: RECORDATORIO DE IMPUESTOS ─────────────
async function ejecutarAgenteImpuestos() {
  console.log('[AGENTE IMPUESTOS] 🤖 Iniciando revisión...');
  try {
    const tenants = await pool.query(`
      SELECT t.id, s.company_name, s.notification_email, s.email,
             s.recordatorios_impuestos, s.account_type, s.irpf_rate
      FROM tenants t
      JOIN settings s ON t.id = s.tenant_id
      WHERE (s.recordatorios_impuestos IS NULL OR s.recordatorios_impuestos = true)
    `);

    for (const tenant of tenants.rows) {
      const destinatario = tenant.notification_email || tenant.email;
      if (!destinatario) continue;

      const accountType: 'autonomo' | 'sl' = tenant.account_type === 'sl' ? 'sl' : 'autonomo';
      const vencimientos = getVencimientosFiscales(accountType);
      const proximos = vencimientos.filter(v => v.diasRestantes <= 15);
      if (proximos.length === 0) continue;

      // Obtener datos fiscales del trimestre para contextualizar el email
      let ivaNeto: number | undefined;
      let irpfTotal: number | undefined;
      try {
        const report = await pool.query(`
          SELECT
            COALESCE(SUM(iva_amount), 0) AS iva_repercutido,
            COALESCE(SUM(irpf_amount), 0) AS irpf_retenido
          FROM documents
          WHERE tenant_id = $1 AND type = 'invoice'
            AND status IN ('Emitida', 'Pagada')
            AND date >= date_trunc('quarter', CURRENT_DATE)::text
        `, [tenant.id]);
        const expReport = await pool.query(`
          SELECT COALESCE(SUM(iva_amount), 0) AS iva_soportado
          FROM expenses WHERE tenant_id = $1
            AND date >= date_trunc('quarter', CURRENT_DATE)::text
        `, [tenant.id]);
        ivaNeto = parseFloat(report.rows[0].iva_repercutido) - parseFloat(expReport.rows[0].iva_soportado);
        irpfTotal = accountType === 'autonomo' ? parseFloat(report.rows[0].irpf_retenido) : undefined;
      } catch {}

      for (const v of proximos) {
        const { subject, html } = await generarEmailImpuesto(
          tenant.company_name || 'Tu empresa',
          v.nombre,
          v.diasRestantes,
          new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: 'long', year: 'numeric' }).format(new Date(v.fecha)),
          accountType,
          ivaNeto,
          irpfTotal
        );
        await enviarEmail(destinatario, subject, html);
        console.log(`[AGENTE IMPUESTOS] 📧 Aviso enviado — ${v.nombre} — ${tenant.company_name} (${accountType})`);
      }
    }
    console.log('[AGENTE IMPUESTOS] ✅ Revisión completada.');
  } catch (err) {
    console.error('[AGENTE IMPUESTOS] ❌ Error:', err);
  }
}

// Middleware JWT
function authMiddleware(req: any, res: any, next: any) {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ error: "No autorizado" });
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    req.tenantId = decoded.tenantId;
    next();
  } catch {
    res.status(401).json({ error: "Token inválido" });
  }
}

// Middleware de Inalterabilidad (Pre-VeriFactu)
async function inalterabilityMiddleware(req: any, res: any, next: any) {
  if (req.method === "DELETE" || req.method === "PUT" || req.method === "PATCH") {
    const { id } = req.params;
    if (id && req.url.includes("/api/documents")) {
      const result = await pool.query(
        "SELECT status, type FROM documents WHERE id = $1 AND tenant_id = $2",
        [id, req.tenantId]
      );
      const doc = result.rows[0];
      const PROTECTED = ['Emitida', 'Pagada', 'Rectificativa'];
      if (doc && doc.type === 'invoice' && PROTECTED.includes(doc.status)) {
        return res.status(403).json({
          error: "Inalterabilidad activa: No se puede modificar/eliminar una factura emitida o pagada. Debe emitir una Factura Rectificativa."
        });
      }
    }
  }
  next();
}

async function startServer() {
  await initDB();

  // ── CRON JOBS ─────────────────────────────────────
  // Agente Cobros: cada día a las 9:00
  cron.schedule('0 9 * * *', ejecutarAgenteCobros, { timezone: 'Europe/Madrid' });
  // Agente Impuestos: cada día a las 8:00
  cron.schedule('0 8 * * *', ejecutarAgenteImpuestos, { timezone: 'Europe/Madrid' });
  console.log('⏰ Cron jobs de agentes IA activados');

  const app = express();
  app.use(express.json());

  // Servir imágenes de logos y tickets
  app.use("/uploads", express.static(uploadsDir));
  // Si express.static no encontró el archivo, devolver 404 (en vez de que Vite sirva index.html)
  app.get("/uploads/*", (_req, res) => {
    res.status(404).json({ error: "Archivo no encontrado" });
  });

  // ── SEGURIDAD AVANZADA (Fase 2.2) ─────────────────

  // 0. Verificar PIN (login con PIN)
  app.post("/api/auth/verify-pin", authMiddleware, async (req: any, res) => {
    const { pin } = req.body;
    try {
      const { rows } = await pool.query("SELECT security_pin FROM tenants WHERE id = $1", [req.tenantId]);
      if (!rows[0] || rows[0].security_pin !== pin) {
        return res.status(401).json({ error: "PIN incorrecto" });
      }
      res.json({ valid: true });
    } catch (err) {
      res.status(500).json({ error: "Error al verificar PIN" });
    }
  });

  // 1. Cambiar PIN
  app.patch("/api/auth/pin", authMiddleware, async (req: any, res) => {
    const { currentPin, newPin } = req.body;
    try {
      const { rows } = await pool.query("SELECT security_pin FROM tenants WHERE id = $1", [req.tenantId]);
      // Si ya tiene PIN, validar el actual; si no tiene PIN aún, permitir establecerlo sin validación
      if (rows[0].security_pin && rows[0].security_pin !== currentPin) {
        return res.status(400).json({ error: "PIN actual incorrecto" });
      }
      
      await pool.query("UPDATE tenants SET security_pin = $1 WHERE id = $2", [newPin, req.tenantId]);
      res.json({ message: "PIN actualizado con éxito" });
    } catch (err) {
      res.status(500).json({ error: "Error al actualizar PIN" });
    }
  });

  // 2. Obtener Semilla (Protegida por PIN)
  // Guardar semilla tras el registro (solo si aún no tiene una)
  app.post("/api/auth/seed/save", authMiddleware, async (req: any, res) => {
    const { seed } = req.body;
    if (!seed || typeof seed !== 'string') return res.status(400).json({ error: "Semilla inválida" });
    try {
      const { rows } = await pool.query("SELECT recovery_seed FROM tenants WHERE id = $1", [req.tenantId]);
      if (rows[0]?.recovery_seed) return res.json({ ok: true }); // ya tiene semilla, no sobreescribir
      await pool.query("UPDATE tenants SET recovery_seed = $1 WHERE id = $2", [seed, req.tenantId]);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: "Error al guardar semilla" });
    }
  });

  // Revelar semilla (protegida por PIN)
  app.post("/api/auth/seed", authMiddleware, async (req: any, res) => {
    const { pin } = req.body;
    try {
      const { rows } = await pool.query("SELECT security_pin, recovery_seed FROM tenants WHERE id = $1", [req.tenantId]);
      if (rows[0].security_pin !== pin) return res.status(400).json({ error: "PIN incorrecto" });
      res.json({ seed: rows[0].recovery_seed });
    } catch (err) {
      res.status(500).json({ error: "Error al recuperar semilla" });
    }
  });

  // 3. Recuperar Acceso (Validación Bancaria de 3 palabras)
  app.post("/api/auth/recover", async (req, res) => {
    const { email, indices, words, newPin, newPassword } = req.body;
    try {
      const { rows } = await pool.query("SELECT id, recovery_seed FROM tenants WHERE email = $1", [email]);
      if (rows.length === 0) return res.status(400).json({ error: "Usuario no encontrado" });
      
      const tenant = rows[0];
      const fullSeed = tenant.recovery_seed.split(" ");
      
      // Validar las 3 posiciones
      const isValid = indices.every((idx: number, i: number) => {
        return fullSeed[idx] === words[i].toLowerCase().trim();
      });

      if (!isValid) return res.status(400).json({ error: "Las palabras de seguridad no coinciden" });

      if (newPin) {
        await pool.query("UPDATE tenants SET security_pin = $1 WHERE id = $2", [newPin, tenant.id]);
        return res.json({ message: "PIN restablecido con éxito." });
      }

      if (newPassword) {
        const hash = await bcrypt.hash(newPassword, 10);
        await pool.query("UPDATE tenants SET password = $1 WHERE id = $2", [hash, tenant.id]);
        return res.json({ message: "Contraseña maestra restablecida con éxito." });
      }

      res.status(400).json({ error: "No se proporcionó nuevo PIN o Contraseña" });
    } catch (err) {
      res.status(500).json({ error: "Error en la recuperación" });
    }
  });

  // ── AUTH ──────────────────────────────────────────
  app.post("/api/auth/register", async (req, res) => {
    const { email, password } = req.body;
    try {
      const hash = await bcrypt.hash(password, 10);
      const result = await pool.query(
        "INSERT INTO tenants (email, password) VALUES ($1, $2) RETURNING id",
        [email, hash]
      );
      const tenantId = result.rows[0].id;
      await pool.query("INSERT INTO settings (tenant_id) VALUES ($1)", [tenantId]);
      const token = jwt.sign({ tenantId }, JWT_SECRET, { expiresIn: "7d" });
      res.json({ token });
    } catch (err: any) {
      if (err.code === "23505") return res.status(400).json({ error: "Email ya registrado" });
      res.status(500).json({ error: "Error al registrar" });
    }
  });

  app.post("/api/auth/login", async (req, res) => {
    const { email, password } = req.body;
    try {
      const result = await pool.query("SELECT * FROM tenants WHERE email = $1", [email]);
      const tenant = result.rows[0];
      if (!tenant) return res.status(400).json({ error: "Email o contraseña incorrectos" });
      const valid = await bcrypt.compare(password, tenant.password);
      if (!valid) return res.status(400).json({ error: "Email o contraseña incorrectos" });
      const token = jwt.sign({ tenantId: tenant.id }, JWT_SECRET, { expiresIn: "7d" });
      res.json({ token, hasPin: !!tenant.security_pin });
    } catch {
      res.status(500).json({ error: "Error al iniciar sesión" });
    }
  });

  // ── SETTINGS ──────────────────────────────────────
  app.get("/api/settings", authMiddleware, async (req: any, res) => {
    const result = await pool.query("SELECT * FROM settings WHERE tenant_id = $1", [req.tenantId]);
    res.json(result.rows[0] || {});
  });

  app.post("/api/settings", authMiddleware, async (req: any, res) => {
    const { company_name, owner_name, cif, phone, email, address, city, province, zip, account_type, irpf_rate,
            notification_email, recordatorios_cobros, recordatorios_impuestos, dias_aviso_cobro, website } = req.body;
    await pool.query(`
      UPDATE settings SET
        company_name=$1, owner_name=$2, cif=$3, phone=$4,
        email=$5, address=$6, city=$7, province=$8,
        zip=$9, account_type=$10, irpf_rate=$11,
        notification_email=$12, recordatorios_cobros=$13,
        recordatorios_impuestos=$14, dias_aviso_cobro=$15,
        website=$16
      WHERE tenant_id=$17
    `, [company_name, owner_name, cif, phone, email, address, city, province, zip,
        account_type || 'autonomo', irpf_rate || 15,
        notification_email || null,
        recordatorios_cobros !== undefined ? recordatorios_cobros : true,
        recordatorios_impuestos !== undefined ? recordatorios_impuestos : true,
        dias_aviso_cobro || 3,
        website || null,
        req.tenantId]);
    res.json({ success: true });
  });

  // ── LOGO ──────────────────────────────────────────
  app.post("/api/settings/logo", authMiddleware, upload.single("logo"), async (req: any, res) => {
    if (!req.file) return res.status(400).json({ error: "No se subió ningún archivo" });
    const logoUrl = `/uploads/${req.file.filename}`;
    await pool.query("UPDATE settings SET logo_url = $1 WHERE tenant_id = $2", [logoUrl, req.tenantId]);
    res.json({ logo_url: logoUrl });
  });

  app.delete("/api/settings/logo", authMiddleware, async (req: any, res) => {
    const result = await pool.query("SELECT logo_url FROM settings WHERE tenant_id = $1", [req.tenantId]);
    const logoUrl = result.rows[0]?.logo_url;
    if (logoUrl) {
      const filePath = path.join(__dirname, logoUrl);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      await pool.query("UPDATE settings SET logo_url = NULL WHERE tenant_id = $1", [req.tenantId]);
    }
    res.json({ success: true });
  });

  // ── NUMERACIÓN AUTOMÁTICA ─────────────────────────
  app.get("/api/next-number/:type", authMiddleware, async (req: any, res) => {
    const { type } = req.params;
    const year = new Date().getFullYear();
    let prefix: string;
    if (type === 'invoice') prefix = 'FAC';
    else if (type === 'abono') prefix = 'ABO';
    else prefix = 'PRE';

    const result = await pool.query(`
      SELECT number FROM documents
      WHERE tenant_id = $1 AND type = $2 AND number LIKE $3
      ORDER BY number DESC LIMIT 1
    `, [req.tenantId, type, `${prefix}-${year}-%`]);

    let nextNum = 1;
    if (result.rows.length > 0) {
      const lastNumber = result.rows[0].number;
      // Extraer el número final: FAC-2026-001 -> 1
      const parts = lastNumber.split('-');
      const numPart = parseInt(parts[parts.length - 1]);
      if (!isNaN(numPart)) nextNum = numPart + 1;
    }
    const formatted = `${prefix}-${year}-${String(nextNum).padStart(3, '0')}`;
    res.json({ number: formatted });
  });

  // ── DOCUMENTS ─────────────────────────────────────
  app.get("/api/documents", authMiddleware, async (req: any, res) => {
    const typeFilter = req.query.type as string | undefined;
    const params: any[] = [req.tenantId];
    let whereClause = 'd.tenant_id = $1';
    if (typeFilter) {
      params.push(typeFilter);
      whereClause += ` AND d.type = $${params.length}`;
    }
    const result = await pool.query(
      `SELECT d.*, orig.number AS original_invoice_number
       FROM documents d
       LEFT JOIN documents orig ON d.original_invoice_id = orig.id
       WHERE ${whereClause}
       ORDER BY d.created_at DESC`,
      params
    );
    res.json(result.rows);
  });

  app.post("/api/documents", authMiddleware, async (req: any, res) => {
    const { type, number, date, client_name, client_dni, client_address, client_city, client_zip, client_province, items, subtotal, iva_rate, iva_amount, total, irpf_rate, irpf_amount, status, is_rectificative, original_invoice_id, fecha_vencimiento, client_email } = req.body;
    try {
      const result = await pool.query(`
        INSERT INTO documents (tenant_id, type, number, date, client_name, client_dni, client_address, client_city, client_zip, client_province, items, subtotal, iva_rate, iva_amount, total, irpf_rate, irpf_amount, status, is_rectificative, original_invoice_id, fecha_vencimiento, client_email)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22) RETURNING id
      `, [req.tenantId, type, number, date, client_name, client_dni, client_address, client_city, client_zip, client_province, JSON.stringify(items), subtotal, iva_rate, iva_amount, total, irpf_rate || 0, irpf_amount || 0, status || (type === 'invoice' ? 'Borrador' : 'Pendiente'), is_rectificative || false, original_invoice_id || null, fecha_vencimiento || null, client_email || null]);
      res.json({ id: result.rows[0].id });
    } catch (err: any) {
      console.error('Error al crear documento:', err);
      res.status(500).json({ error: err.message || 'Error al guardar el documento' });
    }
  });

  app.patch("/api/documents/:id/status", authMiddleware, async (req: any, res) => {
    const { status } = req.body;
    const result = await pool.query(
      "UPDATE documents SET status = $1 WHERE id = $2 AND tenant_id = $3",
      [status, req.params.id, req.tenantId]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: "Documento no encontrado" });
    res.json({ success: true });
  });

  app.delete("/api/documents/:id", authMiddleware, inalterabilityMiddleware, async (req: any, res) => {
    await pool.query("DELETE FROM documents WHERE id = $1 AND tenant_id = $2", [req.params.id, req.tenantId]);
    res.json({ success: true });
  });

  // ── GASTOS (EXPENSES) ──────────────────────────────
  app.get("/api/expenses", authMiddleware, async (req: any, res) => {
    const result = await pool.query(
      "SELECT * FROM expenses WHERE tenant_id = $1 ORDER BY date DESC",
      [req.tenantId]
    );
    res.json(result.rows);
  });

  app.post("/api/expenses", authMiddleware, async (req: any, res) => {
    const { description, provider, nif, amount, base_amount, iva_amount, iva_rate, category, date, ticket_image_url } = req.body;
    const base = base_amount || parseFloat(((amount || 0) / (1 + (iva_rate || 21) / 100)).toFixed(2));
    const result = await pool.query(`
      INSERT INTO expenses (tenant_id, description, provider, nif, amount, base_amount, iva_amount, iva_rate, category, date, ticket_image_url)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id
    `, [req.tenantId, description, provider || '', nif || '', amount, base, iva_amount, iva_rate, category, date, ticket_image_url]);
    res.json({ id: result.rows[0].id });
  });

  app.delete("/api/expenses/:id", authMiddleware, async (req: any, res) => {
    await pool.query("DELETE FROM expenses WHERE id = $1 AND tenant_id = $2", [req.params.id, req.tenantId]);
    res.json({ success: true });
  });

  // ── INTELIGENCIA FISCAL REPORTE ────────────────────
  app.get("/api/reports/real-income", authMiddleware, async (req: any, res) => {
    // Configuración del tenant
    const settingsRes = await pool.query("SELECT account_type, irpf_rate FROM settings WHERE tenant_id = $1", [req.tenantId]);
    const tenantSettings = settingsRes.rows[0] || { account_type: 'autonomo', irpf_rate: 15 };
    const isAutonomo = tenantSettings.account_type !== 'sl';

    // Facturas emitidas/pagadas + abonos — IVA neto e IRPF retenido
    // Los abonos tienen importes negativos → se descuentan automáticamente al sumar
    const invoicesRes = await pool.query(
      `SELECT
        SUM(total)                             AS total_bruto,
        SUM(subtotal)                          AS subtotal,
        SUM(iva_amount)                        AS iva_repercutido,
        SUM(irpf_amount)                       AS irpf_retenido,
        SUM(total - COALESCE(irpf_amount,0))   AS total_neto_cobrado
       FROM documents
       WHERE tenant_id = $1
         AND (
           (type = 'invoice' AND status IN ('Emitida','Pagada'))
           OR
           (type = 'abono')
         )`,
      [req.tenantId]
    );

    // Facturas Pagadas + todos los abonos → base para liquidez real
    const paidRes = await pool.query(
      `SELECT
        SUM(total)                             AS total_bruto,
        SUM(subtotal)                          AS subtotal,
        SUM(iva_amount)                        AS iva_repercutido,
        SUM(irpf_amount)                       AS irpf_retenido,
        SUM(total - COALESCE(irpf_amount,0))   AS total_neto_cobrado
       FROM documents
       WHERE tenant_id = $1
         AND (
           (type = 'invoice' AND status = 'Pagada')
           OR
           (type = 'abono')
         )`,
      [req.tenantId]
    );

    // Gastos totales
    const expensesRes = await pool.query(
      `SELECT
        SUM(amount) as total,
        SUM(COALESCE(base_amount, amount / (1 + COALESCE(iva_rate,21)/100))) as base_total,
        SUM(COALESCE(iva_amount,0)) as iva_soportado
       FROM expenses WHERE tenant_id = $1`,
      [req.tenantId]
    );

    const paid = paidRes.rows[0];
    const all = invoicesRes.rows[0];
    const exp = expensesRes.rows[0];

    const totalIncomeBruto = parseFloat(paid.total_bruto || 0);
    const totalIncomeBase = parseFloat(paid.subtotal || 0);
    const ivaRepercutido = parseFloat(all.iva_repercutido || 0);  // de todas las emitidas/pagadas
    const irpfRetenido = parseFloat(all.irpf_retenido || 0);      // IRPF ya retenido por clientes
    const totalNetoRecibido = parseFloat(paid.total_neto_cobrado || 0); // lo que realmente entró en cuenta

    const totalExpense = parseFloat(exp.total || 0);
    const expenseBase = parseFloat(exp.base_total || 0);
    const ivaSoportado = parseFloat(exp.iva_soportado || 0);

    // IVA neto (Modelo 303): positivo = debemos a Hacienda, negativo = Hacienda nos debe
    const ivaNeto = ivaRepercutido - ivaSoportado;

    // Beneficio bruto (base ingresos - base gastos)
    const beneficioBruto = totalIncomeBase - expenseBase;

    // Liquidez real:
    // Para autónomo: lo cobrado neto (sin IRPF) - gastos pagados - IVA neto pendiente
    // Para SL: lo cobrado bruto - gastos pagados - IVA neto pendiente
    const ivaAPagar = Math.max(0, ivaNeto);
    const realSalary = totalNetoRecibido - totalExpense - ivaAPagar;

    res.json({
      totalIncome: totalIncomeBruto,
      totalIncomeBase,
      totalExpense,
      expenseBase,
      ivaRepercutido,
      ivaSoportado,
      ivaNeto,
      ivaToPay: ivaAPagar,
      irpfRetenido: isAutonomo ? irpfRetenido : 0,
      realSalary,
      netProfit: beneficioBruto,
      isAutonomo,
    });
  });

  // ── EXPORTACIÓN CSV ───────────────────────────────
  app.get("/api/export/incomes", authMiddleware, async (req: any, res) => {
    const result = await pool.query(
      `SELECT number, date, client_name, client_dni, subtotal, iva_rate, iva_amount, irpf_rate, irpf_amount, total, status
       FROM documents WHERE tenant_id = $1 AND type = 'invoice' ORDER BY date ASC`,
      [req.tenantId]
    );
    const rows = result.rows;
    const headers = ['Número','Fecha','Cliente','NIF/CIF Cliente','Base (€)','IVA %','IVA (€)','IRPF %','IRPF (€)','Total (€)','Cobrado Neto (€)','Estado'];
    const lines = rows.map(r => [
      r.number,
      r.date,
      r.client_name,
      r.client_dni || '',
      (r.subtotal || 0).toFixed(2),
      (r.iva_rate || 0).toString(),
      (r.iva_amount || 0).toFixed(2),
      (r.irpf_rate || 0).toString(),
      (r.irpf_amount || 0).toFixed(2),
      (r.total || 0).toFixed(2),
      ((r.total || 0) - (r.irpf_amount || 0)).toFixed(2),
      r.status,
    ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(';'));

    const csv = [headers.join(';'), ...lines].join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="libro_ingresos.csv"');
    res.send('\uFEFF' + csv); // BOM para Excel español
  });

  app.get("/api/export/expenses", authMiddleware, async (req: any, res) => {
    const result = await pool.query(
      `SELECT date, description, provider, nif, category, base_amount, iva_rate, iva_amount, amount
       FROM expenses WHERE tenant_id = $1 ORDER BY date ASC`,
      [req.tenantId]
    );
    const rows = result.rows;
    const headers = ['Fecha','Concepto','Proveedor','NIF/CIF','Categoría','Base (€)','IVA %','IVA (€)','Total (€)'];
    const lines = rows.map(r => [
      r.date,
      r.description,
      r.provider || '',
      r.nif || '',
      r.category,
      (r.base_amount || 0).toFixed(2),
      (r.iva_rate || 0).toString(),
      (r.iva_amount || 0).toFixed(2),
      (r.amount || 0).toFixed(2),
    ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(';'));

    const csv = [headers.join(';'), ...lines].join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="libro_gastos.csv"');
    res.send('\uFEFF' + csv);
  });

  // ── OCR INTELIGENTE (Gemini Vision) ────────────────
  app.post("/api/expenses/ocr", authMiddleware, (req: any, res: any, next: any) => {
    upload.single("ticket")(req, res, (err: any) => {
      if (err instanceof multer.MulterError) {
        return res.status(400).json({ error: `Archivo demasiado grande. Máximo 20MB permitido.` });
      } else if (err) {
        return res.status(400).json({ error: err.message });
      }
      next();
    });
  }, async (req: any, res: any) => {
    if (!req.file) return res.status(400).json({ error: "No se recibió el archivo. Asegúrate de subir JPG, PNG, WEBP o PDF." });

    try {
      const fileBuffer = fs.readFileSync(req.file.path);
      const imageData = fileBuffer.toString("base64");
      const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

      const prompt = `Eres un experto contable español. Analiza MINUCIOSAMENTE este documento fiscal español (ticket, factura, albarán, recibo o cualquier documento con importes) y extrae TODOS los datos que puedas encontrar.

BUSCA ACTIVAMENTE en TODO el documento:
- NIF/CIF: cualquier código fiscal (formato: letra+8dígitos como B12345678, o 8dígitos+letra como 12345678A, o X1234567A para extranjeros). Aparece a menudo como "NIF:", "CIF:", "C.I.F:", "N.I.F:", o simplemente junto al nombre de empresa/proveedor.
- Importes: busca "Total", "TOTAL", "Importe", "Base imponible", "IVA", "Cuota", símbolo €, cualquier número con decimales que parezca un precio.
- Fecha: en cualquier formato (DD/MM/YYYY, YYYY-MM-DD, DD-MM-YY, texto como "26 de marzo de 2026", etc.)

Devuelve ÚNICAMENTE este JSON (sin markdown, sin texto extra):
{
  "description": "concepto principal del gasto, máximo 60 caracteres",
  "provider": "nombre completo de la empresa o autónomo emisor",
  "nif": "NIF o CIF del emisor como string, o null si no aparece en ningún lugar del documento",
  "amount": número decimal del importe TOTAL con IVA incluido (ej: 45.50),
  "base_amount": número decimal de la base imponible sin IVA,
  "iva_rate": número entero del porcentaje de IVA (21, 10, 4 o 0),
  "iva_amount": número decimal del importe de IVA,
  "date": "fecha en formato YYYY-MM-DD",
  "category": "una de estas exactamente: Tecnología, Suministros, Transporte, Formación, Comidas, Varios"
}

Reglas de cálculo:
- Si ves el total pero no el desglose: base = total / 1.21, iva_amount = total - base, iva_rate = 21
- Si ves base e IVA pero no el total: amount = base + iva_amount
- Si la fecha no aparece usa: ${new Date().toISOString().split('T')[0]}
- Los importes siempre como números (no strings), con punto decimal (no coma)
- IMPORTANTE: aunque el documento no parezca una factura estándar, extrae cualquier importe monetario visible`;

      const result = await model.generateContent([
        prompt,
        { inlineData: { data: imageData, mimeType: req.file.mimetype } }
      ]);

      const text = result.response.text().trim();
      // Limpiar posible markdown o texto extra
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        console.error("No JSON found in OCR response:", text);
        throw new Error("La IA no devolvió datos válidos del documento");
      }

      let extracted: any;
      try {
        extracted = JSON.parse(jsonMatch[0]);
      } catch (e) {
        console.error("JSON Parse Error:", jsonMatch[0]);
        throw new Error("Error al interpretar la respuesta de la IA");
      }

      // Normalizar y calcular campos derivados
      const total = parseFloat(extracted.amount) || 0;
      const iva_rate = parseInt(extracted.iva_rate) || 21;
      const base = parseFloat(extracted.base_amount) || parseFloat((total / (1 + iva_rate / 100)).toFixed(2));
      const iva_amount = parseFloat(extracted.iva_amount) || parseFloat((total - base).toFixed(2));

      console.log("OCR extraído:", JSON.stringify({ nif: extracted.nif, amount: extracted.amount, base: extracted.base_amount, iva: extracted.iva_amount, date: extracted.date }));

      // El archivo queda en /uploads para poder mostrarlo en el detalle del gasto
      const response = {
        description: extracted.description || extracted.provider || "Gasto",
        provider: extracted.provider || extracted.description || "",
        nif: extracted.nif || "",
        amount: total,
        base_amount: base,
        iva_rate,
        iva_amount,
        date: extracted.date || new Date().toISOString().split('T')[0],
        category: extracted.category || "Varios",
        ticket_image_url: `/uploads/${req.file.filename}`,
      };

      res.json(response);
    } catch (err: any) {
      // Limpiar archivo en caso de error
      if (req.file?.path) fs.unlink(req.file.path, () => {});
      console.error("Error OCR:", err);
      res.status(500).json({ error: err.message || "No se pudo extraer información del documento" });
    }
  });

  // ── CONVERSIÓN PRESUPUESTO -> FACTURA ──────────────
  app.post("/api/documents/convert/:id", authMiddleware, async (req: any, res) => {
    try {
      const { rows } = await pool.query(
        "SELECT * FROM documents WHERE id = $1 AND tenant_id = $2 AND type = 'quote'",
        [req.params.id, req.tenantId]
      );
      if (rows.length === 0) return res.status(404).json({ error: "Presupuesto no encontrado" });

      const quote = rows[0];
      const year = new Date().getFullYear();

      // 1. Obtener siguiente número de factura legal
      const result = await pool.query(`
        SELECT number FROM documents 
        WHERE tenant_id = $1 AND type = 'invoice' AND number LIKE $2
        ORDER BY number DESC LIMIT 1
      `, [req.tenantId, `FAC-${year}-%`]);

      let nextNum = 1;
      if (result.rows.length > 0) {
        const lastNumber = result.rows[0].number;
        const parts = lastNumber.split('-');
        nextNum = parseInt(parts[parts.length - 1]) + 1;
      }
      const invoiceNumber = `FAC-${year}-${String(nextNum).padStart(3, '0')}`;

      // 2. Crear factura como 'Emitida'
      const newInvoice = await pool.query(`
        INSERT INTO documents (tenant_id, type, number, date, client_name, client_dni, client_address, client_city, client_zip, client_province, items, subtotal, iva_rate, iva_amount, total, irpf_rate, irpf_amount, status, original_invoice_id)
        VALUES ($1, 'invoice', $2, CURRENT_DATE, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, 'Emitida', $16)
        RETURNING *`,
        [req.tenantId, invoiceNumber, quote.client_name, quote.client_dni, quote.client_address, quote.client_city, quote.client_zip, quote.client_province, JSON.stringify(quote.items), quote.subtotal, quote.iva_rate, quote.iva_amount, quote.total, quote.irpf_rate || 0, quote.irpf_amount || 0, quote.id]
      );

      // 3. Marcar presupuesto como 'Convertido'
      await pool.query("UPDATE documents SET status = 'Convertido' WHERE id = $1", [quote.id]);

      res.json(newInvoice.rows[0]);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Error al convertir" });
    }
  });

  // ── CANCELAR FACTURA (crea abono automático) ───────
  app.post("/api/documents/cancel/:id", authMiddleware, async (req: any, res) => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const { rows } = await client.query(
        "SELECT * FROM documents WHERE id = $1 AND tenant_id = $2 AND type = 'invoice'",
        [req.params.id, req.tenantId]
      );
      if (rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "Factura no encontrada" });
      }
      const doc = rows[0];

      // Marcar factura original como Cancelada
      await client.query("UPDATE documents SET status = 'Cancelada' WHERE id = $1 AND tenant_id = $2", [doc.id, req.tenantId]);

      // Calcular siguiente número de abono
      const year = new Date().getFullYear();
      const lastABO = await client.query(
        "SELECT number FROM documents WHERE tenant_id = $1 AND type = 'abono' AND number LIKE $2 ORDER BY number DESC LIMIT 1",
        [req.tenantId, `ABO-${year}-%`]
      );
      let nextNum = 1;
      if (lastABO.rows.length > 0) {
        const parts = lastABO.rows[0].number.split('-');
        const n = parseInt(parts[parts.length - 1]);
        if (!isNaN(n)) nextNum = n + 1;
      }
      const aboNumber = `ABO-${year}-${String(nextNum).padStart(3, '0')}`;

      // Crear abono (importes negativos)
      const aboResult = await client.query(`
        INSERT INTO documents (tenant_id, type, number, date, client_name, client_dni, client_address, client_city, client_zip, client_province, items, subtotal, iva_rate, iva_amount, total, irpf_rate, irpf_amount, status, is_rectificative, original_invoice_id)
        VALUES ($1,'abono',$2,CURRENT_DATE,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,'Emitida',true,$16) RETURNING id`,
        [req.tenantId, aboNumber, doc.client_name, doc.client_dni, doc.client_address, doc.client_city, doc.client_zip, doc.client_province,
         JSON.stringify(doc.items || []), -(doc.subtotal || 0), doc.iva_rate, -(doc.iva_amount || 0), -(doc.total || 0),
         doc.irpf_rate || 0, -(doc.irpf_amount || 0), doc.id]
      );

      await client.query("COMMIT");
      res.json({ success: true, aboNumber, aboId: aboResult.rows[0].id });
    } catch (err) {
      await client.query("ROLLBACK");
      console.error(err);
      res.status(500).json({ error: "Error al cancelar la factura" });
    } finally {
      client.release();
    }
  });

  // ── FECHA VENCIMIENTO Y EMAIL CLIENTE ─────────────
  app.patch("/api/documents/:id/vencimiento", authMiddleware, async (req: any, res) => {
    const { fecha_vencimiento, client_email } = req.body;
    try {
      await pool.query(
        "UPDATE documents SET fecha_vencimiento = $1, client_email = $2 WHERE id = $3 AND tenant_id = $4",
        [fecha_vencimiento || null, client_email || null, req.params.id, req.tenantId]
      );
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: "Error al actualizar vencimiento" });
    }
  });

  // ── VENCIMIENTOS FISCALES ─────────────────────────
  app.get("/api/tax-deadlines", authMiddleware, async (req: any, res) => {
    const s = await pool.query("SELECT account_type FROM settings WHERE tenant_id = $1", [req.tenantId]);
    const accountType: 'autonomo' | 'sl' = s.rows[0]?.account_type === 'sl' ? 'sl' : 'autonomo';
    res.json(getVencimientosFiscales(accountType));
  });

  // ── TRIGGERS MANUALES (TEST/ADMIN) ────────────────
  app.post("/api/reminders/trigger-cobros", authMiddleware, async (_req, res) => {
    ejecutarAgenteCobros();
    res.json({ message: "Agente de cobros iniciado en segundo plano" });
  });

  app.post("/api/reminders/trigger-impuestos", authMiddleware, async (_req, res) => {
    ejecutarAgenteImpuestos();
    res.json({ message: "Agente de impuestos iniciado en segundo plano" });
  });

  // Reset recordatorio_cobro_at para poder volver a testar sin esperar 3 días
  app.post("/api/reminders/reset-cobros", authMiddleware, async (req: any, res) => {
    await pool.query(
      "UPDATE documents SET recordatorio_cobro_at = NULL WHERE tenant_id = $1",
      [req.tenantId]
    );
    res.json({ message: "recordatorio_cobro_at reseteado para todas tus facturas" });
  });

  // ── FRONTEND ──────────────────────────────────────
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  const PORT = parseInt(process.env.PORT || '7860', 10);
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`🚀 Servidor en http://localhost:${PORT}`);
  });
}

startServer();