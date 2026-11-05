import React, { useState, useMemo, useEffect } from 'react';
import { 
  Boxes, 
  Search, 
  ArrowDownLeft, 
  ArrowUpRight, 
  ArrowLeft,
  X, 
  Pencil, 
  Trash2, 
  Plus,
  RotateCcw,
  CheckCircle2,
  Calendar, 
  Clock, 
  User, 
  FileText,
  AlertCircle,
  Loader2,
  Truck
} from 'lucide-react';
import { useFactory } from '../../context/FactoryContext';
import { DistinctArticleStock, StockInHistoryItem, StockOutHistoryItem } from '../../types/factory';
import { formatCurrency, formatDate, safeStringCompare } from '../../utils/factoryFormatters';

export const StockManagement: React.FC = () => {
  const { 
    orders = [],
    stockManagement = [],
    getDistinctArticles, 
    getStockInHistory, 
    getStockOutHistory,
    addStockReceipt,
    deliverFromStock,
    updateCuttingEntry,
    deleteCuttingEntry,
    updateCuttingReturn,
    deleteCuttingReturn,
    updateStockDelivery,
    deleteStockDelivery,
    showToast 
  } = useFactory();

  // Active Tab in Directory: Stock IN Report vs Stock OUT Report
  const [activeTab, setActiveTab] = useState<'IN' | 'OUT'>('IN');

  // Search query for article directory
  const [searchQuery, setSearchQuery] = useState('');

  // Selected article for FULL PAGE navigation (like NAEM Ledger)
  const [selectedArticleName, setSelectedArticleName] = useState<string | null>(null);

  // History filter on article full page: ALL | IN | OUT
  const [historyFilter, setHistoryFilter] = useState<'ALL' | 'IN' | 'OUT'>('ALL');

  // Action modals on the article full page
  const [isInModalOpen, setIsInModalOpen] = useState(false);
  const [inFormDate, setInFormDate] = useState(new Date().toISOString().slice(0, 10));
  const [inFormSize, setInFormSize] = useState('Standard');
  const [inFormSource, setInFormSource] = useState('Cutting Master (Manik)');
  const [inFormQty, setInFormQty] = useState('');
  const [inFormRate, setInFormRate] = useState('');
  const [inFormBillNo, setInFormBillNo] = useState('');
  const [isSavingIn, setIsSavingIn] = useState(false);

  const [isOutModalOpen, setIsOutModalOpen] = useState(false);
  const [outFormDate, setOutFormDate] = useState(new Date().toISOString().slice(0, 10));
  const [outFormCustomer, setOutFormCustomer] = useState('');
  const [outFormQty, setOutFormQty] = useState('');
  const [outFormOrderId, setOutFormOrderId] = useState('');
  const [outFormNotes, setOutFormNotes] = useState('');
  const [isSavingOut, setIsSavingOut] = useState(false);

  const [isAllocateModalOpen, setIsAllocateModalOpen] = useState(false);
  const [allocateOrderId, setAllocateOrderId] = useState('');
  const [allocateQty, setAllocateQty] = useState('');
  const [allocateDate, setAllocateDate] = useState(new Date().toISOString().slice(0, 10));
  const [isSavingAllocate, setIsSavingAllocate] = useState(false);

  const [isWapsiModalOpen, setIsWapsiModalOpen] = useState(false);
  const [wapsiDate, setWapsiDate] = useState(new Date().toISOString().slice(0, 10));
  const [wapsiSource, setWapsiSource] = useState('Customer Return / Wapsi');
  const [wapsiQty, setWapsiQty] = useState('');
  const [wapsiReason, setWapsiReason] = useState('Quality Defect');
  const [wapsiNotes, setWapsiNotes] = useState('');
  const [isSavingWapsi, setIsSavingWapsi] = useState(false);

  // Edit / Delete modals for history rows
  const [editingInItem, setEditingInItem] = useState<StockInHistoryItem | null>(null);
  const [editInQty, setEditInQty] = useState('');
  const [editInDate, setEditInDate] = useState('');
  const [isSavingInEdit, setIsSavingInEdit] = useState(false);

  const [editingOutItem, setEditingOutItem] = useState<StockOutHistoryItem | null>(null);
  const [editOutQty, setEditOutQty] = useState('');
  const [editOutDate, setEditOutDate] = useState('');
  const [editOutCustomer, setEditOutCustomer] = useState('');
  const [isSavingOutEdit, setIsSavingOutEdit] = useState(false);

  const [deletingItem, setDeletingItem] = useState<{ type: 'IN' | 'OUT' | 'RETURN'; id: string; label: string } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Deliver modal state (opened from Deliver button in front of article in directory list)
  const [deliverTarget, setDeliverTarget] = useState<{ articleName: string; availableStock: number } | null>(null);
  const [deliverOrderId, setDeliverOrderId] = useState('');
  const [deliverDate, setDeliverDate] = useState(new Date().toISOString().split('T')[0]);
  const [deliverQty, setDeliverQty] = useState('');
  const [isSavingDeliver, setIsSavingDeliver] = useState(false);

  // Edit return / wapsi state
  const [editingReturnItem, setEditingReturnItem] = useState<{ id: string; date: string; qty: number; remarks: string; rate?: number } | null>(null);
  const [editReturnDate, setEditReturnDate] = useState('');
  const [editReturnQty, setEditReturnQty] = useState('');
  const [editReturnRemarks, setEditReturnRemarks] = useState('');
  const [isSavingReturnEdit, setIsSavingReturnEdit] = useState(false);

  // Sync URL hash with selected article (/stock-management/[article_name])
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash;
      const prefix = '#/stock-management/';
      if (hash.startsWith(prefix)) {
        const decoded = decodeURIComponent(hash.slice(prefix.length)).trim();
        if (decoded) setSelectedArticleName(decoded);
      } else if (hash === '' || hash === '#/stock-management') {
        setSelectedArticleName(null);
      }
    };
    handleHashChange();
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const handleSelectArticle = (articleName: string) => {
    setSelectedArticleName(articleName);
    window.location.hash = `#/stock-management/${encodeURIComponent(articleName)}`;
  };

  const handleBackToDirectory = () => {
    setSelectedArticleName(null);
    if (window.location.hash.startsWith('#/stock-management')) {
      window.location.hash = '';
    }
  };

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

  // Estimated article stock value
  const articleStockValue = useMemo(() => {
    if (!selectedArticleSummary) return 0;
    const found = distinctArticles.find(
      a => a.articleName.trim().toLowerCase() === selectedArticleSummary.articleName.trim().toLowerCase()
    );
    if (found?.stockValue) return found.stockValue;
    return selectedArticleSummary.availableStock * 450;
  }, [selectedArticleSummary, distinctArticles]);

  // Combined History List for Full Page Table
  const combinedArticleHistory = useMemo(() => {
    const list: Array<{
      id: string;
      date: string;
      formattedDateTime: string;
      source: string;
      orderLink: string;
      qtyIn?: number;
      qtyOut?: number;
      type: 'IN' | 'OUT' | 'RETURN';
      billNo?: string;
      raw: any;
    }> = [];

    // 1. IN / Receipts
    selectedArticleInHistory.forEach(item => {
      const raw = item.rawEntry as Record<string, any> | undefined;
      const isReturn = raw?.type === 'RETURN' || Number(item.quantity) < 0;
      const orderLink = raw?.orderNo 
        ? `Against Order: ${raw.customerName ? `${raw.customerName} ` : ''}(${raw.orderNo})`
        : (raw?.customerOrder ? `Against Order: ${raw.customerOrder}` : 'Direct Cutting / Stock');

      list.push({
        id: item.id,
        date: item.date,
        formattedDateTime: item.formattedDateTime || `${formatDate(item.date)} ${item.time || ''}`.trim(),
        source: item.source || 'From Cutting Master',
        orderLink,
        qtyIn: isReturn ? undefined : item.quantity,
        qtyOut: isReturn ? Math.abs(item.quantity) : undefined,
        type: isReturn ? 'RETURN' : 'IN',
        billNo: item.billNo || (raw?.billNo ? `Bill ${raw.billNo}` : '—'),
        raw: item
      });
    });

    // 2. OUT / Deliveries
    selectedArticleOutHistory.forEach(item => {
      const raw = item.rawEntry as Record<string, any> | undefined;
      const orderLink = item.orderNo 
        ? `To Order: ${item.customerName ? `${item.customerName} ` : ''}(${item.orderNo})`
        : (item.orderName || 'Direct Customer Dispatch');

      list.push({
        id: item.id,
        date: item.date,
        formattedDateTime: formatDate(item.date),
        source: item.customerName ? `Dispatched to Customer (${item.customerName})` : 'Dispatched to Customer',
        orderLink,
        qtyOut: item.quantity,
        type: 'OUT',
        billNo: raw?.billNo || '—',
        raw: item
      });
    });

    // Sort newest first
    return list.sort((a, b) => safeStringCompare(b.date, a.date) || safeStringCompare(b.id, a.id));
  }, [selectedArticleInHistory, selectedArticleOutHistory]);

  const filteredCombinedHistory = useMemo(() => {
    if (historyFilter === 'ALL') return combinedArticleHistory;
    if (historyFilter === 'IN') return combinedArticleHistory.filter(item => item.type === 'IN' || item.type === 'RETURN');
    return combinedArticleHistory.filter(item => item.type === 'OUT');
  }, [combinedArticleHistory, historyFilter]);

  // Submit Handler: Add Stock IN
  const handleSaveStockIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedArticleName) return;
    const qty = Number(inFormQty);
    if (!Number.isFinite(qty) || qty <= 0 || !inFormDate) {
      showToast('Enter a valid date and positive quantity.', 'error');
      return;
    }
    setIsSavingIn(true);
    try {
      await addStockReceipt({
        article: selectedArticleName,
        size: inFormSize.trim() || 'Standard',
        quantity: qty,
        date: inFormDate,
        source: inFormSource.trim() || 'Cutting Master (Manik)'
      });
      setIsInModalOpen(false);
      setInFormQty('');
      showToast(`Stock IN added: ${qty} pairs of ${selectedArticleName}`);
    } catch (err) {
      console.error('Error adding stock in:', err);
      showToast(err instanceof Error ? err.message : 'Could not add stock in receipt.', 'error');
    } finally {
      setIsSavingIn(false);
    }
  };

  // Submit Handler: Stock OUT / Delivery
  const handleSaveStockOut = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedArticleName) return;
    const qty = Number(outFormQty);
    if (!Number.isFinite(qty) || qty <= 0 || !outFormDate || !outFormCustomer.trim()) {
      showToast('Enter customer name, valid date, and quantity.', 'error');
      return;
    }
    if (selectedArticleSummary && qty > selectedArticleSummary.availableStock) {
      showToast(`Quantity exceeds available stock (${selectedArticleSummary.availableStock} pairs).`, 'error');
      return;
    }
    setIsSavingOut(true);
    try {
      const matched = stockManagement.find(s => 
        (s.article || s.articleName || '').trim().toLowerCase() === selectedArticleName.trim().toLowerCase()
      );
      const chosenOrder = orders.find(o => o.id === outFormOrderId) || orders[0];
      if (matched && chosenOrder) {
        await deliverFromStock({
          stockId: matched.id,
          orderId: chosenOrder.id,
          customerName: outFormCustomer.trim(),
          quantity: qty,
          date: outFormDate
        });
      } else {
        // Fallback: register stock delivery via receipt deduction
        await addStockReceipt({
          article: selectedArticleName,
          size: 'Standard',
          quantity: -qty,
          date: outFormDate,
          source: `Dispatched to ${outFormCustomer.trim()}`
        });
      }
      setIsOutModalOpen(false);
      setOutFormQty('');
      setOutFormCustomer('');
      showToast(`Stock OUT recorded: ${qty} pairs dispatched.`);
    } catch (err) {
      console.error('Error delivering stock out:', err);
      showToast(err instanceof Error ? err.message : 'Could not process stock out.', 'error');
    } finally {
      setIsSavingOut(false);
    }
  };

  // Submit Handler: Allocate to Order
  const handleSaveAllocateToOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedArticleName) return;
    const qty = Number(allocateQty);
    if (!allocateOrderId) {
      showToast('Please select a customer order to allocate to.', 'error');
      return;
    }
    if (!Number.isFinite(qty) || qty <= 0) {
      showToast('Enter a valid positive pair quantity.', 'error');
      return;
    }
    if (selectedArticleSummary && qty > selectedArticleSummary.availableStock) {
      showToast(`Cannot allocate more than available stock (${selectedArticleSummary.availableStock} pairs).`, 'error');
      return;
    }
    const order = orders.find(o => o.id === allocateOrderId);
    if (!order) {
      showToast('Selected order not found.', 'error');
      return;
    }
    setIsSavingAllocate(true);
    try {
      const matched = stockManagement.find(s => 
        (s.article || s.articleName || '').trim().toLowerCase() === selectedArticleName.trim().toLowerCase()
      );
      if (matched) {
        await deliverFromStock({
          stockId: matched.id,
          orderId: order.id,
          customerName: order.customerName || 'Customer',
          quantity: qty,
          date: allocateDate
        });
      } else {
        await addStockReceipt({
          article: selectedArticleName,
          size: 'Standard',
          quantity: -qty,
          date: allocateDate,
          source: `Allocated to ${order.orderNo} (${order.customerName})`
        });
      }
      setIsAllocateModalOpen(false);
      setAllocateQty('');
      showToast(`Allocated ${qty} pairs to Order #${order.orderNo}`);
    } catch (err) {
      console.error('Error allocating stock:', err);
      showToast(err instanceof Error ? err.message : 'Could not allocate to order.', 'error');
    } finally {
      setIsSavingAllocate(false);
    }
  };

  // Submit Handler: Wapsi / Return
  const handleSaveWapsi = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedArticleName) return;
    const qty = Number(wapsiQty);
    if (!Number.isFinite(qty) || qty <= 0 || !wapsiDate) {
      showToast('Enter valid date and quantity.', 'error');
      return;
    }
    setIsSavingWapsi(true);
    try {
      await addStockReceipt({
        article: selectedArticleName,
        size: 'Standard',
        quantity: qty,
        date: wapsiDate,
        source: `${wapsiSource} - ${wapsiReason}${wapsiNotes ? ` (${wapsiNotes})` : ''}`
      });
      setIsWapsiModalOpen(false);
      setWapsiQty('');
      setWapsiNotes('');
      showToast(`Wapsi / Return recorded: ${qty} pairs of ${selectedArticleName}`);
    } catch (err) {
      console.error('Error recording wapsi:', err);
      showToast(err instanceof Error ? err.message : 'Could not record return/wapsi.', 'error');
    } finally {
      setIsSavingWapsi(false);
    }
  };

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

  // Handle Deliver button clicked in Directory list
  const handleOpenDeliverModal = (article: DistinctArticleStock) => {
    setDeliverTarget({
      articleName: article.articleName,
      availableStock: article.availableStock
    });
    setDeliverOrderId(orders.length > 0 ? orders[0].id : '');
    setDeliverDate(new Date().toISOString().split('T')[0]);
    setDeliverQty('');
  };

  const handleConfirmDelivery = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!deliverTarget) return;
    const qty = Number(deliverQty);
    if (!deliverOrderId) {
      showToast('Please select a customer order to deliver to.', 'error');
      return;
    }
    if (!Number.isFinite(qty) || qty <= 0) {
      showToast('Enter a valid positive pair quantity.', 'error');
      return;
    }
    if (qty > deliverTarget.availableStock) {
      showToast(`Cannot deliver more than available stock (${deliverTarget.availableStock.toLocaleString()} pairs).`, 'error');
      return;
    }
    const order = orders.find(o => o.id === deliverOrderId);
    if (!order) {
      showToast('Selected customer order not found.', 'error');
      return;
    }
    setIsSavingDeliver(true);
    try {
      const matched = stockManagement.find(s => 
        (s.article || s.articleName || '').trim().toLowerCase() === deliverTarget.articleName.trim().toLowerCase()
      );
      if (matched) {
        await deliverFromStock({
          stockId: matched.id,
          orderId: order.id,
          customerName: order.customerName || 'Customer',
          quantity: qty,
          date: deliverDate
        });
      } else {
        await addStockReceipt({
          article: deliverTarget.articleName,
          size: 'Standard',
          quantity: -qty,
          date: deliverDate,
          source: `Delivered to Order #${order.orderNo} (${order.customerName})`
        });
      }
      const beforeStock = deliverTarget.availableStock;
      const afterStock = Math.max(0, beforeStock - qty);
      showToast(`${deliverTarget.articleName} Total was ${beforeStock.toLocaleString()} - Delivered ${qty.toLocaleString()} = Remaining ${afterStock.toLocaleString()} pairs to Order #${order.orderNo}.`);
      setDeliverTarget(null);
      setDeliverQty('');
    } catch (err) {
      console.error('Error delivering stock:', err);
      showToast(err instanceof Error ? err.message : 'Could not confirm delivery.', 'error');
    } finally {
      setIsSavingDeliver(false);
    }
  };

  // Handle Editing Return / Wapsi Item
  const handleSaveReturnEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingReturnItem) return;
    const qty = Number(editReturnQty);
    if (!Number.isFinite(qty) || qty <= 0 || !editReturnDate) {
      showToast('Enter a valid return date and quantity.', 'error');
      return;
    }
    setIsSavingReturnEdit(true);
    try {
      if (updateCuttingReturn) {
        await updateCuttingReturn(editingReturnItem.id, {
          date: editReturnDate,
          remarks: editReturnRemarks,
          pairs: qty,
          rate: editingReturnItem.rate || 0
        });
        showToast('Return record updated successfully.');
      }
      setEditingReturnItem(null);
    } catch (err) {
      console.error('Error updating return record:', err);
      showToast(err instanceof Error ? err.message : 'Could not update return record.', 'error');
    } finally {
      setIsSavingReturnEdit(false);
    }
  };

  // Handle Deleting History Item
  const handleConfirmDelete = async () => {
    if (!deletingItem) return;
    setIsDeleting(true);
    try {
      if (deletingItem.type === 'RETURN') {
        if (deleteCuttingReturn) {
          await deleteCuttingReturn(deletingItem.id);
          showToast('Return record deleted and stock restored.');
        }
      } else if (deletingItem.type === 'IN') {
        if (deleteCuttingEntry) await deleteCuttingEntry(deletingItem.id);
        showToast('Stock In receipt deleted.');
      } else {
        if (deleteStockDelivery) await deleteStockDelivery(deletingItem.id);
        showToast('Stock delivery deleted.');
      }
      setDeletingItem(null);
    } catch (err) {
      console.error('Error deleting entry:', err);
      showToast(err instanceof Error ? err.message : 'Could not delete entry.', 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  // =========================================================================
  // FULL PAGE VIEW (When Article is Clicked - Like NAEM Ledger / Wasooli Page)
  // =========================================================================
  if (selectedArticleName && selectedArticleSummary) {
    return (
      <div className="space-y-6 animate-in fade-in duration-200">
        {/* Header: Back Button & Article Name */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <button
            type="button"
            onClick={handleBackToDirectory}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs sm:text-sm font-bold text-slate-700 shadow-xs hover:bg-slate-50 hover:text-blue-600 transition cursor-pointer w-fit"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>&larr; Back to Stock Management</span>
          </button>

          <div className="flex items-center gap-2 sm:gap-3">
            <span className="rounded-lg bg-blue-100 px-3 py-1 font-mono text-xs font-bold text-blue-800 uppercase tracking-wider">
              Article Ledger
            </span>
            <span className="text-slate-300 font-mono">|</span>
            <h1 className="text-xl sm:text-2xl font-black text-slate-900">
              Article: {selectedArticleSummary.articleName}
            </h1>
          </div>
        </div>

        {/* Top Cards Row (Like NAEM Ledger Rs.193,460 / Rs.59,000 / Rs.134,460) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1: TOTAL RECEIVED ON: 361 Pairs */}
          <div className="rounded-2xl border border-blue-200 bg-blue-50/80 p-5 shadow-xs">
            <span className="text-[11px] font-bold uppercase tracking-wider text-blue-800 block">
              TOTAL RECEIVED ON
            </span>
            <div className="mt-2 font-mono text-2xl sm:text-3xl font-black text-blue-900">
              {selectedArticleSummary.totalIn.toLocaleString()} <span className="text-sm font-semibold text-blue-700">Pairs</span>
            </div>
            <p className="mt-1 text-[11px] text-blue-700/80">From cutting master & stock receipts</p>
          </div>

          {/* Card 2: TOTAL DISPATCHED / USED: 233 Pairs */}
          <div className="rounded-2xl border border-purple-200 bg-purple-50/80 p-5 shadow-xs">
            <span className="text-[11px] font-bold uppercase tracking-wider text-purple-800 block">
              TOTAL DISPATCHED / USED
            </span>
            <div className="mt-2 font-mono text-2xl sm:text-3xl font-black text-purple-900">
              {selectedArticleSummary.totalOut.toLocaleString()} <span className="text-sm font-semibold text-purple-700">Pairs</span>
            </div>
            <p className="mt-1 text-[11px] text-purple-700/80">Delivered to customers & order dispatches</p>
          </div>

          {/* Card 3: AVAILABLE STOCK: 128 Pairs (Green) */}
          <div className="rounded-2xl border border-emerald-300 bg-emerald-50 p-5 shadow-xs">
            <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-800 block">
              AVAILABLE STOCK
            </span>
            <div className="mt-2 font-mono text-2xl sm:text-3xl font-black text-emerald-700">
              {selectedArticleSummary.availableStock.toLocaleString()} <span className="text-sm font-semibold text-emerald-600">Pairs</span>
            </div>
            <p className="mt-1 text-[11px] text-emerald-800 font-semibold">
              {selectedArticleSummary.totalIn} - {selectedArticleSummary.totalOut} = {selectedArticleSummary.availableStock} in hand
            </p>
          </div>

          {/* Card 4: Stock Value (Optional / estimated) */}
          <div className="rounded-2xl border border-amber-200 bg-amber-50/80 p-5 shadow-xs">
            <span className="text-[11px] font-bold uppercase tracking-wider text-amber-800 block">
              ESTIMATED STOCK VALUE
            </span>
            <div className="mt-2 font-mono text-2xl sm:text-3xl font-black text-amber-900">
              Rs. {articleStockValue.toLocaleString()}
            </div>
            <p className="mt-1 text-[11px] text-amber-800/80">Based on manufacturing product value</p>
          </div>
        </div>

        {/* Second Row - Action Buttons (Like New Cutting / Return Cutting in NAEM Ledger) */}
        <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-xs flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <button
              type="button"
              onClick={() => setIsInModalOpen(true)}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 px-4 py-2.5 text-xs sm:text-sm font-bold text-white shadow-md shadow-emerald-600/25 transition active:scale-95 cursor-pointer"
            >
              <Plus className="h-4 w-4" />
              <span>IN / BUY</span>
            </button>

            <button
              type="button"
              onClick={() => setIsOutModalOpen(true)}
              disabled={selectedArticleSummary.availableStock <= 0}
              className="inline-flex items-center gap-2 rounded-xl bg-purple-600 hover:bg-purple-700 px-4 py-2.5 text-xs sm:text-sm font-bold text-white shadow-md shadow-purple-600/25 transition active:scale-95 cursor-pointer disabled:opacity-50"
            >
              <ArrowUpRight className="h-4 w-4" />
              <span>OUT / SELL</span>
            </button>

            <button
              type="button"
              onClick={() => setIsWapsiModalOpen(true)}
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-orange-500 to-rose-600 hover:from-orange-600 hover:to-rose-700 px-4 py-2.5 text-xs sm:text-sm font-bold text-white shadow-md shadow-orange-500/25 transition active:scale-95 cursor-pointer"
            >
              <RotateCcw className="h-4 w-4" />
              <span>RETURN / WAPSI ADD</span>
            </button>
          </div>

          {/* Filter View History: All | IN | OUT */}
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl">
            <button
              type="button"
              onClick={() => setHistoryFilter('ALL')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${historyFilter === 'ALL' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'}`}
            >
              View History ({filteredCombinedHistory.length})
            </button>
            <button
              type="button"
              onClick={() => setHistoryFilter('IN')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${historyFilter === 'IN' ? 'bg-emerald-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'}`}
            >
              IN ({selectedArticleInHistory.length})
            </button>
            <button
              type="button"
              onClick={() => setHistoryFilter('OUT')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${historyFilter === 'OUT' ? 'bg-purple-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'}`}
            >
              OUT ({selectedArticleOutHistory.length})
            </button>
          </div>
        </div>

        {/* Third Row - History Table (Full width like Factory Workers & Cutter Contractor table) */}
        <div className="rounded-2xl border border-slate-200 bg-white shadow-xs overflow-hidden">
          <div className="border-b border-slate-200 bg-slate-50/80 p-4 sm:px-6 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-blue-600" />
              <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider">
                {selectedArticleSummary.articleName} · Transaction History
              </h3>
            </div>
            <span className="font-mono text-xs text-slate-500 font-bold">
              {filteredCombinedHistory.length} Total Records
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[950px] text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-600">
                <tr>
                  <th className="px-4 py-3.5">DATE</th>
                  <th className="px-4 py-3.5">SOURCE / Cutting Master (Manik)</th>
                  <th className="px-4 py-3.5">ORDER LINK</th>
                  <th className="px-4 py-3.5 text-right">QTY IN</th>
                  <th className="px-4 py-3.5 text-right">QTY OUT</th>
                  <th className="px-4 py-3.5 text-center">TYPE</th>
                  <th className="px-4 py-3.5">BILL NO</th>
                  <th className="px-4 py-3.5 text-center">ACTION</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                {filteredCombinedHistory.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-slate-400">
                      <Boxes className="mx-auto mb-2 h-8 w-8 opacity-40" />
                      <p className="font-semibold text-slate-600">No movement records found</p>
                      <p className="mt-1 text-xs text-slate-400">Click [IN / BUY] or receive cutting lots to log stock movements.</p>
                    </td>
                  </tr>
                ) : (
                  filteredCombinedHistory.map(row => (
                    <tr key={row.id} className="hover:bg-slate-50 transition">
                      <td className="px-4 py-3.5 font-mono text-slate-900 font-semibold whitespace-nowrap">
                        {row.formattedDateTime}
                      </td>
                      <td className="px-4 py-3.5 text-slate-800 font-semibold">
                        {row.source}
                      </td>
                      <td className="px-4 py-3.5 text-slate-600">
                        <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-mono text-slate-700">
                          {row.orderLink}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-right font-mono font-bold">
                        {row.qtyIn !== undefined ? (
                          <span className="text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                            +{row.qtyIn.toLocaleString()} IN
                          </span>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-right font-mono font-bold">
                        {row.qtyOut !== undefined ? (
                          <span className="text-rose-700 bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
                            -{row.qtyOut.toLocaleString()} OUT
                          </span>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-center">
                        <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase ${
                          row.type === 'IN' 
                            ? 'bg-emerald-100 text-emerald-800' 
                            : row.type === 'RETURN' 
                              ? 'bg-amber-100 text-amber-800' 
                              : 'bg-purple-100 text-purple-800'
                        }`}>
                          {row.type}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 font-mono text-slate-500">
                        {row.billNo || '—'}
                      </td>
                      <td className="px-4 py-3.5 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          {row.type === 'RETURN' ? (
                            <button
                              type="button"
                              onClick={() => {
                                setEditingReturnItem({
                                  id: row.id,
                                  date: row.date,
                                  qty: row.qtyOut || row.qtyIn || 0,
                                  remarks: row.raw?.remarks || row.source || '',
                                  rate: row.raw?.rate || 0
                                });
                                setEditReturnDate(row.date);
                                setEditReturnQty(String(row.qtyOut || row.qtyIn || ''));
                                setEditReturnRemarks(row.raw?.remarks || row.source || '');
                              }}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-amber-600 hover:bg-amber-50 transition"
                              title="Edit Return Entry"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                          ) : row.type === 'IN' ? (
                            <button
                              type="button"
                              onClick={() => {
                                setEditingInItem(row.raw);
                                setEditInQty(String(row.qtyIn || ''));
                                setEditInDate(row.date);
                              }}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition"
                              title="Edit Stock In"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                setEditingOutItem(row.raw);
                                setEditOutQty(String(row.qtyOut || ''));
                                setEditOutDate(row.date);
                                setEditOutCustomer(row.raw.customerName || '');
                              }}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition"
                              title="Edit Stock Out"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => setDeletingItem({
                              type: row.type,
                              id: row.id,
                              label: `${row.type} (${row.qtyIn || row.qtyOut} pairs)`
                            })}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition"
                            title="Delete record"
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

        {/* Modal: IN / BUY */}
        {isInModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
            <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h3 className="text-lg font-black text-emerald-800">Add Stock IN / Buy</h3>
                <button type="button" onClick={() => setIsInModalOpen(false)} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100">
                  <X className="h-5 w-5" />
                </button>
              </div>
              <form onSubmit={handleSaveStockIn} className="mt-4 space-y-3.5">
                <div>
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-600">Article</label>
                  <input readOnly value={selectedArticleName} className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-100 p-2.5 text-xs font-bold text-slate-800" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-bold text-slate-700">Date *</label>
                    <input type="date" required value={inFormDate} onChange={e => setInFormDate(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 p-2.5 text-xs" />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-700">Quantity (Pairs) *</label>
                    <input type="number" required min="1" placeholder="e.g. 500" value={inFormQty} onChange={e => setInFormQty(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 p-2.5 text-xs font-mono font-bold" />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700">Source / Cutting Master</label>
                  <input type="text" placeholder="e.g. Cutting Master (Manik) or Supplier" value={inFormSource} onChange={e => setInFormSource(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 p-2.5 text-xs" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-bold text-slate-700">Size</label>
                    <input type="text" placeholder="Standard / XL" value={inFormSize} onChange={e => setInFormSize(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 p-2.5 text-xs" />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-700">Bill No</label>
                    <input type="text" placeholder="e.g. Bill 04" value={inFormBillNo} onChange={e => setInFormBillNo(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 p-2.5 text-xs font-mono" />
                  </div>
                </div>
                <div className="mt-5 flex justify-end gap-2.5 pt-3 border-t border-slate-100">
                  <button type="button" onClick={() => setIsInModalOpen(false)} className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100">Cancel</button>
                  <button type="submit" disabled={isSavingIn} className="rounded-xl bg-emerald-600 px-5 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50">
                    {isSavingIn ? 'Saving...' : 'Add Stock IN'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal: OUT / SELL */}
        {isOutModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
            <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h3 className="text-lg font-black text-purple-800">Dispatch Stock OUT / Sell</h3>
                <button type="button" onClick={() => setIsOutModalOpen(false)} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100">
                  <X className="h-5 w-5" />
                </button>
              </div>
              <form onSubmit={handleSaveStockOut} className="mt-4 space-y-3.5">
                <div>
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-600">Article</label>
                  <input readOnly value={`${selectedArticleName} (${selectedArticleSummary.availableStock} available)`} className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-100 p-2.5 text-xs font-bold text-slate-800" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-bold text-slate-700">Date *</label>
                    <input type="date" required value={outFormDate} onChange={e => setOutFormDate(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 p-2.5 text-xs" />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-700">Quantity (Pairs) *</label>
                    <input type="number" required min="1" max={selectedArticleSummary.availableStock} placeholder="e.g. 200" value={outFormQty} onChange={e => setOutFormQty(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 p-2.5 text-xs font-mono font-bold" />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700">Customer / Destination *</label>
                  <input type="text" required placeholder="e.g. BESTWAY / Walk-in Customer" value={outFormCustomer} onChange={e => setOutFormCustomer(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 p-2.5 text-xs" />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700">Link to Customer Order (Optional)</label>
                  <select value={outFormOrderId} onChange={e => setOutFormOrderId(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 bg-white p-2.5 text-xs">
                    <option value="">-- Direct Delivery (No Order Link) --</option>
                    {orders.map(o => (
                      <option key={o.id} value={o.id}>Order #{o.orderNo} - {o.customerName} ({o.totalPairs} pairs)</option>
                    ))}
                  </select>
                </div>
                <div className="mt-5 flex justify-end gap-2.5 pt-3 border-t border-slate-100">
                  <button type="button" onClick={() => setIsOutModalOpen(false)} className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100">Cancel</button>
                  <button type="submit" disabled={isSavingOut} className="rounded-xl bg-purple-600 px-5 py-2 text-xs font-bold text-white hover:bg-purple-700 disabled:opacity-50">
                    {isSavingOut ? 'Saving...' : 'Dispatch OUT'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal: ALLOCATE TO ORDER */}
        {isAllocateModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
            <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h3 className="text-lg font-black text-blue-800">Allocate Stock to Order</h3>
                <button type="button" onClick={() => setIsAllocateModalOpen(false)} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100">
                  <X className="h-5 w-5" />
                </button>
              </div>
              <form onSubmit={handleSaveAllocateToOrder} className="mt-4 space-y-3.5">
                <div>
                  <label className="text-xs font-bold text-slate-700">Select Customer Order *</label>
                  <select required value={allocateOrderId} onChange={e => setAllocateOrderId(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 bg-white p-2.5 text-xs">
                    <option value="" disabled>-- Select Order --</option>
                    {orders.map(o => (
                      <option key={o.id} value={o.id}>Order #{o.orderNo} - {o.customerName} (Total: {o.totalPairs} pairs)</option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-bold text-slate-700">Date *</label>
                    <input type="date" required value={allocateDate} onChange={e => setAllocateDate(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 p-2.5 text-xs" />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-700">Pairs to Allocate *</label>
                    <input type="number" required min="1" max={selectedArticleSummary.availableStock} placeholder="e.g. 100" value={allocateQty} onChange={e => setAllocateQty(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 p-2.5 text-xs font-mono font-bold" />
                  </div>
                </div>
                <div className="rounded-xl bg-blue-50 border border-blue-200 p-3 text-xs text-blue-800">
                  Available in physical stock: <span className="font-bold">{selectedArticleSummary.availableStock} pairs</span>
                </div>
                <div className="mt-5 flex justify-end gap-2.5 pt-3 border-t border-slate-100">
                  <button type="button" onClick={() => setIsAllocateModalOpen(false)} className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100">Cancel</button>
                  <button type="submit" disabled={isSavingAllocate} className="rounded-xl bg-blue-600 px-5 py-2 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-50">
                    {isSavingAllocate ? 'Allocating...' : 'Confirm Allocation'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal: RETURN / WAPSI ADD */}
        {isWapsiModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
            <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h3 className="text-lg font-black text-rose-800">Add Stock Return / Wapsi</h3>
                <button type="button" onClick={() => setIsWapsiModalOpen(false)} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100">
                  <X className="h-5 w-5" />
                </button>
              </div>
              <form onSubmit={handleSaveWapsi} className="mt-4 space-y-3.5">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-bold text-slate-700">Date *</label>
                    <input type="date" required value={wapsiDate} onChange={e => setWapsiDate(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 p-2.5 text-xs" />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-700">Quantity (Pairs) *</label>
                    <input type="number" required min="1" placeholder="e.g. 50" value={wapsiQty} onChange={e => setWapsiQty(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 p-2.5 text-xs font-mono font-bold" />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700">Return Source / Party</label>
                  <input type="text" placeholder="e.g. Customer Return / Cutting Wapsi" value={wapsiSource} onChange={e => setWapsiSource(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 p-2.5 text-xs" />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700">Reason</label>
                  <select value={wapsiReason} onChange={e => setWapsiReason(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 bg-white p-2.5 text-xs">
                    <option value="Quality Defect">Quality Defect</option>
                    <option value="Customer Return">Customer Return</option>
                    <option value="Wrong Size">Wrong Size</option>
                    <option value="Damaged Leather">Damaged Leather</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700">Remarks / Notes</label>
                  <input type="text" placeholder="Optional notes" value={wapsiNotes} onChange={e => setWapsiNotes(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 p-2.5 text-xs" />
                </div>
                <div className="mt-5 flex justify-end gap-2.5 pt-3 border-t border-slate-100">
                  <button type="button" onClick={() => setIsWapsiModalOpen(false)} className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100">Cancel</button>
                  <button type="submit" disabled={isSavingWapsi} className="rounded-xl bg-gradient-to-r from-orange-600 to-rose-600 px-5 py-2 text-xs font-bold text-white hover:from-orange-700 hover:to-rose-700 disabled:opacity-50">
                    {isSavingWapsi ? 'Saving...' : 'Add Wapsi'}
                  </button>
                </div>
              </form>
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

        {/* Edit Return / Wapsi Modal */}
        {editingReturnItem && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
            <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h3 className="text-base font-bold text-slate-900">Edit Return / Wapsi Entry</h3>
                <button
                  type="button"
                  onClick={() => setEditingReturnItem(null)}
                  className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <form onSubmit={handleSaveReturnEdit} className="mt-4 space-y-3.5">
                <div>
                  <label className="text-xs font-bold text-slate-700">Return Date *</label>
                  <input
                    type="date"
                    value={editReturnDate}
                    onChange={e => setEditReturnDate(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-300 p-2.5 text-xs focus:border-amber-500 focus:outline-none"
                    required
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700">Return Quantity (Pairs) *</label>
                  <input
                    type="number"
                    min="1"
                    value={editReturnQty}
                    onChange={e => setEditReturnQty(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-300 p-2.5 text-xs font-mono font-bold focus:border-amber-500 focus:outline-none"
                    required
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700">Remarks / Reason</label>
                  <input
                    type="text"
                    value={editReturnRemarks}
                    onChange={e => setEditReturnRemarks(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-300 p-2.5 text-xs focus:border-amber-500 focus:outline-none"
                  />
                </div>
                <div className="mt-5 flex justify-end gap-2 pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setEditingReturnItem(null)}
                    className="rounded-xl px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSavingReturnEdit}
                    className="rounded-xl bg-amber-600 px-4 py-2 text-xs font-bold text-white hover:bg-amber-700 disabled:opacity-50 cursor-pointer shadow-xs"
                  >
                    {isSavingReturnEdit ? 'Saving...' : 'Save Return'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
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
  }

  // =========================================================================
  // MAIN DIRECTORY VIEW (When No Article is Selected)
  // =========================================================================
  return (
    <div className="space-y-6">
      {/* Top Section - Total Stock Report Card (Light Theme) */}
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
              Estimated Value
            </span>
            <div className="mt-2 font-mono text-2xl sm:text-3xl font-black text-blue-900">
              {formatCurrency(totalStockValue)}
            </div>
            <p className="mt-1 text-[11px] text-blue-700/80">Estimated manufacturing inventory value</p>
          </div>
        </div>

        {/* 2 Tabs/Buttons side by side */}
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

          {/* Search bar to search article by name (MG, drivers, etc.) */}
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

      {/* DISTINCT Articles List (Shows each article ONCE - Click navigates to Full Page) */}
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
                  onClick={() => handleSelectArticle(article.articleName)}
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

                  {/* Right Side: Stock Count & Deliver Button */}
                  <div className="flex items-center gap-3 sm:gap-4 shrink-0">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleOpenDeliverModal(article);
                      }}
                      disabled={article.availableStock <= 0}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 px-3 py-1.5 text-xs font-bold text-white shadow-xs hover:shadow transition active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                      title={`Deliver ${article.articleName} to Customer Order`}
                    >
                      <Truck className="h-3.5 w-3.5" />
                      <span>Deliver</span>
                    </button>

                    <div className="text-right">
                      <div className="font-mono text-base sm:text-lg font-black text-slate-900 group-hover:text-blue-700 transition">
                        {article.availableStock.toLocaleString()} <span className="text-xs font-normal text-slate-500">Pairs</span>
                      </div>
                      <div className="text-[10px] font-semibold text-slate-400">
                        Click to Open Full Ledger &rarr;
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Deliver Modal (Opened from Deliver button in front of each Article in list) */}
      {deliverTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-lg font-black text-blue-900 flex items-center gap-2">
                  <Truck className="h-5 w-5 text-blue-600" />
                  <span>Deliver Stock to Order</span>
                </h3>
                <p className="text-xs text-slate-500 font-medium mt-0.5">
                  Deliver <span className="font-bold text-blue-700">{deliverTarget.articleName}</span> against customer order
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDeliverTarget(null)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 cursor-pointer"
                aria-label="Close delivery modal"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleConfirmDelivery} className="mt-4 space-y-3.5">
              {/* Article fixed - not editable */}
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-slate-600">Selected Article</label>
                <div className="mt-1 flex items-center justify-between rounded-xl border border-blue-200 bg-blue-50/70 p-3">
                  <span className="font-black text-slate-900 text-sm">{deliverTarget.articleName}</span>
                  <span className="text-xs font-bold text-blue-800 bg-white px-2.5 py-1 rounded-md border border-blue-200 shadow-2xs font-mono">
                    Stock: {deliverTarget.availableStock.toLocaleString()} Pairs
                  </span>
                </div>
              </div>

              {/* Select Customer Order */}
              <div>
                <label className="text-xs font-bold text-slate-700">Select Customer Order *</label>
                <select
                  required
                  value={deliverOrderId}
                  onChange={e => setDeliverOrderId(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-300 bg-white p-2.5 text-xs font-medium focus:border-blue-500 focus:outline-none"
                >
                  <option value="" disabled>-- Select Customer Order --</option>
                  {orders.map(o => (
                    <option key={o.id} value={o.id}>
                      Order #{o.orderNo} - {o.customerName} (Total: {Number(o.totalPairs || 0).toLocaleString()} pairs)
                    </option>
                  ))}
                </select>
              </div>

              {/* Date and Pairs to Deliver */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-700">Date *</label>
                  <input
                    type="date"
                    required
                    value={deliverDate}
                    onChange={e => setDeliverDate(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-300 p-2.5 text-xs focus:border-blue-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700">Pairs to Deliver *</label>
                  <input
                    type="number"
                    required
                    min="1"
                    max={deliverTarget.availableStock}
                    placeholder="e.g. 200"
                    value={deliverQty}
                    onChange={e => setDeliverQty(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-300 p-2.5 text-xs font-mono font-bold focus:border-blue-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* Available Stock Indicator */}
              <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-xs text-amber-900 font-medium">
                Available <span className="font-bold">{deliverTarget.articleName}</span> Stock: <span className="font-mono font-bold text-amber-800">{deliverTarget.availableStock.toLocaleString()} Pairs</span>
              </div>

              {/* Action Buttons */}
              <div className="mt-5 flex justify-end gap-2.5 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setDeliverTarget(null)}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingDeliver}
                  className="rounded-xl bg-blue-600 hover:bg-blue-700 px-5 py-2 text-xs font-bold text-white shadow-md shadow-blue-600/25 transition active:scale-95 disabled:opacity-50 cursor-pointer"
                >
                  {isSavingDeliver ? 'Delivering...' : 'Confirm Delivery'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
