import React, { useState, useEffect } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import { useUser } from '../store/UserContext';
import { FileText, Truck, Users, DollarSign } from 'lucide-react';

type Timeframe = 'Semana' | 'Mes' | 'Trimestre' | 'YTD';

export default function Home() {
  const { isAdmin } = useUser();
  const [timeframe, setTimeframe] = useState<Timeframe>('Mes');
  const [selectedMetric, setSelectedMetric] = useState<'presupuestos' | 'entregas' | 'visitas'>('entregas');

  const [dashboardData, setDashboardData] = useState<any>(null);

  useEffect(() => {
    fetch('/api/dashboard')
      .then(res => res.json())
      .then(data => setDashboardData(data));
  }, []);

  const COLORS = ['#4f46e5', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

  if (!dashboardData) return <div className="p-4">Cargando estadísticas...</div>;

  const { stats, financials, chartData } = dashboardData;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h1 className="text-2xl font-bold text-gray-900">Estadísticas</h1>
        <div className="flex bg-white rounded-lg shadow-sm border border-gray-200 p-1">
          {(['Semana', 'Mes', 'Trimestre', 'YTD'] as Timeframe[]).map((t) => (
            <button
              key={t}
              onClick={() => setTimeframe(t)}
              className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${timeframe === t
                  ? 'bg-indigo-50 text-indigo-700'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {isAdmin && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Total Presupuestado</h3>
              <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
                <DollarSign className="w-6 h-6" />
              </div>
            </div>
            <div className="space-y-2">
              <p className="text-3xl font-bold text-gray-900">
                USD {financials.presupuestado.usd.toLocaleString()}
              </p>
              <p className="text-sm text-gray-500">
                ARS {financials.presupuestado.ars.toLocaleString()}
              </p>
            </div>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Total Facturado</h3>
              <div className="p-2 bg-green-50 text-green-600 rounded-lg">
                <DollarSign className="w-6 h-6" />
              </div>
            </div>
            <div className="space-y-2">
              <p className="text-3xl font-bold text-gray-900">
                USD {financials.facturado.usd.toLocaleString()}
              </p>
              <p className="text-sm text-gray-500">
                ARS {financials.facturado.ars.toLocaleString()}
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Panel: Counters */}
        <div className="space-y-4">
          <button
            onClick={() => setSelectedMetric('presupuestos')}
            className={`w-full text-left bg-white rounded-xl shadow-sm border p-6 transition-all ${selectedMetric === 'presupuestos' ? 'border-indigo-500 ring-1 ring-indigo-500' : 'border-gray-200 hover:border-indigo-300'
              }`}
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500">Presupuestos</p>
                <p className="text-3xl font-bold text-gray-900 mt-1">{stats.presupuestos}</p>
              </div>
              <div className={`p-3 rounded-lg ${selectedMetric === 'presupuestos' ? 'bg-indigo-100 text-indigo-600' : 'bg-gray-50 text-gray-400'}`}>
                <FileText className="w-6 h-6" />
              </div>
            </div>
          </button>

          <button
            onClick={() => setSelectedMetric('entregas')}
            className={`w-full text-left bg-white rounded-xl shadow-sm border p-6 transition-all ${selectedMetric === 'entregas' ? 'border-indigo-500 ring-1 ring-indigo-500' : 'border-gray-200 hover:border-indigo-300'
              }`}
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500">Entregas</p>
                <p className="text-3xl font-bold text-gray-900 mt-1">{stats.entregas}</p>
              </div>
              <div className={`p-3 rounded-lg ${selectedMetric === 'entregas' ? 'bg-indigo-100 text-indigo-600' : 'bg-gray-50 text-gray-400'}`}>
                <Truck className="w-6 h-6" />
              </div>
            </div>
          </button>

          <button
            onClick={() => setSelectedMetric('visitas')}
            className={`w-full text-left bg-white rounded-xl shadow-sm border p-6 transition-all ${selectedMetric === 'visitas' ? 'border-indigo-500 ring-1 ring-indigo-500' : 'border-gray-200 hover:border-indigo-300'
              }`}
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500">Visitas</p>
                <p className="text-3xl font-bold text-gray-900 mt-1">{stats.visitas}</p>
              </div>
              <div className={`p-3 rounded-lg ${selectedMetric === 'visitas' ? 'bg-indigo-100 text-indigo-600' : 'bg-gray-50 text-gray-400'}`}>
                <Users className="w-6 h-6" />
              </div>
            </div>
          </button>
        </div>

        {/* Right Panel: Chart */}
        <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-gray-200 p-6 flex flex-col">
          <h3 className="text-lg font-semibold text-gray-900 mb-6">
            Distribución de {selectedMetric.charAt(0).toUpperCase() + selectedMetric.slice(1)} por Cliente
          </h3>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%" minWidth={0}>
              <PieChart>
                <Pie
                  data={chartData[selectedMetric]}
                  cx="50%"
                  cy="50%"
                  innerRadius={80}
                  outerRadius={120}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {chartData[selectedMetric].map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value: number) => [`${value}%`, 'Porcentaje']}
                  contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                />
                <Legend verticalAlign="bottom" height={36} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}
