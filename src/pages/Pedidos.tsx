import React, { useState, useEffect } from 'react';
import { Package, Truck, Calendar, CheckCircle2, Clock, ChevronDown, ChevronRight, Edit2, Trash2, Plus, Minus, History, FileText, X } from 'lucide-react';
import { format, differenceInDays } from 'date-fns';
import { useUser } from '../store/UserContext';
import { supabase } from '../supabaseClient';
import { useInsertKey } from '../hooks/useInsertKey';

interface SupplierOrder {
  id: number;
  supplier: string;
  products: string;
  request_date: string;
  transport: string;
  status: string;
  oc_ref?: string;
  receive_date?: string;
  remito_ref?: string;
}

interface ClientOrder {
  id: number;
  client_id: number;
  client_name: string;
  products: string;
  order_date: string;
  status: string;
  oc_ref?: string;
  presupuesto_ref?: string;
  remito_ref?: string;
}

interface OrderProduct {
  code: string;
  name: string;
  qty: number;
  grade?: string;
  presentation?: string;
}

interface FulfillProduct extends OrderProduct {
  fulfillQty: number;
}

export default function Pedidos() {
  const { user, isAdmin } = useUser();
  const [activeTab, setActiveTab] = useState<'supplier' | 'client'>('supplier');
  const [supplierOrders, setSupplierOrders] = useState<SupplierOrder[]>([]);
  const [clientOrders, setClientOrders] = useState<ClientOrder[]>([]);
  const [clients, setClients] = useState<{ id: number, razon_social: string }[]>([]);
  const [suppliers, setSuppliers] = useState<{ id: number, razon_social: string }[]>([]);
  const [productsList, setProductsList] = useState<{ id: number, code: string, name: string, grades: string[], presentations: string[], category: string }[]>([]);

  // Expanded rows
  const [expandedOrders, setExpandedOrders] = useState<Set<any>>(new Set());
  const [showSupplierHistory, setShowSupplierHistory] = useState(false);

  // Modals
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  useInsertKey(() => {
    resetForm();
    setShowModal(true);
  });

  // Form states
  const [targetId, setTargetId] = useState(''); // client_id or supplier name
  const [transport, setTransport] = useState('');
  const [presupuestoRef, setPresupuestoRef] = useState('');
  const [ocRef, setOcRef] = useState('');
  const [orderProducts, setOrderProducts] = useState<OrderProduct[]>([{ code: '', name: '', qty: 1 }]);
  const [editingOrder, setEditingOrder] = useState<any>(null);
  const [orderDate, setOrderDate] = useState(format(new Date(), 'yyyy-MM-dd'));

  // Fulfillment Modal states
  const [fulfillOrder, setFulfillOrder] = useState<any>(null);
  const [fulfillDate, setFulfillDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [isPartial, setIsPartial] = useState(false);
  const [fulfillProducts, setFulfillProducts] = useState<FulfillProduct[]>([]);
  const [remitoRef, setRemitoRef] = useState('');

  useEffect(() => {
    fetchSupplierOrders();
    fetchClientOrders();
    const loadData = async () => {
      const [{ data: clientsData }, { data: suppliersData }, { data: productsData }] = await Promise.all([
        supabase.from('clients').select('id, razon_social, fecha_primer_pedido').order('razon_social', { ascending: true }),
        supabase.from('suppliers').select('id, razon_social').order('razon_social', { ascending: true }),
        supabase.from('products').select('*').order('code', { ascending: true })
      ]);
      if (clientsData) setClients(clientsData);
      if (suppliersData) setSuppliers(suppliersData);
      if (productsData) {
        setProductsList(productsData.map((p: any) => ({
          ...p,
          grades: Array.isArray(p.grades) ? p.grades : (p.grades ? JSON.parse(p.grades) : []),
          presentations: Array.isArray(p.presentations) ? p.presentations : (p.presentations ? JSON.parse(p.presentations) : [])
        })));
      }
    };
    loadData();

    const interval = setInterval(() => {
      fetchSupplierOrders();
      fetchClientOrders();
    }, 5 * 60 * 1000); // 5 minutes

    return () => clearInterval(interval);
  }, []);

  const fetchSupplierOrders = async () => {
    const { data } = await supabase.from('supplier_orders').select('*').order('request_date', { ascending: false });
    if (data) setSupplierOrders(data);
  };

  const fetchClientOrders = async () => {
    const { data } = await supabase.from('client_orders').select('*, clients(razon_social)').order('order_date', { ascending: false });
    if (data) setClientOrders(data.map((o: any) => ({ ...o, client_name: o.clients?.razon_social })));
  };

  const toggleExpand = (id: any) => {
    const next = new Set(expandedOrders);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setExpandedOrders(next);
  };

  // Product Row Management
  const addProductRow = () => setOrderProducts([...orderProducts, { code: '', name: '', qty: 1 }]);
  const removeProductRow = (i: number) => setOrderProducts(orderProducts.filter((_, idx) => idx !== i));
  const handleProductChange = (i: number, field: keyof OrderProduct, value: string | number) => {
    const newPs = [...orderProducts];
    newPs[i] = { ...newPs[i], [field]: value };

    if (field === 'code') {
      const prod = productsList.find(p => p.code === value);
      if (prod) {
        newPs[i].name = prod.name;
        if (prod.grades.length > 0) newPs[i].grade = prod.grades[0];
        if (prod.presentations.length > 0) newPs[i].presentation = prod.presentations[0];
      }
    }
    setOrderProducts(newPs);
  };

  const handleFulfillChange = (i: number, value: number) => {
    const newPs = [...fulfillProducts];
    newPs[i].fulfillQty = value < 0 ? 0 : value;
    setFulfillProducts(newPs);
  };

  const resetForm = () => {
    setTargetId('');
    setTransport('');
    setPresupuestoRef('');
    setOcRef('');
    setOrderProducts([{ code: '', name: '', qty: 1 }]);
    setEditingId(null);
    setOrderDate(format(new Date(), 'yyyy-MM-dd'));
  };

  const handleEdit = (order: any, type: 'supplier' | 'client') => {
    resetForm();
    setEditingId(order.id);
    setEditingOrder(order);
    setOcRef(order.oc_ref || '');
    if (type === 'supplier') {
      setTargetId(order.supplier);
      setTransport(order.transport || '');
      setOrderDate(order.request_date ? order.request_date.split('T')[0] : format(new Date(), 'yyyy-MM-dd'));
    } else {
      setTargetId(order.client_id.toString());
      setPresupuestoRef(order.presupuesto_ref || '');
      setOrderDate(order.order_date ? order.order_date.split('T')[0] : format(new Date(), 'yyyy-MM-dd'));
    }
    try {
      const prods = JSON.parse(order.products);
      setOrderProducts(Array.isArray(prods) && prods.length > 0 ? prods : [{ code: '', name: '', qty: 1 }]);
    } catch {
      setOrderProducts([{ code: '', name: '', qty: 1 }]);
    }
    setShowModal(true);
  };

  const handleDelete = async () => {
    if (!deletingId) return;
    const table = activeTab === 'supplier' ? 'supplier_orders' : 'client_orders';
    const { error } = await supabase.from(table).delete().eq('id', deletingId);
    if (!error) {
      setDeletingId(null);
      if (activeTab === 'supplier') fetchSupplierOrders();
      else fetchClientOrders();
    }
  };

  const openFulfillModal = (order: any) => {
    setFulfillOrder(order);
    try {
      const prods = JSON.parse(order.products) || [];
      setFulfillProducts(prods.map((p: any) => ({ ...p, fulfillQty: p.qty })));
    } catch {
      setFulfillProducts([]);
    }
    setFulfillDate(format(new Date(), 'yyyy-MM-dd'));
    setIsPartial(false);
    setRemitoRef('');
  };

  const submitFulfill = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fulfillOrder) return;

    let updatedProducts = [];
    let deliveredProducts = [];

    for (const p of fulfillProducts) {
      const remainingQty = isPartial ? Math.max(0, p.qty - p.fulfillQty) : 0;
      if (remainingQty > 0) updatedProducts.push({ code: p.code, name: p.name, qty: remainingQty });

      const actuallyFulfilled = isPartial ? p.fulfillQty : p.qty;
      if (actuallyFulfilled > 0) deliveredProducts.push({ code: p.code, name: p.name, qty: actuallyFulfilled });
    }

    const finalStatus = updatedProducts.length > 0 ? 'pending' : (activeTab === 'supplier' ? 'received' : 'dispatched');
    const parts = fulfillDate.split('-');
    const dtStr = `${parts[0]}-${parts[1]}-${parts[2]}T12:00:00Z`;

    let error = null;

    if (activeTab === 'supplier') {
      if (finalStatus === 'pending') { // partial
        const { error: err1 } = await supabase.from('supplier_orders').insert([{
          supplier: fulfillOrder.supplier,
          products: JSON.stringify(deliveredProducts),
          request_date: fulfillOrder.request_date,
          transport: fulfillOrder.transport,
          status: 'received',
          oc_ref: fulfillOrder.oc_ref || null,
          receive_date: dtStr,
          remito_ref: remitoRef || null
        }]);
        const { error: err2 } = await supabase.from('supplier_orders').update({
          products: JSON.stringify(updatedProducts)
        }).eq('id', fulfillOrder.id);
        error = err1 || err2;
      } else {
        const { error: err3 } = await supabase.from('supplier_orders').update({
          status: 'received',
          receive_date: dtStr,
          products: JSON.stringify(deliveredProducts || fulfillOrder.products),
          remito_ref: remitoRef || null,
          oc_ref: fulfillOrder.oc_ref || null
        }).eq('id', fulfillOrder.id);
        error = err3;
      }
    } else {
      // dispatch client order
      const { error: err4 } = await supabase.from('client_orders').update({
        status: finalStatus,
        products: JSON.stringify(updatedProducts),
        remito_ref: remitoRef || null
      }).eq('id', fulfillOrder.id);
      error = err4;

      if (!error) {
        let fullDescription = isPartial ? `Entrega parcial de pedido #${fulfillOrder.id}` : `Entrega completa de pedido #${fulfillOrder.id}`;
        if (fulfillOrder.oc_ref) fullDescription += ` | OC: ${fulfillOrder.oc_ref}`;
        if (remitoRef) fullDescription += ` | Remito: ${remitoRef}`;

        await supabase.from('interactions').insert([{
          client_id: fulfillOrder.client_id,
          type: 'entrega',
          date: dtStr,
          user: user?.name || 'Usuario',
          description: fullDescription,
          products: JSON.stringify(deliveredProducts)
        }]);
      }
    }

    if (!error) {
      setFulfillOrder(null);
      if (activeTab === 'supplier') fetchSupplierOrders();
      else fetchClientOrders();
      alert("Operación completada con éxito");
    } else {
      alert(`Error: ${error.message || 'No se pudo procesar el pedido'}`);
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const validProducts = orderProducts.filter(p => p.code || p.name);
    if (validProducts.length === 0) {
      alert("Por favor, agregue al menos un producto.");
      return;
    }

    const payload: any = { products: JSON.stringify(validProducts) };
    let table = activeTab === 'supplier' ? 'supplier_orders' : 'client_orders';

    if (editingId) {
      if (activeTab === 'supplier') {
        payload.request_date = `${orderDate}T12:00:00Z`;
        payload.supplier = targetId;
        payload.transport = transport;
      } else {
        payload.order_date = `${orderDate}T12:00:00Z`;
        payload.client_id = Number(targetId);
        payload.presupuesto_ref = presupuestoRef;
      }
    } else {
      payload.status = 'pending';
      if (activeTab === 'supplier') {
        payload.supplier = targetId;
        payload.transport = transport || null;
        payload.request_date = `${orderDate}T12:00:00Z`;
      } else {
        payload.client_id = Number(targetId);
        payload.presupuesto_ref = presupuestoRef || null;
        payload.order_date = `${orderDate}T12:00:00Z`;
      }
    }
    payload.oc_ref = ocRef || null;

    // Solo validar duplicados si es un pedido NUEVO
    if (!editingId && ocRef) {
      const { data: existing } = await supabase
        .from(table)
        .select('id')
        .eq('oc_ref', ocRef)
        .limit(1);

      if (existing && existing.length > 0) {
        alert(`Error: Ya existe un pedido ${activeTab === 'supplier' ? 'a proveedor' : 'de cliente'} con la OC ${ocRef}.`);
        return;
      }
    }

    let error;
    if (editingId) {
      const { error: editErr } = await supabase.from(table).update(payload).eq('id', editingId);
      error = editErr;
    } else {
      const { error: insErr } = await supabase.from(table).insert([payload]);
      error = insErr;

      if (!error && activeTab === 'client' && presupuestoRef) {
        // cancel reminder
        await supabase.from('tasks').update({ reminder_status: 'cancelled' })
          .eq('type', 'presupuesto')
          .eq('client_id', Number(targetId))
          .eq('result', presupuestoRef);
      }
    }

    if (!error) {
      setShowModal(false);
      resetForm();
      if (activeTab === 'supplier') fetchSupplierOrders();
      else fetchClientOrders();
      alert(editingId ? "Cambios guardados con éxito" : "Pedido registrado con éxito");
    } else {
      alert(`Error al guardar: ${error.message || 'Error desconocido'}`);
    }
  };

  const pendingSuppliers = supplierOrders.filter(o => o.status === 'pending');
  const finishedSuppliers = supplierOrders.filter(o => o.status === 'received');
  const pendingClients = clientOrders.filter(o => o.status === 'pending');

  const renderProductsTable = (productsStr: string) => {
    let prods = [];
    try { prods = JSON.parse(productsStr) || []; } catch { }
    if (prods.length === 0) return <span className="text-gray-400 text-sm italic">Sin productos pendientes</span>;

    return (
      <div className="mt-2 bg-gray-50 rounded-lg border border-gray-200 p-3 w-full max-w-2xl">
        <h4 className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-2">Detalle de Productos</h4>
        <div className="space-y-1">
          {prods.map((p: any, i: number) => (
            <div key={i} className="flex justify-between items-center text-sm border-b border-gray-100 last:border-0 pb-1">
              <span className="text-gray-800 font-medium">
                {p.code} x {p.grade ? `${p.grade} x ` : ''}{p.presentation || p.name} - {p.qty} u
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-10">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center">
          <Package className="w-6 h-6 mr-2 text-indigo-600" />
          Gestión de Pedidos
        </h1>

        <div className="flex bg-white rounded-lg shadow-sm border border-gray-200 p-1">
          <button
            onClick={() => setActiveTab('supplier')}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${activeTab === 'supplier' ? 'bg-indigo-50 text-indigo-700' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'}`}
          >
            A Proveedores
          </button>
          <button
            onClick={() => setActiveTab('client')}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${activeTab === 'client' ? 'bg-indigo-50 text-indigo-700' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'}`}
          >
            De Clientes
          </button>
        </div>
      </div>

      <div className="flex justify-end">
        <button
          onClick={() => { resetForm(); setShowModal(true); }}
          className="bg-indigo-600 text-white px-5 py-2.5 rounded-lg font-medium hover:bg-indigo-700 transition-colors flex items-center shadow-md"
        >
          <Plus className="w-5 h-5 mr-2" />
          Nuevo Pedido {activeTab === 'supplier' ? 'a Proveedor' : 'de Cliente'}
        </button>
      </div>

      {/* Main Pending Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="bg-gray-50 px-6 py-3 border-b border-gray-200">
          <h3 className="text-sm font-bold text-gray-600 uppercase tracking-wider">Pedidos Pendientes</h3>
        </div>
        <table className="w-full text-left text-sm text-gray-500">
          <thead className="text-xs text-gray-400 uppercase bg-gray-50/50 border-b border-gray-200">
            <tr>
              <th className="px-4 py-4 w-10"></th>
              <th className="px-6 py-4 font-semibold">{activeTab === 'supplier' ? 'Proveedor' : 'Cliente'}</th>
              <th className="px-6 py-4 font-semibold">Fecha</th>
              <th className="px-6 py-4 font-semibold">N° OC</th>
              {activeTab === 'supplier' && <th className="px-6 py-4 font-semibold">Transporte</th>}
              <th className="px-6 py-4 font-semibold text-center">Estado</th>
              <th className="px-6 py-4 font-semibold text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {(activeTab === 'supplier' ? pendingSuppliers : pendingClients).length === 0 ? (
              <tr>
                <td colSpan={7} className="px-6 py-10 text-center text-gray-400 italic">No hay pedidos pendientes registrados.</td>
              </tr>
            ) : (
              (activeTab === 'supplier' ? pendingSuppliers : pendingClients).map((order: any) => {
                let rowColor = "bg-white border-b border-gray-100 hover:bg-indigo-50/20 text-gray-900";

                if (activeTab === 'client') {
                  const daysOld = differenceInDays(new Date(), new Date(order.order_date));
                  if (daysOld > 15) {
                    rowColor = "bg-red-50 hover:bg-red-100/50 border-b border-red-200 text-red-900";
                  } else if (daysOld >= 7) {
                    rowColor = "bg-orange-50 hover:bg-orange-100/50 border-b border-orange-200 text-orange-900";
                  }
                }

                return (
                  <React.Fragment key={order.id}>
                    <tr className={`${rowColor} transition-colors`}>
                      <td className="px-4 py-4 text-center">
                        <button onClick={() => toggleExpand(order.id)} className="text-gray-400 hover:text-indigo-600">
                          {expandedOrders.has(order.id) ? <ChevronDown className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
                        </button>
                      </td>
                      <td className="px-6 py-4 font-bold text-gray-900">{activeTab === 'supplier' ? order.supplier : order.client_name}</td>
                      <td className="px-6 py-4 text-gray-500">{format(new Date(order.request_date || order.order_date), 'dd/MM/yyyy')}</td>
                      <td className="px-6 py-4">
                        <span className="inline-flex items-center text-indigo-700 font-bold font-mono text-xs bg-indigo-50 px-2.5 py-1 rounded border border-indigo-100">
                          {order.oc_ref || 'S/N'}
                        </span>
                      </td>
                      {activeTab === 'supplier' && <td className="px-6 py-4 italic text-gray-400">{order.transport || '-'}</td>}
                      <td className="px-6 py-4 text-center">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-yellow-50 text-yellow-700 border border-yellow-200">
                          <Clock className="w-3 h-3 mr-1" /> Pendiente
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {activeTab === 'supplier' && (
                            <button
                              onClick={() => openFulfillModal(order)}
                              className="bg-green-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-green-700 flex items-center shadow-sm"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                              Recibir
                            </button>
                          )}
                          <div className="flex items-center gap-1 border-l pl-2 border-gray-100">
                            <button onClick={() => handleEdit(order, activeTab)} className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded" title="Editar">
                              <Edit2 className="w-4 h-4" />
                            </button>
                            {isAdmin && (
                              <button onClick={() => setDeletingId(order.id)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded" title="Eliminar">
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                    {expandedOrders.has(order.id) && (
                      <tr className="bg-gray-50/30">
                        <td colSpan={7} className="px-6 py-4 pl-14">{renderProductsTable(order.products)}</td>
                      </tr>
                    )}
                  </React.Fragment>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {/* History Section for Suppliers */}
      {activeTab === 'supplier' && (
        <div className="mt-10 overflow-hidden">
          <button
            onClick={() => setShowSupplierHistory(!showSupplierHistory)}
            className="flex items-center text-gray-700 font-bold hover:text-indigo-600 transition-colors mb-4 group"
          >
            <div className="p-1 bg-gray-100 rounded group-hover:bg-indigo-100 mr-3">
              <History className="w-5 h-5" />
            </div>
            Historial de Recepciones (Proveedores)
            {showSupplierHistory ? <ChevronDown className="w-5 h-5 ml-2" /> : <ChevronRight className="w-5 h-5 ml-2" />}
          </button>

          {showSupplierHistory && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
              <table className="w-full text-left text-sm text-gray-500">
                <thead className="text-xs text-gray-400 uppercase bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-4 w-10"></th>
                    <th className="px-6 py-4 font-semibold">Proveedor</th>
                    <th className="px-6 py-4 font-semibold">Fecha Rec.</th>
                    <th className="px-6 py-4 font-semibold">N° OC / Remito</th>
                    <th className="px-6 py-4 text-right font-semibold">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {finishedSuppliers.length === 0 ? (
                    <tr><td colSpan={5} className="px-6 py-10 text-center text-gray-400 italic">No hay historial de recepciones disponible.</td></tr>
                  ) : (
                    finishedSuppliers.map((order: any) => (
                      <React.Fragment key={`h-${order.id}`}>
                        <tr className="bg-white border-b border-gray-100 hover:bg-gray-50 transition-colors">
                          <td className="px-4 py-4 text-center">
                            <button onClick={() => toggleExpand(`h-${order.id}` as any)} className="text-gray-400 hover:text-indigo-600">
                              {expandedOrders.has(`h-${order.id}` as any) ? <ChevronDown className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
                            </button>
                          </td>
                          <td className="px-6 py-4 font-medium text-gray-900 border-l-4 border-l-green-500">{order.supplier}</td>
                          <td className="px-6 py-4 text-gray-500">{format(new Date(order.receive_date!), 'dd/MM/yyyy')}</td>
                          <td className="px-6 py-4">
                            <div className="flex flex-col gap-0.5">
                              {order.oc_ref && <span className="text-[10px] font-mono text-gray-600 uppercase">OC: {order.oc_ref}</span>}
                              {order.remito_ref && <span className="text-[10px] font-mono text-blue-600 font-bold uppercase">R: {order.remito_ref}</span>}
                            </div>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-green-50 text-green-700 border border-green-200">
                              <CheckCircle2 className="w-3 h-3 mr-1" /> Recibido
                            </span>
                          </td>
                        </tr>
                        {expandedOrders.has(`h-${order.id}` as any) && (
                          <tr className="bg-gray-50/30">
                            <td colSpan={5} className="px-6 py-4 pl-14">
                              <span className="text-[10px] font-bold text-gray-400 uppercase mb-2 block">Mercadería recibida:</span>
                              {renderProductsTable(order.products)}
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Editor Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[100] p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden border border-gray-200 translate-y-0 animate-in fade-in zoom-in duration-200">
            <div className="p-6 border-b border-gray-100 bg-white flex justify-between items-center shrink-0">
              <h3 className="text-xl font-bold text-gray-900 flex items-center">
                {editingId ? <Edit2 className="w-5 h-5 mr-3 text-indigo-600" /> : <Plus className="w-5 h-5 mr-3 text-indigo-600" />}
                {editingId ? 'Editar Pedido' : `Cargar Nuevo Pedido ${activeTab === 'supplier' ? 'a Proveedor' : 'de Cliente'}`}
              </h3>
              <button onClick={() => { setShowModal(false); resetForm(); }} className="p-2 hover:bg-gray-100 rounded-lg text-gray-400 transition-colors">
                <X className="w-6 h-6" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0">
              <div className="p-8 overflow-y-auto space-y-8">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                  <div>
                    <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Fecha de Pedido</label>
                    <input
                      type="date"
                      value={orderDate}
                      onChange={e => setOrderDate(e.target.value)}
                      className="w-full border border-gray-200 rounded-xl p-3 focus:ring-2 focus:ring-indigo-500 outline-none bg-white text-gray-900 font-medium"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">{activeTab === 'supplier' ? 'Proveedor' : 'Cliente'}</label>
                    <select
                      value={targetId}
                      onChange={e => setTargetId(e.target.value)}
                      className="w-full border border-gray-200 rounded-xl p-3 focus:ring-2 focus:ring-indigo-500 outline-none bg-gray-50 text-gray-900 font-medium" required
                    >
                      <option value="">Seleccione...</option>
                      {activeTab === 'supplier'
                        ? suppliers.map(s => <option key={s.id} value={s.razon_social}>{s.razon_social}</option>)
                        : clients.map(c => <option key={c.id} value={c.id}>{c.razon_social}</option>)
                      }
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Número de OC</label>
                    <input
                      type="text"
                      value={ocRef}
                      onChange={e => setOcRef(e.target.value)}
                      className="w-full border border-gray-200 rounded-xl p-3 focus:ring-2 focus:ring-indigo-500 outline-none bg-white text-gray-900 font-mono font-bold"
                      placeholder="Ej: OC-0301"
                    />
                  </div>

                  {activeTab === 'supplier' ? (
                    <div>
                      <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Transporte / Expreso</label>
                      <input
                        type="text"
                        value={transport}
                        onChange={e => setTransport(e.target.value)}
                        className="w-full border border-gray-200 rounded-xl p-3 focus:ring-2 focus:ring-indigo-500 outline-none bg-white font-medium"
                        placeholder="Ej: Andreani, Via Cargo"
                      />
                    </div>
                  ) : (
                    <div>
                      <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">N° Presupuesto</label>
                      <input
                        type="text"
                        value={presupuestoRef}
                        onChange={e => setPresupuestoRef(e.target.value)}
                        className="w-full border border-gray-200 rounded-xl p-3 focus:ring-2 focus:ring-indigo-500 outline-none bg-white font-medium"
                        placeholder="Ej: P-1001"
                      />
                    </div>
                  )}
                </div>

                <div className="bg-gray-50/50 rounded-2xl p-6 border border-gray-100">
                  <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4">Productos y Cantidades</h4>
                  <div className="space-y-4">
                    {orderProducts.map((p, i) => (
                      <div key={i} className="grid grid-cols-12 gap-4 items-center">
                        <div className="col-span-2">
                          <input
                            type="text"
                            value={p.code}
                            onChange={e => handleProductChange(i, 'code', e.target.value)}
                            list="codes-list"
                            className="w-full border border-gray-200 rounded-xl p-2 text-xs outline-none focus:ring-2 focus:ring-indigo-500 font-mono font-bold text-indigo-700 bg-white"
                            placeholder="Cód."
                            required
                          />
                        </div>
                        <div className="col-span-3">
                          <input
                            type="text"
                            value={p.name}
                            onChange={e => handleProductChange(i, 'name', e.target.value)}
                            className={`w-full border border-gray-200 rounded-xl p-2 text-xs outline-none font-medium overflow-hidden whitespace-nowrap overflow-ellipsis ${p.code === 'MISC' ? 'bg-white text-gray-900 focus:ring-2 focus:ring-indigo-500' : 'bg-gray-50 text-gray-800 focus:ring-2 focus:ring-indigo-500'}`}
                            placeholder="Producto o descripción"
                          />
                        </div>
                        <div className="col-span-2">
                          {(() => {
                            const prod = productsList.find(pr => pr.code === p.code);
                            if (prod && prod.grades.length > 0) {
                              return (
                                <select
                                  value={p.grade}
                                  onChange={e => handleProductChange(i, 'grade', e.target.value)}
                                  className="w-full border border-indigo-200 rounded-xl p-1.5 text-xs outline-none focus:ring-2 focus:ring-indigo-500 bg-indigo-50 font-bold text-indigo-700"
                                >
                                  {prod.grades.map(g => <option key={g} value={g}>{g}</option>)}
                                </select>
                              );
                            }
                            return <div className="text-[10px] text-gray-400 text-center">-</div>;
                          })()}
                        </div>
                        <div className="col-span-2">
                          {(() => {
                            const prod = productsList.find(pr => pr.code === p.code);
                            if (prod && prod.presentations.length > 0) {
                              return (
                                <select
                                  value={p.presentation}
                                  onChange={e => handleProductChange(i, 'presentation', e.target.value)}
                                  className="w-full border border-gray-200 rounded-xl p-1.5 text-xs outline-none focus:ring-2 focus:ring-indigo-500 bg-white font-bold"
                                >
                                  {prod.presentations.map(pr => <option key={pr} value={pr}>{pr}</option>)}
                                </select>
                              );
                            }
                            return <div className="text-[10px] text-gray-400 text-center">-</div>;
                          })()}
                        </div>
                        <div className="col-span-2 text-center">
                          <input
                            type="number"
                            min="1"
                            value={p.qty}
                            onChange={e => handleProductChange(i, 'qty', parseInt(e.target.value) || 1)}
                            className="w-16 border border-gray-200 rounded-xl p-2 text-xs outline-none focus:ring-2 focus:ring-indigo-500 bg-white text-center font-bold"
                            required
                          />
                        </div>
                        <div className="col-span-1 flex justify-center">
                          <button
                            type="button"
                            onClick={() => removeProductRow(i)}
                            disabled={orderProducts.length === 1}
                            className="p-2 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg disabled:opacity-0"
                          >
                            <Minus className="w-5 h-5" />
                          </button>
                        </div>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={addProductRow}
                      className="text-sm font-bold text-indigo-600 hover:text-indigo-800 flex items-center bg-indigo-50/50 px-4 py-2 rounded-xl transition-colors w-fit"
                    >
                      <Plus className="w-4 h-4 mr-2" /> Añadir Línea
                    </button>
                  </div>
                </div>
              </div>

              <div className="p-6 border-t border-gray-100 bg-white flex justify-end gap-3 shrink-0">
                <button type="button" onClick={() => { setShowModal(false); resetForm(); }} className="px-6 py-3 text-gray-500 font-bold hover:bg-gray-50 rounded-xl transition-colors">
                  Cancelar
                </button>
                <button type="submit" className="px-8 py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 shadow-lg shadow-indigo-200 transition-all flex items-center">
                  <CheckCircle2 className="w-5 h-5 mr-2" />
                  {editingId ? 'Guardar Cambios' : 'Finalizar Carga'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Fulfill Modal */}
      {fulfillOrder && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[110] p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden border border-gray-100">
            <div className="p-6 border-b border-gray-100 bg-white">
              <h3 className="text-xl font-bold text-gray-900 flex items-center">
                <div className="p-2 bg-green-100 rounded-lg mr-3">
                  <Truck className="w-6 h-6 text-green-600" />
                </div>
                {activeTab === 'supplier' ? 'Recepción de Mercadería' : 'Despacho de Pedido'}
              </h3>
            </div>

            <form onSubmit={submitFulfill} className="p-8 space-y-8">
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Fecha</label>
                  <input
                    type="date"
                    required
                    value={fulfillDate}
                    onChange={e => setFulfillDate(e.target.value)}
                    className="w-full border border-gray-200 rounded-xl p-3 outline-none focus:ring-2 focus:ring-indigo-500 bg-gray-50 font-medium"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Número de Remito</label>
                  <input
                    type="text"
                    value={remitoRef}
                    onChange={e => setRemitoRef(e.target.value)}
                    className="w-full border border-gray-200 rounded-xl p-3 outline-none focus:ring-2 focus:ring-indigo-500 font-mono font-bold"
                    placeholder="Ej: R-0001"
                  />
                </div>
                <div className="col-span-2">
                  <label className="flex items-center space-x-4 cursor-pointer p-4 bg-indigo-50 rounded-2xl border border-indigo-100">
                    <input
                      type="checkbox"
                      checked={isPartial}
                      onChange={e => setIsPartial(e.target.checked)}
                      className="w-6 h-6 text-indigo-600 rounded-lg border-gray-300 focus:ring-indigo-500"
                    />
                    <div className="flex flex-col">
                      <span className="text-sm font-bold text-indigo-900">Entrega parcial</span>
                    </div>
                  </label>
                </div>
              </div>

              <div className="border border-gray-100 rounded-2xl overflow-hidden bg-gray-50/50 p-6">
                <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4">Cantidades Seleccionadas</h4>
                <div className="space-y-3">
                  {fulfillProducts.map((p, i) => (
                    <div key={i} className="flex items-center justify-between p-4 bg-white border border-gray-100 rounded-xl shadow-sm">
                      <div className="flex-1">
                        <div className="font-bold text-gray-900">{p.code} x {p.name} - {p.qty} u</div>
                      </div>
                      {isPartial ? (
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            min="0"
                            max={p.qty}
                            value={p.fulfillQty}
                            onChange={e => handleFulfillChange(i, parseInt(e.target.value) || 0)}
                            className="w-20 border border-gray-200 rounded-xl p-2 text-center font-bold text-indigo-600 focus:ring-2 focus:ring-indigo-500 outline-none"
                          />
                          <span className="text-xs font-bold text-gray-400">/ {p.qty}</span>
                        </div>
                      ) : (
                        <div className="font-bold text-green-700 bg-green-50 px-4 py-1.5 rounded-lg border border-green-100">
                          {p.qty} un.
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <button type="button" onClick={() => setFulfillOrder(null)} className="px-6 py-3 text-gray-500 font-bold hover:bg-gray-100 rounded-xl transition-colors">
                  Cancelar
                </button>
                <button type="submit" className="px-8 py-3 bg-green-600 text-white font-bold rounded-xl hover:bg-green-700 shadow-lg shadow-green-100 transition-all flex items-center">
                  <CheckCircle2 className="w-5 h-5 mr-2" />
                  Confirmar {activeTab === 'supplier' ? 'Recepción' : 'Despacho'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deletingId && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[110] p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-8 text-center border border-gray-100">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <Trash2 className="w-8 h-8 text-red-600" />
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-2">¿Eliminar pedido?</h3>
            <p className="text-sm text-gray-500 mb-8">Esta acción borrará el registro de forma permanente. No se podrá deshacer.</p>
            <div className="flex justify-center gap-3">
              <button onClick={() => setDeletingId(null)} className="flex-1 px-4 py-3 text-gray-500 font-bold hover:bg-gray-50 rounded-xl">Cancelar</button>
              <button onClick={handleDelete} className="flex-1 px-4 py-3 bg-red-600 text-white font-bold rounded-xl hover:bg-red-700 shadow-lg shadow-red-100">Eliminar</button>
            </div>
          </div>
        </div>
      )}

      {/* Datalists for products */}
      <datalist id="codes-list">
        {productsList.map(p => <option key={`c-${p.id}`} value={p.code} />)}
      </datalist>
      <datalist id="names-list">
        {productsList.map(p => <option key={`n-${p.id}`} value={p.presentation}>{p.code} - {p.name}</option>)}
      </datalist>
    </div>
  );
}
