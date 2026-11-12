import React, { useState, useMemo } from 'react';
import { 
  Building2, 
  Search, 
  Plus, 
  ArrowLeft, 
  Calendar, 
  Package, 
  CheckCircle2, 
  Clock, 
  Pencil, 
  ExternalLink, 
  Phone, 
  MapPin, 
  User, 
  X, 
  ChevronRight, 
  RotateCcw,
  Layers,
  Sparkles
} from 'lucide-react';
import { useFactory } from '../context/FactoryContext';
import { CompanyOrderStats, OrderCompany } from '../types/factory';
import { formatDate } from '../utils/factoryFormatters';

interface OrderCompaniesPageProps {
  onBackToOrders: () => void;
  onSelectCompany: (companyName: string) => void;
  onOpenCreateOrderForCompany?: (companyName: string) => void;
}

export const OrderCompaniesPage: React.FC<OrderCompaniesPageProps> = ({
  onBackToOrders,
  onSelectCompany,
  onOpenCreateOrderForCompany
}) => {
  const { getCompanyStats, updateCompanyAndSyncOrders, toggleCompanyComplete, upsertOrderCompany } = useFactory();

  const [search, setSearch] = useState('');
  const [filterTab, setFilterTab] = useState<'all' | 'active' | 'completed'>('all');

  // Edit Company Modal State
  const [editingCompany, setEditingCompany] = useState<OrderCompany | null>(null);
  const [editForm, setEditForm] = useState({
    name: '',
    contactPerson: '',
    phone: '',
    address: '',
    notes: ''
  });
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  // Add Company Modal State
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [addForm, setAddForm] = useState({
    name: '',
    contactPerson: '',
    phone: '',
    address: '',
    notes: ''
  });
  const [isSavingAdd, setIsSavingAdd] = useState(false);

  // Computed companies list from context (already sorted: active on top, completed at bottom)
  const allCompanyStats = useMemo(() => getCompanyStats(), [getCompanyStats]);

  // Search and Tab filtering
  const filteredCompanies = useMemo(() => {
    return allCompanyStats.filter((c: CompanyOrderStats) => {
      if (filterTab === 'active' && c.isCompleted) return false;
      if (filterTab === 'completed' && !c.isCompleted) return false;

      if (search.trim()) {
        const q = search.trim().toLowerCase();
        const matchName = c.name.toLowerCase().includes(q);
        const matchContact = c.company.contactPerson?.toLowerCase().includes(q);
        const matchPhone = c.company.phone?.toLowerCase().includes(q);
        const matchAddress = c.company.address?.toLowerCase().includes(q);
        return matchName || matchContact || matchPhone || matchAddress;
      }
      return true;
    });
  }, [allCompanyStats, filterTab, search]);

  // Overall aggregate stats
  const totalCompaniesCount = allCompanyStats.length;
  const activeCompaniesCount = allCompanyStats.filter((c: CompanyOrderStats) => !c.isCompleted).length;
  const completedCompaniesCount = allCompanyStats.filter((c: CompanyOrderStats) => c.isCompleted).length;
  const grandLifetimePairs = allCompanyStats.reduce((sum: number, c: CompanyOrderStats) => sum + c.totalPairsLifetime, 0);

  // Handlers for Edit
  const handleOpenEdit = (comp: OrderCompany) => {
    setEditingCompany(comp);
    setEditForm({
      name: comp.name || '',
      contactPerson: comp.contactPerson || '',
      phone: comp.phone || '',
      address: comp.address || '',
      notes: comp.notes || ''
    });
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCompany || !editForm.name.trim()) return;

    setIsSavingEdit(true);
    try {
      await updateCompanyAndSyncOrders(editingCompany.name, {
        name: editForm.name.trim(),
        contactPerson: editForm.contactPerson.trim(),
        phone: editForm.phone.trim(),
        address: editForm.address.trim(),
        notes: editForm.notes.trim()
      });
      setEditingCompany(null);
    } catch (err) {
      console.error('Failed to update company:', err);
    } finally {
      setIsSavingEdit(false);
    }
  };

  // Handlers for Add
  const handleSaveAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addForm.name.trim()) return;

    setIsSavingAdd(true);
    try {
      await upsertOrderCompany({
        name: addForm.name.trim(),
        contactPerson: addForm.contactPerson.trim(),
        phone: addForm.phone.trim(),
        address: addForm.address.trim(),
        notes: addForm.notes.trim(),
        status: 'active',
        isCompleted: false
      });
      setIsAddModalOpen(false);
      setAddForm({ name: '', contactPerson: '', phone: '', address: '', notes: '' });
    } catch (err) {
      console.error('Failed to add company:', err);
    } finally {
      setIsSavingAdd(false);
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16">
      {/* Top Header Bar */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-4 sm:p-6 transition-all">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              onClick={onBackToOrders}
              className="p-2.5 rounded-xl text-slate-600 hover:text-blue-700 hover:bg-slate-100 transition shrink-0 cursor-pointer"
              title="Back to Customer Orders"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <div className="flex items-center gap-2">
                <span className="p-1 rounded-lg bg-blue-100 text-blue-800">
                  <Building2 className="w-4 h-4" />
                </span>
                <span className="text-xs font-bold text-blue-700 uppercase tracking-wider">
                  Buyer Management
                </span>
              </div>
              <h1 className="text-xl sm:text-2xl font-black text-slate-900 mt-0.5">
                Order Companies
              </h1>
              <p className="text-xs text-slate-500">
                Company-wise order pipelines, lifetime pairs, and order histories
              </p>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="flex items-center gap-2.5">
            <button
              onClick={() => setIsAddModalOpen(true)}
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-500/25 transition active:scale-95 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>+ Add New Company</span>
            </button>
          </div>
        </div>

        {/* Aggregate KPI Stats Banner */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mt-6 pt-5 border-t border-slate-100">
          <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
              Total Companies
            </span>
            <div className="text-xl sm:text-2xl font-black text-slate-900 mt-1">
              {totalCompaniesCount}
            </div>
            <p className="text-[11px] text-slate-500 mt-0.5">All registered buyers & clients</p>
          </div>

          <div className="bg-emerald-50/70 border border-emerald-200/80 rounded-xl p-3.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 block">
              Active Companies
            </span>
            <div className="text-xl sm:text-2xl font-black text-emerald-800 mt-1 flex items-center gap-2">
              <span>{activeCompaniesCount}</span>
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            </div>
            <p className="text-[11px] text-emerald-700 mt-0.5">With pending/in-work orders</p>
          </div>

          <div className="bg-slate-100/80 border border-slate-200 rounded-xl p-3.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-600 block">
              Completed Companies
            </span>
            <div className="text-xl sm:text-2xl font-black text-slate-700 mt-1">
              {completedCompaniesCount}
            </div>
            <p className="text-[11px] text-slate-500 mt-0.5">All orders 100% fulfilled</p>
          </div>

          <div className="bg-blue-50/70 border border-blue-200/80 rounded-xl p-3.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-blue-700 block">
              Total Lifetime Pairs
            </span>
            <div className="text-xl sm:text-2xl font-black text-blue-700 font-mono mt-1">
              {grandLifetimePairs.toLocaleString()}{' '}
              <span className="text-xs font-bold text-blue-600">Pairs</span>
            </div>
            <p className="text-[11px] text-blue-600 mt-0.5">Across all client contracts</p>
          </div>
        </div>
      </div>

      {/* Search Bar & Tab Controls */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-4 sm:p-5 space-y-4">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
          {/* Search by Company Name */}
          <div className="relative flex-1 w-full">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
            <input
              type="text"
              placeholder="Search company by name (e.g. traders, best way, Burlas)..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 text-xs sm:text-sm rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500/20 bg-white"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-3 top-2.5 p-1 rounded-md text-slate-400 hover:text-slate-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Filter Tabs */}
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl self-stretch sm:self-auto shrink-0">
            <button
              type="button"
              onClick={() => setFilterTab('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                filterTab === 'all'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              All ({allCompanyStats.length})
            </button>
            <button
              type="button"
              onClick={() => setFilterTab('active')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                filterTab === 'active'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-300" />
              <span>Active ({activeCompaniesCount})</span>
            </button>
            <button
              type="button"
              onClick={() => setFilterTab('completed')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                filterTab === 'completed'
                  ? 'bg-slate-700 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Completed ({completedCompaniesCount})
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1">
          <span>
            Showing <strong className="text-slate-700">{filteredCompanies.length}</strong> of{' '}
            {allCompanyStats.length} companies
          </span>
          <span className="font-medium text-slate-400">
            Rule: Companies with Active Orders stay on top &bull; Completed at bottom
          </span>
        </div>
      </div>

      {/* Grid of Company Cards */}
      {filteredCompanies.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center shadow-xs">
          <div className="w-14 h-14 rounded-2xl bg-slate-100 text-slate-400 mx-auto flex items-center justify-center mb-3">
            <Building2 className="w-7 h-7" />
          </div>
          <h3 className="font-bold text-slate-800 text-base">No companies found</h3>
          <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
            {search
              ? `No companies matching "${search}". Try searching for another name like "traders" or "best way".`
              : 'No company records found. Click "+ Add New Company" or create a customer order to get started.'}
          </p>
          {search && (
            <button
              onClick={() => setSearch('')}
              className="mt-4 px-4 py-2 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 transition cursor-pointer"
            >
              Clear Search
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredCompanies.map((stat: CompanyOrderStats) => {
            const isCompleted = stat.isCompleted;

            return (
              <div
                key={stat.normalizedName}
                className={`rounded-2xl border transition-all duration-200 flex flex-col justify-between overflow-hidden shadow-xs hover:shadow-md ${
                  isCompleted
                    ? 'bg-slate-50/90 border-slate-200 hover:border-slate-300'
                    : 'bg-white border-slate-200 hover:border-blue-400'
                }`}
              >
                {/* Card Header */}
                <div className="p-5 pb-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1.5">
                        {isCompleted ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-200/80 text-slate-700 border border-slate-300">
                            <CheckCircle2 className="w-3 h-3 text-slate-500" />
                            <span>Completed Company</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                            <span>Active Company</span>
                          </span>
                        )}
                        <span className="text-[11px] font-mono text-slate-400">
                          #{stat.company.id.slice(-6)}
                        </span>
                      </div>

                      {/* Company Name (big as requested) */}
                      <h3
                        onClick={() => onSelectCompany(stat.name)}
                        className={`text-lg sm:text-xl font-black truncate cursor-pointer transition hover:text-blue-600 ${
                          isCompleted ? 'text-slate-700' : 'text-slate-900'
                        }`}
                        title={stat.name}
                      >
                        {stat.name}
                      </h3>

                      {/* Contact / Phone / Address metadata if available */}
                      <div className="mt-2 space-y-1 text-xs text-slate-500">
                        {stat.company.contactPerson && (
                          <div className="flex items-center gap-1.5 truncate">
                            <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <span className="truncate">{stat.company.contactPerson}</span>
                          </div>
                        )}
                        {stat.company.phone && (
                          <div className="flex items-center gap-1.5 truncate">
                            <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <span className="font-mono text-slate-600">{stat.company.phone}</span>
                          </div>
                        )}
                        {stat.company.address && (
                          <div className="flex items-center gap-1.5 truncate text-[11px]">
                            <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <span className="truncate">{stat.company.address}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div
                      className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                        isCompleted
                          ? 'bg-slate-200/70 text-slate-500'
                          : 'bg-blue-50 text-blue-600 border border-blue-100'
                      }`}
                    >
                      <Building2 className="w-5 h-5" />
                    </div>
                  </div>

                  {/* Stats Grid inside card */}
                  <div className="mt-4 pt-3.5 border-t border-slate-100 grid grid-cols-3 gap-2 text-center">
                    <div className="bg-slate-50/80 p-2 rounded-xl border border-slate-100">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                        Total Orders
                      </span>
                      <span className="text-sm font-black text-slate-800">
                        {stat.totalOrdersCount}
                      </span>
                    </div>

                    <div className="bg-emerald-50/60 p-2 rounded-xl border border-emerald-100">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 block">
                        Active
                      </span>
                      <span className="text-sm font-black text-emerald-800">
                        {stat.activeOrdersCount}
                      </span>
                    </div>

                    <div className="bg-slate-100/70 p-2 rounded-xl border border-slate-200">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                        Completed
                      </span>
                      <span className="text-sm font-black text-slate-600">
                        {stat.completedOrdersCount}
                      </span>
                    </div>
                  </div>

                  {/* Lifetime Pairs & Last Order Date */}
                  <div className="mt-3 bg-slate-50 rounded-xl p-3 border border-slate-200/70 flex items-center justify-between text-xs">
                    <div>
                      <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 block">
                        Total Pairs (Lifetime)
                      </span>
                      <span className="font-mono font-black text-sm text-blue-700">
                        {stat.totalPairsLifetime.toLocaleString()} Pairs
                      </span>
                    </div>

                    <div className="text-right">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                        Last Order Date
                      </span>
                      <span className="text-[11px] font-medium text-slate-700 flex items-center justify-end gap-1 mt-0.5">
                        <Calendar className="w-3 h-3 text-slate-400" />
                        <span>{stat.lastOrderDate ? formatDate(stat.lastOrderDate) : 'No Orders'}</span>
                      </span>
                    </div>
                  </div>
                </div>

                {/* Card Action Buttons (as requested) */}
                <div className="p-4 pt-0 border-t border-slate-100/80 flex flex-col gap-2 bg-slate-50/40">
                  <div className="flex items-center gap-2 pt-3">
                    <button
                      type="button"
                      onClick={() => onSelectCompany(stat.name)}
                      className="flex-1 py-2 px-3 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-xs transition active:scale-95 flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <span>View Orders</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>

                    <button
                      type="button"
                      onClick={() => handleOpenEdit(stat.company)}
                      className="py-2 px-3 rounded-xl text-xs font-bold border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 shadow-2xs transition active:scale-95 flex items-center gap-1 cursor-pointer"
                      title="Edit Company Details"
                    >
                      <Pencil className="w-3.5 h-3.5 text-slate-500" />
                      <span>Edit</span>
                    </button>
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => toggleCompanyComplete(stat.name, !isCompleted)}
                      className={`w-full py-1.5 px-3 rounded-xl text-[11px] font-bold border transition flex items-center justify-center gap-1.5 cursor-pointer ${
                        isCompleted
                          ? 'bg-white border-slate-300 text-slate-700 hover:bg-slate-100'
                          : 'bg-slate-100 border-slate-200 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {isCompleted ? (
                        <>
                          <RotateCcw className="w-3 h-3 text-blue-600" />
                          <span>Mark as Active</span>
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="w-3 h-3 text-slate-500" />
                          <span>Mark Company Complete</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* =========================================================================
          EDIT COMPANY MODAL (Synchronizes past orders on name edit)
          ========================================================================= */}
      {editingCompany && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-md w-full border border-slate-200 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-4 sm:p-5 bg-gradient-to-r from-blue-700 to-indigo-800 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Building2 className="w-5 h-5 text-blue-200" />
                <h3 className="font-black text-base">Edit Company Details</h3>
              </div>
              <button
                type="button"
                onClick={() => setEditingCompany(null)}
                className="p-1 rounded-lg text-blue-200 hover:bg-white/10"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="p-5 space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Company / Buyer Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={editForm.name}
                  onChange={e => setEditForm(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500/20 font-bold"
                  placeholder="e.g. traders, best way, Burlas"
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  Note: If you change the company name, all its past orders and history records will automatically be updated.
                </p>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Contact Person</label>
                <input
                  type="text"
                  value={editForm.contactPerson}
                  onChange={e => setEditForm(prev => ({ ...prev, contactPerson: e.target.value }))}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  placeholder="e.g. Mr. Aslam / Purchasing Manager"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Phone Number</label>
                <input
                  type="text"
                  value={editForm.phone}
                  onChange={e => setEditForm(prev => ({ ...prev, phone: e.target.value }))}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500/20 font-mono"
                  placeholder="+92 300 1234567"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Office / Factory Address</label>
                <input
                  type="text"
                  value={editForm.address}
                  onChange={e => setEditForm(prev => ({ ...prev, address: e.target.value }))}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  placeholder="City, Area, or Plot #..."
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Notes / Preferences</label>
                <textarea
                  rows={2}
                  value={editForm.notes}
                  onChange={e => setEditForm(prev => ({ ...prev, notes: e.target.value }))}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  placeholder="Special glove specs, billing requirements, etc."
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingCompany(null)}
                  disabled={isSavingEdit}
                  className="px-4 py-2 rounded-xl border border-slate-300 text-slate-600 hover:bg-slate-100 font-bold transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingEdit || !editForm.name.trim()}
                  className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold transition shadow-xs disabled:opacity-50 cursor-pointer"
                >
                  {isSavingEdit ? 'Saving & Syncing...' : 'Save & Update Orders'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =========================================================================
          ADD NEW COMPANY MODAL
          ========================================================================= */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-md w-full border border-slate-200 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-4 sm:p-5 bg-gradient-to-r from-blue-700 to-indigo-800 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Building2 className="w-5 h-5 text-blue-200" />
                <h3 className="font-black text-base">Register New Order Company</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsAddModalOpen(false)}
                className="p-1 rounded-lg text-blue-200 hover:bg-white/10"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveAdd} className="p-5 space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Company / Buyer Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={addForm.name}
                  onChange={e => setAddForm(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500/20 font-bold"
                  placeholder="e.g. traders, best way, Burlas"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Contact Person</label>
                <input
                  type="text"
                  value={addForm.contactPerson}
                  onChange={e => setAddForm(prev => ({ ...prev, contactPerson: e.target.value }))}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  placeholder="e.g. Mr. Tariq / Import Manager"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Phone Number</label>
                <input
                  type="text"
                  value={addForm.phone}
                  onChange={e => setAddForm(prev => ({ ...prev, phone: e.target.value }))}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500/20 font-mono"
                  placeholder="+92 300 0000000"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Address</label>
                <input
                  type="text"
                  value={addForm.address}
                  onChange={e => setAddForm(prev => ({ ...prev, address: e.target.value }))}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  placeholder="City, Area or Country"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Notes</label>
                <textarea
                  rows={2}
                  value={addForm.notes}
                  onChange={e => setAddForm(prev => ({ ...prev, notes: e.target.value }))}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  placeholder="Optional notes"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  disabled={isSavingAdd}
                  className="px-4 py-2 rounded-xl border border-slate-300 text-slate-600 hover:bg-slate-100 font-bold transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingAdd || !addForm.name.trim()}
                  className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold transition shadow-xs disabled:opacity-50 cursor-pointer"
                >
                  {isSavingAdd ? 'Creating...' : '+ Create Company'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
