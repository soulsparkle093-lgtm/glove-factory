import React, { useState, useMemo } from 'react';
import { 
  Boxes, 
  Search, 
  ArrowDownLeft, 
  ArrowUpRight, 
  X, 
  Pencil, 
  Trash2, 
  ChevronRight, 
  Calendar, 
  Clock, 
  User, 
  FileText,
  AlertCircle
} from 'lucide-react';
import { useFactory } from '../../context/FactoryContext';
import { DistinctArticleStock, StockInHistoryItem, StockOutHistoryItem } from '../../types/factory';
import { formatCurrency, formatDate } from '../../utils/factoryFormatters';

export const StockManagement: React.FC = () => {
  const { 
    getDistinctArticles, 
    getStockInHistory, 
    getStockOutHistory,
    updateCuttingEntry,
    deleteCuttingEntry,
    updateStockDelivery,
    deleteStockDelivery,
    showToast 
  } = useFactory();

  // Active Tab: Stock IN Report vs Stock OUT Report
  const [activeTab, setActiveTab] = useState<'IN' | 'OUT'>('IN');

  // Search query for article name
  const [searchQuery, setSearchQuery] = useState('');

  // Selected article for Detail Modal / Page
  const [selectedArticleName, setSelectedArticleName] = useState<string | null>(null);
  const [modalTab, setModalTab] = useState<'IN' | 'OUT'>('IN');

  // Edit / Delete modals for history rows inside Detail Page
  const [editingInItem, setEditingInItem] = useState<StockInHistoryItem | null>(null);
  const [editInQty, setEditInQty] = useState('');
  const [editInDate, setEditInDate] = useState('');
  const [isSavingInEdit, setIsSavingInEdit] = useState(false);

  const [editingOutItem, setEditingOutItem] = useState<StockOutHistoryItem | null>(null);
  const [editOutQty, setEditOutQty] = useState('');
  const [editOutDate, setEditOutDate] = useState('');
  const [editOutCustomer, setEditOutCustomer] = useState('');
  const [isSavingOutEdit, setIsSavingOutEdit] = useState(false);

  const [deletingItem, setDeletingItem] = useState<{ type: 'IN' | 'OUT'; id: string; label: string } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Distinct articles list computed dynamically
  const distinctArticles: DistinctArticleStock[] = useMemo(() => {
    try {
      return getDistinctArticles();
    } catch (e) {
      console.error('Error fetching distinct articles:', e);
      return [];
    }
  }, [getDistinctArticles]);

  // Overall Totals for Top Report Card
  const totalArticlesCount = distinctArticles.length;
  const totalStockPairs = useMemo(() => {
    return distinctArticles.reduce((sum, item) => sum + item.availableStock, 0);
  }, [distinctArticles]);
  const totalStockValue = useMemo(() => {
    return distinctArticles.reduce((sum, item) => sum + item.stockValue, 0);
  }, [distinctArticles]);

  // Filtered distinct articles based on search query
  const filteredArticles = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return distinctArticles;
    return distinctArticles.filter(item => item.articleName.toLowerCase().includes(q));
  }, [distinctArticles, searchQuery]);

  // History for selected article
  const selectedArticleInHistory = useMemo(() => {
    if (!selectedArticleName) return [];
    return getStockInHistory(selectedArticleName);
  }, [selectedArticleName, getStockInHistory]);

  const selectedArticleOutHistory = useMemo(() => {
    if (!selectedArticleName) return [];
    return getStockOutHistory(selectedArticleName);
  }, [selectedArticleName, getStockOutHistory]);

  // Summary numbers for the selected article
  const selectedArticleSummary = useMemo(() => {
    if (!selectedArticleName) return null;
    const found = distinctArticles.find(
      a => a.articleName.trim().toLowerCase() === selectedArticleName.trim().toLowerCase()
    );
    const totalIn = selectedArticleInHistory.reduce((sum, item) => sum + item.quantity, 0);
    const totalOut = selectedArticleOutHistory.reduce((sum, item) => sum + item.quantity, 0);
    const available = Math.max(0, totalIn - totalOut);
    return {
      articleName: found?.articleName || selectedArticleName,
      totalIn,
      totalOut,
      availableStock: available
    };
  }, [selectedArticleName, distinctArticles, selectedArticleInHistory, selectedArticleOutHistory]);

  // Handle Editing Stock IN Item
  const handleSaveInEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingInItem) return;
    const qty = Number(editInQty);
    if (!Number.isFinite(qty) || qty <= 0 || !editInDate) {
      showToast('Enter a valid date and positive pair quantity.', 'error');
      return;
    }
    setIsSavingInEdit(true);
    try {
      if (updateCuttingEntry) {
        const raw = editingInItem.rawEntry as Record<string, any> | undefined;
        await updateCuttingEntry(editingInItem.id, {
          date: editInDate,
          customerName: raw?.customerName || 'Stock',
          article: raw?.article || raw?.articleTitle || selectedArticleName || '',
          size: raw?.size || raw?.sizeName || '',
          average: raw?.average || '',
          remarks: raw?.remarks || '',
          pairs: qty,
          rate: Number(raw?.rate) || 0,
          billNo: raw?.billNo || ''
        });
        showToast('Stock In entry updated successfully.');
      }
      setEditingInItem(null);
    } catch (err) {
      console.error('Error updating stock in entry:', err);
      showToast('Could not update entry. Please try again.', 'error');
    } finally {
      setIsSavingInEdit(false);
    }
  };

  // Handle Editing Stock OUT Item
  const handleSaveOutEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingOutItem) return;
    const qty = Number(editOutQty);
    if (!Number.isFinite(qty) || qty <= 0 || !editOutDate) {
      showToast('Enter a valid date and positive pair quantity.', 'error');
      return;
    }
    setIsSavingOutEdit(true);
    try {
      if (updateStockDelivery) {
        await updateStockDelivery(editingOutItem.id, {
          date: editOutDate,
          quantity: qty,
          customerName: editOutCustomer.trim() || editingOutItem.customerName || 'Customer'
        });
        showToast('Delivery entry updated successfully.');
      }
      setEditingOutItem(null);
    } catch (err) {
      console.error('Error updating delivery entry:', err);
      showToast('Could not update delivery. Please try again.', 'error');
    } finally {
      setIsSavingOutEdit(false);
    }
  };

  // Handle Deleting History Item
  const handleConfirmDelete = async () => {
    if (!deletingItem) return;
    setIsDeleting(true);
    try {
      if (deletingItem.type === 'IN') {
        if (deleteCuttingEntry) await deleteCuttingEntry(deletingItem.id);
        showToast('Stock In receipt deleted.');
      } else {
        if (deleteStockDelivery) await deleteStockDelivery(deletingItem.id);
        showToast('Stock delivery deleted.');
      }
      setDeletingItem(null);
    } catch (err) {
      console.error('Error deleting entry:', err);
      showToast('Could not delete entry.', 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* =========================================================================
          REQUIREMENT 1: Top Section - Total Stock Report Card (Light Theme)
          ========================================================================= */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-100 pb-5">
          <div>
            <div className="flex items-center gap-2">
              <span className="rounded-md bg-blue-100 p-1.5 text-blue-700">
                <Boxes className="h-5 w-5" />
              </span>
              <h1 className="text-xl font-black text-slate-900 sm:text-2xl">
                Stock Management System
              </h1>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              Automated glove stock tracking, receive cutting synchronization, and delivery management.
            </p>
          </div>
        </div>

        {/* Total Stock Report Card 3-Metric Grid */}
        <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
          {/* 1. Total Articles */}
          <div className="rounded-xl border border-purple-100 bg-purple-50/60 p-4 transition-all hover:bg-purple-50">
            <span className="text-xs font-bold uppercase tracking-wider text-purple-700 block">
              Total Articles
            </span>
            <div className="mt-2 font-mono text-2xl sm:text-3xl font-black text-purple-900">
              {totalArticlesCount.toLocaleString()}
            </div>
            <p className="mt-1 text-[11px] text-purple-700/80">Unique glove models registered</p>
          </div>

          {/* 2. Total Stock Pairs */}
          <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 p-4 transition-all hover:bg-emerald-50">
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-700 block">
              Total Stock Pairs
            </span>
            <div className="mt-2 font-mono text-2xl sm:text-3xl font-black text-emerald-800">
              {totalStockPairs.toLocaleString()} <span className="text-sm font-normal text-emerald-600">Pairs</span>
            </div>
            <p className="mt-1 text-[11px] text-emerald-700/80">Current physical balance available</p>
          </div>

          {/* 3. Total Stock Value */}
          <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-4 transition-all hover:bg-blue-50">
            <span className="text-xs font-bold uppercase tracking-wider text-blue-700 block">
              Total Stock Value
            </span>
            <div className="mt-2 font-mono text-2xl sm:text-3xl font-black text-blue-900">
              {formatCurrency(totalStockValue)}
            </div>
            <p className="mt-1 text-[11px] text-blue-700/80">Estimated manufacturing inventory value</p>
          </div>
        </div>

        {/* REQUIREMENT 1: 2 Tabs/Buttons side by side */}
        <div className="mt-6 flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-slate-100">
          <div className="flex w-full sm:w-auto items-center gap-2 p-1 bg-slate-100 rounded-xl">
            <button
              type="button"
              onClick={() => setActiveTab('IN')}
              className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg text-xs font-bold transition-all ${
                activeTab === 'IN'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
              }`}
            >
              <ArrowDownLeft className="h-4 w-4" />
              Stock IN Report
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('OUT')}
              className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg text-xs font-bold transition-all ${
                activeTab === 'OUT'
                  ? 'bg-purple-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
              }`}
            >
              <ArrowUpRight className="h-4 w-4" />
              Stock OUT Report
            </button>
          </div>

          {/* REQUIREMENT 5: Search bar to search article by name (MG, drivers, etc.) */}
          <div className="relative w-full sm:w-80">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search article (e.g. MG, drivers)..."
              className="w-full rounded-xl border border-slate-300 py-2 pl-9 pr-3 text-xs bg-white text-slate-800 focus:border-blue-500 focus:outline-none"
            />
          </div>
        </div>
      </div>

      {/* =========================================================================
          REQUIREMENTS 2 & 3: DISTINCT Articles List (Shows each article ONCE)
          ========================================================================= */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-xs overflow-hidden">
        <div className="border-b border-slate-200 bg-slate-50/70 p-4 sm:px-6 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className={`h-2.5 w-2.5 rounded-full ${activeTab === 'IN' ? 'bg-blue-600' : 'bg-purple-600'}`} />
            <h2 className="text-sm font-black text-slate-800 uppercase tracking-wider">
              {activeTab === 'IN' ? 'Stock IN Articles Directory' : 'Stock OUT Articles Directory'}
            </h2>
          </div>
          <span className="rounded-full bg-white border border-slate-200 px-3 py-1 font-mono text-xs font-bold text-slate-600">
            {filteredArticles.length} Distinct Articles
          </span>
        </div>

        <div className="divide-y divide-slate-100">
          {filteredArticles.length === 0 ? (
            <div className="p-12 text-center text-slate-400">
              <Boxes className="mx-auto mb-2 h-10 w-10 opacity-30" />
              <p className="text-sm font-semibold text-slate-600">No articles found</p>
              <p className="mt-1 text-xs text-slate-400">
                {searchQuery
                  ? `No matching article for "${searchQuery}".`
                  : 'Receive cutting lots or add products to start tracking stock.'}
              </p>
            </div>
          ) : (
            filteredArticles.map((article, index) => {
              return (
                <div
                  key={article.articleName}
                  onClick={() => {
                    setSelectedArticleName(article.articleName);
                    setModalTab(activeTab);
                  }}
                  className="flex items-center justify-between p-4 sm:px-6 hover:bg-slate-50 transition cursor-pointer group"
                >
                  {/* Left Side: Article Name */}
                  <div className="flex items-center gap-3 sm:gap-4 min-w-0">
                    <div className="flex h-9 w-9 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-slate-100 font-mono text-xs font-black text-slate-700 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                      {index + 1}
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-bold text-slate-900 text-sm sm:text-base group-hover:text-blue-700 transition truncate">
                        {article.articleName}
                      </h3>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                        {article.sizes && article.sizes.length > 0 && (
                          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">
                            Sizes: {article.sizes.join(', ')}
                          </span>
                        )}
                        {activeTab === 'IN' ? (
                          <span>Total Received: {article.totalIn.toLocaleString()} Pairs</span>
                        ) : (
                          <span>Total Delivered: {article.totalOut.toLocaleString()} Pairs</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Right Side: Stock Count & Chevron */}
                  <div className="flex items-center gap-4 shrink-0 text-right">
                    <div>
                      {activeTab === 'IN' ? (
                        <>
                          <div className="font-mono text-base sm:text-lg font-black text-emerald-700">
                            {article.availableStock.toLocaleString()} <span className="text-xs font-medium text-emerald-600">Pairs</span>
                          </div>
                          <span className="text-[11px] font-semibold text-slate-500 block">Available Stock</span>
                        </>
                      ) : (
                        <>
                          <div className="font-mono text-base sm:text-lg font-black text-purple-700">
                            {article.totalOut.toLocaleString()} <span className="text-xs font-medium text-purple-600">Pairs</span>
                          </div>
                          <span className="text-[11px] font-semibold text-slate-500 block">Delivered Out</span>
                        </>
                      )}
                    </div>
                    <ChevronRight className="h-5 w-5 text-slate-400 group-hover:text-blue-600 group-hover:translate-x-0.5 transition-all" />
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* =========================================================================
          ARTICLE DETAIL VIEW / MODAL (Like Cutting Ledger)
          ========================================================================= */}
      {selectedArticleName && selectedArticleSummary && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-3 sm:p-6 backdrop-blur-xs">
          <div className="flex max-h-[90vh] w-full max-w-4xl flex-col rounded-2xl bg-white shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="border-b border-slate-200 bg-white p-5">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className={`rounded-md px-2 py-0.5 text-xs font-bold uppercase ${
                      activeTab === 'IN' ? 'bg-blue-100 text-blue-800' : 'bg-purple-100 text-purple-800'
                    }`}>
                      {activeTab === 'IN' ? 'Stock IN Report' : 'Stock OUT Report'}
                    </span>
                    <span className="text-xs font-mono text-slate-400">Article Profile</span>
                  </div>
                  <h2 className="mt-1 text-xl font-black text-slate-900 sm:text-2xl">
                    {selectedArticleSummary.articleName}
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedArticleName(null)}
                  className="rounded-xl border border-slate-200 p-2 text-slate-500 hover:bg-slate-100 transition"
                  title="Close"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Modal Subtabs */}
              <div className="mt-4 flex items-center gap-2 border-b border-slate-200 pb-3">
                <button
                  type="button"
                  onClick={() => setModalTab('IN')}
                  className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                    modalTab === 'IN'
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  <ArrowDownLeft className="h-3.5 w-3.5" />
                  Stock Receive History ({selectedArticleInHistory.length})
                </button>
                <button
                  type="button"
                  onClick={() => setModalTab('OUT')}
                  className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                    modalTab === 'OUT'
                      ? 'bg-purple-600 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  <ArrowUpRight className="h-3.5 w-3.5" />
                  Stock OUT / Delivery History ({selectedArticleOutHistory.length})
                </button>
              </div>

              {/* Top Metrics as required */}
              <div className="mt-4 grid grid-cols-2 gap-3 sm:gap-4">
                {modalTab === 'IN' ? (
                  <>
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-3 sm:p-4">
                      <span className="text-xs font-bold uppercase tracking-wider text-emerald-800">Available Stock</span>
                      <div className="mt-1 font-mono text-xl sm:text-2xl font-black text-emerald-700">
                        {selectedArticleSummary.availableStock.toLocaleString()} Pairs
                      </div>
                    </div>
                    <div className="rounded-xl border border-blue-200 bg-blue-50/70 p-3 sm:p-4">
                      <span className="text-xs font-bold uppercase tracking-wider text-blue-800">Total Received</span>
                      <div className="mt-1 font-mono text-xl sm:text-2xl font-black text-blue-700">
                        {selectedArticleSummary.totalIn.toLocaleString()} Pairs
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="rounded-xl border border-purple-200 bg-purple-50/70 p-3 sm:p-4">
                      <span className="text-xs font-bold uppercase tracking-wider text-purple-800">Total Delivered</span>
                      <div className="mt-1 font-mono text-xl sm:text-2xl font-black text-purple-700">
                        {selectedArticleSummary.totalOut.toLocaleString()} Pairs
                      </div>
                    </div>
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-3 sm:p-4">
                      <span className="text-xs font-bold uppercase tracking-wider text-emerald-800">Available Balance</span>
                      <div className="mt-1 font-mono text-xl sm:text-2xl font-black text-emerald-700">
                        {selectedArticleSummary.availableStock.toLocaleString()} Pairs
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Modal Body / Table */}
            <div className="flex-1 overflow-y-auto p-5">
              {modalTab === 'IN' ? (
                /* REQUIREMENT 2 Table 1: Stock Receive History - Columns: DATE | TIME | SOURCE | QUANTITY RECEIVED | ACTIONS */
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">
                      Stock Receive History ({selectedArticleInHistory.length} Records)
                    </h3>
                  </div>

                  <div className="overflow-x-auto rounded-xl border border-slate-200">
                    <table className="w-full min-w-[650px] text-left text-xs">
                      <thead className="border-b border-slate-200 bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-600">
                        <tr>
                          <th className="px-4 py-3">Date</th>
                          <th className="px-4 py-3">Time</th>
                          <th className="px-4 py-3">Source (Where it came from)</th>
                          <th className="px-4 py-3 text-right">Quantity Received</th>
                          <th className="px-4 py-3 text-center">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                        {selectedArticleInHistory.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="py-8 text-center text-slate-400">
                              No cutting receipts found for this article. Receive cutting from Cutting Master to log stock.
                            </td>
                          </tr>
                        ) : (
                          selectedArticleInHistory.map((item) => (
                            <tr key={item.id} className="hover:bg-slate-50/80 transition-colors">
                              <td className="px-4 py-3 font-semibold text-slate-800 font-mono">
                                {formatDate(item.date)}
                              </td>
                              <td className="px-4 py-3 text-slate-500 font-mono">
                                {item.time || '—'}
                              </td>
                              <td className="px-4 py-3">
                                <span className="rounded-md bg-amber-50 border border-amber-200 px-2 py-0.5 font-bold text-amber-800">
                                  {item.source}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-right font-mono font-black text-emerald-700">
                                {item.quantity.toLocaleString()} pairs
                              </td>
                              <td className="px-4 py-3 text-center">
                                <div className="flex items-center justify-center gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditingInItem(item);
                                      setEditInQty(String(item.quantity));
                                      setEditInDate(item.date);
                                    }}
                                    className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition"
                                    title="Edit Entry"
                                  >
                                    <Pencil className="h-3.5 w-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setDeletingItem({ type: 'IN', id: item.id, label: `${item.source} (${item.quantity} pairs)` })}
                                    className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition"
                                    title="Delete Entry"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                /* REQUIREMENT 3: Stock OUT / Delivery History - Columns: DATE | ORDER NAME / JOB | QUANTITY DELIVERED | DESTINATION | ACTIONS */
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">
                      Stock OUT / Delivery History ({selectedArticleOutHistory.length} Records)
                    </h3>
                  </div>

                  <div className="overflow-x-auto rounded-xl border border-slate-200">
                    <table className="w-full min-w-[650px] text-left text-xs">
                      <thead className="border-b border-slate-200 bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-600">
                        <tr>
                          <th className="px-4 py-3">Date</th>
                          <th className="px-4 py-3">Order Name / Job</th>
                          <th className="px-4 py-3 text-right">Quantity Delivered</th>
                          <th className="px-4 py-3">Destination</th>
                          <th className="px-4 py-3 text-center">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                        {selectedArticleOutHistory.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="py-8 text-center text-slate-400">
                              No delivery or dispatched orders recorded for this article yet.
                            </td>
                          </tr>
                        ) : (
                          selectedArticleOutHistory.map((item) => (
                            <tr key={item.id} className="hover:bg-slate-50/80 transition-colors">
                              <td className="px-4 py-3 font-semibold text-slate-800 font-mono">
                                {formatDate(item.date)}
                              </td>
                              <td className="px-4 py-3 font-bold text-slate-900">
                                {item.orderName}
                              </td>
                              <td className="px-4 py-3 text-right font-mono font-black text-purple-700">
                                {item.quantity.toLocaleString()} pairs
                              </td>
                              <td className="px-4 py-3 text-slate-600">
                                <span className="rounded-md bg-purple-50 border border-purple-200 px-2 py-0.5 font-bold text-purple-800">
                                  {item.destination}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-center">
                                <div className="flex items-center justify-center gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditingOutItem(item);
                                      setEditOutQty(String(item.quantity));
                                      setEditOutDate(item.date);
                                      setEditOutCustomer(item.customerName || '');
                                    }}
                                    className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition"
                                    title="Edit Delivery"
                                  >
                                    <Pencil className="h-3.5 w-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setDeletingItem({ type: 'OUT', id: item.id, label: `${item.orderName} (${item.quantity} pairs)` })}
                                    className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition"
                                    title="Delete Delivery"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="border-t border-slate-200 bg-slate-50 p-4 flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedArticleName(null)}
                className="rounded-xl border border-slate-300 bg-white px-5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100 transition"
              >
                Close Detail
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Stock IN Entry Modal */}
      {editingInItem && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl">
            <h3 className="text-base font-bold text-slate-900">Edit Stock In Receipt</h3>
            <p className="mt-1 text-xs text-slate-500">{editingInItem.source}</p>
            <form onSubmit={handleSaveInEdit} className="mt-4 space-y-3">
              <div>
                <label className="text-xs font-bold text-slate-700">Date</label>
                <input
                  type="date"
                  value={editInDate}
                  onChange={e => setEditInDate(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-300 p-2 text-xs"
                  required
                />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-700">Quantity (Pairs Received)</label>
                <input
                  type="number"
                  min="1"
                  value={editInQty}
                  onChange={e => setEditInQty(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-300 p-2 text-xs"
                  required
                />
              </div>
              <div className="mt-5 flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingInItem(null)}
                  className="rounded-xl px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingInEdit}
                  className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {isSavingInEdit ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Stock OUT Delivery Modal */}
      {editingOutItem && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl">
            <h3 className="text-base font-bold text-slate-900">Edit Stock Delivery</h3>
            <p className="mt-1 text-xs text-slate-500">{editingOutItem.orderName}</p>
            <form onSubmit={handleSaveOutEdit} className="mt-4 space-y-3">
              <div>
                <label className="text-xs font-bold text-slate-700">Date</label>
                <input
                  type="date"
                  value={editOutDate}
                  onChange={e => setEditOutDate(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-300 p-2 text-xs"
                  required
                />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-700">Customer / Party Name</label>
                <input
                  type="text"
                  value={editOutCustomer}
                  onChange={e => setEditOutCustomer(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-300 p-2 text-xs"
                  required
                />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-700">Quantity (Pairs Delivered)</label>
                <input
                  type="number"
                  min="1"
                  value={editOutQty}
                  onChange={e => setEditOutQty(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-300 p-2 text-xs"
                  required
                />
              </div>
              <div className="mt-5 flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingOutItem(null)}
                  className="rounded-xl px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingOutEdit}
                  className="rounded-xl bg-purple-600 px-4 py-2 text-xs font-bold text-white hover:bg-purple-700 disabled:opacity-50"
                >
                  {isSavingOutEdit ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deletingItem && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl">
            <div className="flex items-center gap-2 text-rose-600">
              <AlertCircle className="h-5 w-5" />
              <h3 className="text-base font-bold">Delete History Record?</h3>
            </div>
            <p className="mt-2 text-xs text-slate-600">
              Are you sure you want to remove <span className="font-semibold text-slate-800">{deletingItem.label}</span>?
              This will automatically update the calculated available balance.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeletingItem(null)}
                className="rounded-xl px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={handleConfirmDelete}
                className="rounded-xl bg-rose-600 px-4 py-2 text-xs font-bold text-white hover:bg-rose-700 disabled:opacity-50"
              >
                {isDeleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
