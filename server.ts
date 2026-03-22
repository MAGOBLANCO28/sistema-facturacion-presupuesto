import express from "express";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const db = new Database("database.db");

// Initialize database
db.exec(`
  CREATE TABLE IF NOT EXISTS settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    company_name TEXT,
    owner_name TEXT,
    cif TEXT,
    phone TEXT,
    email TEXT,
    address TEXT,
    city TEXT,
    province TEXT
  );

  CREATE TABLE IF NOT EXISTS documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT CHECK(type IN ('invoice', 'quote')),
    number TEXT,
    date TEXT,
    client_name TEXT,
    client_dni TEXT,
    client_address TEXT,
    client_city TEXT,
    items TEXT, -- JSON string
    subtotal REAL,
    iva_rate REAL,
    iva_amount REAL,
    total REAL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// Seed default settings if not exists
const settingsCount = db.prepare("SELECT COUNT(*) as count FROM settings").get() as { count: number };
if (settingsCount.count === 0) {
  db.prepare(`
    INSERT INTO settings (id, company_name, owner_name, cif, phone, email, address, city, province)
    VALUES (1, 'JUANMA REFORMAS INTEGRALES Y MANTENIMIENTO', 'Juan Manuel Guilloto Amenedo', '31336022V', '675948420', 'jguilloto@hotmail.com', 'C/Rocío 7, Urb. El Carmen', 'El Puerto de Santa María', 'Cádiz')
  `).run();
}

async function startServer() {
  const app = express();
  app.use(express.json());

  // API Routes
  app.get("/api/settings", (req, res) => {
    const settings = db.prepare("SELECT * FROM settings WHERE id = 1").get();
    res.json(settings);
  });

  app.post("/api/settings", (req, res) => {
    const { company_name, owner_name, cif, phone, email, address, city, province } = req.body;
    db.prepare(`
      UPDATE settings SET 
        company_name = ?, owner_name = ?, cif = ?, phone = ?, email = ?, address = ?, city = ?, province = ?
      WHERE id = 1
    `).run(company_name, owner_name, cif, phone, email, address, city, province);
    res.json({ success: true });
  });

  app.get("/api/documents", (req, res) => {
    const documents = db.prepare("SELECT * FROM documents ORDER BY created_at DESC").all();
    res.json(documents.map((doc: any) => ({ ...doc, items: JSON.parse(doc.items) })));
  });

  app.post("/api/documents", (req, res) => {
    const { type, number, date, client_name, client_dni, client_address, client_city, items, subtotal, iva_rate, iva_amount, total } = req.body;
    const result = db.prepare(`
      INSERT INTO documents (type, number, date, client_name, client_dni, client_address, client_city, items, subtotal, iva_rate, iva_amount, total)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(type, number, date, client_name, client_dni, client_address, client_city, JSON.stringify(items), subtotal, iva_rate, iva_amount, total);
    res.json({ id: result.lastInsertRowid });
  });

  app.delete("/api/documents/:id", (req, res) => {
    db.prepare("DELETE FROM documents WHERE id = ?").run(req.params.id);
    res.json({ success: true });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static("dist"));
    app.get("*", (req, res) => {
      res.sendFile(path.resolve(__dirname, "dist", "index.html"));
    });
  }

  const PORT = 3000;
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
