import express from "express";
import { createServer as createViteServer } from "vite";
import db from "./src/db/index.js";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Routes

  // -- Clients --
  app.get("/api/clients", (req, res) => {
    const clients = db.prepare("SELECT * FROM clients").all();
    res.json(clients);
  });

  app.post("/api/clients", (req, res) => {
    const { razon_social, cuit, calificacion, consumos_tipicos, demora_promedio_pago, plazo_de_pago } = req.body;
    const stmt = db.prepare(`
      INSERT INTO clients (razon_social, cuit, calificacion, consumos_tipicos, demora_promedio_pago, plazo_de_pago)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const info = stmt.run(razon_social, cuit, calificacion, consumos_tipicos, demora_promedio_pago, plazo_de_pago);
    res.json({ id: info.lastInsertRowid });
  });

  app.post("/api/clients/import", (req, res) => {
    const { clients } = req.body;
    const stmt = db.prepare(`
      INSERT INTO clients (razon_social, cuit, plazo_de_pago)
      VALUES (?, ?, ?)
      ON CONFLICT(cuit) DO UPDATE SET razon_social=excluded.razon_social, plazo_de_pago=excluded.plazo_de_pago
    `);

    const insertMany = db.transaction((cls) => {
      for (const c of cls) {
        stmt.run(c.razon_social, c.cuit, c.plazo_de_pago);
      }
    });

    insertMany(clients);
    res.json({ success: true });
  });

  // -- Suppliers --
  app.get("/api/suppliers", (req, res) => {
    const suppliers = db.prepare("SELECT * FROM suppliers").all();
    res.json(suppliers);
  });

  app.post("/api/suppliers", (req, res) => {
    const { razon_social, cuit, contact_channels } = req.body;
    const stmt = db.prepare(`
      INSERT INTO suppliers (razon_social, cuit, contact_channels)
      VALUES (?, ?, ?)
    `);
    const info = stmt.run(razon_social, cuit, contact_channels);
    res.json({ id: info.lastInsertRowid });
  });

  app.post("/api/suppliers/import", (req, res) => {
    const { suppliers } = req.body;
    const stmt = db.prepare(`
      INSERT INTO suppliers (razon_social, cuit, contact_channels)
      VALUES (?, ?, ?)
      ON CONFLICT(cuit) DO UPDATE SET razon_social=excluded.razon_social, contact_channels=excluded.contact_channels
    `);

    const insertMany = db.transaction((sups) => {
      for (const s of sups) {
        stmt.run(s.razon_social, s.cuit, s.contact_channels);
      }
    });

    insertMany(suppliers);
    res.json({ success: true });
  });

  // -- Interactions --
  app.get("/api/interactions", (req, res) => {
    const interactions = db.prepare(`
      SELECT i.*, c.razon_social as client_name 
      FROM interactions i 
      JOIN clients c ON i.client_id = c.id
      ORDER BY i.date DESC
    `).all();
    res.json(interactions);
  });

  app.post("/api/interactions", (req, res) => {
    const { client_id, type, date, user, description, products } = req.body;
    const stmt = db.prepare(`
      INSERT INTO interactions (client_id, type, date, user, description, products)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const info = stmt.run(client_id, type, date, user, description, products);
    res.json({ id: info.lastInsertRowid });
  });

  // -- Tasks --
  app.get("/api/tasks", (req, res) => {
    const tasks = db.prepare(`
      SELECT t.*, c.razon_social as client_name 
      FROM tasks t 
      JOIN clients c ON t.client_id = c.id
      ORDER BY t.created_at DESC
    `).all();
    res.json(tasks);
  });

  app.post("/api/tasks", (req, res) => {
    const { client_id, type, products, description, requested_by, status } = req.body;
    const stmt = db.prepare(`
      INSERT INTO tasks (client_id, type, products, description, requested_by, status)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const info = stmt.run(client_id, type, products, description, requested_by, status || 'pending');
    res.json({ id: info.lastInsertRowid });
  });

  app.put("/api/tasks/:id", (req, res) => {
    const { status, completed_by, result, reminder_date, reminder_status } = req.body;

    if (status === 'pending' || status === 'approved') {
      const stmt = db.prepare(`
        UPDATE tasks SET status = ?, completed_by = NULL, completed_at = NULL, result = NULL, reminder_date = NULL, reminder_status = NULL
        WHERE id = ?
      `);
      stmt.run(status, req.params.id);
    } else {
      const stmt = db.prepare(`
        UPDATE tasks SET status = ?, completed_by = ?, completed_at = CURRENT_TIMESTAMP, result = ?, reminder_date = ?, reminder_status = ?
        WHERE id = ?
      `);
      stmt.run(status, completed_by, result, reminder_date, reminder_status, req.params.id);
    }
    res.json({ success: true });
  });

  // -- Orders --
  app.get("/api/orders/supplier", (req, res) => {
    const orders = db.prepare("SELECT * FROM supplier_orders ORDER BY request_date DESC").all();
    res.json(orders);
  });

  app.post("/api/orders/supplier", (req, res) => {
    const { supplier, products, request_date, transport, status } = req.body;
    const stmt = db.prepare(`
      INSERT INTO supplier_orders (supplier, products, request_date, transport, status)
      VALUES (?, ?, ?, ?, ?)
    `);
    const info = stmt.run(supplier, products, request_date, transport, status || 'pending');
    res.json({ id: info.lastInsertRowid });
  });

  app.put("/api/orders/supplier/:id", (req, res) => {
    const { status, receive_date } = req.body;
    const stmt = db.prepare(`
      UPDATE supplier_orders SET status = ?, receive_date = ?
      WHERE id = ?
    `);
    stmt.run(status, receive_date, req.params.id);
    res.json({ success: true });
  });

  app.get("/api/orders/client", (req, res) => {
    const orders = db.prepare(`
      SELECT o.*, c.razon_social as client_name 
      FROM client_orders o 
      JOIN clients c ON o.client_id = c.id
      ORDER BY o.order_date DESC
    `).all();
    res.json(orders);
  });

  app.post("/api/orders/client", (req, res) => {
    const { client_id, products, order_date, status, presupuesto_ref } = req.body;
    const stmt = db.prepare(`
      INSERT INTO client_orders (client_id, products, order_date, status, presupuesto_ref)
      VALUES (?, ?, ?, ?, ?)
    `);
    const info = stmt.run(client_id, products, order_date, status || 'pending', presupuesto_ref);

    if (presupuesto_ref) {
      const cancelStmt = db.prepare(`
        UPDATE tasks SET reminder_status = 'cancelled' 
        WHERE type = 'presupuesto' AND result = ? AND client_id = ?
      `);
      cancelStmt.run(presupuesto_ref, client_id);
    }

    res.json({ id: info.lastInsertRowid });
  });

  app.delete("/api/orders/client/:id", (req, res) => {
    const stmt = db.prepare(`
      DELETE FROM client_orders
      WHERE id = ?
    `);
    stmt.run(req.params.id);
    res.json({ success: true });
  });

  // -- Invoices --
  app.get("/api/invoices", (req, res) => {
    const invoices = db.prepare(`
      SELECT i.*, c.razon_social as client_name 
      FROM invoices i 
      JOIN clients c ON i.client_id = c.id
      ORDER BY i.issue_date DESC
    `).all();
    res.json(invoices);
  });

  app.post("/api/invoices", (req, res) => {
    const { client_id, invoice_number, amount, issue_date, payment_term_days, due_date } = req.body;
    const stmt = db.prepare(`
      INSERT INTO invoices (client_id, invoice_number, amount, issue_date, payment_term_days, due_date)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const info = stmt.run(client_id, invoice_number, amount, issue_date, payment_term_days, due_date);
    res.json({ id: info.lastInsertRowid });
  });

  app.put("/api/invoices/:id/pay", (req, res) => {
    const { payment_date, payment_amount, has_retentions } = req.body;
    const status = has_retentions ? 'paid_pending_retentions' : 'completed';
    const stmt = db.prepare(`
      UPDATE invoices 
      SET status = ?, payment_date = ?, payment_amount = ?, has_retentions = ?
      WHERE id = ?
    `);
    stmt.run(status, payment_date, payment_amount, has_retentions ? 1 : 0, req.params.id);

    // Update client delay if completed
    if (status === 'completed') {
      const invoice = db.prepare("SELECT client_id, invoice_number FROM invoices WHERE id = ?").get(req.params.id) as any;
      if (invoice) {
        updateClientPaymentDelay(invoice.client_id);

        // Cancel reminder task
        db.prepare(`
          UPDATE tasks SET reminder_status = 'cancelled' 
          WHERE type = 'cobranza' AND client_id = ? AND description LIKE ?
        `).run(invoice.client_id, `%${invoice.invoice_number}%`);
      }
    }

    res.json({ success: true });
  });

  app.put("/api/invoices/:id/retentions", (req, res) => {
    const { retentions_sent_date } = req.body;
    const stmt = db.prepare(`
      UPDATE invoices 
      SET status = 'completed', retentions_sent_date = ?
      WHERE id = ?
    `);
    stmt.run(retentions_sent_date, req.params.id);

    const invoice = db.prepare("SELECT client_id, invoice_number FROM invoices WHERE id = ?").get(req.params.id) as any;
    if (invoice) {
      updateClientPaymentDelay(invoice.client_id);

      // Cancel reminder task
      db.prepare(`
        UPDATE tasks SET reminder_status = 'cancelled' 
        WHERE type = 'cobranza' AND client_id = ? AND description LIKE ?
      `).run(invoice.client_id, `%${invoice.invoice_number}%`);
    }

    res.json({ success: true });
  });

  function updateClientPaymentDelay(client_id: number) {
    const invoices = db.prepare(`
      SELECT due_date, payment_date, retentions_sent_date 
      FROM invoices 
      WHERE client_id = ? AND status = 'completed'
    `).all(client_id) as any[];

    if (invoices.length === 0) return;

    let totalDelay = 0;
    let count = 0;

    for (const inv of invoices) {
      if (!inv.payment_date) continue;
      const due = new Date(inv.due_date).getTime();
      const paid = new Date(inv.payment_date).getTime();

      let delay = Math.max(0, (paid - due) / (1000 * 60 * 60 * 24));

      if (inv.retentions_sent_date) {
        const retSent = new Date(inv.retentions_sent_date).getTime();
        delay += Math.max(0, (retSent - paid) / (1000 * 60 * 60 * 24));
      }

      totalDelay += delay;
      count++;
    }

    if (count > 0) {
      const avgDelay = Math.round(totalDelay / count);
      let calificacion = 'Excelente';
      if (avgDelay > 0 && avgDelay <= 15) calificacion = 'Bueno';
      else if (avgDelay > 15 && avgDelay <= 30) calificacion = 'Regular';
      else if (avgDelay > 30) calificacion = 'Malo';

      db.prepare(`UPDATE clients SET demora_promedio_pago = ?, calificacion = ? WHERE id = ?`)
        .run(`${avgDelay} días`, calificacion, client_id);
    }
  }

  // -- Products Catalog --
  app.get("/api/products", (req, res) => {
    const products = db.prepare("SELECT * FROM products").all();
    res.json(products);
  });

  app.post("/api/products/import", (req, res) => {
    const { products } = req.body;
    const stmt = db.prepare(`
      INSERT INTO products (code, name, price, category)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(code) DO UPDATE SET name=excluded.name, price=excluded.price, category=excluded.category
    `);

    const insertMany = db.transaction((prods) => {
      for (const p of prods) {
        stmt.run(p.code, p.name, p.price, p.category);
      }
    });

    insertMany(products);
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
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
