import React, { useState, useMemo } from 'react';
import { 
  Scissors, 
  Search, 
  Plus, 
  Phone, 
  Building, 
  Boxes, 
  Pencil, 
  Trash2, 
  Power 
} from 'lucide-react';
import { Cutter, CutterCategory } from '../../types/factory';
import { useFactory } from '../../context/FactoryContext';

interface FactoryCuttersRosterProps {
  onSelectCutter: (cutter: Cutter) => void;
  onOpenAddCutter: () => void;
  onEditCutter?: (cutter: Cutter) => void;
  onDeleteCutter?: (cutter: Cutter) => void;
  onToggleStatus?: (cutter: Cutter) => void;
  selectedCategory: CutterCategory;
  onSelectCategory: (category: CutterCategory) => void;
}

export const FactoryCuttersRoster: React.FC<FactoryCuttersRosterProps> = ({
  onSelectCutter,
  onOpenAddCutter,
  onEditCutter,
  onDeleteCutter,
  onToggleStatus,
  selectedCategory,
  onSelectCategory
}) => {
  const { cutters = [], cuttingEntries = [], cuttingTransactions = [] } = useFactory();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'deactive'>('all');

  // Category metadata
  const catMeta = useMemo(() => {
    switch (selectedCategory) {
      case 'cutting_man':
        return {
          title: 'Cutting Master / Man',
          singular: 'Cutting Man',
          description: 'Internal factory workers cutting leather gloves inside factory premise',
          borderActive: 'border-amber-500 bg-amber-50/70',
          badgeColor: 'bg-amber-100 text-amber-800'
        };
      case 'cutting_maker':
        return {
          title: 'Cutting Maker',
          singular: 'Cutting Maker',
          description: 'Outside contractors / specialist makers who take leather pieces home or to workshop',
          borderActive: 'border-blue-600 bg-blue-50/70',
          badgeColor: 'bg-blue-100 text-blue-800'
        };
      case 'product':
        return {
          title: 'Product / Purchase',
          singular: 'Product Supplier',
          description: 'Ready glove suppliers or third-party contractors supplying ready gloves',
          borderActive: 'border-indigo-600 bg-indigo-50/70',
          badgeColor: 'bg-indigo-100 text-indigo-800'
        };
    }
  }, [selectedCategory]);

  const categoryCutters = useMemo(() => {
    return cutters.filter(c => c && c.cutterType === selectedCategory);
  }, [cutters, selectedCategory]);

  const filteredCutters = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return categoryCutters.filter(c => {
      if (!c) return false;
      const active = c.isActive !== false;
      const matchesStatus = statusFilter === 'all' || (statusFilter === 'active' ? active : !active);
      const matchesSearch = !q || 
        c.name.toLowerCase().includes(q) ||
        (c.phone && c.phone.toLowerCase().includes(q)) ||
        (c.khataName && c.khataName.toLowerCase().includes(q));
      return matchesStatus && matchesSearch;
    });
  }, [categoryCutters, searchQuery, statusFilter]);

  // CRITICAL REQUIREMENT 2: Check if cutter.id exists before navigating. Wrap ledger loading in try-catch.
  const handleCutterClick = (cutter: Cutter) => {
    try {
      if (!cutter || !cutter.id) {
        console.warn('Cannot open cutter ledger: cutter or cutter.id is undefined/null', cutter);
        return;
      }
      console.log('Navigating safely to cutter ledger:', cutter.name, 'ID:', cutter.id);
      onSelectCutter(cutter);
    } catch (err) {
      console.error('Error opening cutter ledger in FactoryCuttersRoster:', err);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Category Selectors */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-lg font-black text-slate-900">Cutting Management System</h2>
            <p className="text-xs text-slate-500">Select cutting category to manage rosters and notebooks.</p>
          </div>
          <button
            type="button"
            onClick={onOpenAddCutter}
            className="flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-blue-700 transition"
          >
            <Plus className="h-4 w-4" />
            + Add {catMeta.singular}
          </button>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {/* Option A: Cutting Man */}
          <button
            type="button"
            onClick={() => onSelectCategory('cutting_man')}
            className={`rounded-xl border-2 p-4 text-left transition-all ${
              selectedCategory === 'cutting_man'
                ? 'border-amber-500 bg-amber-50/70 shadow-xs'
                : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="rounded-lg bg-amber-100 p-2 text-amber-700">
                <Scissors className="h-5 w-5" />
              </span>
              <span className="font-mono text-xs font-black text-amber-800">
                {cutters.filter(c => c.cutterType === 'cutting_man').length} Cutters
              </span>
            </div>
            <h3 className="mt-3 text-base font-black text-slate-900">Cutting Master / Man</h3>
            <p className="mt-1 text-xs text-slate-500">Internal factory cutting workers</p>
          </button>

          {/* Option B: Cutting Maker */}
          <button
            type="button"
            onClick={() => onSelectCategory('cutting_maker')}
            className={`rounded-xl border-2 p-4 text-left transition-all ${
              selectedCategory === 'cutting_maker'
                ? 'border-blue-600 bg-blue-50/70 shadow-xs'
                : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="rounded-lg bg-blue-100 p-2 text-blue-700">
                <Building className="h-5 w-5" />
              </span>
              <span className="font-mono text-xs font-black text-blue-800">
                {cutters.filter(c => c.cutterType === 'cutting_maker').length} Makers
              </span>
            </div>
            <h3 className="mt-3 text-base font-black text-slate-900">Cutting Maker</h3>
            <p className="mt-1 text-xs text-slate-500">Outside specialist cutting contractors</p>
          </button>

          {/* Option C: Product */}
          <button
            type="button"
            onClick={() => onSelectCategory('product')}
            className={`rounded-xl border-2 p-4 text-left transition-all ${
              selectedCategory === 'product'
                ? 'border-indigo-600 bg-indigo-50/70 shadow-xs'
                : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="rounded-lg bg-indigo-100 p-2 text-indigo-700">
                <Boxes className="h-5 w-5" />
              </span>
              <span className="font-mono text-xs font-black text-indigo-800">
                {cutters.filter(c => c.cutterType === 'product').length} Suppliers
              </span>
            </div>
            <h3 className="mt-3 text-base font-black text-slate-900">Product / Purchase</h3>
            <p className="mt-1 text-xs text-slate-500">Ready glove suppliers & purchasing</p>
          </button>
        </div>
      </div>

      {/* Cutters List Card */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-xs overflow-hidden">
        {/* Search & Filter Header */}
        <div className="border-b border-slate-200 p-4 sm:p-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative min-w-[240px] flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder={`Search ${catMeta.title} by name, phone...`}
              className="w-full rounded-xl border border-slate-300 py-2 pl-9 pr-3 text-xs focus:border-blue-500 focus:outline-none"
            />
          </div>

          <div className="flex items-center gap-2">
            {(['all', 'active', 'deactive'] as const).map(filter => (
              <button
                key={filter}
                type="button"
                onClick={() => setStatusFilter(filter)}
                className={`rounded-full px-3 py-1 text-xs font-bold transition ${
                  statusFilter === filter
                    ? filter === 'deactive'
                      ? 'bg-rose-600 text-white'
                      : 'bg-emerald-600 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {filter === 'all' ? 'All' : filter === 'active' ? 'Active' : 'Inactive'}
              </button>
            ))}
          </div>
        </div>

        {/* Numbered Cutters List */}
        <div className="divide-y divide-slate-100">
          {filteredCutters.length === 0 ? (
            <div className="p-12 text-center text-slate-400">
              <Scissors className="mx-auto mb-2 h-10 w-10 opacity-30" />
              <p className="text-sm font-semibold">No {catMeta.title} entries found</p>
              <p className="mt-1 text-xs">Click "+ Add {catMeta.singular}" above to create a profile.</p>
            </div>
          ) : (
            filteredCutters.map((cutter, index) => {
              const pendingPairs = Math.max(0, (cutter.totalGiven || 0) - (cutter.totalReceived || 0));
              const isActive = cutter.isActive !== false;

              return (
                <div
                  key={cutter.id}
                  onClick={() => handleCutterClick(cutter)}
                  className={`flex items-center justify-between p-4 transition sm:px-6 cursor-pointer group ${
                    isActive ? 'hover:bg-amber-50/50' : 'bg-slate-100 opacity-75'
                  }`}
                >
                  <div className="flex items-center gap-3 sm:gap-4 min-w-0">
                    <div className="flex h-9 w-9 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-slate-100 font-mono text-sm font-black text-slate-700 transition-colors group-hover:bg-amber-500 group-hover:text-white">
                      {index + 1}
                    </div>

                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h4 className="text-sm font-black text-slate-900 transition group-hover:text-amber-700 sm:text-base">
                          {cutter.name}
                        </h4>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                          isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
                        }`}>
                          {isActive ? '● Active' : '● Inactive'}
                        </span>
                        {pendingPairs > 0 ? (
                          <span className="rounded-full border border-amber-200 bg-amber-100 px-2 py-0.5 text-[10px] font-black text-amber-800">
                            Pending: {pendingPairs} Pairs
                          </span>
                        ) : (
                          <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                            Balanced
                          </span>
                        )}
                      </div>

                      <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                        <span className="font-semibold text-slate-600">
                          {cutter.khataName || `${cutter.name} Ledger`}
                        </span>
                        <span className="text-[11px]">Rate: Rs.{cutter.perPairRate || 0}/Pair</span>
                        {cutter.phone && (
                          <span className="flex items-center gap-1 font-mono text-[11px]">
                            <Phone className="h-3 w-3 text-slate-400" />
                            {cutter.phone}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 sm:gap-2 shrink-0">
                    {onEditCutter && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onEditCutter(cutter);
                        }}
                        className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition"
                        title="Edit Cutter"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                    )}
                    {onToggleStatus && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggleStatus(cutter);
                        }}
                        className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition"
                        title={isActive ? 'Deactivate' : 'Activate'}
                      >
                        <Power className="h-4 w-4" />
                      </button>
                    )}
                    {onDeleteCutter && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteCutter(cutter);
                        }}
                        className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition"
                        title="Delete Cutter"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
