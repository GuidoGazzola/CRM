import React, { useState } from 'react';
import { Database, Upload, FileSpreadsheet, CheckCircle2, AlertCircle } from 'lucide-react';
import { useUser } from '../store/UserContext';
import Papa from 'papaparse';

export default function BaseDeDatos() {
  const { isAdmin } = useUser();
  const [importStatus, setImportStatus] = useState<{ type: string; message: string; isError: boolean } | null>(null);

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-8rem)] text-gray-500">
        <AlertCircle className="w-16 h-16 mb-4 text-gray-300" />
        <h2 className="text-xl font-semibold text-gray-900">Acceso Denegado</h2>
        <p>Solo los administradores pueden acceder a esta sección.</p>
      </div>
    );
  }

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>, type: 'products' | 'clients' | 'contracts') => {
    const file = event.target.files?.[0];
    if (!file) return;

    setImportStatus({ type, message: 'Procesando archivo...', isError: false });

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        try {
          let endpoint = '';
          let payload: any = {};

          if (type === 'products') {
            endpoint = '/api/products/import';
            payload = {
              products: results.data.map((row: any) => ({
                code: row.codigo || row.code,
                name: row.nombre || row.name,
                price: parseFloat(row.precio || row.price || '0'),
                category: row.categoria || row.category || '',
              }))
            };
          } else if (type === 'clients') {
            endpoint = '/api/clients/import';
            payload = {
              clients: results.data.map((row: any) => ({
                razon_social: row.razon_social || row.name,
                cuit: row.cuit,
                calificacion: row.calificacion || '',
                consumos_tipicos: row.consumos_tipicos || '',
                demora_promedio_pago: row.demora_promedio_pago || ''
              }))
            };
          } else if (type === 'contracts') {
            endpoint = '/api/contracts/import';
            payload = {
              contracts: results.data.map((row: any) => ({
                client_cuit: row.cuit || row.client_cuit,
                product_code: row.codigo_producto || row.product_code,
                special_price: parseFloat(row.precio_especial || row.special_price || '0')
              }))
            };
          }

          const res = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });

          if (res.ok) {
            setImportStatus({ type, message: 'Importación exitosa', isError: false });
          } else {
            throw new Error('Error en la respuesta del servidor');
          }
        } catch (error) {
          console.error(error);
          setImportStatus({ type, message: 'Error al importar los datos. Verifique el formato del archivo.', isError: true });
        }
        
        // Reset input
        event.target.value = '';
      },
      error: (error) => {
        setImportStatus({ type, message: `Error leyendo archivo: ${error.message}`, isError: true });
        event.target.value = '';
      }
    });
  };

  const renderImportCard = (
    title: string, 
    description: string, 
    type: 'products' | 'clients' | 'contracts', 
    expectedColumns: string
  ) => (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center">
          <div className="p-3 bg-indigo-50 text-indigo-600 rounded-lg mr-4">
            <FileSpreadsheet className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-gray-900">{title}</h3>
            <p className="text-sm text-gray-500">{description}</p>
          </div>
        </div>
      </div>
      
      <div className="mb-6 p-4 bg-gray-50 rounded-lg border border-gray-100">
        <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Columnas Esperadas (CSV)</h4>
        <code className="text-sm text-gray-700 font-mono">{expectedColumns}</code>
      </div>

      <div className="flex items-center justify-between">
        <label className="relative cursor-pointer bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg font-medium transition-colors flex items-center">
          <Upload className="w-4 h-4 mr-2" />
          <span>Seleccionar Archivo</span>
          <input 
            type="file" 
            accept=".csv" 
            className="hidden" 
            onChange={(e) => handleFileUpload(e, type)}
          />
        </label>
        
        {importStatus?.type === type && (
          <div className={`flex items-center text-sm font-medium ${importStatus.isError ? 'text-red-600' : 'text-green-600'}`}>
            {importStatus.isError ? <AlertCircle className="w-4 h-4 mr-1.5" /> : <CheckCircle2 className="w-4 h-4 mr-1.5" />}
            {importStatus.message}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-3 mb-8">
        <Database className="w-8 h-8 text-indigo-600" />
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Base de Datos</h1>
          <p className="text-gray-500">Gestión e importación masiva de datos del sistema</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {renderImportCard(
          'Catálogo de Productos',
          'Actualiza la lista general de productos y precios base.',
          'products',
          'codigo, nombre, precio, categoria'
        )}
        
        {renderImportCard(
          'Directorio de Clientes',
          'Importa o actualiza la información de los clientes.',
          'clients',
          'razon_social, cuit, calificacion, consumos_tipicos, demora_promedio_pago'
        )}
        
        {renderImportCard(
          'Contratos de Precios',
          'Asigna precios especiales de productos a clientes específicos.',
          'contracts',
          'cuit, codigo_producto, precio_especial'
        )}
      </div>
    </div>
  );
}
