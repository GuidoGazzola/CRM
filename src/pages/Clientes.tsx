import React, { useState, useEffect } from 'react';
import { Search, Plus, ChevronRight, FileText, Truck, Users, Activity, X, Download } from 'lucide-react';
import { useUser } from '../store/UserContext';
import { format, differenceInDays } from 'date-fns';
import { formatCuit } from '../utils/formatters';
import { supabase } from '../supabaseClient';
import { useInsertKey } from '../hooks/useInsertKey';

interface Client {
  id: number;
  razon_social: string;
  cuit: string;
  calificacion: string;
  consumos_tipicos: string;
  demora_promedio_pago: string;
  plazo_de_pago: string;
  has_catalog?: boolean;
  score?: number;
  alerts?: string[];
  isDelayed?: boolean;
  lastInteractionDate?: number;
}

interface Interaction {
  id: number;
  client_id: number;
  type: string;
  date: string;
  user: string;
  description: string;
  products: string;
}

export default function Clientes() {
  const { isAdmin, user } = useUser();
  const [clients, setClients] = useState<Client[]>([]);
  const [search, setSearch] = useState('');
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [interactions, setInteractions] = useState<Interaction[]>([]);
  const [showInteractionModal, setShowInteractionModal] = useState(false);
  const [interactionType, setInteractionType] = useState('visita');
  const [filterType, setFilterType] = useState('all');
  const [filterTime, setFilterTime] = useState('all');
  const [productsList, setProductsList] = useState<{ id: number, code: string, name: string, presentation: string }[]>([]);
  const [orderFrequency, setOrderFrequency] = useState<{ text: string, isDelayed: boolean } | null>(null);

  useInsertKey(() => {
    if (selectedClient) {
      setShowInteractionModal(true);
    }
  });

  useEffect(() => {
    const fetchData = async () => {
      const [{ data: clientsData }, { data: productsData }, { data: allOrders }, { data: allInteractions }] = await Promise.all([
        supabase.from('clients').select('*'),
        supabase.from('products').select('*').order('code', { ascending: true }),
        supabase.from('client_orders').select('client_id, order_date').order('order_date', { ascending: true }),
        supabase.from('interactions').select('client_id, date').order('date', { ascending: false })
      ]);

      let processedClients = clientsData || [];

      if (clientsData && allOrders && allInteractions) {
        const ordersByClient: Record<number, any[]> = {};
        allOrders.forEach(o => {
          if (!ordersByClient[o.client_id]) ordersByClient[o.client_id] = [];
          ordersByClient[o.client_id].push(o);
        });

        const lastInteractionByClient: Record<number, number> = {};
        allInteractions.forEach(i => {
          const t = new Date(i.date).getTime();
          if (!lastInteractionByClient[i.client_id] || t > lastInteractionByClient[i.client_id]) {
            lastInteractionByClient[i.client_id] = t;
          }
        });

        processedClients = (processedClients as Client[]).map(client => {
          const clientOrders = ordersByClient[client.id] || [];
          let isDelayed = false;

          if (clientOrders.length >= 3) {
            const diffs: number[] = [];
            for (let i = 1; i < clientOrders.length; i++) {
              const prevDate = new Date(clientOrders[i - 1].order_date);
              const currDate = new Date(clientOrders[i].order_date);
              diffs.push(Math.abs(differenceInDays(currDate, prevDate)));
            }
            const avg = diffs.reduce((a, b) => a + b, 0) / diffs.length;
            const squaredDiffs = diffs.map(val => Math.pow(val - avg, 2));
            const variance = squaredDiffs.reduce((a, b) => a + b, 0) / squaredDiffs.length;
            const stdDev = Math.sqrt(variance);

            const lastOrderDate = new Date(clientOrders[clientOrders.length - 1].order_date);
            const daysSinceLastOrder = differenceInDays(new Date(), lastOrderDate);

            if (daysSinceLastOrder > (avg + stdDev)) {
              isDelayed = true;
            }
          }

          return {
            ...client,
            isDelayed,
            lastInteractionDate: lastInteractionByClient[client.id] || 0
          };
        });

        processedClients.sort((a: any, b: any) => {
          if (a.isDelayed && !b.isDelayed) return -1;
          if (!a.isDelayed && b.isDelayed) return 1;
          return b.lastInteractionDate - a.lastInteractionDate;
        });
      }

      setClients(processedClients);
      if (productsData) setProductsList(productsData);
    };
    fetchData();
  }, []);

  useEffect(() => {
    if (selectedClient) {
      supabase
        .from('interactions')
        .select('*')
        .eq('client_id', selectedClient.id)
        .order('date', { ascending: false })
        .then(({ data }) => {
          if (data) setInteractions(data as Interaction[]);
        });

      // Calculate order frequency
      setOrderFrequency({ text: 'Calculando...', isDelayed: false });
      supabase
        .from('client_orders')
        .select('order_date')
        .eq('client_id', selectedClient.id)
        .order('order_date', { ascending: true })
        .then(({ data }) => {
          if (data && data.length > 1) {
            const diffs: number[] = [];
            for (let i = 1; i < data.length; i++) {
              const prevDate = new Date(data[i - 1].order_date);
              const currDate = new Date(data[i].order_date);
              diffs.push(Math.abs(differenceInDays(currDate, prevDate)));
            }

            const avg = diffs.reduce((a, b) => a + b, 0) / diffs.length;
            const avgDiff = Math.round(avg);

            let isDelayed = false;
            if (data.length >= 3) {
              const squaredDiffs = diffs.map(val => Math.pow(val - avg, 2));
              const variance = squaredDiffs.reduce((a, b) => a + b, 0) / squaredDiffs.length;
              const stdDev = Math.sqrt(variance);

              const lastOrderDate = new Date(data[data.length - 1].order_date);
              const daysSinceLastOrder = differenceInDays(new Date(), lastOrderDate);

              if (daysSinceLastOrder > (avg + stdDev)) {
                isDelayed = true;
              }
            }
            setOrderFrequency({ text: `${avgDiff} días`, isDelayed });
          } else {
            setOrderFrequency({ text: 'Datos insuficientes', isDelayed: false });
          }
        });
    }
  }, [selectedClient]);

  const filteredClients = clients.filter(c =>
    c.razon_social.toLowerCase().includes(search.toLowerCase()) ||
    c.cuit.includes(search)
  );

  const getInteractionIcon = (type: string) => {
    switch (type) {
      case 'visita': return <Users className="w-5 h-5 text-blue-500" />;
      case 'entrega': return <Truck className="w-5 h-5 text-green-500" />;
      case 'presupuesto': return <FileText className="w-5 h-5 text-purple-500" />;
      case 'prueba': return <Activity className="w-5 h-5 text-orange-500" />;
      default: return <FileText className="w-5 h-5 text-gray-500" />;
    }
  };

  const handleAddInteraction = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const type = interactionType;
    let description = '';
    let products = '[]';
    const dateStr = formData.get('interaction_date') as string;
    let interactionDateISO = new Date().toISOString();
    if (dateStr) {
      interactionDateISO = new Date(dateStr + 'T12:00:00').toISOString();
    }

    if (type === 'visita') {
      description = formData.get('description') as string;
    } else if (type === 'presupuesto') {
      const desc = formData.get('description') as string;
      const solicitante = formData.get('solicitante') as string;
      description = `${desc}\n\nSolicitante/Destinatario: ${solicitante}`;
    } else if (type === 'prueba') {
      const desc = formData.get('description') as string;
      const responsable = formData.get('responsable') as string;
      description = `${desc}\n\nResponsable de la prueba: ${responsable}`;
    }

    const newInteraction = {
      client_id: selectedClient?.id,
      type,
      date: interactionDateISO,
      user: user.name,
      description,
      products
    };

    const { error: insertError } = await supabase.from('interactions').insert([newInteraction]);

    if (!insertError) {
      if (type === 'presupuesto' || type === 'prueba') {
        await supabase.from('tasks').insert([{
          client_id: selectedClient?.id,
          type,
          products,
          description,
          requested_by: user.name,
          status: 'pending'
        }]);
      }

      setShowInteractionModal(false);
      setInteractionType('visita');
      // Refresh interactions
      supabase.from('interactions').select('*').eq('client_id', selectedClient?.id).order('date', { ascending: false })
        .then(({ data }) => {
          if (data) setInteractions(data as Interaction[]);
        });
    }
  };

  const filteredInteractions = interactions.filter(interaction => {
    if (filterType !== 'all' && interaction.type !== filterType) return false;

    if (filterTime !== 'all') {
      const interactionDate = new Date(interaction.date);
      const now = new Date();
      const diffTime = Math.abs(now.getTime() - interactionDate.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      if (filterTime === '7days' && diffDays > 7) return false;
      if (filterTime === '30days' && diffDays > 30) return false;
      if (filterTime === '90days' && diffDays > 90) return false;
    }

    return true;
  });

  return (
    <div className="flex flex-col md:flex-row gap-6 h-[calc(100vh-8rem)]">
      {/* Left Panel: Client List */}
      <div className={`${selectedClient ? 'hidden md:flex' : 'flex'} flex-col w-full md:w-1/3 bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden`}>
        <div className="p-4 border-b border-gray-200">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              type="text"
              placeholder="Buscar por Razón Social o CUIT..."
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {filteredClients.map(client => (
            <button
              key={client.id}
              onClick={() => setSelectedClient(client)}
              className={`w-full text-left p-4 border-b border-gray-100 hover:bg-gray-50 transition-colors flex items-center justify-between ${selectedClient?.id === client.id ? 'bg-indigo-50 border-l-4 border-l-indigo-500' : ''
                }`}
            >
              <div>
                <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                  {client.razon_social}
                  {client.isDelayed && <span className="w-2 h-2 rounded-full bg-red-500" title="Cliente atrasado"></span>}
                </h3>
                <p className="text-sm text-gray-500">CUIT: {formatCuit(client.cuit)}</p>
              </div>
              <ChevronRight className={`w-5 h-5 ${selectedClient?.id === client.id ? 'text-indigo-500' : 'text-gray-400'}`} />
            </button>
          ))}
        </div>
      </div>

      {/* Right Panel: Client Detail */}
      {selectedClient ? (
        <div className="flex-1 flex flex-col bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="p-6 border-b border-gray-200 bg-gray-50 flex justify-between items-start">
            <div>
              <button
                className="md:hidden text-indigo-600 text-sm font-medium mb-2 flex items-center"
                onClick={() => setSelectedClient(null)}
              >
                <ChevronRight className="w-4 h-4 rotate-180 mr-1" /> Volver a lista
              </button>
              <h2 className="text-2xl font-bold text-gray-900">{selectedClient.razon_social}</h2>
              <p className="text-gray-500">CUIT: {formatCuit(selectedClient.cuit)}</p>
            </div>
            <button
              onClick={() => setShowInteractionModal(true)}
              className="bg-indigo-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-indigo-700 transition-colors flex items-center"
            >
              <Plus className="w-5 h-5 mr-2" />
              Interacción
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
              <div className="space-y-4">
                <div>
                  <h4 className="text-sm font-medium text-gray-500 uppercase tracking-wider">Calificación / Nota Final</h4>
                  <div className="mt-1 flex items-center gap-2">
                    <p className="text-gray-900 font-medium">{selectedClient.calificacion || 'No especificada'}</p>
                    {selectedClient.score !== undefined && selectedClient.score !== null && (
                      <span className="px-2 py-1 bg-indigo-100 text-indigo-800 font-bold rounded-md border border-indigo-200 text-sm">
                        {selectedClient.score}
                      </span>
                    )}
                  </div>
                  {selectedClient.alerts && selectedClient.alerts.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {selectedClient.alerts.map((a, i) => (
                        <p key={i} className="text-xs text-red-600 bg-red-50 p-1 rounded border border-red-100">{a}</p>
                      ))}
                    </div>
                  )}
                </div>
                <div>
                  <h4 className="text-sm font-medium text-gray-500 uppercase tracking-wider">Consumos Típicos</h4>
                  <p className="mt-1 text-gray-900">{selectedClient.consumos_tipicos || 'No especificados'}</p>
                </div>
              </div>
              <div className="space-y-4">
                <div>
                  <h4 className="text-sm font-medium text-gray-500 uppercase tracking-wider">Demora Promedio de Pago</h4>
                  <p className="mt-1 text-gray-900">{selectedClient.demora_promedio_pago || 'No especificada'}</p>
                </div>
                <div>
                  <h4 className="text-sm font-medium text-gray-500 uppercase tracking-wider">Plazo de Pago</h4>
                  <p className="mt-1 text-gray-900">{selectedClient.plazo_de_pago === '0' || selectedClient.plazo_de_pago === 0 || selectedClient.plazo_de_pago?.toString().toLowerCase() === 'anticipado' ? 'Anticipado' : (selectedClient.plazo_de_pago || 'No especificado')}</p>
                </div>
                {selectedClient.has_catalog && (
                  <div>
                    <h4 className="text-sm font-medium text-gray-500 uppercase tracking-wider">Catálogo de precios</h4>
                    <a
                      href={selectedClient.catalog_pdf || '#'}
                      target="_blank" rel="noopener noreferrer"
                      className="mt-2 text-indigo-600 bg-indigo-50 border border-indigo-100 hover:bg-indigo-100 px-3 py-1.5 rounded-lg flex items-center w-fit text-sm font-bold transition-colors"
                    >
                      <Download className="w-4 h-4 mr-2" />
                      Descargar PDF
                    </a>
                  </div>
                )}
                <div>
                  <h4 className="text-sm font-medium text-gray-500 uppercase tracking-wider">Frecuencia de pedido</h4>
                  <p className={`mt-1 font-medium ${orderFrequency?.isDelayed ? 'text-red-600' : 'text-gray-900'}`}>
                    {orderFrequency?.text || 'Calculando...'}
                    {orderFrequency?.isDelayed && <span className="block text-xs font-bold mt-1 text-red-500 tracking-tight">⚠️ Cliente atrasado</span>}
                  </p>
                </div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 pb-2 border-b border-gray-200 gap-4">
              <h3 className="text-lg font-bold text-gray-900">Historial de Interacciones</h3>
              <div className="flex gap-2">
                <select
                  className="text-sm border border-gray-300 rounded-lg p-1.5 focus:ring-2 focus:ring-indigo-500 outline-none"
                  value={filterType}
                  onChange={(e) => setFilterType(e.target.value)}
                >
                  <option value="all">Todos los tipos</option>
                  <option value="visita">Visitas</option>
                  <option value="entrega">Entregas</option>
                  <option value="presupuesto">Presupuestos</option>
                  <option value="prueba">Pruebas</option>
                </select>
                <select
                  className="text-sm border border-gray-300 rounded-lg p-1.5 focus:ring-2 focus:ring-indigo-500 outline-none"
                  value={filterTime}
                  onChange={(e) => setFilterTime(e.target.value)}
                >
                  <option value="all">Cualquier fecha</option>
                  <option value="7days">Últimos 7 días</option>
                  <option value="30days">Últimos 30 días</option>
                  <option value="90days">Últimos 90 días</option>
                </select>
              </div>
            </div>
            <div className="space-y-6">
              {filteredInteractions.length === 0 ? (
                <p className="text-gray-500 text-center py-8">No hay interacciones registradas.</p>
              ) : (
                filteredInteractions.map((interaction) => (
                  <div key={interaction.id} className="flex gap-4">
                    <div className="flex flex-col items-center">
                      <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center shrink-0">
                        {getInteractionIcon(interaction.type)}
                      </div>
                      <div className="w-px h-full bg-gray-200 my-2"></div>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-4 flex-1 border border-gray-100">
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize bg-white border border-gray-200 text-gray-800">
                            {interaction.type}
                          </span>
                          <span className="ml-2 text-sm text-gray-500">por {interaction.user}</span>
                        </div>
                        <span className="text-sm text-gray-500">
                          {format(new Date(interaction.date), 'dd MMM yyyy, HH:mm')}
                        </span>
                      </div>
                      <p className="text-gray-800 mt-2">{interaction.description}</p>
                      {interaction.products && interaction.products !== '[]' && (
                        <div className="mt-3 text-sm text-gray-600 bg-white p-2 rounded border border-gray-200">
                          <span className="font-medium">Productos:</span> {
                            JSON.parse(interaction.products).map((p: any) => `${p.qty}x ${p.name}`).join(', ')
                          }
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="hidden md:flex flex-1 items-center justify-center bg-white rounded-xl shadow-sm border border-gray-200 text-gray-400">
          <div className="text-center">
            <Users className="w-16 h-16 mx-auto mb-4 text-gray-300" />
            <p className="text-lg">Selecciona un cliente para ver sus detalles</p>
          </div>
        </div>
      )}

      {/* Modal for New Interaction */}
      {showInteractionModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="p-6 border-b border-gray-200 flex justify-between items-center">
              <h3 className="text-lg font-bold text-gray-900">Nueva Interacción</h3>
              <button onClick={() => setShowInteractionModal(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleAddInteraction} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Fecha</label>
                <input
                  type="date"
                  name="interaction_date"
                  defaultValue={format(new Date(), 'yyyy-MM-dd')}
                  className="w-full border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-indigo-500 outline-none"
                  required
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tipo</label>
                <select
                  name="type"
                  className="w-full border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-indigo-500 outline-none"
                  value={interactionType}
                  onChange={(e) => setInteractionType(e.target.value)}
                  required
                >
                  <option value="visita">Informe de visita</option>
                  <option value="presupuesto">Solicitud de presupuesto</option>
                  <option value="prueba">Solicitud de prueba de producto</option>
                </select>
              </div>

              {interactionType === 'visita' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Descripción</label>
                    <textarea
                      name="description"
                      rows={6}
                      className="w-full border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-indigo-500 outline-none resize-none"
                      placeholder="Detalles de la visita..."
                      required
                    ></textarea>
                  </div>
                </>
              )}

              {interactionType === 'presupuesto' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Descripción / Detalle</label>
                    <textarea
                      name="description"
                      rows={3}
                      className="w-full border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-indigo-500 outline-none"
                      placeholder="Detalles del presupuesto..."
                      required
                    ></textarea>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Solicitante / Destinatario</label>
                    <input
                      type="text"
                      name="solicitante"
                      className="w-full border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-indigo-500 outline-none"
                      placeholder="Nombre del solicitante"
                      required
                    />
                  </div>
                </>
              )}

              {interactionType === 'prueba' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Descripción / Detalle</label>
                    <textarea
                      name="description"
                      rows={3}
                      className="w-full border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-indigo-500 outline-none"
                      placeholder="Detalles de la prueba..."
                      required
                    ></textarea>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Responsable de la prueba</label>
                    <input
                      type="text"
                      name="responsable"
                      className="w-full border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-indigo-500 outline-none"
                      placeholder="Nombre del responsable"
                      required
                    />
                  </div>
                </>
              )}

              <div className="pt-4 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowInteractionModal(false)}
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
        </div>
      )}
    </div>
  );
}
