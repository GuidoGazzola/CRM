import db from './src/db/index.js';

try {
    try { db.exec("ALTER TABLE supplier_orders ADD COLUMN remito_ref TEXT"); } catch (e) { }
    try { db.exec("ALTER TABLE client_orders ADD COLUMN remito_ref TEXT"); } catch (e) { }
    console.log('Tables updated with remito_ref');
} catch (e) {
    console.error(e);
}
