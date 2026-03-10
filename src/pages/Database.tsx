import React, { useState, useEffect, useRef } from 'react';
import { Database as DatabaseIcon, Users, Truck, Package, Upload, Plus, X, Trash2, Download } from 'lucide-react';
import { useUser } from '../store/UserContext';
import * as Papa from 'papaparse';
import { formatCuit } from '../utils/formatters';
import { supabase } from '../supabaseClient';
import { useInsertKey } from '../hooks/useInsertKey';

interface ContactChannel {
  name: string;
  phone: string;
  email: string;
}

export default function Database() {
  const { isAdmin } = useUser();
  const [activeTab, setActiveTab] = useState<'clients' | 'suppliers' | 'products'>('clients');

  const [clients, setClients] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);

  const [showModal, setShowModal] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [cuit, setCuit] = useState('');
  const [contacts, setContacts] = useState<ContactChannel[]>([]);
  const [paymentType, setPaymentType] = useState<'anticipado' | 'a_plazo'>('anticipado');
  const [paymentDays, setPaymentDays] = useState('');

  const [editingId, setEditingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [importMessage, setImportMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  const handleNew = () => {
    setEditingId(null);
    setCuit('');
    setRazonSocial('');
    setProductCode('');
    setProductName('');
    setProductCategory('Lubricante');
    setProductSubCategory('');
    setProductGrade('');
    setProductPresentation('');
    setContacts([]);
    setPaymentType('anticipado');
    setPaymentDays('');
    setHasCatalog(false);
    setCatalogPdf(null);
    setShowModal(true);
  };

  useInsertKey(handleNew);

  // New Client Catalog fields
  const [hasCatalog, setHasCatalog] = useState(false);
  const [catalogPdf, setCatalogPdf] = useState<string | null>(null);

  // Common controlled inputs
  const [razonSocial, setRazonSocial] = useState('');
  const [productCode, setProductCode] = useState('');
  const [productName, setProductName] = useState('');
  const [productCategory, setProductCategory] = useState<'Lubricante' | 'Limpiador' | 'Accesorio'>('Lubricante');
  const [productSubCategory, setProductSubCategory] = useState<'Aceite' | 'Grasa' | ''>('');
  const [productGrade, setProductGrade] = useState('');
  const [productPresentation, setProductPresentation] = useState('');
  const [productGrades, setProductGrades] = useState<string[]>([]);
  const [productPresentations, setProductPresentations] = useState<string[]>([]);

  useEffect(() => {
    fetchData();
  }, [activeTab]);

  const fetchData = async () => {
    if (activeTab === 'clients') {
      const { data } = await supabase.from('clients').select('*').order('razon_social', { ascending: true });
      if (data) setClients(data);
    } else if (activeTab === 'suppliers') {
      const { data } = await supabase.from('suppliers').select('*').order('razon_social', { ascending: true });
      if (data) {
        setSuppliers(data.map((s: any) => ({
          ...s,
          contact_channels: s.contact_channels ? JSON.parse(s.contact_channels) : []
        })));
      }
    } else if (activeTab === 'products') {
      const { data } = await supabase.from('products').select('*').order('code', { ascending: true });
      if (data) setProducts(data);
    }
  };

  const handleCuitChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/\D/g, '').slice(0, 11);
    setCuit(value);
  };

  const handleAddContact = () => {
    setContacts([...contacts, { name: '', phone: '', email: '' }]);
  };

  const handleRemoveContact = (index: number) => {
    setContacts(contacts.filter((_, i) => i !== index));
  };

  const handleContactChange = (index: number, field: keyof ContactChannel, value: string) => {
    const newContacts = [...contacts];
    newContacts[index][field] = value;
    setContacts(newContacts);
  };

  const handleEdit = (item: any) => {
    setEditingId(item.id);
    if (activeTab === 'clients') {
      setCuit(String(item.cuit || '').replace(/\D/g, '').slice(0, 11));
      setRazonSocial(item.razon_social || '');
      const plazo = String(item.plazo_de_pago !== undefined && item.plazo_de_pago !== null ? item.plazo_de_pago : '');
      if (plazo && plazo.toLowerCase() !== 'anticipado' && plazo !== '0') {
        const match = plazo.match(/\d+/);
        setPaymentType('a_plazo');
        setPaymentDays(match ? match[0] : '');
      } else {
        setPaymentType('anticipado');
        setPaymentDays('');
      }
      setHasCatalog(!!item.has_catalog);
      setCatalogPdf(item.catalog_pdf || null);
    } else if (activeTab === 'suppliers') {
      setCuit(String(item.cuit || '').replace(/\D/g, '').slice(0, 11));
      setRazonSocial(item.razon_social || '');
      try {
        setContacts(typeof item.contact_channels === 'string' ? JSON.parse(item.contact_channels) : (item.contact_channels || []));
      } catch (e) {
        setContacts([]);
      }
    } else if (activeTab === 'products') {
      setProductCode(item.code || '');
      setProductName(item.name || '');
      setProductCategory(item.category || 'Lubricante');
      setProductSubCategory(item.sub_category || '');
      setProductGrades(Array.isArray(item.grades) ? item.grades : (item.grades ? JSON.parse(item.grades) : []));
      setProductPresentations(Array.isArray(item.presentations) ? item.presentations : (item.presentations ? JSON.parse(item.presentations) : []));
      // For legacy/compatibility during edit sessions:
      setProductGrade('');
      setProductPresentation('');
    }
    setShowModal(true);
  };

  const handleDelete = async () => {
    if (!deletingId) return;
    const { error } = await supabase.from(activeTab).delete().eq('id', deletingId);
    if (!error) {
      setDeletingId(null);
      fetchData();
    } else {
      alert(`Error al borrar: ${error.message}`);
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    let table = activeTab;
    let body: any = {};

    if (activeTab === 'clients') {
      if (cuit.length !== 11) {
        alert('El CUIT debe tener exactamente 11 dígitos numéricos.');
        return;
      }
      const finalPlazo = paymentType === 'anticipado' ? 0 : Number(paymentDays);
      body = {
        razon_social: razonSocial,
        cuit: cuit,
        plazo_de_pago: finalPlazo,
        has_catalog: hasCatalog,
        catalog_pdf: catalogPdf
      };
    } else if (activeTab === 'suppliers') {
      if (cuit.length !== 11) {
        alert('El CUIT debe tener exactamente 11 dígitos numéricos.');
        return;
      }
      body = {
        razon_social: razonSocial,
        cuit: cuit,
        contact_channels: JSON.stringify(contacts)
      };
    } else if (activeTab === 'products') {
      body = {
        code: productCode,
        name: productName,
        category: productCategory,
        sub_category: productCategory === 'Lubricante' ? productSubCategory : null,
        grades: JSON.stringify(productGrades),
        presentations: JSON.stringify(productPresentations)
      };
    }

    let err = null;
    if (editingId) {
      const { error } = await supabase.from(table).update(body).eq('id', editingId);
      err = error;
    } else {
      const { error } = await supabase.from(table).insert([body]);
      err = error;
    }

    if (!err) {
      setShowModal(false);
      setEditingId(null);
      setCuit('');
      setRazonSocial('');
      setProductCode('');
      setProductName('');
      setProductCategory('Lubricante');
      setProductSubCategory('');
      setProductGrade('');
      setProductPresentation('');
      setProductGrades([]);
      setProductPresentations([]);
      setContacts([]);
      setPaymentType('anticipado');
      setPaymentDays('');
      setHasCatalog(false);
      setCatalogPdf(null);
      fetchData();
    } else {
      alert(`Error al guardar: ${err.message}`);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().replace(/\s+/g, '_'),
      complete: async (results) => {
        let table = activeTab;
        let rowsToInsert: any[] = [];

        if (activeTab === 'clients') {
          rowsToInsert = results.data.map((row: any) => ({
            razon_social: row.razon_social,
            cuit: row.cuit?.replace(/\D/g, ''),
            plazo_de_pago: row.plazo_de_pago
          })).filter((c: any) => c.razon_social && c.cuit?.length === 11);
        } else if (activeTab === 'suppliers') {
          rowsToInsert = results.data.map((row: any) => ({
            razon_social: row.razon_social,
            cuit: row.cuit?.replace(/\D/g, ''),
            contact_channels: row.contact_channels || '[]'
          })).filter((s: any) => s.razon_social && s.cuit?.length === 11);
        } else if (activeTab === 'products') {
          rowsToInsert = results.data.map((row: any) => ({
            code: row.codigo,
            name: row.nombre || row.presentacion,
            category: row.categoria,
            sub_category: row.sub_categoria,
            grades: row.grado ? JSON.stringify([row.grado]) : '[]',
            presentations: row.presentacion ? JSON.stringify([row.presentacion]) : '[]'
          })).filter((p: any) => p.code && JSON.parse(p.presentations).length > 0);
        }

        const { error } = await supabase.from(table).insert(rowsToInsert);

        if (!error) {
          setImportMessage({ type: 'success', text: 'Datos importados correctamente.' });
          fetchData();
        } else {
          setImportMessage({ type: 'error', text: 'Error al importar los datos.' });
        }

        setTimeout(() => setImportMessage(null), 3000);

        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      }
    });
  };

  const downloadTemplate = () => {
    let csvContent = '';
    let filename = '';

    if (activeTab === 'clients') {
      csvContent = 'razon_social,cuit,plazo_de_pago\nEjemplo SA,30123456789,30 días\n';
      filename = 'plantilla_clientes.csv';
    } else if (activeTab === 'suppliers') {
      csvContent = 'razon_social,cuit,contact_channels\nProveedor SRL,30987654321,[{"name":"Juan","phone":"11223344","email":"juan@prov.com"}]\n';
      filename = 'plantilla_proveedores.csv';
    } else if (activeTab === 'products') {
      csvContent = 'codigo,nombre,categoria,sub_categoria,grado,presentacion\n533,Limpiador Industrial,Limpiador,,,5L\n533,Limpiador Industrial,Limpiador,,,20L\nGLAS,Grasa Glas,Lubricante,Grasa,NLGI 2,18kg\n';
      filename = 'plantilla_productos.csv';
    }

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center">
          <DatabaseIcon className="w-6 h-6 mr-2 text-indigo-600" />
          Base de Datos
        </h1>

        {importMessage && (
          <div className={`px-4 py-2 rounded-lg text-sm font-medium ${importMessage.type === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
            {importMessage.text}
          </div>
        )}

        <div className="flex gap-3">
            <input
              type="file"
              accept=".csv"
              className="hidden"
              ref={fileInputRef}
              onChange={handleFileUpload}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="bg-white text-gray-700 border border-gray-300 px-4 py-2 rounded-lg font-medium hover:bg-gray-50 transition-colors flex items-center"
            >
              <Upload className="w-5 h-5 mr-2" />
              Importar CSV
            </button>
            <button
              onClick={handleNew}
              className="bg-indigo-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-indigo-700 transition-colors flex items-center"
            >
              <Plus className="w-5 h-5 mr-2" />
              Nuevo Registro
            </button>
          </div>
      </div>

      <div className="flex bg-white rounded-lg shadow-sm border border-gray-200 p-1 w-fit">
        <button
          onClick={() => setActiveTab('clients')}
          className={`px-4 py-2 text-sm font-medium rounded-md transition-colors flex items-center ${activeTab === 'clients' ? 'bg-indigo-50 text-indigo-700' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
            }`}
        >
          <Users className="w-4 h-4 mr-2" /> Clientes
        </button>
        <button
          onClick={() => setActiveTab('suppliers')}
          className={`px-4 py-2 text-sm font-medium rounded-md transition-colors flex items-center ${activeTab === 'suppliers' ? 'bg-indigo-50 text-indigo-700' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
            }`}
        >
          <Truck className="w-4 h-4 mr-2" /> Proveedores
        </button>
        <button
          onClick={() => setActiveTab('products')}
          className={`px-4 py-2 text-sm font-medium rounded-md transition-colors flex items-center ${activeTab === 'products' ? 'bg-indigo-50 text-indigo-700' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
            }`}
        >
          <Package className="w-4 h-4 mr-2" /> Productos
        </button>
      </div>

      {isAdmin && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-start">
          <div className="flex-1">
            <h4 className="text-sm font-semibold text-blue-800 mb-1">Formato CSV Recomendado</h4>
            <p className="text-sm text-blue-600 mb-2">
              {activeTab === 'clients' && "Columnas: razon_social, cuit, plazo_de_pago. El CUIT debe tener 11 dígitos numéricos."}
              {activeTab === 'suppliers' && "Columnas: razon_social, cuit, contact_channels. contact_channels debe ser un JSON válido o vacío."}
              {activeTab === 'products' && "Columnas: codigo, nombre, categoria, sub_categoria, grado, presentacion."}
            </p>
            <button
              onClick={downloadTemplate}
              className="text-sm text-blue-700 font-medium hover:text-blue-900 flex items-center"
            >
              <Download className="w-4 h-4 mr-1" /> Descargar Plantilla
            </button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-gray-500">
            <thead className="text-xs text-gray-700 uppercase bg-gray-50 border-b border-gray-200">
              <tr>
                {activeTab === 'clients' && (
                  <>
                    <th className="px-6 py-4 font-semibold">Razón Social</th>
                    <th className="px-6 py-4 font-semibold">CUIT</th>
                    <th className="px-6 py-4 font-semibold">Plazo de Pago</th>
                    <th className="px-6 py-4 font-semibold">Catálogo</th>
                    <th className="px-6 py-4 font-semibold">Calificación</th>
                    {isAdmin && <th className="px-6 py-4 font-semibold text-right">Acciones</th>}
                  </>
                )}
                {activeTab === 'suppliers' && (
                  <>
                    <th className="px-6 py-4 font-semibold">Razón Social</th>
                    <th className="px-6 py-4 font-semibold">CUIT</th>
                    <th className="px-6 py-4 font-semibold">Contactos</th>
                    <th className="px-6 py-4 font-semibold">Calificación / Nota Final</th>
                    {isAdmin && <th className="px-6 py-4 font-semibold text-right">Acciones</th>}
                  </>
                )}
                {activeTab === 'products' && (
                  <>
                    <th className="px-6 py-4 font-semibold">Código</th>
                    <th className="px-6 py-4 font-semibold">Nombre</th>
                    <th className="px-6 py-4 font-semibold">Categoría</th>
                    <th className="px-6 py-4 font-semibold">Grado/Sub-cat</th>
                    <th className="px-6 py-4 font-semibold">Presentación</th>
                    {isAdmin && <th className="px-6 py-4 font-semibold text-right">Acciones</th>}
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {activeTab === 'clients' && clients.map((client) => (
                <tr key={client.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="px-6 py-4 font-medium text-gray-900">{client.razon_social}</td>
                  <td className="px-6 py-4">{formatCuit(client.cuit)}</td>
                  <td className="px-6 py-4">{client.plazo_de_pago === 0 || client.plazo_de_pago === '0' || client.plazo_de_pago?.toString().toLowerCase() === 'anticipado' ? 'Anticipado' : (client.plazo_de_pago || '-')}</td>
                  <td className="px-6 py-4">
                    {client.has_catalog ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-green-50 text-green-700 border border-green-200">
                        Sí
                      </span>
                    ) : (
                      <span className="text-gray-400">-</span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    {client.calificacion ? (
                      <span className={`inline-flex items-center px-2 py-1 rounded-md text-xs font-medium ${client.calificacion === 'Excelente' ? 'bg-green-100 text-green-800' :
                        client.calificacion === 'Bueno' ? 'bg-blue-100 text-blue-800' :
                          client.calificacion === 'Regular' ? 'bg-yellow-100 text-yellow-800' :
                            'bg-red-100 text-red-800'
                        }`}>
                        {client.calificacion} {client.demora_promedio_pago ? `(${client.demora_promedio_pago})` : ''}
                      </span>
                    ) : '-'}
                  </td>
                  {isAdmin && (
                    <td className="px-6 py-4 text-right">
                      <button onClick={() => handleEdit(client)} className="text-indigo-600 hover:text-indigo-900 mx-2 text-sm font-medium">Editar</button>
                      <button onClick={() => setDeletingId(client.id)} className="text-red-600 hover:text-red-900 text-sm font-medium">Borrar</button>
                    </td>
                  )}
                </tr>
              ))}
              {activeTab === 'suppliers' && suppliers.map((supplier) => (
                <tr key={supplier.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="px-6 py-4 font-medium text-gray-900">{supplier.razon_social}</td>
                  <td className="px-6 py-4">{formatCuit(supplier.cuit)}</td>
                  <td className="px-6 py-4">
                    {supplier.contact_channels?.length > 0 ? (
                      <ul className="space-y-1">
                        {supplier.contact_channels.map((c: any, i: number) => (
                          <li key={i} className="text-xs">
                            <span className="font-medium">{c.name}</span> - {c.phone} - {c.email}
                          </li>
                        ))}
                      </ul>
                    ) : '-'}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-2">
                        {supplier.calificacion ? (
                          <span className={`inline-flex items-center px-2 py-1 rounded-md text-xs font-medium ${supplier.calificacion === 'A — Confiable' ? 'bg-green-100 text-green-800' :
                            supplier.calificacion === 'B — Aceptable' ? 'bg-blue-100 text-blue-800' :
                              supplier.calificacion === 'C — A mejorar' ? 'bg-yellow-100 text-yellow-800' :
                                'bg-red-100 text-red-800'
                            }`}>
                            {supplier.calificacion} {supplier.demora_promedio_entrega ? `(${supplier.demora_promedio_entrega})` : ''}
                          </span>
                        ) : '-'}
                        {supplier.score !== undefined && supplier.score !== null && (
                          <span className="px-2 py-1 bg-indigo-100 text-indigo-800 font-bold rounded-md border border-indigo-200 text-sm">
                            {supplier.score}
                          </span>
                        )}
                      </div>
                      {supplier.alerts && supplier.alerts.length > 0 && (
                        <div className="mt-1 space-y-1">
                          {supplier.alerts.map((a: string, i: number) => (
                            <p key={i} className="text-[10px] text-red-600 bg-red-50 p-1 rounded border border-red-100 leading-tight whitespace-normal max-w-xs">{a}</p>
                          ))}
                        </div>
                      )}
                    </div>
                  </td>
                  {isAdmin && (
                    <td className="px-6 py-4 text-right">
                      <button onClick={() => handleEdit(supplier)} className="text-indigo-600 hover:text-indigo-900 mx-2 text-sm font-medium">Editar</button>
                      <button onClick={() => setDeletingId(supplier.id)} className="text-red-600 hover:text-red-900 text-sm font-medium">Borrar</button>
                    </td>
                  )}
                </tr>
              ))}
              {activeTab === 'products' && products.map((product) => (
                <tr key={product.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="px-6 py-4 font-medium text-gray-900">{product.code}</td>
                  <td className="px-6 py-4">{product.name}</td>
                  <td className="px-6 py-4">
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800">
                      {product.category}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    {product.category === 'Lubricante' ? (
                      <div className="flex flex-col">
                        <span className="text-xs font-bold text-gray-500 uppercase">{product.sub_category}</span>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {(Array.isArray(product.grades) ? product.grades : JSON.parse(product.grades || '[]')).map((g: string, i: number) => (
                            <span key={i} className="px-1.5 py-0.5 bg-indigo-50 text-indigo-700 rounded border border-indigo-100 text-[10px] font-bold">{g}</span>
                          ))}
                        </div>
                      </div>
                    ) : '-'}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-wrap gap-1">
                      {(Array.isArray(product.presentations) ? product.presentations : JSON.parse(product.presentations || '[]')).map((p: string, i: number) => (
                        <span key={i} className="px-1.5 py-0.5 bg-gray-50 text-gray-700 rounded border border-gray-200 text-[10px] font-bold">{p}</span>
                      ))}
                    </div>
                  </td>
                  {isAdmin && (
                    <td className="px-6 py-4 text-right">
                      <button onClick={() => handleEdit(product)} className="text-indigo-600 hover:text-indigo-900 mx-2 text-sm font-medium">Editar</button>
                      <button onClick={() => setDeletingId(product.id)} className="text-red-600 hover:text-red-900 text-sm font-medium">Borrar</button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg overflow-hidden max-h-[90vh] flex flex-col">
            <div className="p-6 border-b border-gray-200 flex justify-between items-center shrink-0">
              <h3 className="text-lg font-bold text-gray-900">
                {editingId ? 'Editar' : 'Nuevo'} {activeTab === 'clients' ? 'Cliente' : activeTab === 'suppliers' ? 'Proveedor' : 'Producto'}
              </h3>
              <button
                onClick={() => {
                  setShowModal(false);
                  setEditingId(null);
                  setRazonSocial('');
                  setProductCode('');
                  setProductName('');
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form id="add-form" onSubmit={handleSubmit} className="flex flex-col min-h-0">
              <div className="overflow-y-auto p-6 space-y-4">
                {activeTab === 'clients' && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Razón Social</label>
                      <input
                        type="text"
                        name="razon_social"
                        value={razonSocial}
                        onChange={e => setRazonSocial(e.target.value)}
                        required
                        className="w-full border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-indigo-500 outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">N° de CUIT (11 dígitos)</label>
                      <input
                        type="text"
                        value={cuit}
                        onChange={handleCuitChange}
                        placeholder="Ej: 30123456789"
                        required
                        className="w-full border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-indigo-500 outline-none"
                      />
                      <p className="text-xs text-gray-500 mt-1">{cuit.length}/11 dígitos</p>
                    </div>
                    <div className="space-y-2">
                      <label className="block text-sm font-medium text-gray-700">Plazo de Pago</label>
                      <div className="flex items-center gap-4">
                        <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                          <input
                            type="radio"
                            name="payment_type"
                            checked={paymentType === 'anticipado'}
                            onChange={() => setPaymentType('anticipado')}
                            className="text-indigo-600 focus:ring-indigo-500"
                          />
                          Anticipado
                        </label>
                        <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                          <input
                            type="radio"
                            name="payment_type"
                            checked={paymentType === 'a_plazo'}
                            onChange={() => setPaymentType('a_plazo')}
                            className="text-indigo-600 focus:ring-indigo-500"
                          />
                          A Plazo
                        </label>
                      </div>

                      {paymentType === 'a_plazo' && (
                        <div className="mt-3">
                          <label className="block text-xs font-medium text-gray-600 mb-1">Cantidad de días</label>
                          <input
                            type="number"
                            value={paymentDays}
                            onChange={(e) => setPaymentDays(e.target.value)}
                            placeholder="Ej: 17"
                            required
                            min="1"
                            className="w-full border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                          />
                        </div>
                      )}
                    </div>


                    <div className="pt-2 border-t border-gray-100 mt-2">
                      <label className="flex items-center gap-2 cursor-pointer p-3 bg-indigo-50 border border-indigo-100 rounded-lg">
                        <input
                          type="checkbox"
                          checked={hasCatalog}
                          onChange={e => setHasCatalog(e.target.checked)}
                          className="w-4 h-4 text-indigo-600 rounded border-gray-300 focus:ring-indigo-500"
                        />
                        <span className="text-sm font-bold text-indigo-900">Catálogo de precios</span>
                      </label>
                      {hasCatalog && (
                        <div className="mt-3">
                          <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Cargar PDF</label>
                          <input
                            type="file"
                            accept="application/pdf"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) {
                                if (file.size > 5 * 1024 * 1024) {
                                  alert("El archivo no puede pesar más de 5MB");
                                  return;
                                }
                                const reader = new FileReader();
                                reader.onload = () => {
                                  setCatalogPdf(reader.result as string);
                                };
                                reader.readAsDataURL(file);
                              }
                            }}
                            className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
                          />
                          {catalogPdf && <p className="text-xs text-green-600 mt-2 font-medium">✓ Archivo cargado ({Math.round(catalogPdf.length / 1024)} KB)</p>}
                        </div>
                      )}
                    </div>
                  </>
                )}

                {activeTab === 'suppliers' && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Razón Social</label>
                      <input
                        type="text"
                        name="razon_social"
                        value={razonSocial}
                        onChange={e => setRazonSocial(e.target.value)}
                        required
                        className="w-full border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-indigo-500 outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">N° de CUIT (11 dígitos)</label>
                      <input
                        type="text"
                        value={cuit}
                        onChange={handleCuitChange}
                        placeholder="Ej: 30123456789"
                        required
                        className="w-full border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-indigo-500 outline-none"
                      />
                      <p className="text-xs text-gray-500 mt-1">{cuit.length}/11 dígitos</p>
                    </div>

                    <div className="pt-2">
                      <div className="flex justify-between items-center mb-2">
                        <label className="block text-sm font-medium text-gray-700">Canales de Contacto (Opcional)</label>
                        <button type="button" onClick={handleAddContact} className="text-indigo-600 text-sm font-medium hover:text-indigo-800 flex items-center">
                          <Plus className="w-4 h-4 mr-1" /> Agregar
                        </button>
                      </div>

                      <div className="space-y-3">
                        {contacts.map((contact, index) => (
                          <div key={index} className="bg-gray-50 p-3 rounded-lg border border-gray-200 relative">
                            <button
                              type="button"
                              onClick={() => handleRemoveContact(index)}
                              className="absolute top-2 right-2 text-gray-400 hover:text-red-500"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                            <div className="space-y-2 pr-6">
                              <input
                                type="text"
                                placeholder="Nombre"
                                value={contact.name}
                                onChange={(e) => handleContactChange(index, 'name', e.target.value)}
                                className="w-full border border-gray-300 rounded p-1.5 text-sm"
                              />
                              <input
                                type="text"
                                placeholder="Teléfono"
                                value={contact.phone}
                                onChange={(e) => handleContactChange(index, 'phone', e.target.value)}
                                className="w-full border border-gray-300 rounded p-1.5 text-sm"
                              />
                              <input
                                type="email"
                                placeholder="Correo electrónico"
                                value={contact.email}
                                onChange={(e) => handleContactChange(index, 'email', e.target.value)}
                                className="w-full border border-gray-300 rounded p-1.5 text-sm"
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                )}

                {activeTab === 'products' && (
                  <>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Código</label>
                        <input
                          type="text"
                          value={productCode}
                          onChange={e => setProductCode(e.target.value)}
                          required
                          className="w-full border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-indigo-500 outline-none"
                          placeholder="Ej: 533"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Categoría</label>
                        <select
                          value={productCategory}
                          onChange={e => setProductCategory(e.target.value as any)}
                          className="w-full border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-indigo-500 outline-none"
                        >
                          <option value="Lubricante">Lubricante</option>
                          <option value="Limpiador">Limpiador</option>
                          <option value="Accesorio">Accesorio</option>
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Nombre / Producto</label>
                      <input
                        type="text"
                        value={productName}
                        onChange={e => setProductName(e.target.value)}
                        required
                        className="w-full border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-indigo-500 outline-none"
                        placeholder="Ej: Limpiador Industrial"
                      />
                    </div>

                    {productCategory === 'Lubricante' && (
                      <div className="grid grid-cols-2 gap-4 bg-indigo-50 p-3 rounded-lg border border-indigo-100">
                        <div>
                          <label className="block text-xs font-bold text-indigo-700 uppercase mb-1">Tipo</label>
                          <select
                            value={productSubCategory}
                            onChange={e => setProductSubCategory(e.target.value as any)}
                            required
                            className="w-full border border-indigo-200 rounded-lg p-2 text-sm outline-none"
                          >
                            <option value="">Seleccionar...</option>
                            <option value="Aceite">Aceite</option>
                            <option value="Grasa">Grasa</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-indigo-700 uppercase mb-1">
                            {productSubCategory === 'Aceite' ? 'Grados ISO VG' : 'Grados NLGI'}
                          </label>
                          <div className="flex flex-wrap gap-2 mb-2">
                            {productGrades.map((g, i) => (
                              <span key={i} className="bg-white px-2 py-1 rounded-md border border-indigo-200 text-xs font-bold text-indigo-700 flex items-center">
                                {g} <X className="w-3 h-3 ml-1 cursor-pointer hover:text-red-500" onClick={() => setProductGrades(prev => prev.filter((_, idx) => idx !== i))} />
                              </span>
                            ))}
                          </div>
                          <div className="flex gap-1">
                            <input
                              type="text"
                              value={productGrade}
                              onChange={e => setProductGrade(e.target.value)}
                              onKeyDown={e => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  if (productGrade.trim() && !productGrades.includes(productGrade.trim())) {
                                    setProductGrades([...productGrades, productGrade.trim()]);
                                    setProductGrade('');
                                  }
                                }
                              }}
                              placeholder="Ej: 68"
                              className="flex-1 border border-indigo-200 rounded-lg p-2 text-sm outline-none"
                            />
                            <button
                              type="button"
                              onClick={() => {
                                if (productGrade.trim() && !productGrades.includes(productGrade.trim())) {
                                  setProductGrades([...productGrades, productGrade.trim()]);
                                  setProductGrade('');
                                }
                              }}
                              className="bg-indigo-600 text-white p-2 rounded-lg shrink-0"
                            >
                              <Plus className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    )}

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Presentaciones</label>
                      <div className="flex flex-wrap gap-2 mb-2">
                        {productPresentations.map((p, i) => (
                          <span key={i} className="bg-gray-100 px-2 py-1 rounded-md border border-gray-300 text-xs font-bold text-gray-800 flex items-center">
                            {p} <X className="w-3 h-3 ml-1 cursor-pointer hover:text-red-500" onClick={() => setProductPresentations(prev => prev.filter((_, idx) => idx !== i))} />
                          </span>
                        ))}
                      </div>
                      <div className="flex gap-1">
                        <input
                          type="text"
                          value={productPresentation}
                          onChange={e => setProductPresentation(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              if (productPresentation.trim() && !productPresentations.includes(productPresentation.trim())) {
                                setProductPresentations([...productPresentations, productPresentation.trim()]);
                                setProductPresentation('');
                              }
                            }
                          }}
                          placeholder="Ej: 20L"
                          className="flex-1 border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-indigo-500 outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            if (productPresentation.trim() && !productPresentations.includes(productPresentation.trim())) {
                              setProductPresentations([...productPresentations, productPresentation.trim()]);
                              setProductPresentation('');
                            }
                          }}
                          className="bg-gray-600 text-white p-2 rounded-lg shrink-0"
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>

              <div className="p-6 border-t border-gray-200 flex justify-end gap-3 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    setShowModal(false);
                    setEditingId(null);
                    setRazonSocial('');
                    setProductCode('');
                    setProductName('');
                  }}
                  className="px-4 py-2 text-gray-700 font-medium hover:bg-gray-100 rounded-lg transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 transition-colors"
                >
                  Guardar
                </button>
              </div>
            </form>
          </div>
        </div >
      )
      }

      {/* Delete Confirmation Modal */}
      {
        deletingId && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-sm overflow-hidden p-6 text-center">
              <h3 className="text-lg font-bold text-gray-900 mb-2">¿Eliminar registro?</h3>
              <p className="text-sm text-gray-500 mb-6">
                Esta acción no se puede deshacer y borrará permanentemente este registro.
              </p>
              <div className="flex justify-center gap-3">
                <button
                  onClick={() => setDeletingId(null)}
                  className="px-4 py-2 text-gray-700 font-medium hover:bg-gray-100 rounded-lg transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleDelete}
                  className="px-4 py-2 bg-red-600 text-white font-medium rounded-lg hover:bg-red-700 transition-colors"
                >
                  Borrar
                </button>
              </div>
            </div>
          </div>
        )
      }
    </div >
  );
}
