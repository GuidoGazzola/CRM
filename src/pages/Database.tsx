import React, { useState, useEffect, useRef } from 'react';
import { Database as DatabaseIcon, Users, Truck, Package, Upload, Plus, X, Trash2, Download } from 'lucide-react';
import { useUser } from '../store/UserContext';
import Papa from 'papaparse';

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

  // Form states
  const [cuit, setCuit] = useState('');
  const [contacts, setContacts] = useState<ContactChannel[]>([]);

  useEffect(() => {
    fetchData();
  }, [activeTab]);

  const fetchData = () => {
    if (activeTab === 'clients') {
      fetch('/api/clients').then(res => res.json()).then(setClients);
    } else if (activeTab === 'suppliers') {
      fetch('/api/suppliers').then(res => res.json()).then(data => {
        setSuppliers(data.map((s: any) => ({
          ...s,
          contact_channels: s.contact_channels ? JSON.parse(s.contact_channels) : []
        })));
      });
    } else if (activeTab === 'products') {
      fetch('/api/products').then(res => res.json()).then(setProducts);
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

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    
    let endpoint = '';
    let body: any = {};

    if (activeTab === 'clients') {
      if (cuit.length !== 11) {
        alert('El CUIT debe tener exactamente 11 dígitos numéricos.');
        return;
      }
      endpoint = '/api/clients';
      body = {
        razon_social: formData.get('razon_social'),
        cuit: cuit,
        plazo_de_pago: formData.get('plazo_de_pago')
      };
    } else if (activeTab === 'suppliers') {
      if (cuit.length !== 11) {
        alert('El CUIT debe tener exactamente 11 dígitos numéricos.');
        return;
      }
      endpoint = '/api/suppliers';
      body = {
        razon_social: formData.get('razon_social'),
        cuit: cuit,
        contact_channels: JSON.stringify(contacts)
      };
    } else if (activeTab === 'products') {
      endpoint = '/api/products/import'; // Using import endpoint for single insert as well since it handles conflicts
      body = {
        products: [{
          code: formData.get('code'),
          name: formData.get('name')
        }]
      };
    }

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    if (res.ok) {
      setShowModal(false);
      setCuit('');
      setContacts([]);
      fetchData();
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        let endpoint = '';
        let body: any = {};

        if (activeTab === 'clients') {
          endpoint = '/api/clients/import';
          body = {
            clients: results.data.map((row: any) => ({
              razon_social: row.razon_social,
              cuit: row.cuit?.replace(/\D/g, ''),
              plazo_de_pago: row.plazo_de_pago
            })).filter((c: any) => c.razon_social && c.cuit?.length === 11)
          };
        } else if (activeTab === 'suppliers') {
          endpoint = '/api/suppliers/import';
          body = {
            suppliers: results.data.map((row: any) => ({
              razon_social: row.razon_social,
              cuit: row.cuit?.replace(/\D/g, ''),
              contact_channels: row.contact_channels || '[]'
            })).filter((s: any) => s.razon_social && s.cuit?.length === 11)
          };
        } else if (activeTab === 'products') {
          endpoint = '/api/products/import';
          body = {
            products: results.data.map((row: any) => ({
              code: row.codigo,
              name: row.presentacion
            })).filter((p: any) => p.code && p.name)
          };
        }

        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });

        if (res.ok) {
          alert('Datos importados correctamente.');
          fetchData();
        } else {
          alert('Error al importar los datos.');
        }
        
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
      csvContent = 'codigo,presentacion\nPROD-01,Caja x 10 unidades\n';
      filename = 'plantilla_productos.csv';
    }

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center">
          <DatabaseIcon className="w-6 h-6 mr-2 text-indigo-600" />
          Base de Datos
        </h1>
        
        {isAdmin && (
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
              onClick={() => {
                setCuit('');
                setContacts([]);
                setShowModal(true);
              }}
              className="bg-indigo-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-indigo-700 transition-colors flex items-center"
            >
              <Plus className="w-5 h-5 mr-2" />
              Nuevo Registro
            </button>
          </div>
        )}
      </div>

      <div className="flex bg-white rounded-lg shadow-sm border border-gray-200 p-1 w-fit">
        <button
          onClick={() => setActiveTab('clients')}
          className={`px-4 py-2 text-sm font-medium rounded-md transition-colors flex items-center ${
            activeTab === 'clients' ? 'bg-indigo-50 text-indigo-700' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
          }`}
        >
          <Users className="w-4 h-4 mr-2" /> Clientes
        </button>
        <button
          onClick={() => setActiveTab('suppliers')}
          className={`px-4 py-2 text-sm font-medium rounded-md transition-colors flex items-center ${
            activeTab === 'suppliers' ? 'bg-indigo-50 text-indigo-700' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
          }`}
        >
          <Truck className="w-4 h-4 mr-2" /> Proveedores
        </button>
        <button
          onClick={() => setActiveTab('products')}
          className={`px-4 py-2 text-sm font-medium rounded-md transition-colors flex items-center ${
            activeTab === 'products' ? 'bg-indigo-50 text-indigo-700' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
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
              {activeTab === 'products' && "Columnas: codigo, presentacion."}
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
                  </>
                )}
                {activeTab === 'suppliers' && (
                  <>
                    <th className="px-6 py-4 font-semibold">Razón Social</th>
                    <th className="px-6 py-4 font-semibold">CUIT</th>
                    <th className="px-6 py-4 font-semibold">Contactos</th>
                  </>
                )}
                {activeTab === 'products' && (
                  <>
                    <th className="px-6 py-4 font-semibold">Código</th>
                    <th className="px-6 py-4 font-semibold">Presentación</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {activeTab === 'clients' && clients.map((client) => (
                <tr key={client.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="px-6 py-4 font-medium text-gray-900">{client.razon_social}</td>
                  <td className="px-6 py-4">{client.cuit}</td>
                  <td className="px-6 py-4">{client.plazo_de_pago || '-'}</td>
                </tr>
              ))}
              {activeTab === 'suppliers' && suppliers.map((supplier) => (
                <tr key={supplier.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="px-6 py-4 font-medium text-gray-900">{supplier.razon_social}</td>
                  <td className="px-6 py-4">{supplier.cuit}</td>
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
                </tr>
              ))}
              {activeTab === 'products' && products.map((product) => (
                <tr key={product.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="px-6 py-4 font-medium text-gray-900">{product.code}</td>
                  <td className="px-6 py-4">{product.name}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden max-h-[90vh] flex flex-col">
            <div className="p-6 border-b border-gray-200 flex justify-between items-center shrink-0">
              <h3 className="text-lg font-bold text-gray-900">
                Nuevo {activeTab === 'clients' ? 'Cliente' : activeTab === 'suppliers' ? 'Proveedor' : 'Producto'}
              </h3>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="overflow-y-auto p-6">
              <form id="add-form" onSubmit={handleSubmit} className="space-y-4">
                {activeTab === 'clients' && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Razón Social</label>
                      <input type="text" name="razon_social" required className="w-full border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-indigo-500 outline-none" />
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
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Plazo de Pago</label>
                      <input type="text" name="plazo_de_pago" placeholder="Ej: Anticipado, Contado, 30 días" required className="w-full border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-indigo-500 outline-none" />
                    </div>
                  </>
                )}

                {activeTab === 'suppliers' && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Razón Social</label>
                      <input type="text" name="razon_social" required className="w-full border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-indigo-500 outline-none" />
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
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Código</label>
                      <input type="text" name="code" required className="w-full border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-indigo-500 outline-none" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Presentación</label>
                      <input type="text" name="name" required className="w-full border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-indigo-500 outline-none" />
                    </div>
                  </>
                )}
              </form>
            </div>
            
            <div className="p-6 border-t border-gray-200 flex justify-end gap-3 shrink-0">
              <button 
                type="button" 
                onClick={() => setShowModal(false)}
                className="px-4 py-2 text-gray-700 font-medium hover:bg-gray-100 rounded-lg transition-colors"
              >
                Cancelar
              </button>
              <button 
                type="submit"
                form="add-form"
                className="px-4 py-2 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 transition-colors"
              >
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
