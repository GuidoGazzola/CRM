import React, { useState, useEffect } from 'react';
import { CheckSquare, Clock, CheckCircle2, XCircle, AlertCircle, ChevronRight, X, RotateCcw, Bell, Truck, Plus, Minus } from 'lucide-react';
import { useUser } from '../store/UserContext';
import { format, addDays, differenceInDays } from 'date-fns';
import { supabase } from '../supabaseClient';

interface Task {
  id: number;
  client_id: number;
  client_name: string;
  type: string;
  products: string;
  description: string;
  requested_by: string;
  status: string;
  created_at: string;
  completed_by?: string;
  completed_at?: string;
  result?: string;
  reminder_date?: string;
  reminder_status?: string;
}

interface OrderTask extends Task {
  isOrder?: boolean;
  order_date?: string;
  oc_ref?: string;
}

export default function Tareas() {
  const { isAdmin, user } = useUser();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [clientOrders, setClientOrders] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'presupuestos' | 'pruebas' | 'entregas' | 'completed'>('presupuestos');
  const [completingTask, setCompletingTask] = useState<OrderTask | null>(null);
  const [isPartial, setIsPartial] = useState(false);
  const [fulfillProducts, setFulfillProducts] = useState<any[]>([]);

  useEffect(() => {
    fetchTasks();
    fetchClientOrders();

    const interval = setInterval(() => {
      fetchTasks();
      fetchClientOrders();
    }, 5 * 60 * 1000); // 5 minutes

    return () => clearInterval(interval);
  }, []);

  const fetchTasks = async () => {
    const { data } = await supabase.from('tasks').select('*, clients(razon_social)').order('created_at', { ascending: false });
    if (data) setTasks(data.map((t: any) => ({ ...t, client_name: t.clients?.razon_social })));
  };

  const fetchClientOrders = async () => {
    const { data } = await supabase.from('client_orders').select('*, clients(razon_social)').order('order_date', { ascending: true });
    if (data) setClientOrders(data.map((o: any) => ({ ...o, client_name: o.clients?.razon_social })));
  };

  const handleStatusChange = async (id: number, status: string, extraData: any = {}) => {
    const updatePayload: any = { status, ...extraData };
    if (status === 'completed') {
      updatePayload.completed_by = user.name || 'Usuario';
      updatePayload.completed_at = new Date().toISOString();
    } else if (status === 'pending' || status === 'approved') {
      updatePayload.completed_by = null;
      updatePayload.completed_at = null;
      updatePayload.result = null;
      updatePayload.reminder_date = null;
      updatePayload.reminder_status = null;
    }

    const { error } = await supabase.from('tasks').update(updatePayload).eq('id', id);

    if (!error) {
      fetchTasks();
    }
  };

  const handleCompleteTask = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!completingTask) return;

    try {
      if (completingTask.isOrder) {
        const formData = new FormData(e.currentTarget);
        const remito = formData.get('remito') as string;
        const recibio = formData.get('recibio') as string;
        const deliveryDateStr = formData.get('delivery_date') as string;
        
        let deliveryDateISO = new Date().toISOString();
        if (deliveryDateStr) {
          deliveryDateISO = new Date(deliveryDateStr + 'T12:00:00').toISOString();
        }

        let updatedProducts = [];
        let deliveredProducts = [];

        for (const p of fulfillProducts) {
          const remainingQty = isPartial ? Math.max(0, p.qty - p.fulfillQty) : 0;
          if (remainingQty > 0) updatedProducts.push({ code: p.code, name: p.name, qty: remainingQty });

          const actuallyFulfilled = isPartial ? p.fulfillQty : p.qty;
          if (actuallyFulfilled > 0) deliveredProducts.push({ code: p.code, name: p.name, qty: actuallyFulfilled });
        }

        if (deliveredProducts.length === 0) {
          alert("Debe entregar al menos un producto.");
          return;
        }

        const finalStatus = updatedProducts.length > 0 ? 'pending' : 'dispatched';
        const resultDescription = `Remito: ${remito}${recibio ? ` - Recibió: ${recibio}` : ''}${isPartial ? ' (Parcial)' : ''}`;

        // Update the order via dispatch endpoint
        const { error: dispatchError } = await supabase.from('client_orders').update({
          status: finalStatus,
          products: JSON.stringify(updatedProducts),
          remito_ref: remito
        }).eq('id', completingTask.id);

        if (dispatchError) throw new Error('Error al despachar el pedido');

        let fullDescription = isPartial ? `Entrega parcial de pedido #${completingTask.id}` : `Entrega completa de pedido #${completingTask.id}`;
        if ((completingTask as any).oc_ref) fullDescription += ` | OC: ${(completingTask as any).oc_ref}`;
        if (remito) fullDescription += ` | Remito: ${remito}`;
        if (recibio) fullDescription += ` | Recibió: ${recibio}`;

        await supabase.from('interactions').insert([{
          client_id: completingTask.client_id,
          type: 'entrega',
          date: deliveryDateISO,
          user: user.name || 'Usuario',
          description: fullDescription,
          products: JSON.stringify(deliveredProducts)
        }]);

        if (finalStatus === 'dispatched') {
          await supabase.from('client_orders').delete().eq('id', completingTask.id);
        }

        // Crear una copia real en la tabla de Tasks para que pase a los Completados
        const { data: taskData, error: taskError } = await supabase.from('tasks').insert([{
          client_id: completingTask.client_id,
          type: 'entrega',
          products: JSON.stringify(deliveredProducts),
          description: isPartial ? 'Entrega parcial del pedido' : 'Pedido despachado y entregado',
          requested_by: '-',
          status: 'pending'
        }]).select().single();

        if (taskData?.id) {
          await handleStatusChange(taskData.id, 'completed', { result: resultDescription });
        }

        fetchClientOrders();
      } else {
        const formData = new FormData(e.currentTarget);
        const result = formData.get('result') as string;

        if (completingTask.type === 'prueba') {
          // Add interaction for the result
          await supabase.from('interactions').insert([{
            client_id: completingTask.client_id,
            type: 'prueba',
            date: new Date().toISOString(),
            user: user.name || 'Usuario',
            description: `Resultado de la prueba: ${result}`
          }]);

          await handleStatusChange(completingTask.id, 'completed', { result });
        } else if (completingTask.type === 'presupuesto') {
          const reminderDate = addDays(new Date(), 14).toISOString();
          await handleStatusChange(completingTask.id, 'completed', {
            result,
            reminder_date: reminderDate,
            reminder_status: 'active'
          });
        }
      }
    } catch (error) {
      console.error('Error completing task:', error);
      alert('Error al completar la tarea');
    } finally {
      setCompletingTask(null);
      setIsPartial(false);
      setFulfillProducts([]);
    }
  };

  const handleRevertTask = (task: Task) => {
    const newStatus = task.type === 'prueba' ? 'approved' : 'pending';
    handleStatusChange(task.id, newStatus);
  };

  // Processing pending tasks
  const pendingTasks = tasks.filter(t => t.status === 'pending' || (t.type === 'prueba' && t.status === 'approved'));
  const presupuestos = pendingTasks.filter(t => t.type === 'presupuesto');
  const pruebas = pendingTasks.filter(t => t.type === 'prueba');

  // Convert pending orders to Tasks format for the UI
  const entregas: OrderTask[] = clientOrders
    .filter(o => o.status === 'pending')
    .map(o => ({
      id: o.id,
      client_id: o.client_id,
      client_name: o.client_name,
      type: 'entrega',
      products: o.products,
      description: o.oc_ref ? `OC: ${o.oc_ref}` : 'Sin OC registrada',
      requested_by: '-',
      status: 'pending',
      created_at: o.order_date,
      isOrder: true,
      oc_ref: o.oc_ref
    }));

  const completedTasks = tasks.filter(t => t.status === 'completed' || t.status === 'rejected');

  const getStatusBadge = (status: string, type: string) => {
    if (status === 'pending') return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800"><Clock className="w-3 h-3 mr-1" /> Pendiente</span>;
    if (status === 'approved') return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800"><CheckCircle2 className="w-3 h-3 mr-1" /> Aprobada (En curso)</span>;
    if (status === 'completed') return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800"><CheckCircle2 className="w-3 h-3 mr-1" /> Completada</span>;
    if (status === 'rejected') return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800"><XCircle className="w-3 h-3 mr-1" /> Rechazada</span>;
    return null;
  };

  const renderTaskCard = (task: OrderTask) => {
    let cardWrapperClass = "bg-white border-gray-200 hover:shadow-md";
    let titleClass = "text-gray-900";
    let dateClass = "text-gray-500";

    if (task.isOrder && task.status === 'pending') {
      const daysOld = differenceInDays(new Date(), new Date(task.created_at));
      if (daysOld > 15) {
        cardWrapperClass = "bg-red-50 border-red-400 border-2 hover:shadow-md hover:shadow-red-50";
        titleClass = "text-red-900";
        dateClass = "text-red-700";
      } else if (daysOld >= 7) {
        cardWrapperClass = "bg-orange-50 border-orange-400 border-2 hover:shadow-md hover:shadow-orange-50";
        titleClass = "text-orange-900";
        dateClass = "text-orange-700";
      }
    }

    return (
      <div key={`${task.isOrder ? 'order-' : 'task-'}${task.id}`} className={`rounded-xl shadow-sm border p-6 transition-shadow ${cardWrapperClass}`}>
        <div className="flex justify-between items-start mb-4">
          <div>
            <h3 className={`text-lg font-bold ${titleClass}`}>{task.client_name}</h3>
            <p className={`text-sm ${dateClass}`}>
              {task.isOrder
                ? `Pedido del ${format(new Date(task.created_at), 'dd/MM/yyyy')}`
                : `Solicitado por ${task.requested_by} el ${format(new Date(task.created_at), 'dd/MM/yyyy')}`
              }
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            {getStatusBadge(task.status, task.type)}
            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize border ${task.type === 'entrega' ? 'bg-green-50 text-green-700 border-green-200' :
              'bg-gray-100 text-gray-800 border-gray-200'
              }`}>
              {task.type === 'entrega' && <Truck className="w-3 h-3 mr-1" />}
              {task.type}
            </span>
          </div>
        </div>

        <div className="space-y-3">
          <p className="text-gray-700 whitespace-pre-wrap">{task.description}</p>

          {task.products && task.products !== '[]' && (
            <div className="bg-gray-50 p-3 rounded-lg border border-gray-100">
              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Productos</h4>
              <ul className="text-sm text-gray-700 space-y-1">
                {JSON.parse(task.products).map((p: any, i: number) => (
                  <li key={i} className="flex items-center text-xs">
                    <ChevronRight className="w-4 h-4 text-gray-400 mr-1" />
                    {p.code} x {p.grade ? `${p.grade} x ` : ''}{p.presentation || p.name} - {p.qty} u
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {activeTab !== 'completed' && (
          <div className="mt-6 pt-4 border-t border-gray-100 flex justify-end gap-3">
            {task.type === 'prueba' && task.status === 'pending' && isAdmin && (
              <>
                <button
                  onClick={() => handleStatusChange(task.id, 'rejected')}
                  className="px-4 py-2 text-red-700 font-medium hover:bg-red-50 rounded-lg transition-colors border border-red-200"
                >
                  Rechazar
                </button>
                <button
                  onClick={() => handleStatusChange(task.id, 'approved')}
                  className="px-4 py-2 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 transition-colors"
                >
                  Aprobar Prueba
                </button>
              </>
            )}
            {task.type === 'prueba' && task.status === 'pending' && !isAdmin && (
              <span className="text-sm text-orange-600 flex items-center bg-orange-50 px-3 py-1.5 rounded-lg border border-orange-100">
                <AlertCircle className="w-4 h-4 mr-1.5" /> Requiere aprobación de Admin
              </span>
            )}
            {(task.type === 'presupuesto' || task.type === 'entrega' || (task.type === 'prueba' && task.status === 'approved')) && (
              <button
                onClick={() => {
                  setCompletingTask(task);
                  if (task.isOrder) {
                    try {
                      const prods = JSON.parse(task.products) || [];
                      setFulfillProducts(prods.map((p: any) => ({ ...p, fulfillQty: p.qty })));
                    } catch {
                      setFulfillProducts([]);
                    }
                  }
                }}
                className="px-4 py-2 bg-green-600 text-white font-medium rounded-lg hover:bg-green-700 transition-colors flex items-center"
              >
                <CheckCircle2 className="w-4 h-4 mr-2" /> Marcar como Completada
              </button>
            )}
          </div>
        )}

        {activeTab === 'completed' && task.completed_by && (
          <div className="mt-4 pt-4 border-t border-gray-100 flex justify-between items-center">
            <div>
              <p className="text-sm text-gray-500">
                Completada por <span className="font-medium text-gray-900">{task.completed_by}</span> el {format(new Date(task.completed_at!), 'dd/MM/yyyy HH:mm')}
              </p>
              {task.result && (
                <p className="text-sm text-gray-700 mt-1">
                  <span className="font-medium">{task.type === 'presupuesto' ? 'N° Presupuesto:' : 'Resultado:'}</span> {task.result}
                </p>
              )}
            </div>
            <button
              onClick={() => handleRevertTask(task)}
              className="px-3 py-1.5 text-sm text-gray-600 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors flex items-center border border-gray-200 hover:border-indigo-200"
            >
              <RotateCcw className="w-4 h-4 mr-1.5" /> Deshacer
            </button>
          </div>
        )}
      </div>
    );
  };

  const getActiveList = () => {
    switch (activeTab) {
      case 'presupuestos': return presupuestos;
      case 'pruebas': return pruebas;
      case 'entregas': return entregas;
      case 'completed': return completedTasks;
      default: return [];
    }
  };

  const activeList = getActiveList();

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center">
          <CheckSquare className="w-6 h-6 mr-2 text-indigo-600" />
          Gestión de Tareas
        </h1>

        <div className="flex flex-wrap bg-white rounded-lg shadow-sm border border-gray-200 p-1 w-full md:w-auto">
          <button
            onClick={() => setActiveTab('presupuestos')}
            className={`flex-1 md:flex-none px-4 py-2 text-sm font-medium rounded-md transition-colors ${activeTab === 'presupuestos'
              ? 'bg-indigo-50 text-indigo-700'
              : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              }`}
          >
            Presupuestos ({presupuestos.length})
          </button>
          <button
            onClick={() => setActiveTab('pruebas')}
            className={`flex-1 md:flex-none px-4 py-2 text-sm font-medium rounded-md transition-colors ${activeTab === 'pruebas'
              ? 'bg-indigo-50 text-indigo-700'
              : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              }`}
          >
            Pruebas ({pruebas.length})
          </button>
          <button
            onClick={() => setActiveTab('entregas')}
            className={`flex-1 md:flex-none px-4 py-2 text-sm font-medium rounded-md transition-colors ${activeTab === 'entregas'
              ? 'bg-indigo-50 text-indigo-700'
              : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              }`}
          >
            Entregas ({entregas.length})
          </button>
          <div className="hidden md:block w-px bg-gray-200 mx-1"></div>
          <button
            onClick={() => setActiveTab('completed')}
            className={`flex-1 md:flex-none px-4 py-2 text-sm font-medium rounded-md transition-colors ${activeTab === 'completed'
              ? 'bg-indigo-50 text-indigo-700'
              : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              }`}
          >
            Completadas
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6">
        {activeTab === 'presupuestos' && presupuestos.filter(t => t.reminder_status === 'active').length > 0 && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 mb-4">
            <h3 className="text-yellow-800 font-semibold flex items-center mb-3">
              <Bell className="w-5 h-5 mr-2" /> Recordatorios Activos
            </h3>
            <div className="space-y-3">
              {presupuestos.filter(t => t.reminder_status === 'active').map(task => (
                <div key={`reminder-${task.id}`} className="bg-white rounded-lg p-3 shadow-sm border border-yellow-100 flex justify-between items-center">
                  <div>
                    <p className="font-medium text-gray-900">{task.client_name}</p>
                    <p className="text-sm text-gray-600">
                      {task.type === 'cobranza' ? task.description : `Presupuesto N° ${task.result}`} - Vence: {format(new Date(task.reminder_date!), 'dd/MM/yyyy')}
                    </p>
                  </div>
                  <button
                    onClick={() => handleStatusChange(task.id, task.status, { reminder_status: 'cancelled' })}
                    className="text-sm text-gray-500 hover:text-gray-700 underline"
                  >
                    Descartar
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeList.length > 0 ? (
          activeTab === 'presupuestos'
            ? activeList.filter(t => t.reminder_status !== 'active').map(renderTaskCard)
            : activeList.map(renderTaskCard)
        ) : (
          <div className="text-center py-12 bg-white rounded-xl border border-gray-200 border-dashed">
            {activeTab === 'completed' ? (
              <Clock className="w-12 h-12 mx-auto text-gray-300 mb-3" />
            ) : (
              <CheckCircle2 className="w-12 h-12 mx-auto text-gray-300 mb-3" />
            )}
            <h3 className="text-lg font-medium text-gray-900">
              {activeTab === 'completed' ? 'No hay tareas completadas' : 'No hay tareas pendientes en esta categoría'}
            </h3>
            {activeTab !== 'completed' && <p className="text-gray-500">¡Todo al día!</p>}
          </div>
        )}
      </div>

      {/* Completion Modal */}
      {completingTask && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className={`bg-white rounded-xl shadow-xl w-full ${completingTask.type === 'entrega' ? 'max-w-4xl' : 'max-w-md'} overflow-hidden`}>
            <div className="p-6 border-b border-gray-200 flex justify-between items-center text-white bg-indigo-600">
              <h3 className="text-lg font-bold">
                Completar {completingTask.type === 'prueba' ? 'Prueba' : completingTask.type === 'entrega' ? 'Entrega' : 'Presupuesto'}
              </h3>
              <button onClick={() => setCompletingTask(null)} className="text-white/80 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleCompleteTask} className="p-6 space-y-6">
              {completingTask.type === 'entrega' ? (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-bold text-gray-700 mb-1">Fecha de entrega</label>
                      <input
                        type="date"
                        name="delivery_date"
                        defaultValue={format(new Date(), 'yyyy-MM-dd')}
                        className="w-full border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-indigo-500 outline-none"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-gray-700 mb-1">Número de remito</label>
                      <input
                        type="text"
                        name="remito"
                        className="w-full border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-indigo-500 outline-none font-mono"
                        placeholder="Ej: R-0001-00001234"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-gray-700 mb-1">Persona que recibió (opcional)</label>
                      <input
                        type="text"
                        name="recibio"
                        className="w-full border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-indigo-500 outline-none"
                        placeholder="Nombre de quien recibe"
                      />
                    </div>
                  </div>

                  <div className="bg-indigo-50 p-4 rounded-xl border border-indigo-100">
                    <label className="flex items-center space-x-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={isPartial}
                        onChange={e => setIsPartial(e.target.checked)}
                        className="w-5 h-5 text-indigo-600 rounded-lg focus:ring-indigo-500"
                      />
                      <span className="text-sm font-bold text-indigo-900">Entrega parcial</span>
                    </label>
                  </div>

                  <div className="border border-gray-200 rounded-xl overflow-hidden">
                    <div className="bg-gray-50 px-4 py-2 border-b border-gray-200">
                      <h4 className="text-xs font-bold text-gray-500 uppercase">Productos a Entregar</h4>
                    </div>
                    <div className="divide-y divide-gray-100 max-h-60 overflow-y-auto">
                      {fulfillProducts.map((p, i) => (
                        <div key={i} className="p-4 flex items-center justify-between">
                          <div className="flex-1">
                            <div className="text-sm font-bold text-gray-900">
                              {p.code} x {p.grade ? `${p.grade} x ` : ''}{p.presentation || p.name} - {p.qty} u
                            </div>
                          </div>
                          {isPartial ? (
                            <div className="flex items-center gap-2">
                              <input
                                type="number"
                                min="0"
                                max={p.qty}
                                value={p.fulfillQty}
                                onChange={e => {
                                  const newPs = [...fulfillProducts];
                                  newPs[i].fulfillQty = Math.max(0, Math.min(p.qty, parseInt(e.target.value) || 0));
                                  setFulfillProducts(newPs);
                                }}
                                className="w-16 border border-gray-300 rounded-lg p-1.5 text-center font-bold text-indigo-600 focus:ring-2 focus:ring-indigo-500 outline-none"
                              />
                              <span className="text-xs font-bold text-gray-400">/ {p.qty}</span>
                            </div>
                          ) : (
                            <div className="font-bold text-green-700 bg-green-50 px-3 py-1 rounded-lg border border-green-100 text-sm">
                              {p.qty} un.
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="text-sm text-gray-500 space-y-1">
                    <p className="flex items-center"><CheckCircle2 className="w-4 h-4 mr-2 text-green-500" /> Registrará la entrega en el historial del cliente.</p>
                    <p className="flex items-center"><CheckCircle2 className="w-4 h-4 mr-2 text-green-500" /> {isPartial ? "El pedido permanecerá en 'Entregas' con los items restantes." : "El pedido se marcará como completado."}</p>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      {completingTask.type === 'prueba' ? 'Resultado de la prueba' : 'N° de Presupuesto'}
                    </label>
                    {completingTask.type === 'prueba' ? (
                      <textarea
                        name="result"
                        rows={3}
                        className="w-full border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-indigo-500 outline-none"
                        placeholder="Detalles del resultado..."
                        required
                      ></textarea>
                    ) : (
                      <input
                        type="text"
                        name="result"
                        className="w-full border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-indigo-500 outline-none"
                        placeholder="Ej: P-0001"
                        required
                      />
                    )}
                  </div>

                  {completingTask.type === 'presupuesto' && (
                    <p className="text-sm text-gray-500 flex items-center">
                      <Bell className="w-4 h-4 mr-1.5" /> Se creará un recordatorio automático para dentro de 2 semanas.
                    </p>
                  )}
                </>
              )}

              <div className="pt-4 flex justify-end gap-3 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setCompletingTask(null)}
                  className="px-6 py-2.5 text-gray-700 font-bold hover:bg-gray-100 rounded-xl transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-8 py-2.5 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 shadow-lg shadow-indigo-200 transition-all"
                >
                  Confirmar Entrega
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
