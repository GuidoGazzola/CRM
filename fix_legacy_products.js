import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const db = new Database(path.join(__dirname, 'crm.db'));

db.prepare("UPDATE products SET presentation = name WHERE presentation IS NULL OR presentation = ''").run();
console.log("Updated presentations for legacy products.");
