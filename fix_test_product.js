import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const db = new Database(path.join(__dirname, 'crm.db'));

db.prepare("DELETE FROM products WHERE code = 'TEST'").run();
db.prepare(`
  INSERT INTO products (code, name, category, sub_category, grade, presentation)
  VALUES ('TEST', 'Lube Test', 'Lubricante', 'Aceite', '68', '20L')
`).run();

const row = db.prepare("SELECT * FROM products WHERE code = 'TEST'").get();
console.log(JSON.stringify(row, null, 2));
