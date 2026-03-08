import React, { useState, useEffect } from 'react';
import { DollarSign, FileText, Calendar, Clock, CheckCircle2, AlertCircle } from 'lucide-react';
import { format, differenceInDays, addDays } from 'date-fns';
import { useUser } from '../store/UserContext';
import { supabase } from '../supabaseClient';

interface Invoice {
  id: number;
  client_id: number;
  client_name: string;
  invoice_number: string;
  amount: number;
  issue_date: string;
  payment_term_days: number;
  due_date: string;
  status: 'pending' | 'paid_pending_retentions' | 'completed';
  payment_date?: string;
  payment_amount?: number;
  has_retentions: boolean;
  retentions_sent_date?: string;
}

export default function Pagos() {
  const { user } = useUser();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [clients, setClients] = useState<{ id: number, razon_social: string, plazo_de_pago?: string }[]>([]);
  const [invoiceTermDays, setInvoiceTermDays] = useState('0');
  const [showNewInvoiceModal, setShowNewInvoiceModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);

  useEffect(() => {
    fetchInvoices();
    const loadData = async () => {
      const { data } = await supabase.from('clients').select('id, razon_social, plazo_de_pago');
      if (data) setClients(data as any[]);
    };
    loadData();
  }, []);

  const fetchInvoices = async () => {
    const { data } = await supabase.from('invoices').select('*, clients(razon_social)').order('issue_date', { ascending: false });
    if (data) setInvoices(data.map((i: any) => ({ ...i, client_name: i.clients?.razon_social })));
  };

  const handleClientSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selectedId = parseInt(e.target.value);
    const client = clients.find(c => c.id === selectedId);
    if (client && client.plazo_de_pago) {
      if (client.plazo_de_pago.toLowerCase() === 'anticipado') {
        setInvoiceTermDays('0');
      } else {
        const match = client.plazo_de_pago.match(/\d+/);
        if (match) {
          setInvoiceTermDays(match[0]);
        } else {
          setInvoiceTermDays('0');
        }
      }
    } else {
      setInvoiceTermDays('0');
    }
  };

  const handleCreateInvoice = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const client_id = formData.get('client_id');
    const invoice_number = formData.get('invoice_number') as string;
    const amount = parseFloat(formData.get('amount') as string);
    const issue_date = formData.get('issue_date') as string;
    const payment_term_days = parseInt(formData.get('payment_term_days') as string, 10);

    const due_date = addDays(new Date(issue_date), payment_term_days).toISOString();

    const { error: invoiceError } = await supabase.from('invoices').insert([{
      client_id: Number(client_id),
      invoice_number,
      amount,
      issue_date: new Date(issue_date).toISOString(),
      payment_term_days,
      due_date,
      status: 'pending'
    }]);

    if (!invoiceError) {
      // Create reminder task
      await supabase.from('tasks').insert([{
        client_id: Number(client_id),
        type: 'cobranza',
        products: '[]',
        description: `Cobro de factura ${invoice_number} por $${amount}`,
        requested_by: user.name || 'Usuario',
        status: 'pending',
        reminder_date: due_date,
        reminder_status: 'active'
      }]);

      setShowNewInvoiceModal(false);
      fetchInvoices();
    }
  };

  const handleRegisterPayment = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedInvoice) return;

    const formData = new FormData(e.currentTarget);
    const payment_date = formData.get('payment_date') as string;
    const payment_amount = parseFloat(formData.get('payment_amount') as string);
    const has_retentions = formData.get('has_retentions') === 'on';
    const status = has_retentions ? 'paid_pending_retentions' : 'completed';

    const { error } = await supabase.from('invoices').update({
      status,
      payment_date: new Date(payment_date).toISOString(),
      payment_amount,
      has_retentions
    }).eq('id', selectedInvoice.id);

    if (!error) {
      if (status === 'completed') {
        await supabase.from('tasks').update({ reminder_status: 'cancelled' })
          .eq('type', 'cobranza')
          .eq('client_id', selectedInvoice.client_id)
          .like('description', `%${selectedInvoice.invoice_number}%`);
      }

      setShowPaymentModal(false);
      setSelectedInvoice(null);
      fetchInvoices();
    }
  };

  const handleSendRetentions = async (id: number) => {
    const { error } = await supabase.from('invoices').update({
      status: 'completed',
      retentions_sent_date: new Date().toISOString()
    }).eq('id', id);

    if (!error) {
      const inv = invoices.find(i => i.id === id);
      if (inv) {
        await supabase.from('tasks').update({ reminder_status: 'cancelled' })
          .eq('type', 'cobranza')
          .eq('client_id', inv.client_id)
          .like('description', `%${inv.invoice_number}%`);
      }
      fetchInvoices();
    }
  };

  const getRemainingDays = (dueDate: string) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const due = new Date(dueDate);
    due.setHours(0, 0, 0, 0);
    return differenceInDays(due, today);
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center">
          <DollarSign className="w-6 h-6 mr-2 text-indigo-600" />
          Gestión de Pagos
        </h1>
        <button
          onClick={() => setShowNewInvoiceModal(true)}
          className="bg-indigo-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-indigo-700 transition-colors flex items-center"
        >
          <FileText className="w-5 h-5 mr-2" />
          Cargar Factura
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-gray-500">
            <thead className="text-xs text-gray-700 uppercase bg-gray-50 border-b border-gray-200">
              <tr>
                <th scope="col" className="px-6 py-4 font-semibold">Cliente</th>
                <th scope="col" className="px-6 py-4 font-semibold">Factura</th>
                <th scope="col" className="px-6 py-4 font-semibold">Monto</th>
                <th scope="col" className="px-6 py-4 font-semibold">Emisión</th>
                <th scope="col" className="px-6 py-4 font-semibold">Vencimiento</th>
                <th scope="col" className="px-6 py-4 font-semibold">Estado</th>
                <th scope="col" className="px-6 py-4 font-semibold text-right">Acción</th>
              </tr>
            </thead>
            <tbody>
              {invoices.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center text-gray-500">
                    No hay facturas registradas.
                  </td>
                </tr>
              ) : (
                invoices.map((invoice) => {
                  const remainingDays = getRemainingDays(invoice.due_date);
                  const isOverdue = remainingDays < 0;

                  return (
                    <tr key={invoice.id} className="bg-white border-b border-gray-100 hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4 font-medium text-gray-900">{invoice.client_name}</td>
                      <td className="px-6 py-4">{invoice.invoice_number}</td>
                      <td className="px-6 py-4 font-medium text-gray-900">${invoice.amount.toLocaleString()}</td>
                      <td className="px-6 py-4">
                        <div className="flex items-center">
                          <Calendar className="w-4 h-4 mr-2 text-gray-400" />
                          {format(new Date(invoice.issue_date), 'dd/MM/yyyy')}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col">
                          <span>{format(new Date(invoice.due_date), 'dd/MM/yyyy')}</span>
                          {invoice.status === 'pending' && (
                            <span className={`text-xs font-medium mt-1 ${isOverdue ? 'text-red-600' : 'text-gray-500'}`}>
                              {isOverdue ? `${remainingDays} días` : `Faltan ${remainingDays} días`}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        {invoice.status === 'pending' && (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                            <Clock className="w-3 h-3 mr-1" /> Pendiente
                          </span>
                        )}
                        {invoice.status === 'paid_pending_retentions' && (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-800">
                            <AlertCircle className="w-3 h-3 mr-1" /> Faltan Retenciones
                          </span>
                        )}
                        {invoice.status === 'completed' && (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                            <CheckCircle2 className="w-3 h-3 mr-1" /> Completado
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right">
                        {invoice.status === 'pending' && (
                          <button
                            onClick={() => {
                              setSelectedInvoice(invoice);
                              setShowPaymentModal(true);
                            }}
                            className="text-indigo-600 hover:text-indigo-900 font-medium text-sm bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-lg transition-colors"
                          >
                            Cargar Pago
                          </button>
                        )}
                        {invoice.status === 'paid_pending_retentions' && (
                          <button
                            onClick={() => handleSendRetentions(invoice.id)}
                            className="text-orange-600 hover:text-orange-900 font-medium text-sm bg-orange-50 hover:bg-orange-100 px-3 py-1.5 rounded-lg transition-colors"
                          >
                            Retenciones Enviadas
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* New Invoice Modal */}
      {showNewInvoiceModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="p-6 border-b border-gray-200 flex justify-between items-center">
              <h3 className="text-lg font-bold text-gray-900">Cargar Nueva Factura</h3>
              <button onClick={() => setShowNewInvoiceModal(false)} className="text-gray-400 hover:text-gray-600">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <form onSubmit={handleCreateInvoice} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Cliente</label>
                <select name="client_id" onChange={handleClientSelect} className="w-full border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-indigo-500 outline-none" required>
                  <option value="">Seleccionar cliente...</option>
                  {clients.map(c => (
                    <option key={c.id} value={c.id}>{c.razon_social}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">N° de Factura</label>
                <input
                  type="text"
                  name="invoice_number"
                  className="w-full border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-indigo-500 outline-none"
                  placeholder="Ej: A-0001-00001234"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Monto ($)</label>
                <input
                  type="number"
                  step="0.01"
                  name="amount"
                  className="w-full border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-indigo-500 outline-none"
                  placeholder="0.00"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Fecha de Emisión</label>
                <input
                  type="date"
                  name="issue_date"
                  defaultValue={new Date().toISOString().split('T')[0]}
                  className="w-full border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-indigo-500 outline-none"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Plazo de Pago (días)</label>
                <input
                  type="number"
                  name="payment_term_days"
                  value={invoiceTermDays}
                  onChange={(e) => setInvoiceTermDays(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-indigo-500 outline-none"
                  placeholder="Ej: 0, 30, 60"
                  required
                />
              </div>
              <div className="pt-4 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowNewInvoiceModal(false)}
                  className="px-4 py-2 text-gray-700 font-medium hover:bg-gray-100 rounded-lg transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 transition-colors"
                >
                  Guardar Factura
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Payment Modal */}
      {showPaymentModal && selectedInvoice && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="p-6 border-b border-gray-200 flex justify-between items-center">
              <h3 className="text-lg font-bold text-gray-900">Cargar Pago</h3>
              <button onClick={() => setShowPaymentModal(false)} className="text-gray-400 hover:text-gray-600">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <form onSubmit={handleRegisterPayment} className="p-6 space-y-4">
              <div className="bg-gray-50 p-3 rounded-lg border border-gray-200 mb-4">
                <p className="text-sm text-gray-600">Factura: <span className="font-medium text-gray-900">{selectedInvoice.invoice_number}</span></p>
                <p className="text-sm text-gray-600">Monto Total: <span className="font-medium text-gray-900">${selectedInvoice.amount.toLocaleString()}</span></p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Monto Pagado ($)</label>
                <input
                  type="number"
                  step="0.01"
                  name="payment_amount"
                  defaultValue={selectedInvoice.amount}
                  className="w-full border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-indigo-500 outline-none"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Fecha de Pago</label>
                <input
                  type="date"
                  name="payment_date"
                  defaultValue={new Date().toISOString().split('T')[0]}
                  className="w-full border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-indigo-500 outline-none"
                  required
                />
              </div>
              <div className="flex items-center mt-4">
                <input
                  type="checkbox"
                  id="has_retentions"
                  name="has_retentions"
                  className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                />
                <label htmlFor="has_retentions" className="ml-2 block text-sm text-gray-900">
                  El pago tiene retenciones
                </label>
              </div>
              <div className="pt-4 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowPaymentModal(false)}
                  className="px-4 py-2 text-gray-700 font-medium hover:bg-gray-100 rounded-lg transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 transition-colors"
                >
                  Registrar Pago
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
