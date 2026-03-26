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
      type TEXT CHECK(type IN ('invoice', 'quote')),
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
  `);

  console.log("✅ Base de datos lista");
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
      if (doc && doc.type === 'invoice' && (doc.status === 'sent' || doc.status === 'paid')) {
        return res.status(403).json({
          error: "Inalterabilidad activa: No se puede modificar/eliminar una factura enviada o pagada. Debe emitir una Factura Rectificativa."
        });
      }
    }
  }
  next();
}

async function startServer() {
  await initDB();

  const app = express();
  app.use(express.json());

  // Servir imágenes de logos y tickets
  app.use("/uploads", express.static(uploadsDir));

  // ── SEGURIDAD AVANZADA (Fase 2.2) ─────────────────
  
  // 1. Cambiar PIN
  app.patch("/api/auth/pin", authMiddleware, async (req: any, res) => {
    const { currentPin, newPin } = req.body;
    try {
      const { rows } = await pool.query("SELECT security_pin FROM tenants WHERE id = $1", [req.tenantId]);
      if (rows[0].security_pin !== currentPin) return res.status(400).json({ error: "PIN actual incorrecto" });
      
      await pool.query("UPDATE tenants SET security_pin = $1 WHERE id = $1", [newPin, req.tenantId]);
      res.json({ message: "PIN actualizado con éxito" });
    } catch (err) {
      res.status(500).json({ error: "Error al actualizar PIN" });
    }
  });

  // 2. Obtener Semilla (Protegida por PIN)
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
    const { company_name, owner_name, cif, phone, email, address, city, province } = req.body;
    await pool.query(`
      UPDATE settings SET
        company_name=$1, owner_name=$2, cif=$3, phone=$4,
        email=$5, address=$6, city=$7, province=$8
      WHERE tenant_id=$9
    `, [company_name, owner_name, cif, phone, email, address, city, province, req.tenantId]);
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
    const prefix = type === 'invoice' ? 'FAC' : 'PRE';
    
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
    const result = await pool.query(
      "SELECT * FROM documents WHERE tenant_id = $1 ORDER BY created_at DESC",
      [req.tenantId]
    );
    res.json(result.rows);
  });

  app.post("/api/documents", authMiddleware, async (req: any, res) => {
    const { type, number, date, client_name, client_dni, client_address, client_city, client_zip, client_province, items, subtotal, iva_rate, iva_amount, total, status, is_rectificative, original_invoice_id } = req.body;
    
    const result = await pool.query(`
      INSERT INTO documents (tenant_id, type, number, date, client_name, client_dni, client_address, client_city, client_zip, client_province, items, subtotal, iva_rate, iva_amount, total, status, is_rectificative, original_invoice_id)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18) RETURNING id
    `, [req.tenantId, type, number, date, client_name, client_dni, client_address, client_city, client_zip, client_province, JSON.stringify(items), subtotal, iva_rate, iva_amount, total, status || (type === 'invoice' ? 'Borrador' : 'Pendiente'), is_rectificative || false, original_invoice_id || null]);
    res.json({ id: result.rows[0].id });
  });

  app.patch("/api/documents/:id/status", authMiddleware, async (req: any, res) => {
    const { status } = req.body;
    await pool.query("UPDATE documents SET status = $1 WHERE id = $2 AND tenant_id = $3", [status, req.params.id, req.tenantId]);
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
    const { description, amount, iva_amount, iva_rate, category, date, ticket_image_url } = req.body;
    const result = await pool.query(`
      INSERT INTO expenses (tenant_id, description, amount, iva_amount, iva_rate, category, date, ticket_image_url)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id
    `, [req.tenantId, description, amount, iva_amount, iva_rate, category, date, ticket_image_url]);
    res.json({ id: result.rows[0].id });
  });

  app.delete("/api/expenses/:id", authMiddleware, async (req: any, res) => {
    await pool.query("DELETE FROM expenses WHERE id = $1 AND tenant_id = $2", [req.params.id, req.tenantId]);
    res.json({ success: true });
  });

  // ── INTELIGENCIA FISCAL REPORTE ────────────────────
  app.get("/api/reports/real-income", authMiddleware, async (req: any, res) => {
    // 1. Facturas Cobradas (PAGADAS)
    const invoicesRes = await pool.query(
      "SELECT SUM(total) as total, SUM(iva_amount) as iva, SUM(subtotal) as subtotal FROM documents WHERE tenant_id = $1 AND type = 'invoice' AND status = 'paid'",
      [req.tenantId]
    );
    
    // 2. Gastos Totales
    const expensesRes = await pool.query(
      "SELECT SUM(amount) as total, SUM(iva_amount) as iva FROM expenses WHERE tenant_id = $1",
      [req.tenantId]
    );

    const income = invoicesRes.rows[0];
    const expense = expensesRes.rows[0];

    const totalIncome = parseFloat(income.total || 0);
    const totalIVACollected = parseFloat(income.iva || 0);
    const totalSubtotalIncome = parseFloat(income.subtotal || 0);

    const totalExpense = parseFloat(expense.total || 0);
    const totalIVAPaid = parseFloat(expense.iva || 0);

    // Lógica Fiscal España 2026:
    // IVA a liquidar = IVA Cobrado - IVA Pagado
    const ivaToPay = Math.max(0, totalIVACollected - totalIVAPaid);
    
    // IRPF (Modelo 130 - 20% del beneficio neto)
    // Beneficio Neto = Subtotal Ingresos - Subtotal Gastos (amount en gastos es total, restamos su iva)
    const netProfit = totalSubtotalIncome - (totalExpense - totalIVAPaid);
    const irpfProvision = Math.max(0, netProfit * 0.20);

    // Sueldo Real = Dinero en cuenta (Total Ingresos) - IVA a pagar - Provisión IRPF - Gastos ya pagados
    // Nota: El dinero disponible realmente es (Total Ingresos - Gastos Pagados) - Impuestos pendientes
    const realSalary = totalIncome - totalExpense - ivaToPay - irpfProvision;

    res.json({
      totalIncome,
      totalExpense,
      ivaToPay,
      irpfProvision,
      realSalary,
      netProfit
    });
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
      const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-lite" });

      const prompt = `Eres un asistente contable español experto. Analiza este documento (puede ser un ticket de compra, factura o albarán) y extrae los datos fiscales.

Devuelve ÚNICAMENTE un objeto JSON válido con estos campos exactos (sin texto adicional, sin markdown):
{
  "description": "concepto del gasto o nombre del establecimiento (máx 60 chars)",
  "provider": "razón social del proveedor si aparece, si no usa description",
  "nif": "NIF o CIF del proveedor si aparece, si no pon null",
  "amount": importe total con IVA como número decimal (ej: 45.50),
  "base_amount": base imponible sin IVA como número decimal,
  "iva_rate": tipo de IVA como entero (21, 10, 4 o 0),
  "iva_amount": cuota de IVA como número decimal,
  "date": "fecha en formato YYYY-MM-DD",
  "category": "una de: Tecnología, Suministros, Transporte, Formación, Comidas, Varios"
}

Reglas:
- Si no hay desglose de IVA visible, calcula asumiendo 21% sobre el total
- Si la fecha no aparece, usa la fecha de hoy: ${new Date().toISOString().split('T')[0]}
- SOLO devuelve el JSON, sin explicaciones ni texto antes o después`;

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

      // Limpiar archivo temporal después de procesar
      fs.unlink(req.file.path, () => {});

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

      // 2. Crear factura como 'Borrador'
      const newInvoice = await pool.query(`
        INSERT INTO documents (tenant_id, type, number, date, client_name, client_dni, client_address, client_city, client_zip, client_province, items, subtotal, iva_rate, iva_amount, total, status, original_invoice_id)
        VALUES ($1, 'invoice', $2, CURRENT_DATE, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'Borrador', $14)
        RETURNING *`,
        [req.tenantId, invoiceNumber, quote.client_name, quote.client_dni, quote.client_address, quote.client_city, quote.client_zip, quote.client_province, JSON.stringify(quote.items), quote.subtotal, quote.iva_rate, quote.iva_amount, quote.total, quote.id]
      );

      // 3. Marcar presupuesto como 'Convertido'
      await pool.query("UPDATE documents SET status = 'Convertido' WHERE id = $1", [quote.id]);

      res.json(newInvoice.rows[0]);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Error al convertir" });
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
    app.use(express.static("dist"));
    app.get("*", (_req, res) => {
      res.sendFile(path.resolve(__dirname, "dist", "index.html"));
    });
  }

  const PORT = 4000;
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`🚀 Servidor en http://localhost:${PORT}`);
  });
}

startServer();