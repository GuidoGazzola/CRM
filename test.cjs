import fs from 'fs';
import Papa from 'papaparse';

const file = fs.readFileSync('test_clientes.csv', 'utf8');
const results = Papa.parse(file, { header: true, skipEmptyLines: true });

const parsed = results.data.map((row) => ({
    razon_social: row.razon_social,
    cuit: row.cuit?.replace(/\D/g, ''),
    plazo_de_pago: row.plazo_de_pago
}));

console.log('Parsed:', parsed);

for (const item of parsed) {
    try {
        console.log("Cuit slice:", (item.cuit || '').replace(/\D/g, '').slice(0, 11));
        console.log("Item plazo de pago:", item.plazo_de_pago);
        if (item.plazo_de_pago && item.plazo_de_pago.toLowerCase() !== 'anticipado') {
            const match = item.plazo_de_pago.match(/\d+/);
            console.log("Match:", match);
        }
    } catch (e) {
        console.error("Error for item", item, e.message);
    }
}
