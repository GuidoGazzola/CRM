import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const db = new Database(path.join(__dirname, 'crm.db'));

const row = db.prepare("SELECT * FROM products WHERE code = 'TEST'").get();
console.log(JSON.stringify(row, null, 2));
