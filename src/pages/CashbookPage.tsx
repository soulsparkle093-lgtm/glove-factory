import React, { useState } from 'react';
import { Wallet, ArrowDownLeft, ArrowUpRight, Search, Plus, Trash2, X } from 'lucide-react';
import { useFactory } from '../context/FactoryContext';
import { formatCurrency, formatDate } from '../utils/factoryFormatters';
import { CashbookEntry } from '../types/factory';

export const CashbookPage: React.FC = () => {
  const { cashbook, addCashbookEntry, deleteCashbookEntry, settings } = useFactory();

  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'in' | 'out'>('all');
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [entryType, setEntryType] = useState<'in' | 'out'>('in');

  // Form states
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [paymentMode, setPaymentMode] = useState<'cash' | 'bank'>('cash');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);

  const totalIn = cashbook.filter(c => c.type === 'in').reduce((s, c) => s + c.amount, 0);
  const totalOut = cashbook.filter(c => c.type === 'out').reduce((s, c) => s + c.amount, 0);
  const netBalance = totalIn - totalOut;

  const cashInOnly = cashbook.filter(c => c.type === 'in' && c.paymentMode === 'cash').reduce((s, c) => s + c.amount, 0);
  const cashOutOnly = cashbook.filter(c => c.type === 'out' && c.paymentMode === 'cash').reduce((s, c) => s + c.amount, 0);
  const physicalCashInHand = cashInOnly - cashOutOnly;

  const filteredEntries = cashbook.filter(c => {
    if (typeFilter !== 'all' && c.type !== typeFilter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return c.description.toLowerCase().includes(q) || c.category.toLowerCase().includes(q);
    }
    return true;
  });

  const handleOpenModal = (type: 'in' | 'out') => {
    setEntryType(type);
    setAmount('');
    setDescription('');
    setCategory(type === 'in' ? 'Factory Capital' : 'Cash Withdrawal');
    setDate(new Date().toISOString().split('T')[0]);
    setIsAddOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const numAmount = parseFloat(amount);
    if (!description.trim() || isNaN(numAmount) || numAmount <= 0) return;

    addCashbookEntry({
      type: entryType,
      amount: numAmount,
      date,
      category,
      paymentMode,
      description
    });

    setIsAddOpen(false);
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Top Metrics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl p-5 border border-emerald-100 shadow-xs">
          <span className="text-xs font-bold uppercase tracking-wider text-emerald-700">Total Cash In</span>
          <div className="text-2xl font-black text-emerald-600 mt-1">{formatCurrency(totalIn, settings.currency)}</div>
          <p className="text-xs text-slate-500 mt-1">Customer bill receipts & deposits</p>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-rose-100 shadow-xs">
          <span className="text-xs font-bold uppercase tracking-wider text-rose-700">Total Cash Out</span>
          <div className="text-2xl font-black text-rose-600 mt-1">{formatCurrency(totalOut, settings.currency)}</div>
          <p className="text-xs text-slate-500 mt-1">Leather, wages & factory bills</p>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-blue-100 shadow-xs">
          <span className="text-xs font-bold uppercase tracking-wider text-blue-700">Net Physical Cash In Hand</span>
          <div className={`text-2xl font-black mt-1 ${netBalance >= 0 ? 'text-blue-700' : 'text-rose-700'}`}>
            {formatCurrency(physicalCashInHand, settings.currency)}
          </div>
          <p className="text-xs text-slate-500 mt-1">Running cashbook balance</p>
        </div>
      </div>

      {/* Main Cashbook Table Card */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="font-bold text-slate-900 text-lg">Daily Cashbook Register</h3>
            <p className="text-xs text-slate-500">Live consolidated cash and bank inflows and outflows</p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => handleOpenModal('out')}
              className="px-3.5 py-2 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white shadow-xs transition active:scale-95 flex items-center gap-1.5"
            >
              <ArrowUpRight className="w-4 h-4" />
              <span>+ Cash Out</span>
            </button>
            <button
              onClick={() => handleOpenModal('in')}
              className="px-3.5 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs transition active:scale-95 flex items-center gap-1.5"
            >
              <ArrowDownLeft className="w-4 h-4" />
              <span>+ Cash In</span>
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          {filteredEntries.length === 0 ? (
            <div className="py-16 text-center text-slate-400 text-sm">
              <Wallet className="w-10 h-10 text-slate-300 mx-auto mb-2" />
              <p>No cashbook entries logged yet.</p>
            </div>
          ) : (
            <table className="w-full text-left text-xs sm:text-sm">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                <tr>
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4">Description / Details</th>
                  <th className="py-3 px-4">Category</th>
                  <th className="py-3 px-4">Channel</th>
                  <th className="py-3 px-4 text-right text-emerald-600 font-bold">Cash In (+)</th>
                  <th className="py-3 px-4 text-right text-rose-600 font-bold">Cash Out (-)</th>
                  <th className="py-3 px-4 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredEntries.map(entry => (
                  <tr key={entry.id} className="hover:bg-slate-50/70 transition">
                    <td className="py-3.5 px-4 text-slate-600 whitespace-nowrap">{formatDate(entry.date)}</td>
                    <td className="py-3.5 px-4 font-bold text-slate-900">{entry.description}</td>
                    <td className="py-3.5 px-4">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700">
                        {entry.category}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 capitalize text-slate-600 font-medium">{entry.paymentMode}</td>
                    <td className="py-3.5 px-4 text-right font-black text-emerald-600">
                      {entry.type === 'in' ? formatCurrency(entry.amount, settings.currency) : '-'}
                    </td>
                    <td className="py-3.5 px-4 text-right font-black text-rose-600">
                      {entry.type === 'out' ? formatCurrency(entry.amount, settings.currency) : '-'}
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      <button onClick={() => deleteCashbookEntry(entry.id)} className="p-1 rounded text-slate-400 hover:text-rose-600">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Add Modal */}
      {isAddOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className={`px-6 py-4 text-white flex items-center justify-between ${
              entryType === 'in' ? 'bg-emerald-600' : 'bg-rose-600'
            }`}>
              <h3 className="font-bold text-lg">
                {entryType === 'in' ? 'Record Cash In' : 'Record Cash Out'}
              </h3>
              <button onClick={() => setIsAddOpen(false)} className="p-1 text-white hover:bg-white/20 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Amount ({settings.currency}) *</label>
                <input
                  type="number"
                  required
                  min="1"
                  step="any"
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  className="w-full px-3 py-2 text-base font-black text-center rounded-xl border border-slate-300"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Narration / Description *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Received counter payment, Office chai bill"
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Category</label>
                  <input
                    type="text"
                    value={category}
                    onChange={e => setCategory(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Channel</label>
                  <select
                    value={paymentMode}
                    onChange={e => setPaymentMode(e.target.value as any)}
                    className="w-full px-3 py-2 text-xs font-bold rounded-xl border border-slate-300 bg-white"
                  >
                    <option value="cash">Cash in Hand</option>
                    <option value="bank">Bank Account</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Date</label>
                <input
                  type="date"
                  required
                  value={date}
                  onChange={e => setDate(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300"
                />
              </div>

              <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsAddOpen(false)}
                  className="px-4 py-2 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className={`px-5 py-2 rounded-xl text-sm font-bold text-white shadow-sm ${
                    entryType === 'in' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-rose-600 hover:bg-rose-700'
                  }`}
                >
                  Confirm Entry
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
