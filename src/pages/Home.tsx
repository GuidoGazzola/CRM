import React, { useState, useEffect } from 'react';
import { useUser } from '../store/UserContext';
import {
  FileText, Truck, Users, DollarSign, Building2, Package, Clock, ShieldAlert,
  BadgeCheck, TrendingUp, TrendingDown, Calendar, Wallet, Landmark, History as HistoryIcon
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { supabase } from '../supabaseClient';
import {
  startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfQuarter, endOfQuarter,
  startOfYear, endOfYear, subWeeks, subMonths, subQuarters, subYears, format,
  isWithinInterval, parseISO
} from 'date-fns';

type Timeframe = 'Semana' | 'Mes' | 'Trimestre' | 'Año';
const COLORS = ['#4f46e5', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#f97316'];

export default function Home() {
  const { isAdmin, user } = useUser();
  const [timeframe, setTimeframe] = useState<Timeframe>('Mes');
  const [activeTab, setActiveTab] = useState<'mi_empresa' | 'clientes' | 'proveedores'>('mi_empresa');

  const [dashboardData, setDashboardData] = useState<any>(null);

  useEffect(() => {
    const fetchDashboard = async () => {
      const now = new Date();
      let currentStart: Date, currentEnd: Date, prevStart: Date, prevEnd: Date;

      switch (timeframe) {
        case 'Semana':
          currentStart = startOfWeek(now, { weekStartsOn: 1 });
          currentEnd = endOfWeek(now, { weekStartsOn: 1 });
          prevStart = startOfWeek(subWeeks(now, 1), { weekStartsOn: 1 });
          prevEnd = endOfWeek(subWeeks(now, 1), { weekStartsOn: 1 });
          break;
        case 'Mes':
          currentStart = startOfMonth(now);
          currentEnd = endOfMonth(now);
          prevStart = startOfMonth(subMonths(now, 1));
          prevEnd = endOfMonth(subMonths(now, 1));
          break;
        case 'Trimestre':
          currentStart = startOfQuarter(now);
          currentEnd = endOfQuarter(now);
          prevStart = startOfQuarter(subQuarters(now, 1));
          prevEnd = endOfQuarter(subQuarters(now, 1));
          break;
        case 'Año':
          currentStart = startOfYear(now);
          currentEnd = endOfYear(now);
          prevStart = startOfYear(subYears(now, 1));
          prevEnd = endOfYear(subYears(now, 1));
          break;
        default:
          currentStart = startOfMonth(now);
          currentEnd = endOfMonth(now);
          prevStart = startOfMonth(subMonths(now, 1));
          prevEnd = endOfMonth(subMonths(now, 1));
      }

      // Parallel queries
      const [
        { data: tasksData },
        { data: interactionsData },
        { data: invoicesData },
        { count: presupuestosPendientes },
        { count: entregasPendientes },
        { count: pagosPendientes },
        { count: pedidosProvPendientes },
        { data: suppliersData },
        { data: clientsData }
      ] = await Promise.all([
        supabase.from('tasks').select('id, type, created_at, client_id'),
        supabase.from('interactions').select('id, type, date, client_id, products'),
        supabase.from('invoices').select('amount, issue_date, due_date, status, payment_date, payment_amount'),
        supabase.from('tasks').select('*', { count: 'exact', head: true }).eq('type', 'presupuesto').eq('status', 'pending'),
        supabase.from('client_orders').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
        supabase.from('invoices').select('*', { count: 'exact', head: true }).neq('status', 'completed'),
        supabase.from('supplier_orders').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
        supabase.from('suppliers').select('razon_social, calificacion, demora_promedio_entrega, score').not('calificacion', 'is', null).order('razon_social', { ascending: true }),
        supabase.from('clients').select('id, razon_social, calificacion, score, fecha_primer_pedido').order('razon_social', { ascending: true })
      ]);

      const tData = tasksData || [];
      const iData = interactionsData || [];
      const invData = invoicesData || [];

      // Stats filtrados por periodo actual
      const presupuestos = tData.filter(t => {
        const d = parseISO(t.created_at);
        return isWithinInterval(d, { start: currentStart, end: currentEnd }) && t.type === 'presupuesto';
      }).length;

      const entregas = iData.filter(i => {
        const d = parseISO(i.date);
        return isWithinInterval(d, { start: currentStart, end: currentEnd }) && i.type === 'entrega';
      }).length;

      const visitas = iData.filter(i => {
        const d = parseISO(i.date);
        return isWithinInterval(d, { start: currentStart, end: currentEnd }) && i.type === 'visita';
      }).length;

      // 1. Facturado Periodo Actual
      const facturadoActual = invData
        .filter(i => {
          const d = parseISO(i.issue_date);
          return isWithinInterval(d, { start: currentStart, end: currentEnd });
        })
        .reduce((acc, curr) => acc + (curr.amount || 0), 0);

      // 2. A cobrar este periodo (vencimiento <= fin periodo actual && status != completed)
      const aCobrarActual = invData
        .filter(i => {
          const d = parseISO(i.due_date);
          return d <= currentEnd && i.status !== 'completed';
        })
        .reduce((acc, curr) => acc + (curr.amount || 0), 0);

      // 3. Facturado Periodo Anterior
      const facturadoAnterior = invData
        .filter(i => {
          const d = parseISO(i.issue_date);
          return isWithinInterval(d, { start: prevStart, end: prevEnd });
        })
        .reduce((acc, curr) => acc + (curr.amount || 0), 0);

      // 4. Cobrado Periodo Anterior (payment_date dentro del periodo anterior Y status === completed)
      const cobradoAnterior = invData
        .filter(i => {
          if (!i.payment_date || i.status !== 'completed') return false;
          const d = parseISO(i.payment_date);
          return isWithinInterval(d, { start: prevStart, end: prevEnd });
        })
        .reduce((acc, curr) => acc + (curr.payment_amount || 0), 0);

      // Chart Data grouping
      const groupData = (dataRow: any[], dateField: string, type: string) => {
        const filtered = dataRow.filter(r => {
          const d = parseISO(r[dateField]);
          return r.type === type && isWithinInterval(d, { start: currentStart, end: currentEnd });
        });
        const counts: any = {};
        filtered.forEach(r => {
          counts[r.client_id] = (counts[r.client_id] || 0) + 1;
        });
        const clientsLookup = (clientsData || []).reduce((acc: any, c: any) => { acc[c.id] = c.razon_social; return acc; }, {});
        return Object.keys(counts).map(cid => ({
          name: clientsLookup[cid] || 'Desconocido',
          value: counts[cid]
        })).sort((a, b) => b.value - a.value).slice(0, 5);
      };

      const topClients = (clientsData || []).sort((a: any, b: any) => (b.score || 0) - (a.score || 0)).slice(0, 5);

      setDashboardData({
        stats: { presupuestos, entregas, visitas },
        pending: {
          presupuestos: presupuestosPendientes || 0,
          entregas: entregasPendientes || 0,
          pagos: pagosPendientes || 0,
          proveedoresPedidos: pedidosProvPendientes || 0
        },
        suppliers: suppliersData || [],
        topClients,
        financials: {
          periodLabel: timeframe === 'Semana' ? `esta ${timeframe}` : `este ${timeframe}`,
          actual: { facturado: facturadoActual, aCobrar: aCobrarActual },
          anterior: { facturado: facturadoAnterior, cobrado: cobradoAnterior }
        },
        chartData: {
          presupuestos: groupData(tData, 'created_at', 'presupuesto'),
          entregas: groupData(iData, 'date', 'entrega'),
          visitas: groupData(iData, 'date', 'visita')
        }
      });
    };

    fetchDashboard();
  }, [timeframe]);

  if (!dashboardData) return <div className="p-4 text-gray-500 font-medium">Cargando estadísticas...</div>;

  const { stats, pending, financials, suppliers } = dashboardData;

  return (
    <div className="space-y-6 pb-12">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h1 className="text-2xl font-bold text-gray-900">Resumen y Estadísticas</h1>
        <div className="flex bg-white rounded-lg shadow-sm border border-gray-200 p-1">
          <button
            onClick={() => setActiveTab('mi_empresa')}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors flex items-center ${activeTab === 'mi_empresa'
              ? 'bg-indigo-50 text-indigo-700'
              : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              }`}
          >
            <Building2 className="w-4 h-4 mr-2" />
            Mi Empresa
          </button>
          <button
            onClick={() => setActiveTab('clientes')}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors flex items-center ${activeTab === 'clientes'
              ? 'bg-indigo-50 text-indigo-700'
              : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              }`}
          >
            <Users className="w-4 h-4 mr-2" />
            Clientes
          </button>
          <button
            onClick={() => setActiveTab('proveedores')}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors flex items-center ${activeTab === 'proveedores'
              ? 'bg-indigo-50 text-indigo-700'
              : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              }`}
          >
            <Truck className="w-4 h-4 mr-2" />
            Proveedores
          </button>
        </div>
      </div>

      {activeTab === 'mi_empresa' && (
        <div className="space-y-6 animate-in fade-in duration-300">
          <div className="flex justify-between items-center bg-gray-50 p-4 rounded-xl border border-gray-200">
            <h2 className="text-lg font-semibold text-gray-700 flex items-center">
              <Calendar className="w-5 h-5 mr-2 text-indigo-500" /> Métricas Financieras
            </h2>
            <div className="flex bg-white rounded-lg shadow-sm border border-gray-200 p-1">
              {(['Semana', 'Mes', 'Trimestre', 'Año'] as Timeframe[]).map((t) => (
                <button
                  key={t}
                  onClick={() => setTimeframe(t)}
                  className={`px-4 py-1.5 text-xs font-bold rounded-md transition-colors ${timeframe === t
                    ? 'bg-indigo-600 text-white'
                    : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                    }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          {isAdmin && (
            <div className="space-y-6">
              {/* CURRENT PERIOD METRICS */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 flex flex-col justify-between overflow-hidden relative group">
                  <div className="absolute right-0 top-0 p-8 opacity-5 group-hover:scale-110 transition-transform">
                    <TrendingUp className="w-32 h-32 text-indigo-600" />
                  </div>
                  <div className="flex items-center justify-between relative z-10">
                    <div>
                      <h3 className="text-xs font-bold text-indigo-500 uppercase tracking-widest mb-1">
                        Facturado {financials.periodLabel}
                      </h3>
                      <p className="text-3xl font-black text-gray-900">
                        ARS {financials.actual.facturado.toLocaleString()}
                      </p>
                    </div>
                    <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl">
                      <DollarSign className="w-6 h-6" />
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 flex flex-col justify-between overflow-hidden relative group">
                  <div className="absolute right-0 top-0 p-8 opacity-5 group-hover:scale-110 transition-transform">
                    <Wallet className="w-32 h-32 text-orange-600" />
                  </div>
                  <div className="flex items-center justify-between relative z-10">
                    <div>
                      <h3 className="text-xs font-bold text-orange-500 uppercase tracking-widest mb-1">
                        A cobrar {financials.periodLabel}
                      </h3>
                      <p className="text-3xl font-black text-gray-900">
                        ARS {financials.actual.aCobrar.toLocaleString()}
                      </p>
                    </div>
                    <div className="p-3 bg-orange-50 text-orange-600 rounded-xl">
                      <Clock className="w-6 h-6" />
                    </div>
                  </div>
                </div>
              </div>

              {/* COMPARATIVE PREVIOUS PERIOD */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 border-t border-gray-100 pt-6">
                <div className="bg-gray-50/50 rounded-xl border border-gray-200 p-5 flex items-center justify-between">
                  <div className="flex items-center">
                    <div className="p-2.5 bg-gray-100 text-gray-400 rounded-lg mr-4">
                      <HistoryIcon className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-[10px] font-black text-gray-400 uppercase tracking-tighter">Facturado periodo anterior</p>
                      <p className="text-xl font-bold text-gray-600">ARS {financials.anterior.facturado.toLocaleString()}</p>
                    </div>
                  </div>
                </div>

                <div className="bg-gray-50/50 rounded-xl border border-gray-200 p-5 flex items-center justify-between">
                  <div className="flex items-center">
                    <div className="p-2.5 bg-green-50 text-green-400 rounded-lg mr-4">
                      <Landmark className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-[10px] font-black text-gray-400 uppercase tracking-tighter">Cobrado periodo anterior</p>
                      <p className="text-xl font-bold text-green-600">ARS {financials.anterior.cobrado.toLocaleString()}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Realizadas (Hechas) */}
            <div className="space-y-4">
              <h3 className="text-sm font-bold text-gray-400 uppercase tracking-widest ml-1 flex items-center">
                <BadgeCheck className="w-4 h-4 mr-1.5 text-green-500" /> Actividad del Periodo
              </h3>

              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-500">Presupuestos Enviados</p>
                  <p className="text-4xl font-bold text-gray-900 mt-1">{stats.presupuestos}</p>
                </div>
                <div className="p-4 rounded-xl bg-indigo-50 text-indigo-600">
                  <FileText className="w-8 h-8" />
                </div>
              </div>

              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-500">Entregas Realizadas</p>
                  <p className="text-4xl font-bold text-gray-900 mt-1">{stats.entregas}</p>
                </div>
                <div className="p-4 rounded-xl bg-green-50 text-green-600">
                  <Truck className="w-8 h-8" />
                </div>
              </div>

              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-500">Visitas Concretadas</p>
                  <p className="text-4xl font-bold text-gray-900 mt-1">{stats.visitas}</p>
                </div>
                <div className="p-4 rounded-xl bg-purple-50 text-purple-600">
                  <Users className="w-8 h-8" />
                </div>
              </div>
            </div>

            {/* Pendientes */}
            <div className="space-y-4">
              <h3 className="text-sm font-bold text-gray-400 uppercase tracking-widest ml-1 flex items-center">
                <Clock className="w-4 h-4 mr-1.5 text-orange-500" /> Tareas Pendientes (Global)
              </h3>

              <div className="bg-white rounded-xl shadow-sm border border-orange-200 p-6 flex items-center justify-between relative overflow-hidden group hover:border-orange-300 transition-colors">
                <div className="absolute top-0 left-0 w-1.5 h-full bg-orange-400"></div>
                <div>
                  <p className="text-sm font-bold text-orange-600 uppercase">Presupuestos Pendientes</p>
                  <p className="text-4xl font-bold text-gray-900 mt-1">{pending.presupuestos}</p>
                </div>
                <div className="p-4 rounded-xl bg-orange-50 text-orange-500">
                  <FileText className="w-8 h-8" />
                </div>
              </div>

              <div className="bg-white rounded-xl shadow-sm border border-orange-200 p-6 flex items-center justify-between relative overflow-hidden group hover:border-orange-300 transition-colors">
                <div className="absolute top-0 left-0 w-1.5 h-full bg-orange-400"></div>
                <div>
                  <p className="text-sm font-bold text-orange-600 uppercase">Entregas Pendientes</p>
                  <p className="text-4xl font-bold text-gray-900 mt-1">{pending.entregas}</p>
                </div>
                <div className="p-4 rounded-xl bg-orange-50 text-orange-500">
                  <Truck className="w-8 h-8" />
                </div>
              </div>

              <div className="bg-white rounded-xl shadow-sm border border-orange-200 p-6 flex items-center justify-between relative overflow-hidden group hover:border-orange-300 transition-colors">
                <div className="absolute top-0 left-0 w-1.5 h-full bg-orange-400"></div>
                <div>
                  <p className="text-sm font-bold text-orange-600 uppercase">Pagos a Recibir</p>
                  <p className="text-4xl font-bold text-gray-900 mt-1">{pending.pagos}</p>
                </div>
                <div className="p-4 rounded-xl bg-orange-50 text-orange-500">
                  <DollarSign className="w-8 h-8" />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'clientes' && (
        <div className="space-y-6 animate-in fade-in zoom-in-95 duration-300">
          <div className="flex justify-between items-center bg-gray-50 p-4 rounded-xl border border-gray-200">
            <h2 className="text-lg font-semibold text-gray-700">Análisis de Clientes</h2>
            <div className="flex bg-white rounded-lg shadow-sm border border-gray-200 p-1">
              {(['Semana', 'Mes', 'Trimestre', 'Año'] as Timeframe[]).map((t) => (
                <button
                  key={t}
                  onClick={() => setTimeframe(t)}
                  className={`px-4 py-1.5 text-xs font-bold rounded-md transition-colors ${timeframe === t
                    ? 'bg-indigo-600 text-white'
                    : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                    }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 flex flex-col">
              <h3 className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-4">Top 5 Clientes</h3>
              <div className="flex-1 space-y-4">
                {dashboardData.topClients && dashboardData.topClients.length > 0 ? dashboardData.topClients.map((c: any, i: number) => (
                  <div key={i} className="flex items-center justify-between border-b border-gray-50 pb-3 last:border-0 last:pb-0">
                    <div>
                      <span className="text-xs font-black text-indigo-400 mr-3 w-4 inline-block">{i + 1}.</span>
                      <span className="font-bold text-gray-800">{c.razon_social}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {c.calificacion && (
                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${c.calificacion.includes('A —') ? 'bg-green-100 text-green-800' :
                          c.calificacion.includes('B —') ? 'bg-blue-100 text-blue-800' :
                            c.calificacion.includes('C —') ? 'bg-yellow-100 text-yellow-800' :
                              'bg-red-100 text-red-800'
                          }`}>
                          {c.calificacion.split('—')[0].trim()}
                        </span>
                      )}
                      <span className="text-xs font-black px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-100">
                        {c.score || 0}
                      </span>
                    </div>
                  </div>
                )) : <p className="text-gray-400 text-sm">No hay clientes suficientes.</p>}
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 flex flex-col items-center">
              <h3 className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-4 w-full text-left">Distribución de Entregas</h3>
              {dashboardData.chartData.entregas && dashboardData.chartData.entregas.length > 0 ? (
                <div className="h-64 w-full mt-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={dashboardData.chartData.entregas}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        outerRadius={80}
                        innerRadius={50}
                        label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                        labelLine={false}
                        paddingAngle={2}
                        style={{ fontSize: '10px' }}
                      >
                        {dashboardData.chartData.entregas.map((entry: any, index: number) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} border="none" />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{
                          borderRadius: '8px',
                          border: 'none',
                          boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                          fontSize: '12px',
                          fontWeight: 'bold'
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-gray-400 w-full">
                  <Package className="w-10 h-10 mb-2 opacity-30" />
                  <p className="text-sm">No hay entregas en este periodo</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'proveedores' && (
        <div className="space-y-6 animate-in fade-in zoom-in-95 duration-300">
          <div className="bg-white rounded-2xl shadow-sm border border-indigo-200 p-8 flex items-center justify-between relative overflow-hidden">
            <div className="absolute right-0 top-0 w-64 h-64 bg-indigo-50 rounded-full blur-3xl -mr-10 -mt-20 opacity-50 pointer-events-none"></div>
            <div className="relative z-10">
              <h3 className="text-sm font-bold text-indigo-500 uppercase tracking-widest mb-2 flex items-center">
                <Package className="w-4 h-4 mr-2" /> Pedidos por Recibir
              </h3>
              <p className="text-6xl font-black text-indigo-900 tracking-tight">
                {pending.proveedoresPedidos}
              </p>
            </div>
            <div className="relative z-10 hidden sm:block">
              <div className="w-24 h-24 bg-indigo-50 rounded-full flex items-center justify-center border-4 border-white shadow-inner">
                <Clock className="w-10 h-10 text-indigo-300 animate-pulse" />
              </div>
            </div>
          </div>

          <h3 className="text-sm font-bold text-gray-400 uppercase tracking-widest ml-1 pt-4">Estadísticas por Proveedor</h3>
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            {suppliers.length === 0 ? (
              <div className="p-8 text-center text-gray-500 flex flex-col items-center">
                <ShieldAlert className="w-10 h-10 mb-3 text-gray-300" />
                <p className="font-medium">No hay estadísticas de proveedores disponibles aún.</p>
              </div>
            ) : (
              <table className="w-full text-left text-sm text-gray-600">
                <thead className="bg-gray-50/80 border-b border-gray-200 text-xs font-bold text-gray-500 uppercase tracking-wider">
                  <tr>
                    <th className="px-6 py-4">Proveedor</th>
                    <th className="px-6 py-4">Demora Promedio</th>
                    <th className="px-6 py-4">Calificación / Nota</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {suppliers.map((s: any, idx: number) => (
                    <tr key={idx} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-6 py-4 font-bold text-gray-900">{s.razon_social}</td>
                      <td className="px-6 py-4 font-medium text-gray-600">{s.demora_promedio_entrega || '-'}</td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          {s.calificacion && (
                            <span className={`inline-flex items-center px-2 py-1 rounded-md text-[11px] font-bold uppercase tracking-wider ${s.calificacion.includes('A —') ? 'bg-green-100 text-green-800 border border-green-200' :
                              s.calificacion.includes('B —') ? 'bg-blue-100 text-blue-800 border border-blue-200' :
                                s.calificacion.includes('C —') ? 'bg-yellow-100 text-yellow-800 border border-yellow-200' :
                                  'bg-red-100 text-red-800 border border-red-200'
                              }`}>
                              {s.calificacion}
                            </span>
                          )}
                          {s.score !== undefined && s.score !== null && (
                            <span className="px-2.5 py-1 bg-indigo-100 text-indigo-800 font-black rounded-lg border border-indigo-200">
                              {s.score}
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
