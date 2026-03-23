import 'dotenv/config';
import express from "express";
import { createServer as createViteServer } from "vite";
import { Pool } from "pg";
import path from "path";
import { fileURLToPath } from "url";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import multer from "multer";
import fs from "fs";

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
    cb(null, `logo_${req.tenantId}${ext}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB máximo
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/svg+xml', 'image/webp'];
    cb(null, allowed.includes(file.mimetype));
  },
});

// Inicializar tablas
async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tenants (
      id SERIAL PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
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
      items JSONB,
      subtotal REAL,
      iva_rate REAL,
      iva_amount REAL,
      total REAL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  // Añadir columna logo_url si no existe (para bases de datos ya creadas)
  await pool.query(`
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

async function startServer() {
  await initDB();

  const app = express();
  app.use(express.json());

  // Servir imágenes de logos
  app.use("/uploads", express.static(uploadsDir));

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
      res.json({ token });
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

  // ── DOCUMENTS ─────────────────────────────────────
  app.get("/api/documents", authMiddleware, async (req: any, res) => {
    const result = await pool.query(
      "SELECT * FROM documents WHERE tenant_id = $1 ORDER BY created_at DESC",
      [req.tenantId]
    );
    res.json(result.rows);
  });

  app.post("/api/documents", authMiddleware, async (req: any, res) => {
    const { type, number, date, client_name, client_dni, client_address, client_city, items, subtotal, iva_rate, iva_amount, total } = req.body;
    const result = await pool.query(`
      INSERT INTO documents (tenant_id, type, number, date, client_name, client_dni, client_address, client_city, items, subtotal, iva_rate, iva_amount, total)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id
    `, [req.tenantId, type, number, date, client_name, client_dni, client_address, client_city, JSON.stringify(items), subtotal, iva_rate, iva_amount, total]);
    res.json({ id: result.rows[0].id });
  });

  app.delete("/api/documents/:id", authMiddleware, async (req: any, res) => {
    await pool.query("DELETE FROM documents WHERE id = $1 AND tenant_id = $2", [req.params.id, req.tenantId]);
    res.json({ success: true });
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

  const PORT = 3000;
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`🚀 Servidor en http://localhost:${PORT}`);
  });
}

startServer();