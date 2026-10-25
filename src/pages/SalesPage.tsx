import React, { useState } from 'react';
import { Receipt, Search, Plus, Printer, Trash2, ArrowDownLeft, Clock, AlertCircle } from 'lucide-react';
import { useFactory } from '../context/FactoryContext';
import { formatCurrency, formatDate } from '../utils/factoryFormatters';
import { SaleInvoice } from '../types/factory';
import { PrintInvoiceModal } from '../components/sales/PrintInvoiceModal';

interface SalesPageProps {
  onOpenCreateInvoice: () => void;
}

export const SalesPage: React.FC<SalesPageProps> = ({ onOpenCreateInvoice }) => {
  const { 
    invoices, 
    deleteSaleInvoice, 
    selectedInvoiceId, 
    setSelectedInvoiceId, 
    settings 
  } = useFactory();

  const [search, setSearch] = useState('');
  const [invoiceToDelete, setInvoiceToDelete] = useState<SaleInvoice | null>(null);

  const totalSales = invoices.reduce((s, i) => s + i.grandTotal, 0);
  const totalPaid = invoices.reduce((s, i) => s + i.paidAmount, 0);
  const totalPending = invoices.reduce((s, i) => s + i.remaining, 0);

  const filteredInvoices = invoices.filter(inv => {
    if (search.trim()) {
      const q = search.toLowerCase();
      return inv.invoiceNo.toLowerCase().includes(q) || 
             inv.customerName.toLowerCase().includes(q) || 
             inv.orderNo.toLowerCase().includes(q);
    }
    return true;
  });

  const activeInvoiceForPrint = invoices.find(i => i.id === selectedInvoiceId);

  const handleDelete = () => {
    if (!invoiceToDelete) return;
    deleteSaleInvoice(invoiceToDelete.id);
    setInvoiceToDelete(null);
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Top Metrics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl p-5 border border-blue-100 shadow-xs">
          <span className="text-xs font-bold uppercase tracking-wider text-blue-700">Total Invoiced Sales</span>
          <div className="text-2xl font-black text-slate-900 mt-1">{formatCurrency(totalSales, settings.currency)}</div>
          <p className="text-xs text-slate-500 mt-1">{invoices.length} delivery invoices generated</p>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-emerald-100 shadow-xs">
          <span className="text-xs font-bold uppercase tracking-wider text-emerald-700">Cash & Bank Received</span>
          <div className="text-2xl font-black text-emerald-600 mt-1">{formatCurrency(totalPaid, settings.currency)}</div>
          <p className="text-xs text-slate-500 mt-1">Cleared revenue</p>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-rose-100 shadow-xs">
          <span className="text-xs font-bold uppercase tracking-wider text-rose-700">Outstanding Credit Due</span>
          <div className="text-2xl font-black text-rose-600 mt-1">{formatCurrency(totalPending, settings.currency)}</div>
          <p className="text-xs text-slate-500 mt-1">Outstanding customer ledger balance</p>
        </div>
      </div>

      {/* Main Table Card */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="font-bold text-slate-900 text-lg">Sale Bills & Invoices</h3>
            <p className="text-xs text-slate-500">Auto stock deduction on every bill with customer ledger posting</p>
          </div>

          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Search invoice #, customer..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-9 pr-3 py-1.5 text-xs sm:text-sm rounded-xl border border-slate-300"
              />
            </div>

            <button
              onClick={onOpenCreateInvoice}
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-sm transition active:scale-95"
            >
              <Plus className="w-4 h-4" />
              <span>+ Create Sale Bill</span>
            </button>
          </div>
        </div>

        {/* Delete Confirmation */}
        {invoiceToDelete && (
          <div className="p-4 bg-rose-50 border-b border-rose-200 flex items-center justify-between text-xs text-rose-900">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>Cancel invoice #{invoiceToDelete.invoiceNo}? Sold pairs will be returned to inventory stock automatically.</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setInvoiceToDelete(null)}
                className="px-2.5 py-1 rounded bg-white border border-slate-300 font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                className="px-2.5 py-1 rounded bg-rose-600 text-white font-semibold hover:bg-rose-700"
              >
                Yes, Cancel Bill
              </button>
            </div>
          </div>
        )}

        {/* Table */}
        <div className="overflow-x-auto">
          {filteredInvoices.length === 0 ? (
            <div className="py-16 text-center text-slate-400 text-sm">
              <Receipt className="w-10 h-10 text-slate-300 mx-auto mb-2" />
              <p>No sale invoices found.</p>
              <button
                onClick={onOpenCreateInvoice}
                className="mt-3 text-xs font-bold text-blue-600 hover:underline"
              >
                + Generate your first sale bill
              </button>
            </div>
          ) : (
            <table className="w-full text-left text-xs sm:text-sm">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                <tr>
                  <th className="py-3 px-4">Invoice #</th>
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4">Customer</th>
                  <th className="py-3 px-4">Order Ref</th>
                  <th className="py-3 px-4">Items Summary</th>
                  <th className="py-3 px-4 text-right">Grand Total</th>
                  <th className="py-3 px-4 text-right">Paid / Due</th>
                  <th className="py-3 px-4 text-center">Status</th>
                  <th className="py-3 px-4 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredInvoices.map(inv => (
                  <tr key={inv.id} className="hover:bg-slate-50/70 transition">
                    <td className="py-3.5 px-4 font-mono font-bold text-blue-700">
                      {inv.invoiceNo}
                    </td>
                    <td className="py-3.5 px-4 text-slate-600 whitespace-nowrap">
                      {formatDate(inv.date)}
                    </td>
                    <td className="py-3.5 px-4 font-bold text-slate-900">
                      {inv.customerName}
                    </td>
                    <td className="py-3.5 px-4 font-mono font-semibold text-slate-600">
                      #{inv.orderNo}
                    </td>
                    <td className="py-3.5 px-4 text-slate-600">
                      <span className="font-bold text-slate-800">{inv.items.reduce((s, i) => s + i.qty, 0)} pairs</span>
                      <div className="text-[10px] text-slate-400 truncate max-w-xs">
                        {inv.items.map(i => `${i.qty}x ${i.gloveType}`).join(', ')}
                      </div>
                    </td>
                    <td className="py-3.5 px-4 text-right font-black text-slate-900">
                      {formatCurrency(inv.grandTotal, settings.currency)}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <div className="text-emerald-600 font-bold text-xs">
                        Paid: {formatCurrency(inv.paidAmount, settings.currency)}
                      </div>
                      {inv.remaining > 0 && (
                        <div className="text-rose-600 font-bold text-xs mt-0.5">
                          Due: {formatCurrency(inv.remaining, settings.currency)}
                        </div>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                        inv.paymentStatus === 'paid' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                      }`}>
                        {inv.paymentStatus}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          onClick={() => setSelectedInvoiceId(inv.id)}
                          className="px-2.5 py-1 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-bold flex items-center gap-1 transition"
                        >
                          <Printer className="w-3.5 h-3.5" />
                          <span>Print</span>
                        </button>
                        <button
                          onClick={() => setInvoiceToDelete(inv)}
                          className="p-1 rounded text-slate-400 hover:text-rose-600"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {activeInvoiceForPrint && (
        <PrintInvoiceModal
          invoice={activeInvoiceForPrint}
          onClose={() => setSelectedInvoiceId(null)}
        />
      )}
    </div>
  );
};
