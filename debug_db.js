import db from './src/db/index.js';

try {
    const o1Id = db.prepare("INSERT INTO client_orders (client_id, products, order_date, status) VALUES (?, ?, ?, ?)").run(1, '[]', new Date().toISOString(), 'pending').lastInsertRowid;

    console.log('Inserted client order', o1Id);

    // Test dispatch
    console.log('Testing dispatch...');
    const order = db.prepare("SELECT * FROM client_orders WHERE id = ?").get(o1Id);
    const user = 'Test';
    const interactionStmt = db.prepare(`
         INSERT INTO interactions (client_id, type, date, user, description, products)
         VALUES (?, 'entrega', ?, ?, ?, ?)
       `);
    interactionStmt.run(
        order.client_id,
        new Date().toISOString(),
        user || 'Admin',
        `Entrega de pedido #${order.id}`,
        order.products
    );

    console.log('Dispatch interaction OK');

    // Test Delete
    console.log('Testing Delete...');
    db.prepare("DELETE FROM client_orders WHERE id = ?").run(o1Id);
    console.log('Delete OK');

} catch (e) {
    console.error("DB Error:", e);
}
