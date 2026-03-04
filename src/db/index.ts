import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, "../../crm.db");

const db = new Database(dbPath);

// Initialize tables
db.exec(`
  CREATE TABLE IF NOT EXISTS clients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    razon_social TEXT NOT NULL,
    cuit TEXT UNIQUE NOT NULL,
    calificacion TEXT,
    consumos_tipicos TEXT,
    demora_promedio_pago TEXT,
    plazo_de_pago TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS interactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id INTEGER NOT NULL,
    type TEXT NOT NULL, -- 'visita', 'entrega', 'presupuesto', 'prueba'
    date DATETIME NOT NULL,
    user TEXT NOT NULL,
    description TEXT,
    products TEXT, -- JSON string of products involved
    FOREIGN KEY(client_id) REFERENCES clients(id)
  );

  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id INTEGER NOT NULL,
    type TEXT NOT NULL, -- 'presupuesto', 'prueba'
    products TEXT, -- JSON string
    description TEXT,
    requested_by TEXT NOT NULL,
    status TEXT DEFAULT 'pending', -- 'pending', 'completed', 'approved', 'rejected'
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    completed_by TEXT,
    completed_at DATETIME,
    result TEXT,
    reminder_date DATETIME,
    reminder_status TEXT,
    FOREIGN KEY(client_id) REFERENCES clients(id)
  );

  CREATE TABLE IF NOT EXISTS supplier_orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    supplier TEXT NOT NULL,
    products TEXT, -- JSON string
    request_date DATETIME NOT NULL,
    transport TEXT,
    status TEXT DEFAULT 'pending', -- 'pending', 'received'
    receive_date DATETIME,
    oc_ref TEXT,
    remito_ref TEXT
  );

  CREATE TABLE IF NOT EXISTS client_orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id INTEGER NOT NULL,
    products TEXT, -- JSON string
    order_date DATETIME NOT NULL,
    status TEXT DEFAULT 'pending', -- 'pending', 'dispatched'
    presupuesto_ref TEXT,
    oc_ref TEXT,
    remito_ref TEXT,
    FOREIGN KEY(client_id) REFERENCES clients(id)
  );

  CREATE TABLE IF NOT EXISTS invoices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id INTEGER NOT NULL,
    invoice_number TEXT NOT NULL,
    amount REAL NOT NULL,
    issue_date DATETIME NOT NULL,
    payment_term_days INTEGER NOT NULL,
    due_date DATETIME NOT NULL,
    status TEXT DEFAULT 'pending', -- 'pending', 'paid_pending_retentions', 'completed'
    payment_date DATETIME,
    payment_amount REAL,
    has_retentions BOOLEAN DEFAULT 0,
    retentions_sent_date DATETIME,
    FOREIGN KEY(client_id) REFERENCES clients(id)
  );

  CREATE TABLE IF NOT EXISTS suppliers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    razon_social TEXT NOT NULL,
    cuit TEXT UNIQUE NOT NULL,
    contact_channels TEXT -- JSON string of array of {name, phone, email}
  );

  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    price REAL,
    category TEXT
  );
`);

try {
  db.exec("ALTER TABLE clients ADD COLUMN plazo_de_pago TEXT;");
} catch (e) {
  // Column might already exist
}
try {
  db.exec("ALTER TABLE suppliers ADD COLUMN calificacion TEXT;");
  db.exec("ALTER TABLE suppliers ADD COLUMN demora_promedio_entrega TEXT;");
} catch (e) { }

try {
  db.exec("ALTER TABLE supplier_orders ADD COLUMN oc_ref TEXT;");
} catch (e) { }
try {
  db.exec("ALTER TABLE supplier_orders ADD COLUMN remito_ref TEXT;");
} catch (e) { }
try {
  db.exec("ALTER TABLE client_orders ADD COLUMN oc_ref TEXT;");
} catch (e) { }
try {
  db.exec("ALTER TABLE client_orders ADD COLUMN remito_ref TEXT;");
} catch (e) { }
const clientCount = db.prepare("SELECT COUNT(*) as count FROM clients").get() as { count: number };
if (clientCount.count === 0) {
  const insertClient = db.prepare("INSERT INTO clients (razon_social, cuit, calificacion, consumos_tipicos, demora_promedio_pago) VALUES (?, ?, ?, ?, ?)");
  insertClient.run("Tech Solutions S.A.", "30-12345678-9", "Excelente", "Laptops, Monitores", "15 días");
  insertClient.run("Comercial del Sur SRL", "30-98765432-1", "Bueno", "Impresoras, Insumos", "30 días");
  insertClient.run("Industrias Metalurgicas", "33-45678901-2", "Regular", "Servidores, UPS", "45 días");

  const insertInteraction = db.prepare("INSERT INTO interactions (client_id, type, date, user, description, products) VALUES (?, ?, ?, ?, ?, ?)");
  insertInteraction.run(1, "visita", new Date().toISOString(), "Juan Perez", "Visita de rutina, todo en orden", "[]");
  insertInteraction.run(2, "entrega", new Date().toISOString(), "Maria Gomez", "Entrega de pedido #102", '[{"name": "Impresora", "qty": 2}]');
  insertInteraction.run(1, "presupuesto", new Date().toISOString(), "Juan Perez", "Solicitud de presupuesto para renovación de equipos", '[{"name": "Laptop", "qty": 10}]');

  const insertTask = db.prepare("INSERT INTO tasks (client_id, type, products, description, requested_by, status) VALUES (?, ?, ?, ?, ?, ?)");
  insertTask.run(1, "presupuesto", '[{"name": "Laptop", "qty": 10}]', "Renovación de equipos", "Juan Perez", "pending");
  insertTask.run(3, "prueba", '[{"name": "Servidor", "qty": 1}]', "Prueba de servidor nuevo", "Maria Gomez", "pending");

  const insertSupplierOrder = db.prepare("INSERT INTO supplier_orders (supplier, products, request_date, transport, status) VALUES (?, ?, ?, ?, ?)");
  insertSupplierOrder.run("Distribuidora IT", '[{"name": "Laptops", "qty": 50}]', new Date().toISOString(), "Expreso Sur", "pending");

  const insertClientOrder = db.prepare("INSERT INTO client_orders (client_id, products, order_date, status) VALUES (?, ?, ?, ?)");
  insertClientOrder.run(2, '[{"name": "Impresora", "qty": 2}]', new Date().toISOString(), "pending");
}

export default db;
