import React, { useState, useEffect } from 'react';
import { CheckSquare, Clock, CheckCircle2, XCircle, AlertCircle, ChevronRight, X, RotateCcw, Bell } from 'lucide-react';
import { useUser } from '../store/UserContext';
import { format, addDays } from 'date-fns';

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

export default function Tareas() {
  const { isAdmin, user } = useUser();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [activeTab, setActiveTab] = useState<'pending' | 'completed'>('pending');
  const [completingTask, setCompletingTask] = useState<Task | null>(null);

  useEffect(() => {
    fetchTasks();
  }, []);

  const fetchTasks = () => {
    fetch('/api/tasks')
      .then(res => res.json())
      .then(data => setTasks(data));
  };

  const handleStatusChange = async (id: number, status: string, extraData: any = {}) => {
    const res = await fetch(`/api/tasks/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, completed_by: user.name, ...extraData })
    });

    if (res.ok) {
      fetchTasks();
    }
  };

  const handleCompleteTask = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!completingTask) return;

    const formData = new FormData(e.currentTarget);
    const result = formData.get('result') as string;

    if (completingTask.type === 'prueba') {
      // Add interaction for the result
      await fetch('/api/interactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: completingTask.client_id,
          type: 'prueba',
          date: new Date().toISOString(),
          user: user.name,
          description: `Resultado de la prueba: ${result}`,
          products: '[]'
        })
      });

      await handleStatusChange(completingTask.id, 'completed', { result });
    } else if (completingTask.type === 'presupuesto') {
      const reminderDate = addDays(new Date(), 14).toISOString();
      await handleStatusChange(completingTask.id, 'completed', { 
        result, 
        reminder_date: reminderDate,
        reminder_status: 'active'
      });
    }

    setCompletingTask(null);
  };

  const handleRevertTask = (task: Task) => {
    const newStatus = task.type === 'prueba' ? 'approved' : 'pending';
    handleStatusChange(task.id, newStatus);
  };

  const pendingTasks = tasks.filter(t => t.status === 'pending' || (t.type === 'prueba' && t.status === 'approved'));
  const completedTasks = tasks.filter(t => t.status === 'completed' || t.status === 'rejected');

  const getStatusBadge = (status: string, type: string) => {
    if (status === 'pending') return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800"><Clock className="w-3 h-3 mr-1" /> Pendiente</span>;
    if (status === 'approved') return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800"><CheckCircle2 className="w-3 h-3 mr-1" /> Aprobada (En curso)</span>;
    if (status === 'completed') return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800"><CheckCircle2 className="w-3 h-3 mr-1" /> Completada</span>;
    if (status === 'rejected') return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800"><XCircle className="w-3 h-3 mr-1" /> Rechazada</span>;
    return null;
  };

  const renderTaskCard = (task: Task) => (
    <div key={task.id} className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow">
      <div className="flex justify-between items-start mb-4">
        <div>
          <h3 className="text-lg font-bold text-gray-900">{task.client_name}</h3>
          <p className="text-sm text-gray-500">Solicitado por {task.requested_by} el {format(new Date(task.created_at), 'dd/MM/yyyy')}</p>
        </div>
        <div className="flex flex-col items-end gap-2">
          {getStatusBadge(task.status, task.type)}
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize bg-gray-100 text-gray-800 border border-gray-200">
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
                <li key={i} className="flex items-center"><ChevronRight className="w-4 h-4 text-gray-400 mr-1" /> {p.qty}x {p.name}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {activeTab === 'pending' && (
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
          {(task.type === 'presupuesto' || (task.type === 'prueba' && task.status === 'approved')) && (
            <button 
              onClick={() => setCompletingTask(task)}
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

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center">
          <CheckSquare className="w-6 h-6 mr-2 text-indigo-600" />
          Gestión de Tareas
        </h1>
        
        <div className="flex bg-white rounded-lg shadow-sm border border-gray-200 p-1">
          <button
            onClick={() => setActiveTab('pending')}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
              activeTab === 'pending'
                ? 'bg-indigo-50 text-indigo-700'
                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
            }`}
          >
            Pendientes ({pendingTasks.length})
          </button>
          <button
            onClick={() => setActiveTab('completed')}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
              activeTab === 'completed'
                ? 'bg-indigo-50 text-indigo-700'
                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
            }`}
          >
            Completadas ({completedTasks.length})
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6">
        {activeTab === 'pending' ? (
          <>
            {pendingTasks.filter(t => t.reminder_status === 'active').length > 0 && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 mb-4">
                <h3 className="text-yellow-800 font-semibold flex items-center mb-3">
                  <Bell className="w-5 h-5 mr-2" /> Recordatorios Activos
                </h3>
                <div className="space-y-3">
                  {pendingTasks.filter(t => t.reminder_status === 'active').map(task => (
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
            {pendingTasks.filter(t => t.reminder_status !== 'active').length > 0 ? pendingTasks.filter(t => t.reminder_status !== 'active').map(renderTaskCard) : (
              <div className="text-center py-12 bg-white rounded-xl border border-gray-200 border-dashed">
                <CheckCircle2 className="w-12 h-12 mx-auto text-gray-300 mb-3" />
                <h3 className="text-lg font-medium text-gray-900">No hay tareas pendientes</h3>
                <p className="text-gray-500">¡Todo al día!</p>
              </div>
            )}
          </>
        ) : (
          completedTasks.length > 0 ? completedTasks.map(renderTaskCard) : (
            <div className="text-center py-12 bg-white rounded-xl border border-gray-200 border-dashed">
              <Clock className="w-12 h-12 mx-auto text-gray-300 mb-3" />
              <h3 className="text-lg font-medium text-gray-900">No hay tareas completadas</h3>
            </div>
          )
        )}
      </div>

      {/* Completion Modal */}
      {completingTask && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="p-6 border-b border-gray-200 flex justify-between items-center">
              <h3 className="text-lg font-bold text-gray-900">
                Completar {completingTask.type === 'prueba' ? 'Prueba' : 'Presupuesto'}
              </h3>
              <button onClick={() => setCompletingTask(null)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleCompleteTask} className="p-6 space-y-4">
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

              <div className="pt-4 flex justify-end gap-3">
                <button 
                  type="button" 
                  onClick={() => setCompletingTask(null)}
                  className="px-4 py-2 text-gray-700 font-medium hover:bg-gray-100 rounded-lg transition-colors"
                >
                  Cancelar
                </button>
                <button 
                  type="submit"
                  className="px-4 py-2 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 transition-colors"
                >
                  Guardar y Completar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
