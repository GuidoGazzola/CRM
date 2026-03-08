import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Link, useLocation, Navigate, Outlet } from 'react-router-dom';
import { Home, Users, CheckSquare, Package, DollarSign, Database as DatabaseIcon, LogOut, Menu, X, Settings } from 'lucide-react';
import HomePage from './pages/Home';
import ClientesPage from './pages/Clientes';
import TareasPage from './pages/Tareas';
import PedidosPage from './pages/Pedidos';
import PagosPage from './pages/Pagos';
import DatabasePage from './pages/Database';
import LoginPage from './pages/Login';
import ProfileModal from './components/ProfileModal';
import { UserProvider, useUser } from './store/UserContext';
import { supabase } from './supabaseClient';
import { Session } from '@supabase/supabase-js';

function Layout({ children }: { children: React.ReactNode }) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const location = useLocation();
  const { user } = useUser();

  const navItems = [
    { path: '/', label: 'Home', icon: Home },
    { path: '/clientes', label: 'Clientes', icon: Users },
    { path: '/tareas', label: 'Tareas', icon: CheckSquare },
    { path: '/pedidos', label: 'Pedidos', icon: Package },
    { path: '/pagos', label: 'Pagos', icon: DollarSign },
    { path: '/database', label: 'Base de Datos', icon: DatabaseIcon },
  ];

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col md:flex-row">
      {/* Mobile Header */}
      <div className="md:hidden bg-indigo-600 text-white p-4 flex justify-between items-center">
        <h1 className="text-xl font-bold">CRM Comercial</h1>
        <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}>
          {isMobileMenuOpen ? <X /> : <Menu />}
        </button>
      </div>

      {/* Sidebar */}
      <div className={`${isMobileMenuOpen ? 'block' : 'hidden'} md:block w-full md:w-64 bg-indigo-700 text-white flex-shrink-0`}>
        <div className="p-6 hidden md:block">
          <h1 className="text-2xl font-bold">CRM Comercial</h1>
        </div>
        <nav className="mt-4">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => setIsMobileMenuOpen(false)}
                className={`flex items-center px-6 py-3 text-sm font-medium transition-colors ${isActive ? 'bg-indigo-800 text-white' : 'text-indigo-100 hover:bg-indigo-600'
                  }`}
              >
                <Icon className="w-5 h-5 mr-3" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="absolute bottom-0 w-full md:w-64 p-4 border-t border-indigo-600">
          <div className="flex items-center justify-between">
            <div className="text-sm">
              <p className="font-semibold">{user.name}</p>
              <p className="text-indigo-200 text-xs">{user.role}</p>
            </div>
            <div className="flex space-x-2">
              <button
                onClick={() => setIsProfileModalOpen(true)}
                className="p-2 hover:bg-indigo-600 rounded-full transition-colors"
                title="Mi Perfil"
              >
                <Settings className="w-4 h-4" />
              </button>
              <button
                onClick={() => supabase.auth.signOut()}
                className="p-2 hover:bg-indigo-600 rounded-full transition-colors"
                title="Cerrar Sesión"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <main className="flex-1 overflow-x-hidden overflow-y-auto bg-gray-50 p-4 md:p-8">
        {children}
      </main>

      {isProfileModalOpen && (
        <ProfileModal onClose={() => setIsProfileModalOpen(false)} />
      )}
    </div>
  );
}

import { useUserRole } from './hooks/useUserRole';

function ProtectedLayout({ session }: { session: Session | null }) {
  const { setUser } = useUser();
  const { role, name, loadingRole } = useUserRole(session);

  useEffect(() => {
    if (session?.user) {
      setUser({
        name: name || session.user.email?.split('@')[0] || 'Usuario',
        role: role,
        email: session.user.email,
        id: session.user.id,
        isLoading: loadingRole
      });
    }
  }, [session, setUser, role, name, loadingRole]);

  if (!session) {
    return <Navigate to="/login" replace />;
  }
  return (
    <Layout>
      <Outlet />
    </Layout>
  );
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col justify-center items-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
        <p className="mt-4 text-gray-600 font-medium">Cargando...</p>
      </div>
    );
  }

  return (
    <UserProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={!session ? <LoginPage /> : <Navigate to="/" replace />} />

          <Route element={<ProtectedLayout session={session} />}>
            <Route path="/" element={<HomePage />} />
            <Route path="/clientes" element={<ClientesPage />} />
            <Route path="/tareas" element={<TareasPage />} />
            <Route path="/pedidos" element={<PedidosPage />} />
            <Route path="/pagos" element={<PagosPage />} />
            <Route path="/database" element={<DatabasePage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </UserProvider>
  );
}
