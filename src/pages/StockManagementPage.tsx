import React, { useMemo, useState, useEffect } from 'react';
import { ArrowDownToLine, Boxes, CalendarDays, History, PackageCheck, Pencil, Trash2, X } from 'lucide-react';
import { useFactory } from '../context/FactoryContext';
import { ArticleStockItem, DeliveryHistoryEntry, FactoryStockItem } from '../types/factory';
import { formatDate } from '../utils/factoryFormatters';
import { collection, db, onSnapshot } from '../firebase';

type StockDateFilter = 'All Time' | 'Today' | 'Last 7 Days' | 'Last 30 Days' | 'This Month' | 'Last Month' | 'Others';

const stockDateKey = (date: Date): string =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

const getStockDateRange = (filter: StockDateFilter, fromDate: string, toDate: string): { from: string; to: string } | null => {
  const today = new Date();
  const todayKey = stockDateKey(today);
  if (filter === 'All Time') return null;
  if (filter === 'Today') return { from: todayKey, to: todayKey };
  if (filter === 'Others') return { from: fromDate, to: toDate };
  if (filter === 'This Month') return { from: stockDateKey(new Date(today.getFullYear(), today.getMonth(), 1)), to: todayKey };
  if (filter === 'Last Month') {
    return {
      from: stockDateKey(new Date(today.getFullYear(), today.getMonth() - 1, 1)),
      to: stockDateKey(new Date(today.getFullYear(), today.getMonth(), 0))
    };
  }
  const days = filter === 'Last 7 Days' ? 7 : 30;
  return {
    from: stockDateKey(new Date(today.getFullYear(), today.getMonth(), today.getDate() - days + 1)),
    to: todayKey
  };
};

const isInStockDateRange = (date: string, range: { from: string; to: string } | null): boolean =>
  !range || (!!(range.from || range.to) && (!range.from || date >= range.from) && (!range.to || date <= range.to));

export const StockManagementPage: React.FC = () => {
  const { stockManagement, articleStock, deliveryHistory, orders, parties, deliverFromStock, deleteFactoryStock, updateStockDelivery, deleteStockDelivery, showToast } = useFactory();
  const [selectedStock, setSelectedStock] = useState<FactoryStockItem | null>(null);
  const [selectedArticleStockId, setSelectedArticleStockId] = useState<string | null>(null);
  const selectedArticleStock = articleStock.find(item => item.id === selectedArticleStockId) || null;
  const [orderId, setOrderId] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [quantity, setQuantity] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [customerCollectionNames, setCustomerCollectionNames] = useState<string[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<{ type: 'stock'; item: FactoryStockItem } | { type: 'delivery'; item: DeliveryHistoryEntry } | null>(null);
  const [deliveryToEdit, setDeliveryToEdit] = useState<DeliveryHistoryEntry | null>(null);
  const [deliveryEditForm, setDeliveryEditForm] = useState({ date: '', quantity: '', customerName: '' });
  const [isSavingDeliveryEdit, setIsSavingDeliveryEdit] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [dateFilter, setDateFilter] = useState<StockDateFilter>('All Time');
  const [filterFromDate, setFilterFromDate] = useState('');
  const [filterToDate, setFilterToDate] = useState('');

  const stockDateRange = getStockDateRange(dateFilter, filterFromDate, filterToDate);
  const filteredDeliveryHistory = deliveryHistory.filter(entry =>
    isInStockDateRange(entry.date || entry.deliveryDate || '', stockDateRange)
  );

  const getArticleSummary = (item: ArticleStockItem) => {
    if (!stockDateRange) {
      return {
        totalReceived: item.totalReceived,
        totalDelivered: item.totalDelivered,
        totalAvailable: item.totalAvailable
      };
    }
    const totalReceived = item.cuttingHistory
      .filter(entry => isInStockDateRange(entry.date || '', stockDateRange))
      .reduce((sum, entry) => sum + (Number(entry.pairs) || 0), 0);
    const totalDelivered = item.deliveryHistory
      .filter(entry => isInStockDateRange(entry.date || '', stockDateRange))
      .reduce((sum, entry) => sum + (Number(entry.pairs) || 0), 0);
    return { totalReceived, totalDelivered, totalAvailable: totalReceived - totalDelivered };
  };

  const selectedArticleSummary = selectedArticleStock ? getArticleSummary(selectedArticleStock) : null;
  const selectedArticleCuttingHistory = selectedArticleStock?.cuttingHistory
    .filter(entry => isInStockDateRange(entry.date || '', stockDateRange)) || [];
  const selectedArticleDeliveryHistory = selectedArticleStock?.deliveryHistory
    .filter(entry => isInStockDateRange(entry.date || '', stockDateRange)) || [];
  const selectedArticleOrders = selectedArticleStock
    ? orders.filter(order => isInStockDateRange(order.orderDate || '', stockDateRange))
      .reduce((sum, order) => sum + order.items
      .filter(item => (item.article || item.title || item.gloveType || '').trim().toLocaleLowerCase() === selectedArticleStock.articleName.trim().toLocaleLowerCase())
      .reduce((itemSum, item) => itemSum + (Number(item.originalQty) || Number(item.totalPairs) || Number(item.qty) || 0), 0), 0)
    : 0;
  const selectedArticleDeliveredToOrders = selectedArticleStock
    ? deliveryHistory
      .filter(entry =>
        entry.article.trim().toLocaleLowerCase() === selectedArticleStock.articleName.trim().toLocaleLowerCase() &&
        isInStockDateRange(entry.date || entry.deliveryDate || '', stockDateRange)
      )
      .reduce((sum, entry) => sum + (Number(entry.quantity) || 0), 0)
    : 0;
  const selectedArticlePendingOrders = Math.max(0, selectedArticleOrders - selectedArticleDeliveredToOrders);
  const selectedArticleSizeStocks = selectedArticleStock
    ? stockManagement.filter(item =>
      item.article.trim().toLocaleLowerCase() === selectedArticleStock.articleName.trim().toLocaleLowerCase()
    )
    : [];
  const selectedArticleStockRate = selectedArticleSizeStocks.reduce((sum, item) =>
    sum + Math.max(0, item.balance) * (Number(item.rate) || 0), 0) /
    (selectedArticleSizeStocks.reduce((sum, item) => sum + Math.max(0, item.balance), 0) || 1);
  const selectedArticleStockValue = Math.max(0, selectedArticleSummary?.totalAvailable || 0) * selectedArticleStockRate;

  const customerNames = useMemo(() => [...new Set([
    ...customerCollectionNames,
    ...orders.map(order => order.customerName),
    ...parties.filter(party => party.type === 'customer' || party.type === 'buyer').map(party => party.name)
  ].filter(Boolean))].sort((a, b) => a.localeCompare(b)), [customerCollectionNames, orders, parties]);

  useEffect(() => {
    if (!db) return;
    return onSnapshot(collection(db, 'customers'), snapshot => {
      setCustomerCollectionNames(snapshot.docs
        .map(customer => String(customer.data().name || customer.data().customerName || ''))
        .filter(Boolean));
    }, error => console.error('Unable to load stock delivery customers:', error));
  }, []);

  const openDelivery = (stock: FactoryStockItem) => {
    const firstOrder = orders[0];
    setSelectedStock(stock);
    setOrderId(firstOrder?.id || '');
    setCustomerName(firstOrder?.customerName || '');
    setDate(new Date().toISOString().slice(0, 10));
    setQuantity('');
  };

  const handleDeleteStock = async (stock: FactoryStockItem) => {
    setDeleteTarget({ type: 'stock', item: stock });
  };

  const handleEditDelivery = (delivery: DeliveryHistoryEntry) => {
    setDeliveryToEdit(delivery);
    setDeliveryEditForm({
      date: delivery.date || delivery.deliveryDate || '',
      quantity: String(delivery.quantity),
      customerName: delivery.customerName || delivery.partyName || ''
    });
  };

  const handleSaveDeliveryEdit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!deliveryToEdit) return;
    const parsedQuantity = Number(deliveryEditForm.quantity);
    if (!deliveryEditForm.date || !deliveryEditForm.customerName.trim() || !Number.isFinite(parsedQuantity) || parsedQuantity <= 0) {
      showToast('Enter a valid delivery quantity, date, and party.', 'error');
      return;
    }
    setIsSavingDeliveryEdit(true);
    try {
      await updateStockDelivery(deliveryToEdit.id, {
        date: deliveryEditForm.date,
        quantity: parsedQuantity,
        customerName: deliveryEditForm.customerName.trim()
      });
      setDeliveryToEdit(null);
      showToast('Delivery updated and balances recalculated.');
    } catch (error) {
      console.error('Unable to update delivery:', error);
      showToast(error instanceof Error ? error.message : 'Delivery could not be updated.', 'error');
    } finally {
      setIsSavingDeliveryEdit(false);
    }
  };

  const handleDeleteDelivery = async (delivery: DeliveryHistoryEntry) => {
    setDeleteTarget({ type: 'delivery', item: delivery });
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      if (deleteTarget.type === 'stock') {
        await deleteFactoryStock(deleteTarget.item.id);
        showToast('Stock and linked history deleted; order cutting totals recalculated.');
      } else {
        await deleteStockDelivery(deleteTarget.item.id);
        showToast('Delivery deleted and stock/order balances restored.');
      }
      setDeleteTarget(null);
    } catch (error) {
      console.error('Unable to delete stock record:', error);
      showToast(error instanceof Error ? error.message : 'The record could not be deleted.', 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleSaveDelivery = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedStock || !orderId || !customerName.trim() || !date) {
      showToast('Select an order and customer, and enter a delivery date.', 'error');
      return;
    }
    const parsedQuantity = Number(quantity);
    if (!Number.isFinite(parsedQuantity) || parsedQuantity <= 0) {
      showToast('Enter a valid delivery quantity.', 'error');
      return;
    }
    setIsSaving(true);
    try {
      await deliverFromStock({
        stockId: selectedStock.id,
        orderId,
        customerName: customerName.trim(),
        quantity: parsedQuantity,
        date
      });
      setSelectedStock(null);
    } catch (error) {
      console.error('Unable to deliver stock:', error);
      showToast(error instanceof Error ? error.message : 'The delivery could not be saved.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="mb-1 flex items-center gap-2 text-blue-700">
            <Boxes className="h-5 w-5" />
            <span className="text-xs font-black uppercase tracking-wider">Cutting Management</span>
          </div>
          <h1 className="text-2xl font-black text-slate-900">Stock Management</h1>
          <p className="mt-1 text-sm text-slate-500">Cutting receipts, deliveries, and available stock by article and size.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700">
            <CalendarDays className="h-4 w-4 text-slate-500" />
            <span>Filter</span>
            <select value={dateFilter} onChange={event => setDateFilter(event.target.value as StockDateFilter)} className="bg-transparent text-sm outline-none">
              {['All Time', 'Today', 'Last 7 Days', 'Last 30 Days', 'This Month', 'Last Month', 'Others'].map(filter => <option key={filter} value={filter}>{filter}</option>)}
            </select>
          </label>
          {dateFilter === 'Others' && (
            <>
              <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">
                From <input type="date" value={filterFromDate} onChange={event => setFilterFromDate(event.target.value)} className="rounded-lg border border-slate-300 px-2 py-2 text-sm" />
              </label>
              <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">
                To <input type="date" value={filterToDate} onChange={event => setFilterToDate(event.target.value)} className="rounded-lg border border-slate-300 px-2 py-2 text-sm" />
              </label>
            </>
          )}
          <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm font-bold text-blue-800">
            {articleStock.reduce((sum, item) => sum + Math.max(0, getArticleSummary(item).totalAvailable), 0).toLocaleString()} pairs available
          </div>
        </div>
      </header>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-4 py-4 sm:px-5">
          <h2 className="font-bold text-slate-900">Article Stock</h2>
          <p className="mt-1 text-xs text-slate-500">Article totals update automatically from every cutting receipt and stock delivery.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-slate-100 text-[11px] uppercase tracking-wide text-slate-600">
              <tr>
                <th className="px-4 py-3">Article Name</th>
                <th className="px-4 py-3 text-right">Total Available Stock</th>
                <th className="px-4 py-3 text-right">Total Received</th>
                <th className="px-4 py-3 text-right">Total Delivered</th>
                <th className="px-4 py-3 text-right">Remaining</th>
                <th className="px-4 py-3 text-right">History</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {articleStock.map(item => {
                const summary = getArticleSummary(item);
                return (
                <tr key={item.id} onClick={() => setSelectedArticleStockId(item.id)} className="cursor-pointer hover:bg-slate-50">
                  <td className="px-4 py-3 font-bold text-slate-900">{item.articleName}</td>
                  <td className="px-4 py-3 text-right font-mono">{summary.totalAvailable.toLocaleString()}</td>
                  <td className="px-4 py-3 text-right font-mono">{summary.totalReceived.toLocaleString()}</td>
                  <td className="px-4 py-3 text-right font-mono">{summary.totalDelivered.toLocaleString()}</td>
                  <td className="px-4 py-3 text-right font-mono font-bold text-emerald-700">{summary.totalAvailable.toLocaleString()}</td>
                  <td className="px-4 py-3 text-right">
                    <button type="button" onClick={event => { event.stopPropagation(); setSelectedArticleStockId(item.id); }} className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 px-3 py-2 text-xs font-bold text-blue-700 hover:bg-blue-50">
                      <History className="h-3.5 w-3.5" /> View
                    </button>
                  </td>
                </tr>
                );
              })}
              {articleStock.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-slate-500">No article cutting receipts recorded yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-4 py-4 sm:px-5">
          <h2 className="font-bold text-slate-900">Size-level Stock</h2>
          <p className="mt-1 text-xs text-slate-500">Receipts are linked to cutting entries; deliveries update size stock and the selected customer order atomically.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-slate-100 text-[11px] uppercase tracking-wide text-slate-600">
              <tr>
                <th className="px-4 py-3">Article</th>
                <th className="px-4 py-3">Size</th>
                <th className="px-4 py-3 text-right">Total Cutting</th>
                <th className="px-4 py-3 text-right">Total Delivered</th>
                <th className="px-4 py-3 text-right">Balance Stock</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {stockManagement.map(item => (
                <tr key={item.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-bold text-slate-900">{item.article}</td>
                  <td className="px-4 py-3 text-slate-600">{item.size || '-'}</td>
                  <td className="px-4 py-3 text-right font-mono">{item.totalCuttingReceived.toLocaleString()}</td>
                  <td className="px-4 py-3 text-right font-mono">{item.totalDelivered.toLocaleString()}</td>
                  <td className={`px-4 py-3 text-right font-mono font-bold ${item.balance > 0 ? 'text-emerald-700' : 'text-slate-500'}`}>
                    {item.balance.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <button type="button" onClick={() => void handleDeleteStock(item)} className="rounded-lg p-2 text-rose-700 hover:bg-rose-50" aria-label="Delete stock" title="Delete stock">
                        <Trash2 className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => openDelivery(item)}
                        disabled={item.balance <= 0 || orders.length === 0}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-xs font-bold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                      >
                        <ArrowDownToLine className="h-3.5 w-3.5" /> Deliver
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {stockManagement.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-12 text-center text-sm text-slate-500">No cutting stock received yet. Receive a cutting entry with “Add to Stock” enabled to start.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-4 sm:px-5">
          <PackageCheck className="h-4 w-4 text-emerald-700" />
          <h2 className="font-bold text-slate-900">Recent Deliveries</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] text-left text-sm">
            <thead className="bg-slate-100 text-[11px] uppercase tracking-wide text-slate-600">
              <tr>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Order</th>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Article / Size</th>
                <th className="px-4 py-3 text-right">Quantity</th>
                <th className="px-4 py-3 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredDeliveryHistory.slice(0, 20).map(entry => (
                <tr key={entry.id}>
                  <td className="px-4 py-3 text-slate-600">{formatDate(entry.date || entry.deliveryDate || '')}</td>
                  <td className="px-4 py-3 font-mono text-slate-700">{entry.orderNo || '-'}</td>
                  <td className="px-4 py-3 font-semibold">{entry.customerName || entry.partyName || '-'}</td>
                  <td className="px-4 py-3">{entry.article} / {entry.size}</td>
                  <td className="px-4 py-3 text-right font-mono font-bold">{entry.quantity.toLocaleString()}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-center gap-1">
                      <button type="button" onClick={() => handleEditDelivery(entry)} className="rounded-lg p-2 text-blue-700 hover:bg-blue-50" aria-label="Edit delivery" title="Edit delivery">
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button type="button" onClick={() => void handleDeleteDelivery(entry)} className="rounded-lg p-2 text-rose-700 hover:bg-rose-50" aria-label="Delete delivery" title="Delete delivery">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredDeliveryHistory.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-slate-500">No stock deliveries recorded in this date range.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {selectedArticleStock && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/60 p-3 sm:p-4">
          <div role="dialog" aria-modal="true" aria-labelledby="article-stock-history-title" className="max-h-[90vh] w-full max-w-5xl overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between bg-blue-700 px-5 py-4 text-white">
              <div>
                <h2 id="article-stock-history-title" className="font-black">{selectedArticleStock.articleName} - Available in {dateFilter}: {selectedArticleSummary?.totalAvailable.toLocaleString()} pairs</h2>
                <p className="mt-1 text-xs text-blue-100">Total Received: {selectedArticleSummary?.totalReceived.toLocaleString()} · Total Delivered: {selectedArticleSummary?.totalDelivered.toLocaleString()}</p>
              </div>
              <button type="button" onClick={() => setSelectedArticleStockId(null)} className="rounded-lg p-1.5 hover:bg-white/15" aria-label="Close article stock history"><X className="h-5 w-5" /></button>
            </div>
            <div className="max-h-[calc(90vh-76px)] space-y-6 overflow-y-auto p-4 sm:p-5">
              <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-xl border border-blue-100 bg-blue-50 p-3">
                  <p className="text-[11px] font-bold uppercase text-blue-700">Total Cutting Received</p>
                  <p className="mt-1 text-xl font-black text-blue-900">{selectedArticleSummary?.totalReceived.toLocaleString()}</p>
                </div>
                <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-3">
                  <p className="text-[11px] font-bold uppercase text-emerald-700">Total Delivered</p>
                  <p className="mt-1 text-xl font-black text-emerald-900">{selectedArticleSummary?.totalDelivered.toLocaleString()}</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-[11px] font-bold uppercase text-slate-600">Available in Range</p>
                  <p className="mt-1 text-xl font-black text-slate-900">{selectedArticleSummary?.totalAvailable.toLocaleString()}</p>
                </div>
                <div className="rounded-xl border border-amber-100 bg-amber-50 p-3">
                  <p className="text-[11px] font-bold uppercase text-amber-700">Pending Orders / Stock Value</p>
                  <p className="mt-1 text-sm font-black text-amber-900">{selectedArticlePendingOrders.toLocaleString()} pairs · Rs. {selectedArticleStockValue.toLocaleString()}</p>
                </div>
              </section>
              <section>
                <h3 className="mb-3 font-bold text-slate-900">Deliver to Order</h3>
                <div className="overflow-x-auto rounded-xl border border-slate-200">
                  <table className="w-full min-w-[560px] text-left text-sm">
                    <thead className="bg-slate-100 text-xs uppercase text-slate-600">
                      <tr><th className="px-3 py-2.5">Size</th><th className="px-3 py-2.5 text-right">Available</th><th className="px-3 py-2.5 text-right">Action</th></tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {selectedArticleSizeStocks.map(item => (
                        <tr key={item.id}>
                          <td className="px-3 py-2.5 font-semibold">{item.size || '-'}</td>
                          <td className="px-3 py-2.5 text-right font-mono">{item.balance.toLocaleString()}</td>
                          <td className="px-3 py-2.5 text-right">
                            <button
                              type="button"
                              onClick={() => openDelivery(item)}
                              disabled={item.balance <= 0 || orders.length === 0}
                              className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-bold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                            >
                              Deliver to Order
                            </button>
                          </td>
                        </tr>
                      ))}
                      {selectedArticleSizeStocks.length === 0 && (
                        <tr><td colSpan={3} className="px-3 py-6 text-center text-slate-500">No size-level stock is available for this article.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
              <section>
                <h3 className="mb-3 font-bold text-slate-900">Cutting Receive History</h3>
                <div className="overflow-x-auto rounded-xl border border-slate-200">
                  <table className="w-full min-w-[600px] text-left text-sm">
                    <thead className="bg-slate-100 text-xs uppercase text-slate-600">
                      <tr><th className="px-3 py-2.5">Date</th><th className="px-3 py-2.5">Source</th><th className="px-3 py-2.5 text-right">Pairs Received</th><th className="px-3 py-2.5 text-right">Total After</th></tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {[...selectedArticleCuttingHistory]
                        .sort((a, b) => a.date.localeCompare(b.date) || a.receiveId.localeCompare(b.receiveId))
                        .reduce<Array<ArticleStockItem['cuttingHistory'][number] & { totalAfter: number }>>((rows, entry) => {
                          const totalAfter = (rows[rows.length - 1]?.totalAfter || 0) + entry.pairs;
                          rows.push({ ...entry, totalAfter });
                          return rows;
                        }, [])
                        .reverse()
                        .map((entry, index) => (
                          <tr key={`${entry.receiveId}-${index}`}>
                            <td className="px-3 py-2.5">{formatDate(entry.date)}</td><td className="px-3 py-2.5">{entry.source || 'Nasim Cutting'}</td>
                            <td className="px-3 py-2.5 text-right font-mono">{entry.pairs.toLocaleString()}</td><td className="px-3 py-2.5 text-right font-mono font-bold">{entry.totalAfter.toLocaleString()}</td>
                          </tr>
                        ))}
                      {selectedArticleCuttingHistory.length === 0 && <tr><td colSpan={4} className="px-3 py-6 text-center text-slate-500">No cutting receipts in this date range.</td></tr>}
                    </tbody>
                  </table>
                </div>
              </section>
              <section>
                <h3 className="mb-3 font-bold text-slate-900">Delivery History</h3>
                <div className="overflow-x-auto rounded-xl border border-slate-200">
                  <table className="w-full min-w-[760px] text-left text-sm">
                    <thead className="bg-slate-100 text-xs uppercase text-slate-600">
                      <tr><th className="px-3 py-2.5">Date</th><th className="px-3 py-2.5">Order No</th><th className="px-3 py-2.5">Party / Customer Name</th><th className="px-3 py-2.5 text-right">Pairs Delivered</th><th className="px-3 py-2.5 text-right">Remaining Stock</th></tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {[...selectedArticleDeliveryHistory].sort((a, b) => b.date.localeCompare(a.date)).map((entry, index) => (
                        <tr key={entry.deliveryId || `${entry.date}-${index}`}>
                          <td className="px-3 py-2.5">{formatDate(entry.date)}</td><td className="px-3 py-2.5">{entry.orderNo || '-'}</td><td className="px-3 py-2.5">{entry.customerName || '-'}</td>
                          <td className="px-3 py-2.5 text-right font-mono">{entry.pairs.toLocaleString()}</td><td className="px-3 py-2.5 text-right font-mono font-bold">{entry.remainingAfter.toLocaleString()}</td>
                        </tr>
                      ))}
                      {selectedArticleDeliveryHistory.length === 0 && <tr><td colSpan={5} className="px-3 py-6 text-center text-slate-500">No deliveries in this date range.</td></tr>}
                    </tbody>
                  </table>
                </div>
              </section>
              <footer className="rounded-xl bg-slate-100 px-4 py-3 text-right text-sm font-black text-slate-800">
                Range Total = {selectedArticleSummary?.totalReceived.toLocaleString()} - {selectedArticleSummary?.totalDelivered.toLocaleString()} = {selectedArticleSummary?.totalAvailable.toLocaleString()} pairs
              </footer>
            </div>
          </div>
        </div>
      )}

      {selectedStock && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/60 p-4">
          <div role="dialog" aria-modal="true" aria-labelledby="stock-delivery-title" className="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between bg-blue-700 px-5 py-4 text-white">
              <div>
                <h2 id="stock-delivery-title" className="font-black">Deliver from Stock</h2>
                <p className="mt-0.5 text-xs text-blue-100">{selectedStock.article} / {selectedStock.size} · Available {selectedStock.balance}</p>
              </div>
              <button type="button" onClick={() => setSelectedStock(null)} className="rounded-lg p-1.5 hover:bg-white/15" aria-label="Close delivery modal">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleSaveDelivery} className="space-y-4 p-5">
              <label className="block">
                <span className="mb-1 block text-xs font-bold text-slate-700">Kis Order Ke Against Dena Hai *</span>
                <select
                  required
                  value={orderId}
                  onChange={event => {
                    const selectedOrder = orders.find(order => order.id === event.target.value);
                    setOrderId(event.target.value);
                    setCustomerName(selectedOrder?.customerName || '');
                  }}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm"
                >
                  <option value="">Select customer order</option>
                  {orders.map(order => <option key={order.id} value={order.id}>#{order.orderNo} · {order.customerName}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-bold text-slate-700">Kis Party Ko Dena Hai *</span>
                <select required value={customerName} onChange={event => setCustomerName(event.target.value)} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm">
                  <option value="">Select customer</option>
                  {customerNames.map(name => <option key={name} value={name}>{name}</option>)}
                  {customerName && !customerNames.includes(customerName) && <option value={customerName}>{customerName}</option>}
                </select>
              </label>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1 block text-xs font-bold text-slate-700">Delivery Quantity *</span>
                  <input
                    required
                    type="number"
                    min="1"
                    max={selectedStock.balance}
                    value={quantity}
                    onChange={event => {
                      const nextQuantity = event.target.value;
                      setQuantity(nextQuantity);
                      event.target.setCustomValidity(Number(nextQuantity) > selectedStock.balance ? 'Stock se zyada deliver nahi kar sakti' : '');
                    }}
                    onInvalid={event => {
                      if (Number(quantity) > selectedStock.balance) event.currentTarget.setCustomValidity('Stock se zyada deliver nahi kar sakti');
                    }}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-bold text-slate-700">Delivery Date *</span>
                  <span className="relative block">
                    <CalendarDays className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" />
                    <input required type="date" value={date} onChange={event => setDate(event.target.value)} className="w-full rounded-lg border border-slate-300 py-2.5 pl-9 pr-3 text-sm" />
                  </span>
                </label>
              </div>
              <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
                <button type="button" onClick={() => setSelectedStock(null)} disabled={isSaving} className="rounded-lg px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-100">Cancel</button>
                <button type="submit" disabled={isSaving} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-60">{isSaving ? 'Saving…' : 'Save Delivery'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
      {deliveryToEdit && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/60 p-4">
          <form onSubmit={handleSaveDeliveryEdit} className="w-full max-w-md space-y-4 rounded-2xl bg-white p-5 shadow-2xl">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-black text-slate-900">Edit Delivery</h2>
                <p className="mt-1 text-xs text-slate-500">{deliveryToEdit.article} / {deliveryToEdit.size}</p>
              </div>
              <button type="button" onClick={() => setDeliveryToEdit(null)} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100" aria-label="Close delivery form"><X className="h-5 w-5" /></button>
            </div>
            <label className="block text-xs font-bold text-slate-700">
              Party / Customer *
              <select required value={deliveryEditForm.customerName} onChange={event => setDeliveryEditForm(form => ({ ...form, customerName: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm font-normal">
                <option value="">Select customer</option>
                {customerNames.map(name => <option key={name} value={name}>{name}</option>)}
              </select>
            </label>
            <label className="block text-xs font-bold text-slate-700">
              Quantity *
              <input required min="1" type="number" value={deliveryEditForm.quantity} onChange={event => setDeliveryEditForm(form => ({ ...form, quantity: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm font-normal" />
            </label>
            <label className="block text-xs font-bold text-slate-700">
              Delivery Date *
              <input required type="date" value={deliveryEditForm.date} onChange={event => setDeliveryEditForm(form => ({ ...form, date: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm font-normal" />
            </label>
            <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
              <button type="button" onClick={() => setDeliveryToEdit(null)} disabled={isSavingDeliveryEdit} className="rounded-lg px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-100">Cancel</button>
              <button type="submit" disabled={isSavingDeliveryEdit} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-60">{isSavingDeliveryEdit ? 'Saving…' : 'Save Delivery'}</button>
            </div>
          </form>
        </div>
      )}
      {deleteTarget && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/60 p-4">
          <div role="dialog" aria-modal="true" aria-labelledby="stock-delete-title" className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl">
            <h2 id="stock-delete-title" className="text-lg font-black text-slate-900">
              {deleteTarget.type === 'stock' ? 'Delete Stock and Linked History?' : 'Delete Delivery?'}
            </h2>
            <p className="mt-3 text-sm text-slate-600">
              {deleteTarget.type === 'stock'
                ? `Are you sure? This will delete ${deleteTarget.item.article} / ${deleteTarget.item.size} and its linked cutting and delivery history.`
                : `Are you sure? Deleting this delivery restores ${deleteTarget.item.quantity} pairs to its linked stock and order.`}
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setDeleteTarget(null)} disabled={isDeleting} className="rounded-lg px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-100">Cancel</button>
              <button type="button" onClick={() => void handleConfirmDelete()} disabled={isDeleting} className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-bold text-white hover:bg-rose-700 disabled:opacity-60">{isDeleting ? 'Deleting…' : 'Delete'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
