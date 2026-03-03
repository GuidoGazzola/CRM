import React, { useState, useEffect } from 'react';
import { Package, Truck, Calendar, CheckCircle2, Clock } from 'lucide-react';
import { format, differenceInDays } from 'date-fns';

interface SupplierOrder {
  id: number;
  supplier: string;
  products: string;
  request_date: string;
  transport: string;
  status: string;
  receive_date?: string;
}

interface ClientOrder {
  id: number;
  client_id: number;
  client_name: string;
  products: string;
  order_date: string;
  status: string;
}

export default function Pedidos() {
  const [activeTab, setActiveTab] = useState<'supplier' | 'client'>('supplier');
  const [supplierOrders, setSupplierOrders] = useState<SupplierOrder[]>([]);
  const [clientOrders, setClientOrders] = useState<ClientOrder[]>([]);
  const [showNewClientOrderModal, setShowNewClientOrderModal] = useState(false);
  const [showNewSupplierOrderModal, setShowNewSupplierOrderModal] = useState(false);
  const [clients, setClients] = useState<{ id: number, razon_social: string }[]>([]);
  const [suppliers, setSuppliers] = useState<{ id: number, razon_social: string }[]>([]);
  const [productsList, setProductsList] = useState<{ id: number, code: string, name: string }[]>([]);

  useEffect(() => {
    fetchSupplierOrders();
    fetchClientOrders();
    fetch('/api/clients').then(res => res.json()).then(data => setClients(data));
    fetch('/api/suppliers').then(res => res.json()).then(data => setSuppliers(data));
    fetch('/api/products').then(res => res.json()).then(data => setProductsList(data));
  }, []);

  const fetchSupplierOrders = () => {
    fetch('/api/orders/supplier')
      .then(res => res.json())
      .then(data => setSupplierOrders(data));
  };

  const fetchClientOrders = () => {
    fetch('/api/orders/client')
      .then(res => res.json())
      .then(data => setClientOrders(data));
  };

  const handleReceiveSupplierOrder = async (id: number) => {
    const res = await fetch(`/api/orders/supplier/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'received', receive_date: new Date().toISOString() })
    });
    if (res.ok) fetchSupplierOrders();
  };

  const handleCreateClientOrder = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const client_id = formData.get('client_id');
    const products = formData.get('products') as string;
    const presupuesto_ref = formData.get('presupuesto_ref') as string;

    const res = await fetch('/api/orders/client', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id,
        products: JSON.stringify([{ name: products, qty: 1 }]),
        order_date: new Date().toISOString(),
        status: 'pending',
        presupuesto_ref
      })
    });

    if (res.ok) {
      setShowNewClientOrderModal(false);
      fetchClientOrders();
    }
  };

  const handleCreateSupplierOrder = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const supplier = formData.get('supplier') as string;
    const products = formData.get('products') as string;
    const transport = formData.get('transport') as string;

    const res = await fetch('/api/orders/supplier', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        supplier,
        products: JSON.stringify([{ name: products, qty: 1 }]),
        request_date: new Date().toISOString(),
        transport,
        status: 'pending'
      })
    });

    if (res.ok) {
      setShowNewSupplierOrderModal(false);
      fetchSupplierOrders();
    }
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center">
          <Package className="w-6 h-6 mr-2 text-indigo-600" />
          Gestión de Pedidos
        </h1>

        <div className="flex bg-white rounded-lg shadow-sm border border-gray-200 p-1">
          <button
            onClick={() => setActiveTab('supplier')}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${activeTab === 'supplier'
              ? 'bg-indigo-50 text-indigo-700'
              : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              }`}
          >
            A Proveedores
          </button>
          <button
            onClick={() => setActiveTab('client')}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${activeTab === 'client'
              ? 'bg-indigo-50 text-indigo-700'
              : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              }`}
          >
            De Clientes
          </button>
        </div>
      </div>

      {activeTab === 'supplier' && (
        <div className="flex justify-end">
          <button
            onClick={() => setShowNewSupplierOrderModal(true)}
            className="bg-indigo-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-indigo-700 transition-colors flex items-center"
          >
            Nuevo Pedido
          </button>
        </div>
      )}

      {activeTab === 'client' && (
        <div className="flex justify-end">
          <button
            onClick={() => setShowNewClientOrderModal(true)}
            className="bg-indigo-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-indigo-700 transition-colors flex items-center"
          >
            Nuevo Pedido
          </button>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        {activeTab === 'supplier' ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-gray-500">
              <thead className="text-xs text-gray-700 uppercase bg-gray-50 border-b border-gray-200">
                <tr>
                  <th scope="col" className="px-6 py-4 font-semibold">Proveedor</th>
                  <th scope="col" className="px-6 py-4 font-semibold">Productos</th>
                  <th scope="col" className="px-6 py-4 font-semibold">Fecha Solicitud</th>
                  <th scope="col" className="px-6 py-4 font-semibold">Transporte</th>
                  <th scope="col" className="px-6 py-4 font-semibold">Estado</th>
                  <th scope="col" className="px-6 py-4 font-semibold text-right">Acción</th>
                </tr>
              </thead>
              <tbody>
                {supplierOrders.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-8 text-center text-gray-500">
                      No hay pedidos a proveedores registrados.
                    </td>
                  </tr>
                ) : (
                  supplierOrders.map((order) => (
                    <tr key={order.id} className="bg-white border-b border-gray-100 hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4 font-medium text-gray-900">{order.supplier}</td>
                      <td className="px-6 py-4">
                        {order.products && order.products !== '[]' ? (
                          <ul className="list-disc list-inside">
                            {JSON.parse(order.products).map((p: any, i: number) => (
                              <li key={i}>{p.qty}x {p.name}</li>
                            ))}
                          </ul>
                        ) : '-'}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center">
                          <Calendar className="w-4 h-4 mr-2 text-gray-400" />
                          {format(new Date(order.request_date), 'dd/MM/yyyy')}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center">
                          <Truck className="w-4 h-4 mr-2 text-gray-400" />
                          {order.transport || 'No especificado'}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        {order.status === 'pending' ? (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                            <Clock className="w-3 h-3 mr-1" /> Pendiente
                          </span>
                        ) : (
                          <div className="flex flex-col gap-1">
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 w-fit">
                              <CheckCircle2 className="w-3 h-3 mr-1" /> Recibido
                            </span>
                            <span className="text-xs text-gray-500">
                              Demora: {differenceInDays(new Date(order.receive_date!), new Date(order.request_date))} días
                            </span>
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right">
                        {order.status === 'pending' && (
                          <button
                            onClick={() => handleReceiveSupplierOrder(order.id)}
                            className="text-indigo-600 hover:text-indigo-900 font-medium text-sm bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-lg transition-colors"
                          >
                            Marcar Recibido
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-gray-500">
              <thead className="text-xs text-gray-700 uppercase bg-gray-50 border-b border-gray-200">
                <tr>
                  <th scope="col" className="px-6 py-4 font-semibold">Cliente</th>
                  <th scope="col" className="px-6 py-4 font-semibold">Productos</th>
                  <th scope="col" className="px-6 py-4 font-semibold">Fecha Pedido</th>
                  <th scope="col" className="px-6 py-4 font-semibold">Estado</th>
                  <th scope="col" className="px-6 py-4 font-semibold text-right">Acción</th>
                </tr>
              </thead>
              <tbody>
                {clientOrders.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-8 text-center text-gray-500">
                      No hay pedidos de clientes registrados.
                    </td>
                  </tr>
                ) : (
                  clientOrders.map((order) => (
                    <tr key={order.id} className="bg-white border-b border-gray-100 hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4 font-medium text-gray-900">{order.client_name}</td>
                      <td className="px-6 py-4">
                        {order.products && order.products !== '[]' ? (
                          <ul className="list-disc list-inside">
                            {JSON.parse(order.products).map((p: any, i: number) => (
                              <li key={i}>{p.qty}x {p.name}</li>
                            ))}
                          </ul>
                        ) : '-'}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center">
                          <Calendar className="w-4 h-4 mr-2 text-gray-400" />
                          {format(new Date(order.order_date), 'dd/MM/yyyy')}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        {order.status === 'pending' && (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                            <Clock className="w-3 h-3 mr-1" /> Pendiente
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right">
                        {order.status === 'pending' && (
                          <span className="text-sm text-gray-400">Gestionar desde Tareas</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* New Supplier Order Modal */}
      {showNewSupplierOrderModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="p-6 border-b border-gray-200 flex justify-between items-center">
              <h3 className="text-lg font-bold text-gray-900">Nuevo Pedido a Proveedor</h3>
              <button onClick={() => setShowNewSupplierOrderModal(false)} className="text-gray-400 hover:text-gray-600">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <form onSubmit={handleCreateSupplierOrder} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Proveedor</label>
                <select name="supplier" className="w-full border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-indigo-500 outline-none" required>
                  <option value="">Seleccionar proveedor...</option>
                  {suppliers.map(s => (
                    <option key={s.id} value={s.razon_social}>{s.razon_social}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Productos</label>
                <input
                  type="text"
                  name="products"
                  list="products-list"
                  className="w-full border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-indigo-500 outline-none"
                  placeholder="Seleccionar o escribir producto..."
                  required
                />
                <datalist id="products-list">
                  {productsList.map(p => (
                    <option key={p.id} value={p.name}>{p.code}</option>
                  ))}
                </datalist>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Transporte (opcional)</label>
                <input
                  type="text"
                  name="transport"
                  className="w-full border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-indigo-500 outline-none"
                  placeholder="Ej: Andreani, OCA..."
                />
              </div>
              <div className="pt-4 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowNewSupplierOrderModal(false)}
                  className="px-4 py-2 text-gray-700 font-medium hover:bg-gray-100 rounded-lg transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 transition-colors"
                >
                  Guardar Pedido
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* New Client Order Modal */}
      {showNewClientOrderModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="p-6 border-b border-gray-200 flex justify-between items-center">
              <h3 className="text-lg font-bold text-gray-900">Nuevo Pedido de Cliente</h3>
              <button onClick={() => setShowNewClientOrderModal(false)} className="text-gray-400 hover:text-gray-600">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <form onSubmit={handleCreateClientOrder} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Cliente</label>
                <select name="client_id" className="w-full border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-indigo-500 outline-none" required>
                  <option value="">Seleccionar cliente...</option>
                  {clients.map(c => (
                    <option key={c.id} value={c.id}>{c.razon_social}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Productos</label>
                <input
                  type="text"
                  name="products"
                  list="products-list"
                  className="w-full border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-indigo-500 outline-none"
                  placeholder="Seleccionar o escribir producto..."
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">N° de Presupuesto (opcional)</label>
                <input
                  type="text"
                  name="presupuesto_ref"
                  className="w-full border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-indigo-500 outline-none"
                  placeholder="Ej: P-0001"
                />
                <p className="text-xs text-gray-500 mt-1">Si ingresa el número de presupuesto, se cancelará el recordatorio automático.</p>
              </div>
              <div className="pt-4 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowNewClientOrderModal(false)}
                  className="px-4 py-2 text-gray-700 font-medium hover:bg-gray-100 rounded-lg transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 transition-colors"
                >
                  Guardar Pedido
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
