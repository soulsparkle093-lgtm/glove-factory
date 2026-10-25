import React, { useState } from 'react';
import { ShoppingBag, Search, Plus, Layers, AlertCircle, X, CheckCircle2 } from 'lucide-react';
import { useFactory } from '../context/FactoryContext';
import { formatCurrency, formatDate } from '../utils/factoryFormatters';
import { Purchase } from '../types/factory';

const RAW_MATERIAL_PRESETS = [
  'Goatskin Leather (Grade A)',
  'Cowhide Split Leather (Heavy Duty)',
  'Sheep Nappa Leather (Soft)',
  'Buffalo Grain Leather',
  'Yellow Kevlar Thread Spool',
  'Cotton Fleece Lining Fabric',
  'Elastic Wrist Band Rolls'
];

export const PurchasePage: React.FC = () => {
  const { purchases, rawMaterials, parties, createPurchase, settings } = useFactory();

  const suppliers = parties.filter(p => p.type === 'supplier');

  const [search, setSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Form
  const [supplierId, setSupplierId] = useState('');
  const [supplierName, setSupplierName] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [material, setMaterial] = useState(RAW_MATERIAL_PRESETS[0]);
  const [qty, setQty] = useState('500');
  const [unit, setUnit] = useState('sqft');
  const [rate, setRate] = useState('180');
  const [paid, setPaid] = useState('0');
  const [paymentMode, setPaymentMode] = useState<'cash' | 'bank' | 'credit'>('credit');
  const [notes, setNotes] = useState('');

  const totalPurchasedValue = purchases.reduce((s, p) => s + p.total, 0);
  const totalPaidValue = purchases.reduce((s, p) => s + p.paid, 0);
  const totalPayableValue = purchases.reduce((s, p) => s + p.remaining, 0);

  const filteredPurchases = purchases.filter(p => {
    if (search.trim()) {
      const q = search.toLowerCase();
      return p.material.toLowerCase().includes(q) || p.supplierName.toLowerCase().includes(q);
    }
    return true;
  });

  const handleOpenAdd = () => {
    setDate(new Date().toISOString().split('T')[0]);
    if (suppliers.length > 0) {
      setSupplierId(suppliers[0].id);
      setSupplierName(suppliers[0].name);
    } else {
      setSupplierId('');
      setSupplierName('Tannery Supplier');
    }
    setMaterial(RAW_MATERIAL_PRESETS[0]);
    setQty('500');
    setUnit('sqft');
    setRate('180');
    setPaid('0');
    setPaymentMode('credit');
    setNotes('');
    setIsModalOpen(true);
  };

  const handleSupplierChange = (id: string) => {
    setSupplierId(id);
    const sup = suppliers.find(s => s.id === id);
    if (sup) setSupplierName(sup.name);
  };

  const numQty = parseFloat(qty) || 0;
  const numRate = parseFloat(rate) || 0;
  const total = numQty * numRate;
  const numPaid = parseFloat(paid) || 0;
  const dueToSupplier = Math.max(0, total - numPaid);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!material.trim() || numQty <= 0) return;

    createPurchase({
      supplierId: supplierId || 'generic-supplier',
      supplierName: supplierName || 'Leather Supplier',
      date,
      material,
      qty: numQty,
      unit,
      rate: numRate,
      paid: numPaid,
      paymentMode,
      notes
    });

    setIsModalOpen(false);
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Top Metrics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl p-5 border border-blue-100 shadow-xs">
          <span className="text-xs font-bold uppercase tracking-wider text-blue-700">Total Leather Purchases</span>
          <div className="text-2xl font-black text-slate-900 mt-1">{formatCurrency(totalPurchasedValue, settings.currency)}</div>
          <p className="text-xs text-slate-500 mt-1">{purchases.length} raw leather shipments</p>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-emerald-100 shadow-xs">
          <span className="text-xs font-bold uppercase tracking-wider text-emerald-700">Supplier Payments Cleared</span>
          <div className="text-2xl font-black text-emerald-600 mt-1">{formatCurrency(totalPaidValue, settings.currency)}</div>
          <p className="text-xs text-slate-500 mt-1">Paid via Cash & Bank</p>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-rose-100 shadow-xs">
          <span className="text-xs font-bold uppercase tracking-wider text-rose-700">Supplier Payables Due</span>
          <div className="text-2xl font-black text-rose-600 mt-1">{formatCurrency(totalPayableValue, settings.currency)}</div>
          <p className="text-xs text-slate-500 mt-1">Automatically tracked in the supplier ledger</p>
        </div>
      </div>

      {/* Raw Materials Inventory Cards */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5">
        <div className="flex items-center justify-between mb-3 border-b border-slate-100 pb-2">
          <h4 className="font-bold text-slate-900 text-sm flex items-center gap-2">
            <Layers className="w-4 h-4 text-blue-600" />
            <span>Raw Materials Stock Level</span>
          </h4>
          <span className="text-xs text-slate-500">{rawMaterials.length} materials tracked</span>
        </div>

        {rawMaterials.length === 0 ? (
          <p className="text-xs text-slate-400 py-3">No raw materials recorded yet. Purchases will automatically add stock here.</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {rawMaterials.map(rm => (
              <div key={rm.id} className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                <span className="text-xs font-bold text-slate-800 block truncate">{rm.material}</span>
                <span className="text-lg font-black text-blue-700 block mt-1">
                  {rm.currentStock} <span className="text-xs font-normal text-slate-500">{rm.unit}</span>
                </span>
                <span className="text-[10px] text-slate-400">Rate: {settings.currency} {rm.lastPurchaseRate}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Purchase Bills Table Card */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="font-bold text-slate-900 text-lg">Leather & Materials Purchase Log</h3>
            <p className="text-xs text-slate-500">Automatically updates the supplier payable ledger and raw material inventory</p>
          </div>

          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Search material or supplier..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-9 pr-3 py-1.5 text-xs sm:text-sm rounded-xl border border-slate-300"
              />
            </div>

            <button
              onClick={handleOpenAdd}
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-sm transition active:scale-95"
            >
              <Plus className="w-4 h-4" />
              <span>+ Record Leather Purchase</span>
            </button>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          {filteredPurchases.length === 0 ? (
            <div className="py-16 text-center text-slate-400 text-sm">
              <ShoppingBag className="w-10 h-10 text-slate-300 mx-auto mb-2" />
              <p>No leather purchases recorded yet.</p>
              <button
                onClick={handleOpenAdd}
                className="mt-3 text-xs font-bold text-blue-600 hover:underline"
              >
                + Record your first leather purchase
              </button>
            </div>
          ) : (
            <table className="w-full text-left text-xs sm:text-sm">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                <tr>
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4">Raw Material / Leather</th>
                  <th className="py-3 px-4">Tannery Supplier</th>
                  <th className="py-3 px-4 text-center">Quantity</th>
                  <th className="py-3 px-4 text-right">Unit Rate</th>
                  <th className="py-3 px-4 text-right">Total Amount</th>
                  <th className="py-3 px-4 text-right">Paid / Due</th>
                  <th className="py-3 px-4 text-center">Payment Channel</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredPurchases.map(pur => (
                  <tr key={pur.id} className="hover:bg-slate-50/70 transition">
                    <td className="py-3.5 px-4 text-slate-600 whitespace-nowrap">
                      {formatDate(pur.date)}
                    </td>
                    <td className="py-3.5 px-4 font-bold text-slate-900">
                      {pur.material}
                    </td>
                    <td className="py-3.5 px-4 text-slate-800 font-semibold">
                      {pur.supplierName}
                    </td>
                    <td className="py-3.5 px-4 text-center font-bold text-blue-700">
                      {pur.qty} {pur.unit}
                    </td>
                    <td className="py-3.5 px-4 text-right text-slate-600">
                      {formatCurrency(pur.rate, settings.currency)}
                    </td>
                    <td className="py-3.5 px-4 text-right font-black text-slate-900">
                      {formatCurrency(pur.total, settings.currency)}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <div className="text-emerald-600 font-bold text-xs">
                        Paid: {formatCurrency(pur.paid, settings.currency)}
                      </div>
                      {pur.remaining > 0 && (
                        <div className="text-rose-600 font-bold text-xs mt-0.5">
                          Due: {formatCurrency(pur.remaining, settings.currency)}
                        </div>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-center capitalize text-slate-600 font-medium">
                      {pur.paymentMode}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Add Purchase Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-6 py-4 bg-blue-700 text-white flex items-center justify-between">
              <h3 className="font-bold text-lg">Record Leather / Raw Material Purchase</h3>
              <button onClick={() => setIsModalOpen(false)} className="p-1 text-white hover:bg-white/20 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Select Supplier *</label>
                {suppliers.length > 0 ? (
                  <select
                    value={supplierId}
                    onChange={e => handleSupplierChange(e.target.value)}
                    className="w-full px-3 py-2 text-xs font-semibold rounded-lg border border-slate-300 bg-white"
                  >
                    {suppliers.map(s => (
                      <option key={s.id} value={s.id}>{s.name} ({s.phone})</option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    required
                    placeholder="Enter supplier name..."
                    value={supplierName}
                    onChange={e => setSupplierName(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300"
                  />
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Material Description *</label>
                <select
                  value={material}
                  onChange={e => setMaterial(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-semibold rounded-lg border border-slate-300 bg-white"
                >
                  {RAW_MATERIAL_PRESETS.map(m => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Quantity *</label>
                  <input
                    type="number"
                    required
                    min="1"
                    value={qty}
                    onChange={e => setQty(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-black text-center rounded-lg border border-slate-300"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Unit of Measure</label>
                  <select
                    value={unit}
                    onChange={e => setUnit(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 bg-white"
                  >
                    <option value="sqft">Sq. Ft</option>
                    <option value="skins">Skins</option>
                    <option value="kg">Kilograms</option>
                    <option value="rolls">Rolls</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Rate per Unit ({settings.currency}) *</label>
                  <input
                    type="number"
                    required
                    min="0"
                    step="any"
                    value={rate}
                    onChange={e => setRate(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-bold text-right rounded-lg border border-slate-300"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Purchase Date</label>
                  <input
                    type="date"
                    required
                    value={date}
                    onChange={e => setDate(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Paid Amount</label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={paid}
                    onChange={e => setPaid(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs font-bold rounded-lg border border-slate-300 bg-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Due to Supplier</label>
                  <div className="px-3 py-1.5 text-xs font-black text-rose-700 bg-rose-50 border border-rose-200 rounded-lg">
                    {formatCurrency(dueToSupplier, settings.currency)}
                  </div>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-100 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl text-sm font-bold bg-blue-700 hover:bg-blue-800 text-white shadow-sm transition active:scale-95"
                >
                  Save Leather Purchase
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
