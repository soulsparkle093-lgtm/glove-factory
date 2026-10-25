import React, { useState } from 'react';
import { TrendingDown, Search, Plus, Trash2, X, DollarSign } from 'lucide-react';
import { useFactory } from '../context/FactoryContext';
import { formatCurrency, formatDate } from '../utils/factoryFormatters';
import { Expense } from '../types/factory';

const FACTORY_EXPENSE_CATEGORIES = [
  'Factory Commercial Rent',
  'Electricity & Power (WAPDA / Generator)',
  'Cutting Blades & Machine Oil',
  'Packing Boxes & Poly Bags',
  'Staff Tea & Refreshments',
  'Local Van Transport & Courier',
  'Machinery Maintenance & Repairs',
  'Misc Overheads'
];

export const ExpensePage: React.FC = () => {
  const { expenses, addExpense, deleteExpense, settings } = useFactory();

  const [search, setSearch] = useState('');
  const [isAddOpen, setIsAddOpen] = useState(false);

  const [title, setTitle] = useState('');
  const [category, setCategory] = useState(FACTORY_EXPENSE_CATEGORIES[0]);
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [paymentMode, setPaymentMode] = useState<'cash' | 'bank'>('cash');
  const [notes, setNotes] = useState('');

  const totalExpense = expenses.reduce((s, e) => s + e.amount, 0);

  const filteredExpenses = expenses.filter(e => {
    if (search.trim()) {
      const q = search.toLowerCase();
      return e.title.toLowerCase().includes(q) || e.category.toLowerCase().includes(q);
    }
    return true;
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const numAmount = parseFloat(amount);
    if (!title.trim() || isNaN(numAmount) || numAmount <= 0) return;

    addExpense({
      title,
      category,
      amount: numAmount,
      date,
      paymentMode,
      notes: notes || undefined
    });

    setTitle('');
    setAmount('');
    setIsAddOpen(false);
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Top Banner */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl p-5 border border-rose-100 shadow-xs">
          <span className="text-xs font-bold uppercase tracking-wider text-rose-700">Total Factory Overheads</span>
          <div className="text-2xl font-black text-rose-700 mt-1">{formatCurrency(totalExpense, settings.currency)}</div>
          <p className="text-xs text-slate-500 mt-1">{expenses.length} overhead transactions recorded</p>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs col-span-1 sm:col-span-2 flex items-center justify-between">
          <div>
            <h4 className="text-sm font-bold text-slate-900">Overheads Debit Cashbook Directly</h4>
            <p className="text-xs text-slate-500 mt-0.5">Every expense automatically logs a Cash Out in your factory Cashbook.</p>
          </div>
          <button
            onClick={() => setIsAddOpen(true)}
            className="px-4 py-2 rounded-xl text-xs sm:text-sm font-bold bg-rose-600 hover:bg-rose-700 text-white shadow-sm transition active:scale-95 flex items-center gap-1.5 shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>+ Log Expense</span>
          </button>
        </div>
      </div>

      {/* Main Expenses Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <h3 className="font-bold text-slate-900 text-lg">Factory Expenses Register</h3>
          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search expense description..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs rounded-xl border border-slate-300"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          {filteredExpenses.length === 0 ? (
            <div className="py-16 text-center text-slate-400 text-sm">
              <TrendingDown className="w-10 h-10 text-slate-300 mx-auto mb-2" />
              <p>No factory expenses logged yet.</p>
            </div>
          ) : (
            <table className="w-full text-left text-xs sm:text-sm">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                <tr>
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4">Title / Description</th>
                  <th className="py-3 px-4">Category</th>
                  <th className="py-3 px-4">Channel</th>
                  <th className="py-3 px-4 text-right">Amount</th>
                  <th className="py-3 px-4 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredExpenses.map(exp => (
                  <tr key={exp.id} className="hover:bg-slate-50/70 transition">
                    <td className="py-3.5 px-4 text-slate-600 whitespace-nowrap">{formatDate(exp.date)}</td>
                    <td className="py-3.5 px-4 font-bold text-slate-900">{exp.title}</td>
                    <td className="py-3.5 px-4">
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700">
                        {exp.category}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 capitalize text-slate-600 font-medium">{exp.paymentMode}</td>
                    <td className="py-3.5 px-4 text-right font-black text-rose-600">
                      {formatCurrency(exp.amount, settings.currency)}
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      <button onClick={() => deleteExpense(exp.id)} className="p-1 rounded text-slate-400 hover:text-rose-600">
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

      {/* Add Expense Modal */}
      {isAddOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-6 py-4 bg-rose-600 text-white flex items-center justify-between">
              <h3 className="font-bold text-lg">Log Factory Expense</h3>
              <button onClick={() => setIsAddOpen(false)} className="p-1 text-white hover:bg-white/20 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Expense Title / Description *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. 50 Cutting Machine Blades, Monthly WAPDA Bill"
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Expense Category</label>
                <select
                  value={category}
                  onChange={e => setCategory(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-bold rounded-xl border border-slate-300 bg-white"
                >
                  {FACTORY_EXPENSE_CATEGORIES.map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Amount ({settings.currency}) *</label>
                  <input
                    type="number"
                    required
                    min="1"
                    step="any"
                    value={amount}
                    onChange={e => setAmount(e.target.value)}
                    className="w-full px-3 py-2 text-base font-black text-center text-rose-700 rounded-xl border border-slate-300"
                  />
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
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Payment Method</label>
                <select
                  value={paymentMode}
                  onChange={e => setPaymentMode(e.target.value as any)}
                  className="w-full px-3 py-2 text-xs font-semibold rounded-xl border border-slate-300 bg-white"
                >
                  <option value="cash">Cash in Hand</option>
                  <option value="bank">Bank Account</option>
                </select>
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
                  className="px-5 py-2 rounded-xl text-sm font-bold bg-rose-600 hover:bg-rose-700 text-white shadow-sm"
                >
                  Save Expense
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
