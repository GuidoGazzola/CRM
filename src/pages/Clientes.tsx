import React, { useState, useEffect } from 'react';
import { Search, Plus, ChevronRight, FileText, Truck, Users, Activity, X, Download } from 'lucide-react';
import { useUser } from '../store/UserContext';
import { format } from 'date-fns';
import { formatCuit } from '../utils/formatters';

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

  useEffect(() => {
    fetch('/api/clients')
      .then(res => res.json())
      .then(data => setClients(data));
    fetch('/api/products')
      .then(res => res.json())
      .then(data => setProductsList(data));
  }, []);

  useEffect(() => {
    if (selectedClient) {
      fetch('/api/interactions')
        .then(res => res.json())
        .then((data: Interaction[]) => {
          setInteractions(data.filter(i => i.client_id === selectedClient.id));
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

    if (type === 'visita') {
      description = formData.get('description') as string;
      const prods = formData.get('products') as string;
      if (prods) products = JSON.stringify([{ name: prods, qty: 1 }]);
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
      date: new Date().toISOString(),
      user: user.name,
      description,
      products
    };

    const res = await fetch('/api/interactions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newInteraction)
    });

    if (res.ok) {
      if (type === 'presupuesto' || type === 'prueba') {
        await fetch('/api/tasks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            client_id: selectedClient?.id,
            type,
            products,
            description,
            requested_by: user.name,
            status: 'pending'
          })
        });
      }

      setShowInteractionModal(false);
      setInteractionType('visita');
      // Refresh interactions
      fetch('/api/interactions')
        .then(res => res.json())
        .then((data: Interaction[]) => {
          setInteractions(data.filter(i => i.client_id === selectedClient?.id));
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
                <h3 className="font-semibold text-gray-900">{client.razon_social}</h3>
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
                  <p className="mt-1 text-gray-900">{selectedClient.plazo_de_pago || 'No especificado'}</p>
                </div>
                {selectedClient.has_catalog && (
                  <div>
                    <h4 className="text-sm font-medium text-gray-500 uppercase tracking-wider">Catálogo de precios</h4>
                    <a
                      href={`/api/clients/${selectedClient.id}/catalog`}
                      download={`catalogo_cliente_${selectedClient.id}.pdf`}
                      className="mt-2 text-indigo-600 bg-indigo-50 border border-indigo-100 hover:bg-indigo-100 px-3 py-1.5 rounded-lg flex items-center w-fit text-sm font-bold transition-colors"
                    >
                      <Download className="w-4 h-4 mr-2" />
                      Descargar PDF
                    </a>
                  </div>
                )}
                {isAdmin && (
                  <div>
                    <h4 className="text-sm font-medium text-gray-500 uppercase tracking-wider">% Ventas Efectivas</h4>
                    <div className="mt-1 flex items-center">
                      <div className="w-full bg-gray-200 rounded-full h-2.5 mr-2">
                        <div className="bg-green-500 h-2.5 rounded-full" style={{ width: '75%' }}></div>
                      </div>
                      <span className="text-sm font-medium text-gray-900">75%</span>
                    </div>
                  </div>
                )}
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
                      rows={3}
                      className="w-full border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-indigo-500 outline-none"
                      placeholder="Detalles de la visita..."
                      required
                    ></textarea>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Productos (opcional)</label>
                    <input
                      type="text"
                      name="products"
                      list="products-list"
                      className="w-full border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-indigo-500 outline-none"
                      placeholder="Seleccionar o escribir producto..."
                    />
                    <datalist id="products-list">
                      {productsList.map(p => (
                        <option key={p.id} value={p.presentation}>{p.code} - {p.name}</option>
                      ))}
                    </datalist>
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
