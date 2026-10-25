import React, { useState } from 'react';
import { 
  BookOpen, 
  Search, 
  Plus, 
  ArrowDownLeft, 
  ArrowUpRight, 
  Phone, 
  Trash2, 
  Edit, 
  X, 
  MessageCircle, 
  Calendar,
  AlertCircle 
} from 'lucide-react';
import { useFactory } from '../context/FactoryContext';
import { formatCurrency, formatDate } from '../utils/factoryFormatters';
import { Party, PartyType } from '../types/factory';

export const KhataPage: React.FC = () => {
  const { 
    parties, 
    partyTransactions, 
    addParty, 
    updateParty, 
    deleteParty, 
    settings 
  } = useFactory();

  const [activeTab, setActiveTab] = useState<'all' | 'customer' | 'supplier' | 'cutter_maker'>('all');
  const [search, setSearch] = useState('');
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editingParty, setEditingParty] = useState<Party | null>(null);
  const [selectedPartyForLedger, setSelectedPartyForLedger] = useState<Party | null>(null);

  // Form states
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [type, setType] = useState<PartyType>('customer');
  const [openingBalance, setOpeningBalance] = useState('0');

  const totalReceivable = parties
    .filter(p => p.currentBalance > 0)
    .reduce((s, p) => s + p.currentBalance, 0);

  const totalPayable = parties
    .filter(p => p.currentBalance < 0)
    .reduce((s, p) => s + Math.abs(p.currentBalance), 0);

  const netBalance = totalReceivable - totalPayable;

  const filteredParties = parties.filter(p => {
    if (activeTab === 'customer' && p.type !== 'customer' && p.type !== 'buyer') return false;
    if (activeTab === 'supplier' && p.type !== 'supplier') return false;
    if (activeTab === 'cutter_maker' && p.type !== 'cutter_maker') return false;

    if (search.trim()) {
      const q = search.toLowerCase();
      return p.name.toLowerCase().includes(q) || p.phone.toLowerCase().includes(q);
    }
    return true;
  });

  const handleOpenAdd = () => {
    setEditingParty(null);
    setName('');
    setPhone('');
    setAddress('');
    setType('customer');
    setOpeningBalance('0');
    setIsAddOpen(true);
  };

  const handleOpenEdit = (p: Party) => {
    setEditingParty(p);
    setName(p.name);
    setPhone(p.phone);
    setAddress(p.address || '');
    setType(p.type);
    setOpeningBalance(p.openingBalance.toString());
    setIsAddOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    if (editingParty) {
      updateParty(editingParty.id, {
        name,
        phone,
        address: address || undefined,
        type
      });
    } else {
      addParty({
        name,
        phone,
        address: address || undefined,
        type,
        openingBalance: parseFloat(openingBalance) || 0
      });
    }

    setIsAddOpen(false);
  };

  const openWhatsApp = (phone: string, text: string) => {
    let clean = phone.replace(/[^0-9]/g, '');
    if (clean.startsWith('0')) clean = '92' + clean.substring(1);
    const url = `https://wa.me/${clean}?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
  };

  // Ledger transactions for selected party
  const partyTxs = selectedPartyForLedger 
    ? partyTransactions.filter(t => t.partyId === selectedPartyForLedger.id)
    : [];

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Top Metrics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl p-5 border border-emerald-100 shadow-xs">
          <span className="text-xs font-bold uppercase tracking-wider text-emerald-700">Total Customer Receivables</span>
          <div className="text-2xl font-black text-emerald-600 mt-1">{formatCurrency(totalReceivable, settings.currency)}</div>
          <p className="text-xs text-slate-500 mt-1">Receivable from customers</p>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-rose-100 shadow-xs">
          <span className="text-xs font-bold uppercase tracking-wider text-rose-700">Total Payables Due</span>
          <div className="text-2xl font-black text-rose-600 mt-1">{formatCurrency(totalPayable, settings.currency)}</div>
          <p className="text-xs text-slate-500 mt-1">Payable to suppliers & contractors</p>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-blue-100 shadow-xs">
          <span className="text-xs font-bold uppercase tracking-wider text-blue-700">Net Ledger Position</span>
          <div className={`text-2xl font-black mt-1 ${netBalance >= 0 ? 'text-blue-700' : 'text-amber-700'}`}>
            {formatCurrency(netBalance, settings.currency)}
          </div>
          <p className="text-xs text-slate-500 mt-1">{netBalance >= 0 ? 'Surplus receivables' : 'Deficit payables'}</p>
        </div>
      </div>

      {/* Main Parties List Card */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        {/* Header Controls */}
        <div className="p-4 sm:p-5 border-b border-slate-200 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="font-bold text-slate-900 text-lg">Ledger Book</h3>
              <p className="text-xs text-slate-500">Auto tracks customer billings, supplier leather shipments, and cutter maker wages</p>
            </div>

            <button
              onClick={handleOpenAdd}
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-sm transition active:scale-95"
            >
              <Plus className="w-4 h-4" />
              <span>+ Add Party</span>
            </button>
          </div>

          {/* Tabs & Search */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl overflow-x-auto w-fit">
              <button
                onClick={() => setActiveTab('all')}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition whitespace-nowrap ${
                  activeTab === 'all' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600'
                }`}
              >
                All Parties ({parties.length})
              </button>
              <button
                onClick={() => setActiveTab('customer')}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition whitespace-nowrap ${
                  activeTab === 'customer' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600'
                }`}
              >
                Customers & Buyers ({parties.filter(p => p.type === 'customer' || p.type === 'buyer').length})
              </button>
              <button
                onClick={() => setActiveTab('supplier')}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition whitespace-nowrap ${
                  activeTab === 'supplier' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600'
                }`}
              >
                Leather Suppliers ({parties.filter(p => p.type === 'supplier').length})
              </button>
              <button
                onClick={() => setActiveTab('cutter_maker')}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition whitespace-nowrap ${
                  activeTab === 'cutter_maker' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600'
                }`}
              >
                Outside Cutter Makers ({parties.filter(p => p.type === 'cutter_maker').length})
              </button>
            </div>

            <div className="relative w-full sm:w-72">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Search party by name or phone..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 text-xs rounded-xl border border-slate-300"
              />
            </div>
          </div>
        </div>

        {/* Table / List */}
        <div className="overflow-x-auto">
          {filteredParties.length === 0 ? (
            <div className="py-16 text-center text-slate-400 text-sm">
              <BookOpen className="w-10 h-10 text-slate-300 mx-auto mb-2" />
              <p>No parties found.</p>
              <button
                onClick={handleOpenAdd}
                className="mt-3 text-xs font-bold text-blue-600 hover:underline"
              >
                + Add your first party
              </button>
            </div>
          ) : (
            <table className="w-full text-left text-xs sm:text-sm">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                <tr>
                  <th className="py-3 px-4">Party Name</th>
                  <th className="py-3 px-4">Contact Phone</th>
                  <th className="py-3 px-4">Type</th>
                  <th className="py-3 px-4">Address</th>
                  <th className="py-3 px-4 text-right">Current Balance</th>
                  <th className="py-3 px-4 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredParties.map(p => {
                  const isRec = p.currentBalance > 0;
                  const isPay = p.currentBalance < 0;

                  return (
                    <tr key={p.id} className="hover:bg-slate-50/70 transition">
                      <td className="py-3.5 px-4">
                        <button
                          onClick={() => setSelectedPartyForLedger(p)}
                          className="font-bold text-slate-900 hover:text-blue-700 text-left"
                        >
                          {p.name}
                        </button>
                      </td>
                      <td className="py-3.5 px-4 font-mono text-slate-600">{p.phone}</td>
                      <td className="py-3.5 px-4">
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase bg-slate-100 text-slate-700">
                          {p.type.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-slate-500 max-w-xs truncate">{p.address || '-'}</td>
                      <td className="py-3.5 px-4 text-right">
                        <span className={`text-base font-black ${
                          isRec ? 'text-emerald-600' : isPay ? 'text-rose-600' : 'text-slate-500'
                        }`}>
                          {formatCurrency(p.currentBalance, settings.currency)}
                        </span>
                        <span className="text-[10px] text-slate-400 block">
                          {isRec ? "You'll Receive" : isPay ? "You'll Pay" : "Cleared"}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            onClick={() => {
                              const msg = `Dear ${p.name},\nReminder from ${settings.factoryName}: Your current balance is ${settings.currency} ${Math.abs(p.currentBalance)}. Thank you!`;
                              openWhatsApp(p.phone, msg);
                            }}
                            className="p-1.5 rounded-lg text-emerald-600 hover:bg-emerald-50 transition"
                            title="WhatsApp Balance Reminder"
                          >
                            <MessageCircle className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setSelectedPartyForLedger(p)}
                            className="px-2.5 py-1 rounded-lg text-xs font-bold bg-blue-50 text-blue-700 hover:bg-blue-100 transition"
                          >
                            Ledger
                          </button>
                          <button
                            onClick={() => handleOpenEdit(p)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700"
                          >
                            <Edit className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => deleteParty(p.id)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Add / Edit Party Modal */}
      {isAddOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-6 py-4 bg-blue-600 text-white flex items-center justify-between">
              <h3 className="font-bold text-lg">{editingParty ? 'Edit Party' : 'Add New Party'}</h3>
              <button onClick={() => setIsAddOpen(false)} className="p-1 text-white hover:bg-white/20 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Party / Business Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Sialkot Safety Impex, Al-Hassan Tannery"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Phone Number (WhatsApp) *</label>
                <input
                  type="text"
                  required
                  placeholder="0321-1234567"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Party Type *</label>
                <select
                  value={type}
                  onChange={e => setType(e.target.value as any)}
                  className="w-full px-3 py-2 text-xs font-semibold rounded-xl border border-slate-300 bg-white"
                >
                  <option value="customer">Customer / Local Buyer</option>
                  <option value="buyer">Export Buyer</option>
                  <option value="supplier">Leather / Raw Material Supplier</option>
                  <option value="cutter_maker">Cutter Maker / Outside Contractor</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Address / Location</label>
                <input
                  type="text"
                  placeholder="Market or area..."
                  value={address}
                  onChange={e => setAddress(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300"
                />
              </div>

              {!editingParty && (
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Opening Balance ({settings.currency})</label>
                  <input
                    type="number"
                    step="any"
                    value={openingBalance}
                    onChange={e => setOpeningBalance(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300"
                  />
                  <p className="text-[10px] text-slate-400 mt-0.5">Positive = Receivable from party, Negative = Payable to party</p>
                </div>
              )}

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
                  className="px-5 py-2 rounded-xl text-sm font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-sm"
                >
                  {editingParty ? 'Save Changes' : 'Save Party'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Party Ledger Details Modal */}
      {selectedPartyForLedger && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
              <div>
                <h3 className="font-bold text-lg">{selectedPartyForLedger.name} - Statement</h3>
                <p className="text-xs text-slate-400">{selectedPartyForLedger.phone} &bull; Type: {selectedPartyForLedger.type}</p>
              </div>
              <button onClick={() => setSelectedPartyForLedger(null)} className="p-1 text-white hover:bg-white/20 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <span className="text-xs font-bold text-slate-700 uppercase">Current Account Balance:</span>
              <span className={`text-xl font-black ${
                selectedPartyForLedger.currentBalance > 0 ? 'text-emerald-600' : selectedPartyForLedger.currentBalance < 0 ? 'text-rose-600' : 'text-slate-600'
              }`}>
                {formatCurrency(selectedPartyForLedger.currentBalance, settings.currency)}
              </span>
            </div>

            <div className="flex-1 overflow-y-auto p-4 sm:p-6">
              {partyTxs.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-12">No transactions recorded yet for this party.</p>
              ) : (
                <table className="w-full text-left text-xs sm:text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                    <tr>
                      <th className="py-2.5 px-3">Date</th>
                      <th className="py-2.5 px-3">Description</th>
                      <th className="py-2.5 px-3 text-right text-rose-600">Credit (Payable)</th>
                      <th className="py-2.5 px-3 text-right text-emerald-600">Debit (Receivable)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {partyTxs.map(t => (
                      <tr key={t.id}>
                        <td className="py-2.5 px-3 text-slate-600">{formatDate(t.date)}</td>
                        <td className="py-2.5 px-3 font-medium text-slate-900">{t.description}</td>
                        <td className="py-2.5 px-3 text-right font-bold text-rose-600">
                          {t.type === 'credit' ? formatCurrency(t.amount, settings.currency) : '-'}
                        </td>
                        <td className="py-2.5 px-3 text-right font-bold text-emerald-600">
                          {t.type === 'debit' ? formatCurrency(t.amount, settings.currency) : '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
