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
import rateLimit from "express-rate-limit";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const JWT_SECRET = process.env.JWT_SECRET || "fallback_secret";

// Transporter SMTP para emails de facturas con adjunto PDF
const smtpTransporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: process.env.SMTP_SECURE === 'true',
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
});

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

    CREATE TABLE IF NOT EXISTS clients (
      id SERIAL PRIMARY KEY,
      tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      nif TEXT,
      email TEXT,
      phone TEXT,
      address TEXT,
      city TEXT,
      province TEXT,
      zip TEXT,
      notes TEXT,
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
    ALTER TABLE tenants ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT FALSE;
    ALTER TABLE tenants ADD COLUMN IF NOT EXISTS plan TEXT DEFAULT 'libre';
    ALTER TABLE settings ADD COLUMN IF NOT EXISTS gestor_token TEXT;
    ALTER TABLE settings ADD COLUMN IF NOT EXISTS gestor_token_created_at TIMESTAMPTZ;
  `);

  // Tabla facturas recurrentes (Plan Profesional)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS recurring_invoices (
      id SERIAL PRIMARY KEY,
      tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      client_name TEXT NOT NULL,
      client_dni TEXT,
      client_address TEXT,
      client_city TEXT,
      client_zip TEXT,
      client_province TEXT,
      client_email TEXT,
      items JSONB NOT NULL,
      iva_rate REAL DEFAULT 21,
      irpf_rate REAL DEFAULT 0,
      frequency TEXT NOT NULL DEFAULT 'monthly',
      next_date DATE NOT NULL,
      active BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_recurring_tenant_id ON recurring_invoices(tenant_id);
  `);

  // Índices para rendimiento multi-tenant
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_documents_tenant_id ON documents(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_expenses_tenant_id ON expenses(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_clients_tenant_id ON clients(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_settings_tenant_id ON settings(tenant_id);
  `);

  console.log("✅ Base de datos lista");
}

// ── PLAN HELPERS ──────────────────────────────────────
async function getTenantPlan(tenantId: number): Promise<string> {
  const r = await pool.query('SELECT plan FROM tenants WHERE id = $1', [tenantId]);
  return r.rows[0]?.plan || 'libre';
}

async function enforcePlan(req: any, res: any, checks: {
  plans?: string[];      // planes que PUEDEN acceder (whitelist)
  blockedPlans?: string[]; // planes que NO pueden acceder
}): Promise<boolean> {
  const plan = await getTenantPlan(req.tenantId);
  req.tenantPlan = plan;
  if (checks.plans && !checks.plans.includes(plan)) {
    res.status(403).json({ error: 'plan_limit', plan, required: checks.plans });
    return false;
  }
  if (checks.blockedPlans && checks.blockedPlans.includes(plan)) {
    res.status(403).json({ error: 'plan_limit', plan, required: checks.blockedPlans.map(p => p === 'libre' ? 'autonomo' : 'profesional') });
    return false;
  }
  return true;
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
        AND (t.plan = 'autonomo' OR t.plan = 'profesional')
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
async function ejecutarAgenteImpuestos(diasAviso = 15) {
  console.log(`[AGENTE IMPUESTOS] 🤖 Iniciando revisión (ventana: ${diasAviso} días)...`);
  try {
    const tenants = await pool.query(`
      SELECT t.id, s.company_name, s.notification_email, s.email,
             s.recordatorios_impuestos, s.account_type, s.irpf_rate
      FROM tenants t
      JOIN settings s ON t.id = s.tenant_id
      WHERE (s.recordatorios_impuestos IS NULL OR s.recordatorios_impuestos = true)
        AND (t.plan = 'autonomo' OR t.plan = 'profesional')
    `);

    for (const tenant of tenants.rows) {
      const destinatario = tenant.notification_email || tenant.email;
      if (!destinatario) continue;

      const accountType: 'autonomo' | 'sl' = tenant.account_type === 'sl' ? 'sl' : 'autonomo';
      const vencimientos = getVencimientosFiscales(accountType);
      const proximos = vencimientos.filter(v => v.diasRestantes <= diasAviso);
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

      // Agrupar modelos por fecha de vencimiento → un solo email por día
      const porFecha = new Map<string, typeof proximos>();
      for (const v of proximos) {
        if (!porFecha.has(v.fecha)) porFecha.set(v.fecha, []);
        porFecha.get(v.fecha)!.push(v);
      }

      for (const [fecha, modelos] of porFecha) {
        const fechaStr = new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: 'long', year: 'numeric' }).format(new Date(fecha));
        const nombresModelos = modelos.map(m => m.nombre).join(' + ');
        const diasRestantes = modelos[0].diasRestantes;
        const { subject, html } = await generarEmailImpuesto(
          tenant.company_name || 'Tu empresa',
          nombresModelos,
          diasRestantes,
          fechaStr,
          accountType,
          ivaNeto,
          irpfTotal
        );
        await enviarEmail(destinatario, subject, html);
        console.log(`[AGENTE IMPUESTOS] 📧 Aviso enviado — ${nombresModelos} — ${tenant.company_name} (${accountType})`);
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
    req.isAdmin = decoded.isAdmin === true;
    req.isGestor = decoded.isGestor === true;
    next();
  } catch {
    res.status(401).json({ error: "Token inválido" });
  }
}

function adminMiddleware(req: any, res: any, next: any) {
  if (!req.isAdmin) return res.status(403).json({ error: "Acceso restringido a administradores" });
  next();
}

// Rate limiters (por tenant, no por IP)
const assistantLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 30,
  keyGenerator: (req: any) => String(req.tenantId || req.ip),
  message: { error: "Límite alcanzado: máximo 30 consultas al asistente por hora. Inténtalo más tarde." },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req: any) => req.isAdmin === true,
});

const ocrLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000,
  max: 20,
  keyGenerator: (req: any) => String(req.tenantId || req.ip),
  message: { error: "Límite alcanzado: máximo 20 escaneos por día. Inténtalo mañana." },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req: any) => req.isAdmin === true,
});

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

// ── AGENTE: GENERAR FACTURAS RECURRENTES ─────────────
async function ejecutarFacturasRecurrentes() {
  console.log('[RECURRENTES] 🔄 Generando facturas programadas...');
  try {
    const due = await pool.query(`
      SELECT r.*, t.plan FROM recurring_invoices r
      JOIN tenants t ON r.tenant_id = t.id
      WHERE r.active = TRUE
        AND r.next_date <= CURRENT_DATE
        AND t.plan = 'profesional'
    `);
    for (const r of due.rows) {
      const items = r.items;
      const subtotal = items.reduce((s: number, i: any) => s + (i.total || 0), 0);
      const iva_amount = subtotal * (r.iva_rate / 100);
      const irpf_amount = subtotal * (r.irpf_rate / 100);
      const total = subtotal + iva_amount - irpf_amount;

      // Generar número de factura
      const year = new Date().getFullYear();
      const lastDoc = await pool.query(
        `SELECT number FROM documents WHERE tenant_id=$1 AND type='invoice' AND number LIKE $2 ORDER BY id DESC LIMIT 1`,
        [r.tenant_id, `FAC-${year}-%`]
      );
      let seq = 1;
      if (lastDoc.rows[0]) {
        const parts = lastDoc.rows[0].number.split('-');
        seq = (parseInt(parts[2]) || 0) + 1;
      }
      const number = `FAC-${year}-${String(seq).padStart(4, '0')}`;
      const date = new Date().toISOString().split('T')[0];

      await pool.query(
        `INSERT INTO documents (tenant_id, type, number, date, client_name, client_dni, client_address, client_city, client_zip, client_province, client_email, items, subtotal, iva_rate, iva_amount, irpf_rate, irpf_amount, total, status)
         VALUES ($1,'invoice',$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,'Borrador')`,
        [r.tenant_id, number, date, r.client_name, r.client_dni, r.client_address, r.client_city, r.client_zip, r.client_province, r.client_email, JSON.stringify(items), subtotal, r.iva_rate, iva_amount, r.irpf_rate, irpf_amount, total]
      );

      // Calcular próxima fecha según frecuencia
      const nextDate = new Date(r.next_date);
      if (r.frequency === 'weekly') nextDate.setDate(nextDate.getDate() + 7);
      else if (r.frequency === 'quarterly') nextDate.setMonth(nextDate.getMonth() + 3);
      else nextDate.setMonth(nextDate.getMonth() + 1); // monthly por defecto

      await pool.query(
        'UPDATE recurring_invoices SET next_date=$1 WHERE id=$2',
        [nextDate.toISOString().split('T')[0], r.id]
      );
      console.log(`[RECURRENTES] ✅ Generada ${number} para tenant ${r.tenant_id}`);
    }
    console.log(`[RECURRENTES] Procesadas: ${due.rows.length} facturas.`);
  } catch (err) {
    console.error('[RECURRENTES] ❌ Error:', err);
  }
}

async function startServer() {
  await initDB();

  // ── CRON JOBS ─────────────────────────────────────
  // Agente Cobros: cada día a las 9:00
  cron.schedule('0 9 * * *', ejecutarAgenteCobros, { timezone: 'Europe/Madrid' });
  // Agente Impuestos: cada día a las 8:00
  cron.schedule('0 8 * * *', () => ejecutarAgenteImpuestos(), { timezone: 'Europe/Madrid' });
  // Facturas recurrentes: cada día a las 7:00
  cron.schedule('0 7 * * *', ejecutarFacturasRecurrentes, { timezone: 'Europe/Madrid' });
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
      const token = jwt.sign({ tenantId: tenant.id, isAdmin: tenant.is_admin === true }, JWT_SECRET, { expiresIn: "7d" });
      res.json({ token, hasPin: !!tenant.security_pin, isAdmin: tenant.is_admin === true });
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

  // ── CLIENTES (CARTERA) ───────────────────────────
  app.get("/api/clients", authMiddleware, async (req: any, res) => {
    const search = (req.query.search as string) || '';
    const result = search.length >= 2
      ? await pool.query(
          `SELECT * FROM clients WHERE tenant_id = $1
           AND (name ILIKE $2 OR nif ILIKE $2 OR email ILIKE $2)
           ORDER BY name ASC LIMIT 20`,
          [req.tenantId, `%${search}%`]
        )
      : await pool.query(
          'SELECT * FROM clients WHERE tenant_id = $1 ORDER BY name ASC',
          [req.tenantId]
        );
    res.json(result.rows);
  });

  app.post("/api/clients", authMiddleware, async (req: any, res) => {
    const { name, nif, email, phone, address, city, province, zip, notes } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'El nombre es obligatorio' });
    // Plan Libre: máximo 2 clientes
    const plan = await getTenantPlan(req.tenantId);
    if (plan === 'libre') {
      const count = await pool.query('SELECT COUNT(*) FROM clients WHERE tenant_id = $1', [req.tenantId]);
      if (parseInt(count.rows[0].count) >= 2) {
        return res.status(403).json({ error: 'plan_limit', plan, feature: 'clients', limit: 2 });
      }
    }
    const existing = await pool.query(
      'SELECT id FROM clients WHERE tenant_id = $1 AND LOWER(name) = LOWER($2)',
      [req.tenantId, name.trim()]
    );
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Ya existe un cliente con ese nombre' });
    }
    const result = await pool.query(
      `INSERT INTO clients (tenant_id, name, nif, email, phone, address, city, province, zip, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [req.tenantId, name.trim(), nif||null, email||null, phone||null, address||null, city||null, province||null, zip||null, notes||null]
    );
    res.json(result.rows[0]);
  });

  app.put("/api/clients/:id", authMiddleware, async (req: any, res) => {
    const { name, nif, email, phone, address, city, province, zip, notes } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'El nombre es obligatorio' });
    const result = await pool.query(
      `UPDATE clients SET name=$1, nif=$2, email=$3, phone=$4, address=$5,
       city=$6, province=$7, zip=$8, notes=$9
       WHERE id=$10 AND tenant_id=$11 RETURNING *`,
      [name.trim(), nif||null, email||null, phone||null, address||null, city||null, province||null, zip||null, notes||null, req.params.id, req.tenantId]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Cliente no encontrado' });
    res.json(result.rows[0]);
  });

  app.delete("/api/clients/:id", authMiddleware, async (req: any, res) => {
    await pool.query('DELETE FROM clients WHERE id = $1 AND tenant_id = $2', [req.params.id, req.tenantId]);
    res.json({ success: true });
  });

  // ── LOGO ──────────────────────────────────────────
  app.post("/api/settings/logo", authMiddleware, async (req: any, res: any, next: any) => {
    const plan = await getTenantPlan(req.tenantId);
    if (plan === 'libre') return res.status(403).json({ error: 'plan_limit', plan, feature: 'logo', required: 'autonomo' });
    next();
  }, upload.single("logo"), async (req: any, res) => {
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

    // Plan Libre: máximo 5 facturas/abonos por mes
    if (type === 'invoice' || type === 'abono') {
      const plan = await getTenantPlan(req.tenantId);
      if (plan === 'libre') {
        const count = await pool.query(
          `SELECT COUNT(*) FROM documents WHERE tenant_id = $1 AND type IN ('invoice','abono')
           AND created_at >= date_trunc('month', NOW())`,
          [req.tenantId]
        );
        if (parseInt(count.rows[0].count) >= 5) {
          return res.status(403).json({ error: 'plan_limit', plan, feature: 'documents', limit: 5 });
        }
      }
    }

    // Validación obligatoria alineada con VeriFactu / RD 1619/2012
    const errors: string[] = [];
    if (!client_name?.trim()) errors.push('El nombre del cliente es obligatorio');
    if ((type === 'invoice' || type === 'abono') && !client_dni?.trim()) errors.push('El NIF/CIF del cliente es obligatorio en facturas');
    if ((type === 'invoice' || type === 'abono') && !client_address?.trim()) errors.push('La dirección del cliente es obligatoria en facturas');
    if ((type === 'invoice' || type === 'abono') && !client_city?.trim()) errors.push('La ciudad del cliente es obligatoria en facturas');
    if (!items || !Array.isArray(items) || items.length === 0) errors.push('Debe incluir al menos un concepto');
    if (items?.some((i: any) => !i.concept?.trim())) errors.push('Todos los conceptos deben tener descripción');
    if (errors.length > 0) return res.status(400).json({ error: errors.join(' · ') });

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
    const plan = await getTenantPlan(req.tenantId);
    if (plan === 'libre') return res.status(403).json({ error: 'plan_limit', plan, feature: 'csv', required: 'autonomo' });
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
    const plan = await getTenantPlan(req.tenantId);
    if (plan === 'libre') return res.status(403).json({ error: 'plan_limit', plan, feature: 'csv', required: 'autonomo' });
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
  app.post("/api/expenses/ocr", authMiddleware, async (req: any, res: any, next: any) => {
    const plan = await getTenantPlan(req.tenantId);
    if (plan === 'libre') return res.status(403).json({ error: 'plan_limit', plan, feature: 'ocr', required: 'autonomo' });
    next();
  }, ocrLimiter, (req: any, res: any, next: any) => {
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
    ejecutarAgenteImpuestos(60); // ventana ampliada para pruebas manuales
    res.json({ message: "Agente de impuestos iniciado en segundo plano" });
  });

  // ── ADMIN: GESTIÓN DE CUENTAS ────────────────────────
  // ── GENERACIÓN PDF CON PDFKIT ─────────────────────────────
  async function generateInvoicePDF(doc: any, s: any): Promise<Buffer> {
    const { createRequire } = await import('module');
    const req2 = createRequire(import.meta.url);
    const PDFDocument = req2('pdfkit');

    const fmt = (n: number) => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(n || 0);
    const docTitle = doc.type === 'quote' ? 'PRESUPUESTO' : doc.type === 'abono' ? 'NOTA DE CRÉDITO' : 'FACTURA';
    const themeHex = doc.type === 'quote' ? '#d97706' : doc.type === 'abono' ? '#dc2626' : '#7c3aed';
    const items: Array<any> = doc.items || [];
    const hasIrpf = (doc.irpf_rate || 0) > 0;
    const W = 595.28, H = 841.89, M = 50, CW = W - 2 * M;

    return new Promise((resolve, reject) => {
      const pdf = new PDFDocument({ size: 'A4', margin: 0, info: { Title: `${docTitle} ${doc.number}` } });
      const chunks: Buffer[] = [];
      pdf.on('data', (c: Buffer) => chunks.push(c));
      pdf.on('end', () => resolve(Buffer.concat(chunks)));
      pdf.on('error', reject);

      // Header bar
      pdf.rect(0, 0, W, 100).fill(themeHex);
      pdf.font('Helvetica-Bold').fontSize(20).fillColor('#ffffff').text(docTitle, M, 28);
      pdf.font('Helvetica-Bold').fontSize(13).fillColor('#ffffff')
         .text(doc.number, M, 28, { width: CW, align: 'right' });
      pdf.font('Helvetica').fontSize(10).fillColor('rgba(255,255,255,0.75)')
         .text(`Fecha: ${doc.date}`, M, 58);

      // Emisor / Cliente
      const colW = (CW - 20) / 2;
      let ey = 118, cy2 = 118;
      const cx = M + colW + 20;

      pdf.font('Helvetica-Bold').fontSize(7).fillColor('#94a3b8').text('EMISOR', M, ey); ey += 13;
      pdf.font('Helvetica-Bold').fontSize(11).fillColor('#1e293b').text(s.company_name || '', M, ey, { width: colW }); ey += 15;
      if (s.cif) { pdf.font('Helvetica').fontSize(9).fillColor('#64748b').text(`NIF/CIF: ${s.cif}`, M, ey, { width: colW }); ey += 12; }
      if (s.address) { pdf.font('Helvetica').fontSize(9).fillColor('#64748b').text(`${s.address}${s.city ? `, ${s.city}` : ''}`, M, ey, { width: colW }); ey += 12; }
      if (s.email) { pdf.font('Helvetica').fontSize(9).fillColor('#64748b').text(s.email, M, ey, { width: colW }); ey += 12; }

      pdf.font('Helvetica-Bold').fontSize(7).fillColor('#94a3b8').text('CLIENTE', cx, cy2); cy2 += 13;
      pdf.font('Helvetica-Bold').fontSize(11).fillColor('#1e293b').text(doc.client_name || '', cx, cy2, { width: colW }); cy2 += 15;
      if (doc.client_dni) { pdf.font('Helvetica').fontSize(9).fillColor('#64748b').text(`NIF/CIF: ${doc.client_dni}`, cx, cy2, { width: colW }); cy2 += 12; }
      if (doc.client_address) { pdf.font('Helvetica').fontSize(9).fillColor('#64748b').text(`${doc.client_address}${doc.client_city ? `, ${doc.client_city}` : ''}`, cx, cy2, { width: colW }); cy2 += 12; }

      // Table
      let ty = Math.max(ey, cy2) + 24;
      const cW = [CW * 0.44, CW * 0.10, CW * 0.22, CW * 0.24];
      const cX = [M, M + cW[0], M + cW[0] + cW[1], M + cW[0] + cW[1] + cW[2]];
      pdf.rect(M, ty, CW, 22).fill('#f8fafc');
      pdf.font('Helvetica-Bold').fontSize(7).fillColor('#64748b');
      pdf.text('CONCEPTO', cX[0] + 6, ty + 7, { width: cW[0] });
      pdf.text('CANT.', cX[1], ty + 7, { width: cW[1], align: 'center' });
      pdf.text('PRECIO UNIT.', cX[2], ty + 7, { width: cW[2], align: 'right' });
      pdf.text('TOTAL', cX[3], ty + 7, { width: cW[3] - 6, align: 'right' });
      ty += 22;

      items.forEach((item: any, i: number) => {
        pdf.rect(M, ty, CW, 22).fill(i % 2 === 0 ? '#ffffff' : '#fafafa').stroke('#f1f5f9');
        pdf.font('Helvetica').fontSize(9).fillColor('#334155').text(item.concept || '', cX[0] + 6, ty + 6, { width: cW[0] - 12 });
        pdf.fillColor('#64748b').text(String(item.quantity ?? 0), cX[1], ty + 6, { width: cW[1], align: 'center' });
        pdf.text(fmt(item.price || 0), cX[2], ty + 6, { width: cW[2], align: 'right' });
        pdf.font('Helvetica-Bold').fillColor('#1e293b').text(fmt(item.total || 0), cX[3], ty + 6, { width: cW[3] - 6, align: 'right' });
        ty += 22;
      });

      // Totals
      ty += 14;
      const tX = M + CW * 0.54, tW = CW * 0.46;
      pdf.moveTo(tX, ty).lineTo(W - M, ty).strokeColor('#e2e8f0').lineWidth(1).stroke(); ty += 10;
      const row = (label: string, val: string, bold = false, col = '#1e293b') => {
        pdf.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(bold ? 12 : 10)
           .fillColor('#64748b').text(label, tX, ty, { width: tW * 0.62 });
        pdf.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(bold ? 12 : 10)
           .fillColor(col).text(val, tX + tW * 0.62, ty, { width: tW * 0.38, align: 'right' });
        ty += bold ? 18 : 15;
      };
      row('Base imponible', fmt(doc.subtotal));
      row(`IVA (${doc.iva_rate}%)`, fmt(doc.iva_amount));
      if (hasIrpf) row(`IRPF (-${doc.irpf_rate}%)`, `-${fmt(doc.irpf_amount)}`, false, '#dc2626');
      ty += 4;
      pdf.moveTo(tX, ty).lineTo(W - M, ty).strokeColor('#e2e8f0').stroke(); ty += 8;
      row('TOTAL', fmt(Math.abs(doc.total)), true, themeHex);

      // Footer
      const fY = H - 55;
      pdf.moveTo(M, fY).lineTo(W - M, fY).strokeColor('#e2e8f0').stroke();
      const footerText = [s.company_name, s.cif ? `NIF/CIF: ${s.cif}` : null, s.address, s.city, s.phone, s.email].filter(Boolean).join('  ·  ');
      pdf.font('Helvetica').fontSize(7.5).fillColor('#94a3b8').text(footerText, M, fY + 12, { width: CW, align: 'center' });

      pdf.end();
    });
  }

  // Lista todos los tenants registrados (para detectar cuentas huérfanas/demo)
  // ── PERFIL PROPIO ──────────────────────────────────
  // ── ENVÍO DE FACTURA POR EMAIL (PLAN PROFESIONAL) ──────────
  app.post("/api/documents/:id/send-email", authMiddleware, async (req: any, res) => {
    const plan = await getTenantPlan(req.tenantId);
    if (plan !== 'profesional') return res.status(403).json({ error: 'plan_limit', plan, feature: 'send_email', required: 'profesional' });

    const docId = parseInt(req.params.id);
    const { recipient_email, message } = req.body;
    if (!recipient_email?.trim()) return res.status(400).json({ error: 'Se requiere el email del destinatario' });

    const [docResult, settingsResult] = await Promise.all([
      pool.query('SELECT * FROM documents WHERE id = $1 AND tenant_id = $2', [docId, req.tenantId]),
      pool.query('SELECT * FROM settings WHERE tenant_id = $1', [req.tenantId]),
    ]);
    const doc = docResult.rows[0];
    if (!doc) return res.status(404).json({ error: 'Documento no encontrado' });
    const s = settingsResult.rows[0] || {};

    const fmt = (n: number) => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(n || 0);
    const docTitle = doc.type === 'quote' ? 'Presupuesto' : doc.type === 'abono' ? 'Nota de Crédito' : 'Factura';
    const themeColor = doc.type === 'quote' ? '#d97706' : doc.type === 'abono' ? '#dc2626' : '#7c3aed';
    const hasIrpf = (doc.irpf_rate || 0) > 0;
    const msgHtml = message?.trim()
      ? `<p style="color:#334155;font-size:14px;line-height:1.7;white-space:pre-line;margin:16px 0 20px">${message.trim()}</p>`
      : '';

    // Email body — limpio, sin referencias a Faktio
    const emailHtml = `
<div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;background:#f1f5f9;padding:20px">
  <div style="background:${themeColor};padding:22px 28px;border-radius:8px 8px 0 0">
    <table width="100%" cellpadding="0" cellspacing="0"><tr>
      <td><p style="color:#fff;margin:0;font-size:17px;font-weight:900">${s.company_name || ''}</p></td>
      <td style="text-align:right">
        <p style="color:rgba(255,255,255,0.75);margin:0;font-size:10px;text-transform:uppercase;letter-spacing:0.08em">${docTitle}</p>
        <p style="color:#fff;margin:3px 0 0;font-weight:bold;font-size:13px">${doc.number}</p>
      </td>
    </tr></table>
  </div>
  <div style="background:#ffffff;border:1px solid #e2e8f0;border-top:none;padding:28px;border-radius:0 0 8px 8px">
    <p style="color:#1e293b;font-size:14px;line-height:1.7;margin:0 0 4px">Estimado/a <strong>${doc.client_name || 'cliente'}</strong>,</p>
    ${msgHtml}
    <p style="color:#334155;font-size:14px;line-height:1.7;margin:0 0 20px">
      ${msgHtml ? 'Asimismo, a' : 'A'}djuntamos la ${docTitle.toLowerCase()} <strong>${doc.number}</strong> con fecha <strong>${doc.date}</strong>.
    </p>
    <table width="100%" cellpadding="6" cellspacing="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;margin-bottom:20px">
      <tr>
        <td style="color:#64748b;font-size:12px">Base imponible</td>
        <td style="text-align:right;font-weight:600;font-size:12px;color:#1e293b">${fmt(doc.subtotal)}</td>
      </tr>
      <tr>
        <td style="color:#64748b;font-size:12px">IVA (${doc.iva_rate}%)</td>
        <td style="text-align:right;font-weight:600;font-size:12px;color:#1e293b">${fmt(doc.iva_amount)}</td>
      </tr>
      ${hasIrpf ? `<tr>
        <td style="color:#64748b;font-size:12px">IRPF (-${doc.irpf_rate}%)</td>
        <td style="text-align:right;font-weight:600;font-size:12px;color:#dc2626">-${fmt(doc.irpf_amount)}</td>
      </tr>` : ''}
      <tr style="border-top:2px solid #e2e8f0">
        <td style="color:#1e293b;font-weight:900;font-size:15px;padding-top:10px">TOTAL</td>
        <td style="text-align:right;font-weight:900;font-size:15px;color:${themeColor};padding-top:10px">${fmt(Math.abs(doc.total))}</td>
      </tr>
    </table>
    <p style="color:#94a3b8;font-size:12px;margin:0 0 20px">Encontrará la factura en formato PDF adjunta a este correo.</p>
    <hr style="border:none;border-top:1px solid #f1f5f9;margin:0 0 16px">
    <p style="margin:0;font-weight:900;color:#1e293b;font-size:13px">${s.company_name || ''}</p>
    ${s.cif ? `<p style="margin:2px 0;color:#64748b;font-size:11px">NIF/CIF: ${s.cif}</p>` : ''}
    ${s.phone ? `<p style="margin:2px 0;color:#64748b;font-size:11px">${s.phone}</p>` : ''}
    ${s.email ? `<p style="margin:2px 0;color:#64748b;font-size:11px">${s.email}</p>` : ''}
  </div>
</div>`;

    const subject = `${docTitle} ${doc.number} de ${s.company_name || ''}`;
    const sent = await enviarEmail(recipient_email.trim(), subject, emailHtml);
    if (sent) {
      res.json({ success: true, message: `${docTitle} enviada a ${recipient_email}` });
    } else {
      res.status(500).json({ error: 'No se pudo enviar el email. Inténtalo de nuevo.' });
    }
  });

  // ── FACTURAS RECURRENTES (PLAN PROFESIONAL) ──────────────
  app.get("/api/recurring", authMiddleware, async (req: any, res) => {
    const plan = await getTenantPlan(req.tenantId);
    if (plan !== 'profesional') return res.status(403).json({ error: 'plan_limit', plan, feature: 'recurring', required: 'profesional' });
    const result = await pool.query(
      'SELECT * FROM recurring_invoices WHERE tenant_id = $1 ORDER BY created_at DESC',
      [req.tenantId]
    );
    res.json(result.rows);
  });

  app.post("/api/recurring", authMiddleware, async (req: any, res) => {
    const plan = await getTenantPlan(req.tenantId);
    if (plan !== 'profesional') return res.status(403).json({ error: 'plan_limit', plan, feature: 'recurring', required: 'profesional' });
    const { name, client_name, client_dni, client_address, client_city, client_zip, client_province, client_email, items, iva_rate, irpf_rate, frequency, next_date } = req.body;
    if (!name?.trim() || !client_name?.trim() || !items?.length || !next_date) {
      return res.status(400).json({ error: 'Faltan campos obligatorios: nombre, cliente, conceptos y próxima fecha' });
    }
    const result = await pool.query(
      `INSERT INTO recurring_invoices (tenant_id, name, client_name, client_dni, client_address, client_city, client_zip, client_province, client_email, items, iva_rate, irpf_rate, frequency, next_date)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
      [req.tenantId, name.trim(), client_name.trim(), client_dni||null, client_address||null, client_city||null, client_zip||null, client_province||null, client_email||null, JSON.stringify(items), iva_rate||21, irpf_rate||0, frequency||'monthly', next_date]
    );
    res.json(result.rows[0]);
  });

  app.put("/api/recurring/:id", authMiddleware, async (req: any, res) => {
    const plan = await getTenantPlan(req.tenantId);
    if (plan !== 'profesional') return res.status(403).json({ error: 'plan_limit' });
    const { name, client_name, client_dni, client_address, client_city, client_zip, client_province, client_email, items, iva_rate, irpf_rate, frequency, next_date, active } = req.body;
    const result = await pool.query(
      `UPDATE recurring_invoices SET name=$1, client_name=$2, client_dni=$3, client_address=$4, client_city=$5, client_zip=$6, client_province=$7, client_email=$8, items=$9, iva_rate=$10, irpf_rate=$11, frequency=$12, next_date=$13, active=$14
       WHERE id=$15 AND tenant_id=$16 RETURNING *`,
      [name, client_name, client_dni||null, client_address||null, client_city||null, client_zip||null, client_province||null, client_email||null, JSON.stringify(items), iva_rate||21, irpf_rate||0, frequency||'monthly', next_date, active !== false, req.params.id, req.tenantId]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'No encontrada' });
    res.json(result.rows[0]);
  });

  app.delete("/api/recurring/:id", authMiddleware, async (req: any, res) => {
    await pool.query('DELETE FROM recurring_invoices WHERE id=$1 AND tenant_id=$2', [req.params.id, req.tenantId]);
    res.json({ success: true });
  });

  // ── ACCESO GESTOR (PLAN PROFESIONAL) ───────────────────────
  app.post("/api/settings/gestor-token", authMiddleware, async (req: any, res) => {
    const plan = await getTenantPlan(req.tenantId);
    if (plan !== 'profesional') return res.status(403).json({ error: 'plan_limit', plan, feature: 'gestor', required: 'profesional' });
    const token = jwt.sign({ tenantId: req.tenantId, isGestor: true }, JWT_SECRET, { expiresIn: '365d' });
    await pool.query(
      'UPDATE settings SET gestor_token=$1, gestor_token_created_at=NOW() WHERE tenant_id=$2',
      [token, req.tenantId]
    );
    res.json({ token });
  });

  app.delete("/api/settings/gestor-token", authMiddleware, async (req: any, res) => {
    await pool.query('UPDATE settings SET gestor_token=NULL, gestor_token_created_at=NULL WHERE tenant_id=$1', [req.tenantId]);
    res.json({ success: true });
  });

  // Login gestor mediante token (sin auth middleware — es el propio token quien autentica)
  app.get("/api/gestor/verify/:token", async (req, res) => {
    try {
      const decoded = jwt.verify(req.params.token, JWT_SECRET) as any;
      if (!decoded.isGestor) return res.status(403).json({ error: 'Token inválido' });
      const result = await pool.query(
        'SELECT gestor_token FROM settings WHERE tenant_id=$1', [decoded.tenantId]
      );
      if (!result.rows[0] || result.rows[0].gestor_token !== req.params.token) {
        return res.status(403).json({ error: 'Token revocado o inválido' });
      }
      // Devuelve el token directamente para usarlo como JWT de solo lectura
      res.json({ token: req.params.token, tenantId: decoded.tenantId });
    } catch {
      res.status(403).json({ error: 'Token expirado o inválido' });
    }
  });

  app.get("/api/me", authMiddleware, async (req: any, res) => {
    const result = await pool.query("SELECT id, email, is_admin, plan FROM tenants WHERE id = $1", [req.tenantId]);
    res.json(result.rows[0] || {});
  });

  app.patch("/api/me/plan", authMiddleware, async (req: any, res) => {
    const { plan } = req.body;
    if (!['libre', 'autonomo', 'profesional'].includes(plan)) {
      return res.status(400).json({ error: 'Plan inválido' });
    }
    await pool.query('UPDATE tenants SET plan = $1 WHERE id = $2', [plan, req.tenantId]);
    res.json({ ok: true, plan });
  });

  // Bootstrap de administrador — solo funciona si aún no existe ningún admin
  app.post("/api/admin/bootstrap", authMiddleware, async (req: any, res) => {
    const existing = await pool.query("SELECT id FROM tenants WHERE is_admin = TRUE LIMIT 1");
    if (existing.rows.length > 0) return res.status(403).json({ error: "Ya existe un administrador. Endpoint desactivado." });
    await pool.query("UPDATE tenants SET is_admin = TRUE WHERE id = $1", [req.tenantId]);
    res.json({ message: "Tu cuenta ha sido promovida a administradora. Vuelve a iniciar sesión." });
  });

  // ── PANEL DE ADMINISTRACIÓN ────────────────────────
  app.get("/api/admin/tenants", authMiddleware, adminMiddleware, async (_req, res) => {
    const result = await pool.query(`
      SELECT t.id, t.email AS login_email, t.is_admin, t.plan, s.company_name, s.owner_name,
             s.email AS fiscal_email, s.notification_email, t.created_at,
             (SELECT COUNT(*) FROM documents WHERE tenant_id = t.id) AS total_docs,
             (SELECT COUNT(*) FROM expenses WHERE tenant_id = t.id) AS total_expenses
      FROM tenants t
      LEFT JOIN settings s ON t.id = s.tenant_id
      ORDER BY t.created_at DESC
    `);
    res.json(result.rows);
  });

  app.patch("/api/admin/tenant/:id/plan", authMiddleware, adminMiddleware, async (req: any, res) => {
    const targetId = parseInt(req.params.id);
    const { plan } = req.body;
    if (!['libre', 'autonomo', 'profesional'].includes(plan)) {
      return res.status(400).json({ error: 'Plan inválido. Usa: libre, autonomo, profesional' });
    }
    const result = await pool.query(
      'UPDATE tenants SET plan = $1 WHERE id = $2 RETURNING id, email, plan',
      [plan, targetId]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Usuario no encontrado' });
    res.json(result.rows[0]);
  });

  // Impersonar a un usuario (solo admin) — genera JWT temporal de 2h para soporte
  app.post("/api/admin/impersonate/:id", authMiddleware, adminMiddleware, async (req: any, res) => {
    const targetId = parseInt(req.params.id);
    if (isNaN(targetId)) return res.status(400).json({ error: "ID inválido" });
    const result = await pool.query("SELECT id, email FROM tenants WHERE id = $1", [targetId]);
    if (!result.rows[0]) return res.status(404).json({ error: "Usuario no encontrado" });
    const token = jwt.sign({ tenantId: targetId, isAdmin: false, impersonatedBy: req.tenantId }, JWT_SECRET, { expiresIn: "2h" });
    res.json({ token, email: result.rows[0].email });
  });

  // Elimina un tenant por ID (solo admin, no puede ser el propio)
  app.delete("/api/admin/tenant/:id", authMiddleware, adminMiddleware, async (req: any, res) => {
    const targetId = parseInt(req.params.id);
    if (targetId === req.tenantId) {
      return res.status(400).json({ error: "No puedes eliminar tu propia cuenta" });
    }
    await pool.query("DELETE FROM tenants WHERE id = $1", [targetId]);
    res.json({ message: `Usuario ${targetId} eliminado` });
  });

  // Limpieza de cuentas de prueba (solo admin)
  app.delete("/api/admin/cleanup-others", authMiddleware, adminMiddleware, async (req: any, res) => {
    const result = await pool.query(
      "DELETE FROM tenants WHERE id != $1 AND is_admin = FALSE RETURNING id, email",
      [req.tenantId]
    );
    res.json({ eliminados: result.rows, mensaje: `${result.rowCount} cuenta(s) eliminada(s)` });
  });

  // Reset recordatorio_cobro_at para poder volver a testar sin esperar 3 días
  app.post("/api/reminders/reset-cobros", authMiddleware, async (req: any, res) => {
    await pool.query(
      "UPDATE documents SET recordatorio_cobro_at = NULL WHERE tenant_id = $1",
      [req.tenantId]
    );
    res.json({ message: "recordatorio_cobro_at reseteado para todas tus facturas" });
  });

  // ── ASISTENTE IA ─────────────────────────────────
  app.post("/api/assistant", authMiddleware, assistantLimiter, async (req: any, res) => {
    try {
      const { message, history = [] } = req.body;
      if (!message || typeof message !== 'string') {
        return res.status(400).json({ error: 'Mensaje requerido' });
      }

      const systemPrompt = `Eres el asistente oficial de Faktio, una aplicación de facturación y gestión contable para autónomos y PYMEs españolas. Tu misión es ayudar a los usuarios a entender y usar la aplicación. Respondes SIEMPRE en español, de forma clara, amable y estructurada. Nunca crees documentos ni ejecutes acciones por el usuario; solo explica cómo hacerlo. Cuando respondas sobre una sección concreta, describe lo que el usuario verá en pantalla para que pueda orientarse fácilmente.

SECCIÓN 1 — DASHBOARD (Panel de inicio)
El Dashboard es la primera pantalla que ves al entrar. Muestra un resumen financiero completo organizado en tarjetas (KPIs).

TARJETA PRINCIPAL — "Liquidez Real Disponible":
Es la tarjeta más grande (ocupa dos columnas). Muestra el importe neto real que el autónomo o empresa se lleva a casa después de descontar impuestos. Dentro de esta misma tarjeta puedes ver tres datos secundarios: Ingresos totales (flecha verde), Gastos totales (flecha roja) y el Margen de beneficio en porcentaje (verde si mayor o igual al 30%, ámbar si es positivo pero bajo, rojo si es negativo). En la esquina superior derecha hay un botón "OCULTAR / MOSTRAR" que oculta todos los importes de la pantalla para que puedas compartir la pantalla sin revelar cifras.

TARJETA "Pendiente de Cobro":
Muestra el total de dinero que los clientes te deben (facturas en estado "Emitida" que aún no han pagado). El indicador azul parpadea para llamar la atención.

TARJETAS FISCALES (según tipo de cuenta):
- "IVA Neto (Mod.303)": muestra la diferencia entre el IVA que has cobrado a tus clientes (IVA repercutido) y el IVA que has pagado en tus compras (IVA soportado). Si es positivo (en rojo) debes ingresarlo a Hacienda; si es negativo (en verde) Hacienda te lo devolverá.
- "IRPF Retenido" (solo autónomos): importe total de IRPF que tus clientes ya han retenido y pagado a Hacienda por ti. Aparece en ámbar.
- "Beneficio Bruto": ingresos menos gastos, sin impuestos.

ACTIVIDAD RECIENTE:
Lista los últimos 6 documentos emitidos (facturas o presupuestos) con su número, estado (Emitida, Pagada, Borrador, etc.), nombre del cliente, importe y fecha.

CONSEJO FISCAL (IA):
Consejo automático basado en tus datos: si tienes mucho IVA acumulado te avisa para que reserves dinero; si tus gastos son muy bajos te sugiere revisar si has registrado todos los tickets.

PRÓXIMOS VENCIMIENTOS FISCALES:
Si tienes activado el Agente de Impuestos, aparece un panel ámbar con los próximos modelos fiscales a presentar, cuántos días quedan y la fecha límite. Las filas se ponen en rojo cuando quedan 3 días o menos, y en ámbar cuando quedan 7 o menos.

ALERTAS IA FISCAL:
Aparecen en morado si se detecta alguna alerta automática: por ejemplo si el IVA pendiente supera los 3.000 euros o si tus gastos registrados son muy bajos respecto a los ingresos.

BANNER VERIFACTU:
Muestra el progreso de la integración con VeriFactu (35% completado). Esta función enviará cada factura firmada digitalmente a la AEAT en tiempo real cuando esté disponible.

SECCIÓN 2 — CREAR FACTURA, PRESUPUESTO O ABONO
Accedes pulsando "Facturar" (factura), "Presupuestos -> Crear Presupuesto" o "Abonos -> Nuevo Abono" en el menú lateral. El color del formulario cambia según el tipo: índigo para facturas, ámbar para presupuestos, rojo para abonos.

BLOQUE 1 — EMISOR Y NÚMERO:
A la izquierda aparecen tu logo y datos de empresa (cargados automáticamente desde Ajustes). A la derecha puedes editar el número del documento (se genera automáticamente como FAC-2026-001, PRE-2026-001 o ABO-2026-001) y la fecha (por defecto hoy).

BLOQUE 2 — DATOS DEL CLIENTE (Receptor):
- Barra de búsqueda: escribe 2 o más caracteres y aparece un desplegable con los clientes guardados en tu Cartera. Al seleccionar uno, todos los campos del cliente se rellenan automáticamente.
- Si escribes un nombre nuevo (no guardado), aparece el botón "Guardar cliente" para añadirlo a la Cartera.
- Campos: Nombre/Razón Social (obligatorio siempre), NIF/CIF (obligatorio en facturas y abonos), Dirección Postal (obligatorio en facturas y abonos), Ciudad (obligatorio en facturas y abonos), Código Postal y Provincia (opcionales).
- Solo en facturas: campo "Fecha de vencimiento" (para el control de cobros) y "Email del cliente" (para que el Agente de Cobros le envíe recordatorios automáticos).

BLOQUE 3 — CONCEPTOS (líneas de la factura):
Tabla con columnas: Descripción, Cantidad, Precio unitario y Total (calculado automáticamente). Puedes añadir tantas líneas como necesites con el botón "+ Añadir Línea". La última línea no se puede eliminar.

BLOQUE 4 — TOTALES:
- Subtotal: suma de todas las líneas (editable manualmente).
- IVA: selector de tipo (21% general, 10% reducido, 4% superreducido, 0% exento), el importe se calcula solo.
- IRPF: solo si tienes IRPF configurado en Ajustes (7% o 15%). Se muestra en ámbar como importe negativo.
- Total Factura: importe final (editable). Si hay IRPF, aparece también el campo "A Cobrar (neto)" en verde con el dinero que realmente recibirás tras la retención.

GUARDAR O EMITIR:
El botón superior derecho ("Emitir Factura", "Guardar Presupuesto" o "Emitir Abono") guarda el documento. Si faltan campos obligatorios, aparecen errores en rojo bajo cada campo y el formulario hace scroll hasta el primero. Tras guardar con éxito, aparece una pantalla verde de confirmación y la app te lleva automáticamente al historial.

CAMPOS OBLIGATORIOS por ley (RD 1619/2012):
- Nombre del cliente: siempre (facturas, presupuestos y abonos).
- NIF/CIF del cliente: obligatorio en facturas y abonos.
- Dirección y ciudad del cliente: obligatorio en facturas y abonos.
- Al menos una línea con descripción del concepto: siempre.

SECCIÓN 3 — HISTORIAL FISCAL
Muestra todas tus facturas y presupuestos emitidos. Accedes desde "Historial" en el menú.

FILTROS Y BÚSQUEDA:
- Barra de búsqueda: filtra por nombre de cliente o número de documento en tiempo real.
- Pestañas: alterna entre "Facturas" y "Presupuestos".
- Selector de estado: Emitida, Pagada, Cancelada para facturas; Borrador, Definitivo, Aceptado, Rechazado, Convertido para presupuestos.

CADA DOCUMENTO MUESTRA:
Número, cliente, fecha, estado con badge de color y total. El estado se puede cambiar directamente desde el historial sin abrir el documento (desplegable inline en cada fila).

COLORES DE ESTADO:
Borrador: gris; Emitida: azul; Pagada: verde; Cancelada: gris oscuro; Rectificativa o Abono: rosa; Pendiente: ámbar; Definitivo: azul; Aceptado: verde; Rechazado: rosa; Convertido: morado.

ACCIONES POR DOCUMENTO (aparecen al pasar el ratón):
- "Ver o Imprimir": abre la vista previa en PDF imprimible.
- En facturas no canceladas: "Abono Parcial" (crea una nota de crédito parcial) y "Cancelar (Abono Total)" (cancela la factura y crea automáticamente un abono completo, obligatorio por ley).
- En presupuestos no convertidos: "Editar", "Convertir a Factura" y "Eliminar".

EXPORTAR CSV:
El botón "Exportar CSV" descarga el libro de ingresos en formato CSV para el gestor o para importar en otros programas.

SECCIÓN 4 — PRESUPUESTOS
Vista específica para el pipeline comercial. Cada presupuesto aparece como una tarjeta con el número, cliente, importe y estado.

ACCIONES:
- "Ver": abre la vista previa para imprimir o enviar al cliente.
- "Facturar": convierte el presupuesto en una factura legal emitida (el presupuesto pasa a estado "Convertido" y no se puede volver a facturar).
- Un presupuesto ya convertido muestra el badge "Finalizado" en morado (no se puede editar ni volver a convertir).

SECCIÓN 5 — ABONOS (Notas de crédito)
Los abonos son documentos rectificativos obligatorios por ley para anular o corregir una factura ya emitida. NUNCA se pueden modificar ni eliminar una vez emitidos (Ley 11/2021 y VeriFactu).

CÓMO SE CREAN:
1. Automáticamente: desde el Historial -> botón "Cancelar (Abono Total)" en una factura. El sistema crea el abono automáticamente.
2. Manualmente: desde el Historial -> "Abono Parcial" para crear un abono por un importe menor al de la factura original.
3. Desde el menú "Abonos" -> "+ Nuevo Abono" para un abono independiente.

LO QUE VES:
Número del abono, a qué factura corresponde ("Cancela FAC-2026-001"), cliente, fecha e importe en rojo negativo. Solo puedes ver la vista previa (no editar ni borrar). El resumen estadístico muestra el total de abonos emitidos y el importe total abonado.

SECCIÓN 6 — GASTOS
Registra todos tus gastos deducibles. Los gastos se usan para calcular el IVA soportado (que reduce el IVA a pagar a Hacienda) y el beneficio bruto en el dashboard.

ESCÁNER OCR (Auto-Completar con IA):
Sube la foto del ticket o una factura en PDF o imagen. La IA analiza el documento y rellena automáticamente todos los campos: concepto, proveedor, NIF, fecha, categoría, base imponible, IVA e importe total. Si el OCR falla, puedes rellenar los campos manualmente.

CAMPOS MANUALES:
- Concepto (descripción del gasto), Proveedor (nombre del vendedor), NIF/CIF del proveedor, Fecha.
- Clasificación: 9 categorías -> Varios, Tecnología, Suministros, Transporte, Formación, Comidas, Alquiler, Publicidad, Servicios Profesionales.
- IVA deducible: 21%, 10%, 4% o 0%.
- Base, IVA y Total: los tres campos están interconectados; cambiar uno recalcula los otros automáticamente.

LISTA DE GASTOS:
Tabla con fecha, concepto, proveedor, categoría (badge de color) y total. Al hacer clic en una fila se abre un panel lateral con el detalle completo incluyendo la imagen del ticket si la hay. Desde el panel de detalle también puedes eliminar el gasto. El botón "Exportar CSV" descarga todos los gastos como libro de gastos.

SECCIÓN 7 — CLIENTES (Cartera de clientes)
Base de datos de tus clientes para no tener que introducir sus datos cada vez. Accedes desde "Clientes" en el menú lateral.

QUÉ PUEDES GUARDAR POR CLIENTE:
Nombre o Razón Social (obligatorio), NIF/CIF, Email, Teléfono, Dirección, Ciudad, Provincia, Código Postal y Notas internas (condiciones especiales, persona de contacto, etc.).

BÚSQUEDA: barra de búsqueda que filtra por nombre, NIF o email en tiempo real.

CREAR, EDITAR Y ELIMINAR: botón "Nuevo cliente" abre un modal con todos los campos. El nombre es el único campo obligatorio. Los botones de editar y eliminar aparecen al pasar el ratón sobre cada tarjeta. Al eliminar pide confirmación.

AUTOCOMPLETADO EN FACTURAS: cuando creas una factura o presupuesto y escribes en la barra de búsqueda de cliente (mínimo 2 caracteres), aparece un desplegable con los clientes guardados. Al seleccionar uno, todos los campos del formulario se rellenan automáticamente.

SECCIÓN 8 — AJUSTES
Tres pestañas: Empresa, Seguridad y Alertas IA.

PESTAÑA EMPRESA:
Configura los datos que aparecen en todas tus facturas: Nombre empresa, NIF/CIF, Responsable, Email fiscal, Teléfono, Página web, Ciudad, Dirección postal, Provincia y Código postal. También puedes subir tu logo (PNG/JPG, máximo 5MB) que aparecerá en el encabezado de todas las facturas.
- Tipo de actividad: elige "Autónomo" o "Sociedad Limitada (SL)". Determina qué modelos fiscales monitoriza el Agente de Impuestos.
- IRPF (solo autónomos): 7% (nuevo autónomo, menos de 3 años de alta) o 15% (general). Configura la retención que aparece por defecto en las facturas.

PESTAÑA SEGURIDAD:
- PIN de acceso (4 dígitos): protección adicional. Si lo configuras, se pedirá para acciones sensibles.
- Palabras de recuperación: frase de 12 palabras para recuperar el acceso. Solo se revelan con el PIN. Guárdalas en papel, son únicas e irrecuperables.
- Política de privacidad: cumplimiento RGPD/LOPDGDD, derechos ARCO (acceso, rectificación, cancelación, oposición), email de contacto: privacidad@faktio.app.

PESTAÑA ALERTAS IA:
- Agente de Cobros: toggle para activar o desactivar. Configura cuántos días antes del vencimiento se envía el recordatorio al cliente (por defecto 3 días).
- Agente de Impuestos: toggle para activar o desactivar. Envía recordatorios 15 y 3 días antes de cada vencimiento fiscal según tu tipo de cuenta.
- Email de notificaciones: dirección donde recibirás los avisos (si está vacío, se usa el email de tu cuenta).
- Prueba manual: botones "Ejecutar Cobros Ahora" y "Ejecutar Impuestos Ahora" para probar los agentes inmediatamente.

SECCIÓN 9 — AGENTE DE IMPUESTOS (IA)
Envía recordatorios automáticos por email antes de los plazos fiscales. Se ejecuta cada día a las 8:00h.

MODELOS PARA AUTÓNOMOS:
- Modelo 303 (IVA trimestral): 20 enero, 20 abril, 20 julio, 20 octubre.
- Modelo 130 (IRPF trimestral): mismas fechas que el 303.
- Modelo 100 (Declaración de la Renta): del 1 de abril al 30 de junio.
- Modelo 390 (Resumen anual IVA): hasta el 30 de enero del año siguiente.

MODELOS PARA S.L. Y PYMEs:
- Modelo 303 (IVA trimestral): 20 enero, 20 abril, 20 julio, 20 octubre.
- Modelo 202 (Pagos fraccionados Impuesto Sociedades): 20 abril, 20 octubre, 20 diciembre.
- Modelo 200 (Impuesto Sociedades anual): hasta el 25 de julio.
- Modelo 390 (Resumen anual IVA): hasta el 30 de enero del año siguiente.

Los recordatorios se envían 15 días y 3 días antes de cada vencimiento. Si varios modelos vencen el mismo día, se agrupan en un único email para no saturar el buzón.

SECCIÓN 10 — AGENTE DE COBROS (IA)
Envía recordatorios automáticos por email a los clientes con facturas vencidas sin pagar. Se ejecuta cada día a las 9:00h.

CÓMO FUNCIONA:
Busca facturas en estado "Emitida" que han superado su fecha de vencimiento. Si el cliente tiene email registrado en la factura, le envía un recordatorio profesional generado por IA con el detalle de la factura pendiente. No envía más de un recordatorio cada 3 días por la misma factura para no molestar en exceso.

CONFIGURACIÓN: Ajustes -> Alertas IA -> "Agente de Cobros". Puedes activarlo o desactivarlo y configurar cuántos días antes del vencimiento quieres el aviso (para ser proactivo antes de que la factura venza).

SECCIÓN 11 — VERIFACTU Y CUMPLIMIENTO LEGAL
- RD 1619/2012: Faktio exige los campos obligatorios de toda factura legal (nombre, NIF, dirección del cliente, descripción de conceptos). Si faltan, la app no permite guardar el documento.
- VeriFactu (RD 1007/2023): en desarrollo. Cuando esté activo, cada factura se enviará firmada digitalmente a la AEAT en tiempo real.
- RGPD y LOPDGDD: cumplimiento de protección de datos europeo y español.
- Inalterabilidad fiscal: las facturas y abonos emitidos no se pueden modificar ni eliminar. Para corregir una factura siempre se crea un abono.

LÍMITES DEL ASISTENTE:
Nunca ofrezcas asesoramiento fiscal o legal específico (qué puedo deducirme, si tengo que presentar tal modelo, cuánto debo pagar a Hacienda...). Si la pregunta requiere conocimiento fiscal profesional, dilo claramente y recomienda consultar a un asesor fiscal o gestor. Este asistente orienta sobre el USO de la aplicación, no sobre obligaciones fiscales concretas del usuario.`;

      const model = genAI.getGenerativeModel({
        model: "gemini-2.5-flash",
        systemInstruction: systemPrompt,
      });

      const rawHistory = (history as Array<{ role: string; content: string }>)
        .slice(-10)
        .map(msg => ({
          role: (msg.role === 'user' ? 'user' : 'model') as 'user' | 'model',
          parts: [{ text: msg.content }],
        }));
      // Gemini requires history to start with a user message
      while (rawHistory.length > 0 && rawHistory[0].role === 'model') rawHistory.shift();

      const chat = model.startChat({ history: rawHistory });

      const result = await chat.sendMessage(message);
      const reply = result.response.text();

      res.json({ reply });
    } catch (err) {
      console.error('[ASSISTANT] Error:', err);
      res.status(500).json({ error: 'Error al procesar la consulta' });
    }
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