import fs from 'fs';
import Papa from 'papaparse';

const file = 'Codigo,Presentación\n533,20\n538,205';
const results = Papa.parse(file, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().replace(/\s+/g, '_')
});

console.log(results.data);
