import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const db = new Database(path.join(__dirname, 'crm.db'));

const info = db.prepare("PRAGMA table_info(products)").all();
console.log(JSON.stringify(info, null, 2));
