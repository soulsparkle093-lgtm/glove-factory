import React, { useState, useEffect, useMemo } from 'react';
import { 
  ArrowLeft, 
  FileText, 
  Scissors, 
  Boxes, 
  Receipt, 
  CheckCircle2, 
  Clock, 
  AlertCircle, 
  Calendar, 
  Phone, 
  User,
  ShieldCheck,
  TrendingUp,
  Layers,
  Sparkles,
  PackageCheck,
  ChevronDown,
  ChevronRight,
  Search,
  X,
  Plus
} from 'lucide-react';
import { useFactory } from '../context/FactoryContext';
import { formatCurrency, formatDate, getOrderStatusBadge } from '../utils/factoryFormatters';
import { db, collection, doc, onSnapshot, updateDoc } from '../firebase';
import { OrderItem, SizeMatrix, StitchingHistoryEntry, StitchingOrderStatus } from '../types/factory';

interface OrderDetailPageProps {
  orderId: string;
  onBack: () => void;
  onOpenCuttingModalForOrder: (orderId: string, orderItemId?: string) => void;
  onOpenInvoiceModalForOrder: (orderId: string) => void;
}

interface CuttingHistoryRow {
  id: string;
  date: string;
  cutterName: string;
  article: string;
  size: string;
  qty: number;
  rate: number;
  amount: number;
  type: 'GIVE' | 'RECEIVE';
  status: string;
  notes: string;
  isLegacyCut?: boolean;
}

interface CuttingArticleSizeGroup {
  key: string;
  article: string;
  size: string;
  orderedPairs: number;
  rows: CuttingHistoryRow[];
}

interface StitchingArticleSizeGroup {
  key: string;
  article: string;
  size: string;
  orderedPairs: number;
  cuttingReceivedPairs: number;
  rows: StitchingHistoryEntry[];
}

const normalizeArticleSize = (value: string) => {
  const normalized = value.trim().toLocaleLowerCase();
  const aliases: Record<string, string> = {
    small: 's',
    medium: 'm',
    large: 'l',
    'extra large': 'xl',
    xlarge: 'xl',
    '2xl': 'xxl',
    'xx-large': 'xxl'
  };
  return aliases[normalized] || normalized;
};

export const OrderDetailPage: React.FC<OrderDetailPageProps> = ({
  orderId,
  onBack,
  onOpenCuttingModalForOrder,
  onOpenInvoiceModalForOrder
}) => {
  const { 
    orders, 
    cuttings, 
    cuttingEntries,
    stockLedger, 
    invoices, 
    orderDispatchHistory,
    cuttingTransactions,
    stitchingOrders,
    stitchingHistory,
    stitchers,
    settings,
    receiveCutting,
    createStitchingOrder,
    updateStitchingOrderStatus,
    setSelectedInvoiceId,
    setActiveModule,
    showToast
  } = useFactory();

  const [activeTab, setActiveTab] = useState<'items' | 'cutting' | 'stitching' | 'stock' | 'dispatch'>('items');
  const [subHistory, setSubHistory] = useState<any[]>([]);
  const [expandedCuttingGroup, setExpandedCuttingGroup] = useState<string | null>(null);
  const [cuttingArticleSearch, setCuttingArticleSearch] = useState('');
  const [selectedCutterHistory, setSelectedCutterHistory] = useState<{ article: string; size: string; cutterName: string; rows: CuttingHistoryRow[] } | null>(null);
  const [isAddArticleSizeOpen, setIsAddArticleSizeOpen] = useState(false);
  const [newCuttingArticle, setNewCuttingArticle] = useState('');
  const [newCuttingSize, setNewCuttingSize] = useState('');
  const [isSavingArticleSize, setIsSavingArticleSize] = useState(false);
  const [isAddStitchingOpen, setIsAddStitchingOpen] = useState(false);
  const [stitchingForm, setStitchingForm] = useState({
    articleSizeKey: '',
    stitcherId: '',
    date: new Date().toISOString().slice(0, 10),
    qty: '',
    rate: ''
  });
  const [isSavingStitching, setIsSavingStitching] = useState(false);
  const [stitchingArticleSearch, setStitchingArticleSearch] = useState('');
  const [expandedStitchingGroup, setExpandedStitchingGroup] = useState<string | null>(null);

  const order = orders.find(o => o.id === orderId);

  // Real-time onSnapshot listener for sub-collection customer_orders/{orderId}/order_history
  useEffect(() => {
    if (!db || !orderId) return;
    try {
      const unsub = onSnapshot(collection(db, 'customer_orders', orderId, 'order_history'), snap => {
        const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        list.sort((a: any, b: any) => (b.date || b.createdAt || '').localeCompare(a.date || a.createdAt || ''));
        setSubHistory(list);
      }, err => {
        console.warn('Sub-history onSnapshot notice:', err);
      });
      return () => unsub();
    } catch (e) {
      console.warn('Sub-history listener error:', e);
    }
  }, [orderId]);

  if (!order) {
    return (
      <div className="bg-white rounded-2xl p-8 text-center text-slate-500 max-w-2xl mx-auto border border-slate-200 shadow-sm mt-8">
        <AlertCircle className="w-12 h-12 text-rose-500 mx-auto mb-3" />
        <h3 className="text-lg font-bold text-slate-900">Order Not Found</h3>
        <p className="text-xs text-slate-500 mt-1">The requested order may have been removed or deleted.</p>
        <button
          onClick={onBack}
          className="mt-4 px-4 py-2 rounded-xl bg-blue-600 text-white font-bold text-xs hover:bg-blue-700 transition"
        >
          &larr; Back to Orders List
        </button>
      </div>
    );
  }

  // --- 1. SECTION A DATA: IMMUTABLE ORIGINAL ORDER VALUES ---
  // Sum of originalQty across all items (Never subtracts)
  const totalOriginalPairs = (order.items || []).reduce((sum, item) => {
    const orig = Number(item.originalQty) || Number(item.totalPairs) || Number(item.qty) || 0;
    return sum + orig;
  }, 0) || Number(order.totalPairs) || 0;

  // --- 2. SECTION B DATA: LIVE CALCULATED FROM HISTORY COLLECTIONS ---
  // Cutting Given: sum of cuttings + cuttingTransactions where orderId matches
  const orderCuttings = cuttings.filter(c => c.orderId === orderId);
  const orderStitchingOrders = stitchingOrders
    .filter(stitchingOrder => stitchingOrder.orderId === orderId)
    .sort((a, b) => (a.issueDate || '').localeCompare(b.issueDate || ''));
  const orderStitchingHistory = stitchingHistory
    .filter(entry => entry.orderId === orderId)
    .sort((a, b) => (a.date || '').localeCompare(b.date || '') || (a.createdAt || '').localeCompare(b.createdAt || ''));
  const orderCuttingTxs = cuttingTransactions.filter(t => t.orderId === orderId);
  const orderCuttingRecords = useMemo(() => {
    const recordsById = new Map<string, CuttingHistoryRow>();
    orderCuttingTxs.forEach(tx => {
      recordsById.set(tx.id, {
        id: tx.id,
        date: tx.date,
        cutterName: tx.cutterName || 'Unknown Cutter',
        article: tx.articleTitle || tx.article || 'Unspecified Article',
        size: tx.sizeName || tx.size || '-',
        qty: Number(tx.totalQty) || Number(tx.qty) || 0,
        rate: Number(tx.rate) || 0,
        amount: Number(tx.totalBalance) || Number(tx.lotTotal) || (Number(tx.qty) || 0) * (Number(tx.rate) || 0),
        type: tx.type,
        status: tx.type === 'GIVE' ? 'Cutting Issued' : 'Cutting Received',
        notes: tx.notes || tx.remarks || ''
      });
    });
    cuttingEntries.filter(entry => entry.orderId === orderId).forEach(entry => {
      recordsById.set(entry.id, {
        id: entry.id,
        date: entry.date,
        cutterName: entry.cutterName || 'Unknown Cutter',
        article: entry.articleTitle || entry.article || 'Unspecified Article',
        size: entry.sizeName || entry.size || '-',
        qty: Number(entry.totalQty) || Number(entry.quantity) || Number(entry.pairs) || 0,
        rate: Number(entry.rate) || Number(entry.boxRate) || 0,
        amount: Number(entry.totalBalance) || Number(entry.lotTotal) || (Number(entry.pairs) || 0) * (Number(entry.rate) || 0),
        type: entry.type,
        status: entry.type === 'GIVE' ? 'Cutting Issued' : 'Cutting Received',
        notes: entry.remarks || ''
      });
    });
    orderCuttings.forEach(cutting => {
      if (recordsById.has(cutting.id)) return;
      recordsById.set(cutting.id, {
        id: cutting.id,
        date: cutting.date,
        cutterName: cutting.personName || 'Unknown Cutter',
        article: cutting.gloveType || 'Unspecified Article',
        size: cutting.size || '-',
        qty: Number(cutting.qty) || 0,
        rate: Number(cutting.rate) || 0,
        amount: Number(cutting.totalAmount) || (Number(cutting.qty) || 0) * (Number(cutting.rate) || 0),
        type: cutting.status === 'Received' ? 'RECEIVE' : 'GIVE',
        status: cutting.status === 'Received' ? 'Cutting Received' : 'Cutting Issued',
        notes: cutting.notes || '',
        isLegacyCut: true
      });
    });
    return [...recordsById.values()].sort((a, b) =>
      (a.date || '').localeCompare(b.date || '') || a.id.localeCompare(b.id)
    );
  }, [cuttingEntries, orderCuttingTxs, orderCuttings, orderId]);
  const cuttingArticleGroups = useMemo(() => {
    const groups = new Map<string, CuttingArticleSizeGroup>();
    const normalizeArticle = (value: string) => value.trim().toLocaleLowerCase();
    const normalizeSize = (value: string) => {
      const size = value.trim().toLocaleLowerCase();
      const aliases: Record<string, string> = {
        small: 'S',
        medium: 'M',
        large: 'L',
        xl: 'XL',
        xxl: '2XL',
        '2xl': '2XL'
      };
      return aliases[size] || (size ? value.trim() : '-');
    };
    const addGroup = (articleValue: string, sizeValue: string, orderedPairs = 0) => {
      const article = articleValue.trim() || 'Unspecified Article';
      const size = normalizeSize(sizeValue);
      const key = `${normalizeArticle(article)}___${size.toLocaleLowerCase()}`;
      const existing = groups.get(key);
      if (existing) {
        existing.orderedPairs += orderedPairs;
        return existing;
      }
      const group = { key, article, size, orderedPairs, rows: [] as CuttingHistoryRow[] };
      groups.set(key, group);
      return group;
    };

    (order.items || []).forEach(item => {
      const article = item.title || item.gloveType || 'Unspecified Article';
      const sizes = item.sizes || { small: 0, medium: 0, large: 0, xl: 0, xxl: 0 };
      const sizeEntries = Object.entries(sizes).filter(([, quantity]) => Number(quantity) > 0);
      if (sizeEntries.length > 0) {
        sizeEntries.forEach(([size, quantity]) => addGroup(article, size, Number(quantity) || 0));
      } else {
        addGroup(article, item.size || '-', Number(item.originalQty) || Number(item.totalPairs) || Number(item.qty) || 0);
      }
    });

    (order.cuttingArticleSizes || []).forEach(item => addGroup(item.article, item.size));

    orderCuttingRecords.forEach(record => {
      addGroup(record.article, record.size).rows.push(record);
    });

    return [...groups.values()].sort((a, b) =>
      a.article.localeCompare(b.article) || a.size.localeCompare(b.size)
    );
  }, [order.items, order.cuttingArticleSizes, orderCuttingRecords]);

  const stitchingArticleGroups = useMemo(() => {
    const groups = new Map<string, StitchingArticleSizeGroup>();
    const addGroup = (articleValue: string, sizeValue: string, orderedPairs = 0) => {
      const article = articleValue.trim() || 'Unspecified Article';
      const size = sizeValue.trim() || '-';
      const key = `${normalizeArticleSize(article)}___${normalizeArticleSize(size)}`;
      const existing = groups.get(key);
      if (existing) {
        existing.orderedPairs += orderedPairs;
        return existing;
      }
      const cuttingGroup = cuttingArticleGroups.find(group =>
        normalizeArticleSize(group.article) === normalizeArticleSize(article) &&
        normalizeArticleSize(group.size) === normalizeArticleSize(size)
      );
      const group: StitchingArticleSizeGroup = {
        key,
        article,
        size,
        orderedPairs,
        cuttingReceivedPairs: cuttingGroup?.rows
          .filter(row => row.type === 'RECEIVE')
          .reduce((total, row) => total + row.qty, 0) || 0,
        rows: []
      };
      groups.set(key, group);
      return group;
    };

    cuttingArticleGroups.forEach(group => addGroup(group.article, group.size, group.orderedPairs));
    orderStitchingHistory
      .filter(entry => entry.type !== 'STATUS')
      .forEach(entry => {
        const stitchingOrder = orderStitchingOrders.find(item => item.id === entry.stitchingOrderId);
        const orderItem = order.items.find(item => item.id === stitchingOrder?.orderItemId);
        addGroup(entry.article, entry.size || stitchingOrder?.size || orderItem?.size || '-').rows.push(entry);
      });

    return [...groups.values()].sort((a, b) =>
      a.article.localeCompare(b.article) || a.size.localeCompare(b.size)
    );
  }, [cuttingArticleGroups, order.items, orderStitchingHistory, orderStitchingOrders]);

  const cuttingGivenPairs = orderCuttings.reduce((sum, c) => sum + (Number(c.qty) || 0), 0) ||
    orderCuttingTxs.filter(t => t.type === 'GIVE').reduce((sum, t) => sum + (Number(t.qty) || 0), 0);

  // Stock Received: sum of stock_ledger where orderId matches and type is in or cutting_received
  const orderStockLedger = stockLedger.filter(s => s.orderId === orderId);
  const stockReceivedPairs = orderStockLedger
    .filter(s => s.type === 'in' || s.type === 'cutting_received')
    .reduce((sum, s) => sum + (Number(s.qty) || 0), 0);

  // Billed / Dispatched: sum of sales_invoices where orderId matches
  const orderInvoices = invoices.filter(i => i.orderId === orderId);
  const invoiceDispatchedPairs = orderInvoices.reduce((sum, inv) => {
    return sum + (inv.items || []).reduce((iSum, itm) => iSum + (Number(itm.qty) || 0), 0);
  }, 0);

  const orderDispatches = orderDispatchHistory.filter(h => h.orderId === orderId);
  const historyDispatchedPairs = orderDispatches
    .filter(h => h.actionType === 'dispatched_to_customer')
    .reduce((sum, h) => sum + (Number(h.quantity) || 0), 0);

  const dispatchedPairs = Math.max(invoiceDispatchedPairs, historyDispatchedPairs);

  // Pending Pairs: Original Qty - Dispatched Qty
  const pendingPairs = Math.max(0, totalOriginalPairs - dispatchedPairs);

  // Progress Percentages
  const dispatchedPct = totalOriginalPairs > 0 
    ? Math.min(100, Math.round((dispatchedPairs / totalOriginalPairs) * 100)) 
    : 0;

  const cuttingPct = totalOriginalPairs > 0 
    ? Math.min(100, Math.round((cuttingGivenPairs / totalOriginalPairs) * 100)) 
    : 0;

  const stockPct = totalOriginalPairs > 0 
    ? Math.min(100, Math.round((stockReceivedPairs / totalOriginalPairs) * 100)) 
    : 0;

  const statusBadge = getOrderStatusBadge(order.status);
  const handleStitchingStatusChange = async (stitchingOrderId: string, status: StitchingOrderStatus) => {
    try {
      await updateStitchingOrderStatus(stitchingOrderId, status);
      showToast(`Stitching history updated: ${status}.`);
    } catch (error) {
      console.error('Unable to update stitching history:', error);
      showToast(error instanceof Error ? error.message : 'Unable to update stitching status.', 'error');
    }
  };

  const handleSaveArticleSize = async (event: React.FormEvent) => {
    event.preventDefault();
    const article = newCuttingArticle.trim();
    const size = newCuttingSize.trim();
    if (!article || !size) {
      showToast('Enter both an article name and size.', 'error');
      return;
    }
    if (!db) {
      showToast('The database is unavailable. The article and size were not saved.', 'error');
      return;
    }
    const exists = (order.cuttingArticleSizes || []).some(item =>
      item.article.trim().toLocaleLowerCase() === article.toLocaleLowerCase() &&
      item.size.trim().toLocaleLowerCase() === size.toLocaleLowerCase()
    );
    if (exists) {
      showToast('This article and size are already listed.', 'error');
      return;
    }
    setIsSavingArticleSize(true);
    try {
      await updateDoc(doc(db, 'customer_orders', order.id), {
        cuttingArticleSizes: [...(order.cuttingArticleSizes || []), { article, size }]
      });
      setNewCuttingArticle('');
      setNewCuttingSize('');
      setIsAddArticleSizeOpen(false);
      showToast('Article and size added successfully.');
    } catch (error) {
      console.error('Error saving order article and size:', error);
      showToast('The article and size could not be saved. Please try again.', 'error');
    } finally {
      setIsSavingArticleSize(false);
    }
  };

  const availableStitchingGroups = stitchingArticleGroups.filter(group => {
    const issued = group.rows
      .filter(entry => entry.type === 'ISSUE')
      .reduce((total, entry) => total + (Number(entry.quantity) || 0), 0);
    return group.cuttingReceivedPairs > issued;
  });

  const openAddStitchingEntry = (articleSizeKey?: string) => {
    const firstGroup = availableStitchingGroups.find(group => group.key === articleSizeKey) || availableStitchingGroups[0];
    const firstStitcher = stitchers.find(stitcher => stitcher.isActive);
    setStitchingForm({
      articleSizeKey: firstGroup?.key || '',
      stitcherId: firstStitcher?.id || '',
      date: new Date().toISOString().slice(0, 10),
      qty: '',
      rate: firstStitcher?.perPairRate ? String(firstStitcher.perPairRate) : ''
    });
    setIsAddStitchingOpen(true);
  };

  const handleSaveStitchingEntry = async (event: React.FormEvent) => {
    event.preventDefault();
    const group = stitchingArticleGroups.find(item => item.key === stitchingForm.articleSizeKey);
    const stitcher = stitchers.find(item => item.id === stitchingForm.stitcherId && item.isActive);
    const qty = Number(stitchingForm.qty);
    const rate = Number(stitchingForm.rate);
    if (!group || !stitcher || !stitchingForm.date || !Number.isFinite(qty) || qty <= 0 ||
        !Number.isFinite(rate) || rate < 0) {
      showToast('Select an available article and size, an active stitcher, a date, and valid quantity and rate.', 'error');
      return;
    }
    const alreadyIssued = group.rows
      .filter(entry => entry.type === 'ISSUE')
      .reduce((total, entry) => total + (Number(entry.quantity) || 0), 0);
    const availablePairs = Math.max(0, group.cuttingReceivedPairs - alreadyIssued);
    if (qty > availablePairs) {
      showToast(`Only ${availablePairs} cutting-received pairs are available for ${group.article} / ${group.size}.`, 'error');
      return;
    }

    const normalizedSize = normalizeArticleSize(group.size);
    const sizeKeys: Record<string, keyof SizeMatrix> = {
      s: 'small',
      m: 'medium',
      l: 'large',
      xl: 'xl',
      xxl: 'xxl'
    };
    const sizeKey = sizeKeys[normalizedSize];
    const orderItem = order.items.find(item =>
      normalizeArticleSize(item.title || item.gloveType || '') === normalizeArticleSize(group.article) &&
      (normalizeArticleSize(item.size || '') === normalizedSize ||
        Boolean(sizeKey && Number(item.sizes?.[sizeKey]) > 0))
    ) || order.items.find(item =>
      normalizeArticleSize(item.title || item.gloveType || '') === normalizeArticleSize(group.article)
    );
    const sizes: SizeMatrix = { small: 0, medium: 0, large: 0, xl: 0, xxl: 0 };
    if (sizeKey) sizes[sizeKey] = qty;

    setIsSavingStitching(true);
    try {
      await createStitchingOrder({
        orderId: order.id,
        orderNo: order.orderNo,
        orderItemId: orderItem?.id || '',
        article: group.article,
        size: group.size,
        customerName: order.customerName,
        stitcherId: stitcher.id,
        stitcherName: stitcher.name,
        stitcherPhone: stitcher.phone || '',
        qty,
        receivedQuantity: 0,
        lossQuantity: 0,
        sizes,
        issueDate: stitchingForm.date,
        dueDate: '',
        rate,
        totalAmount: qty * rate,
        advancePaid: 0,
        remainingBalance: qty * rate,
        status: 'Pending',
        remarks: ''
      });
      setIsAddStitchingOpen(false);
      showToast('Stitching entry added successfully.');
    } catch (error) {
      console.error('Unable to add stitching entry:', error);
      showToast(error instanceof Error ? error.message : 'Unable to save the stitching entry.', 'error');
    } finally {
      setIsSavingStitching(false);
    }
  };

  const selectedStitchingGroup = stitchingArticleGroups.find(group => group.key === stitchingForm.articleSizeKey);
  const selectedStitchingAvailablePairs = selectedStitchingGroup
    ? Math.max(0, selectedStitchingGroup.cuttingReceivedPairs - selectedStitchingGroup.rows
      .filter(entry => entry.type === 'ISSUE')
      .reduce((total, entry) => total + (Number(entry.quantity) || 0), 0))
    : 0;

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16">
      {/* =========================================================================
          STICKY TOP HEADER: TOTAL ORIGINAL PAIRS IN BIG BOLD BLUE & PROGRESS BAR
          ========================================================================= */}
      <div className="sticky top-0 z-30 bg-white/95 backdrop-blur-md rounded-2xl border border-slate-200/90 shadow-md p-4 sm:p-5 transition-all">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          {/* Back & Order Meta */}
          <div className="flex items-center gap-3">
            <button
              onClick={onBack}
              className="p-2 rounded-xl text-slate-600 hover:text-blue-700 hover:bg-slate-100 transition shrink-0 cursor-pointer"
              title="Back to Customer Orders"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono font-black text-lg text-blue-700">
                  #{order.orderNo}
                </span>
                <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${statusBadge.bg}`}>
                  {statusBadge.label}
                </span>
              </div>
              <h1 className="text-base sm:text-lg font-black text-slate-900 truncate">
                {order.customerName}
              </h1>
            </div>
          </div>

          {/* TOTAL ORIGINAL PAIRS IN BIG BOLD BLUE (as requested) */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-6 bg-blue-50/70 border border-blue-200/80 px-4 py-2.5 rounded-xl">
            <div className="text-left sm:text-right">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-blue-600 block">
                Total Original Pairs
              </span>
              <span className="text-2xl sm:text-3xl font-black text-blue-700 font-mono tracking-tight">
                {totalOriginalPairs} <span className="text-sm font-bold text-blue-600">Pairs</span>
              </span>
            </div>

            <div className="h-8 w-px bg-blue-200 hidden sm:block" />

            {/* Quick Action Buttons */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => onOpenCuttingModalForOrder(order.id)}
                className="px-3.5 py-2 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-600 text-white shadow-sm transition active:scale-95 flex items-center gap-1.5 cursor-pointer"
              >
                <Scissors className="w-4 h-4" />
                <span>+ Give Cutting</span>
              </button>
              <button
                onClick={() => onOpenInvoiceModalForOrder(order.id)}
                className="px-3.5 py-2 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-sm transition active:scale-95 flex items-center gap-1.5 cursor-pointer"
              >
                <Receipt className="w-4 h-4" />
                <span>+ Create Bill / Dispatch</span>
              </button>
            </div>
          </div>
        </div>

        {/* Real-time Order Progress Bar: Dispatched / Original */}
        <div className="mt-3.5 pt-3 border-t border-slate-100">
          <div className="flex items-center justify-between text-xs font-bold mb-1.5">
            <span className="text-slate-700 flex items-center gap-1.5">
              <PackageCheck className="w-4 h-4 text-emerald-600" />
              <span>Dispatched to Customer:</span>
              <span className="text-emerald-700 font-mono font-black">{dispatchedPairs} / {totalOriginalPairs} Pairs</span>
            </span>
            <span className="text-slate-500 text-[11px] font-mono font-semibold">
              {dispatchedPct}% Fulfilled &bull; Pending: {pendingPairs} Pairs
            </span>
          </div>
          <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden flex">
            <div 
              style={{ width: `${dispatchedPct}%` }}
              className="h-full bg-emerald-500 transition-all duration-500 rounded-full"
              title={`Dispatched: ${dispatchedPairs} Pairs (${dispatchedPct}%)`}
            />
          </div>
        </div>
      </div>

      {/* =========================================================================
          SECTION A - ORDER DETAIL (FIXED ON TOP):
          "Original Customer Order - Never Changes"
          ========================================================================= */}
      <section className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="px-5 py-4 bg-gradient-to-r from-slate-900 to-slate-800 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-500/20 text-blue-300 border border-blue-400/30 flex items-center justify-center">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm sm:text-base font-black tracking-tight">
                  Section A: Original Customer Order
                </h2>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-400/20 text-emerald-300 border border-emerald-400/30 uppercase tracking-wider">
                  Never Changes &bull; Immutable
                </span>
              </div>
              <p className="text-[11px] text-slate-300">
                Primary contract quantities recorded at PO creation. Cutting or dispatching never alters this data.
              </p>
            </div>
          </div>

          <div className="text-left sm:text-right">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Original PO Quantity</span>
            <span className="text-base sm:text-lg font-black text-blue-300 font-mono">{totalOriginalPairs} Pairs</span>
          </div>
        </div>

        {/* PO Meta Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-5 bg-slate-50/70 border-b border-slate-200 text-xs">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Customer Name</span>
            <span className="font-bold text-slate-800 text-sm mt-0.5 block">{order.customerName}</span>
            {order.customerPhone && (
              <span className="text-slate-500 text-[11px] flex items-center gap-1 mt-0.5">
                <Phone className="w-3 h-3 text-slate-400" /> {order.customerPhone}
              </span>
            )}
          </div>
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Order Date</span>
            <span className="font-bold text-slate-800 mt-0.5 block">{formatDate(order.orderDate)}</span>
          </div>
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Delivery Date</span>
            <span className="font-bold text-blue-700 mt-0.5 block">{formatDate(order.deliveryDate)}</span>
          </div>
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Total Original Ordered Pairs</span>
            <span className="font-black text-blue-700 font-mono text-sm mt-0.5 block">{totalOriginalPairs} Pairs</span>
          </div>
        </div>

        {/* Glove Items Table with Original Immutable Quantities */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-slate-100 text-slate-600 font-bold border-b border-slate-200 uppercase text-[10px] tracking-wider">
                <th className="py-3 px-4">#</th>
                <th className="py-3 px-4">Glove Item / Article</th>
                <th className="py-3 px-4">Color</th>
                <th className="py-3 px-4 text-center">Size Matrix Breakdown (S, M, L, XL, 2XL)</th>
                <th className="py-3 px-4 text-right font-black text-slate-900">Original Qty</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium">
              {(order.items || []).map((item, idx) => {
                const origQty = Number(item.originalQty) || Number(item.totalPairs) || Number(item.qty) || 0;
                const sz = item.sizes || { small: 0, medium: 0, large: 0, xl: 0, xxl: 0 };
                return (
                  <tr key={item.id || idx} className="hover:bg-slate-50/80 transition">
                    <td className="py-3.5 px-4 font-mono text-slate-400 text-[11px]">{idx + 1}</td>
                    <td className="py-3.5 px-4">
                      <span className="font-bold text-slate-900 text-sm block">
                        {item.title || item.gloveType}
                      </span>
                      {item.leatherType && (
                        <span className="text-[10px] text-slate-400 block">{item.leatherType}</span>
                      )}
                    </td>
                    <td className="py-3.5 px-4">
                      {item.color ? (
                        <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                          {item.color}
                        </span>
                      ) : (
                        <span className="text-slate-400 text-[11px]">-</span>
                      )}
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="flex items-center justify-center gap-1.5 sm:gap-2 flex-wrap">
                        <span className="px-2 py-0.5 rounded bg-slate-50 border border-slate-200 text-[11px] font-mono">
                          <span className="font-bold text-slate-400">S:</span> {sz.small || 0}
                        </span>
                        <span className="px-2 py-0.5 rounded bg-slate-50 border border-slate-200 text-[11px] font-mono">
                          <span className="font-bold text-slate-400">M:</span> {sz.medium || 0}
                        </span>
                        <span className="px-2 py-0.5 rounded bg-slate-50 border border-slate-200 text-[11px] font-mono">
                          <span className="font-bold text-slate-400">L:</span> {sz.large || 0}
                        </span>
                        <span className="px-2 py-0.5 rounded bg-slate-50 border border-slate-200 text-[11px] font-mono">
                          <span className="font-bold text-slate-400">XL:</span> {sz.xl || 0}
                        </span>
                        <span className="px-2 py-0.5 rounded bg-slate-50 border border-slate-200 text-[11px] font-mono">
                          <span className="font-bold text-slate-400">2XL:</span> {sz.xxl || 0}
                        </span>
                      </div>
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <span className="font-mono font-black text-sm text-blue-700 bg-blue-50 px-2.5 py-1 rounded-lg border border-blue-100">
                        {origQty} Pairs
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="bg-slate-50 font-black text-xs text-slate-900 border-t border-slate-200">
                <td colSpan={4} className="py-3 px-4 text-right uppercase tracking-wider">
                  Total Original Order Pairs:
                </td>
                <td className="py-3 px-4 text-right font-mono text-sm text-blue-700">
                  {totalOriginalPairs} Pairs
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      {/* =========================================================================
          SECTION B - ORDER PROGRESS / LIVE STATUS (MIDDLE):
          Calculated by querying history collections, NOT by modifying main order.
          ========================================================================= */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-black text-slate-900 tracking-tight flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-blue-600" />
              <span>Section B: Live Order Progress & Pipeline Status</span>
            </h2>
            <p className="text-xs text-slate-500">
              Live calculated metrics from transaction history collections &bull; Main contract quantity is untouched
            </p>
          </div>
        </div>

        {/* 4 Colored Progress Cards as specified */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1: Cutting Given */}
          <div className="bg-white rounded-2xl p-5 border border-amber-200 shadow-xs relative overflow-hidden">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-amber-700">
                1. Cutting Given
              </span>
              <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
                <Scissors className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-3">
              <div className="text-2xl font-black text-amber-700 font-mono">
                {cuttingGivenPairs} <span className="text-xs font-medium text-slate-500">pairs</span>
              </div>
              <div className="mt-2 text-xs text-slate-500 flex items-center justify-between">
                <span>{cuttingPct}% of original PO</span>
                <span className="font-semibold text-amber-800">{orderCuttings.length} work batches</span>
              </div>
              <div className="w-full h-1.5 bg-amber-100 rounded-full mt-2 overflow-hidden">
                <div style={{ width: `${cuttingPct}%` }} className="h-full bg-amber-500 rounded-full" />
              </div>
            </div>
          </div>

          {/* Card 2: Stock Received */}
          <div className="bg-white rounded-2xl p-5 border border-emerald-200 shadow-xs relative overflow-hidden">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-700">
                2. Stock Received
              </span>
              <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                <Boxes className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-3">
              <div className="text-2xl font-black text-emerald-600 font-mono">
                {stockReceivedPairs} <span className="text-xs font-medium text-slate-500">pairs</span>
              </div>
              <div className="mt-2 text-xs text-slate-500 flex items-center justify-between">
                <span>{stockPct}% ready in warehouse</span>
                <span className="font-semibold text-emerald-800">From Cutters</span>
              </div>
              <div className="w-full h-1.5 bg-emerald-100 rounded-full mt-2 overflow-hidden">
                <div style={{ width: `${stockPct}%` }} className="h-full bg-emerald-500 rounded-full" />
              </div>
            </div>
          </div>

          {/* Card 3: Billed / Dispatched */}
          <div className="bg-white rounded-2xl p-5 border border-blue-200 shadow-xs relative overflow-hidden">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-blue-700">
                3. Billed / Dispatched
              </span>
              <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                <Receipt className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-3">
              <div className="text-2xl font-black text-blue-700 font-mono">
                {dispatchedPairs} <span className="text-xs font-medium text-slate-500">pairs</span>
              </div>
              <div className="mt-2 text-xs text-slate-500 flex items-center justify-between">
                <span>{dispatchedPct}% delivered to buyer</span>
                <span className="font-semibold text-blue-800">{orderInvoices.length} Invoices</span>
              </div>
              <div className="w-full h-1.5 bg-blue-100 rounded-full mt-2 overflow-hidden">
                <div style={{ width: `${dispatchedPct}%` }} className="h-full bg-blue-600 rounded-full" />
              </div>
            </div>
          </div>

          {/* Card 4: Pending Balance */}
          <div className="bg-white rounded-2xl p-5 border border-indigo-200 shadow-xs relative overflow-hidden">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-indigo-700">
                4. Pending to Dispatch
              </span>
              <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                <Clock className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-3">
              <div className="text-2xl font-black text-indigo-700 font-mono">
                {pendingPairs} <span className="text-xs font-medium text-slate-500">pairs</span>
              </div>
              <div className="mt-2 text-xs text-slate-500 flex items-center justify-between">
                <span>Original Qty - Dispatched</span>
                <span className="font-bold text-indigo-800">{pendingPairs === 0 ? 'Fully Fulfilled' : 'In Pipeline'}</span>
              </div>
              <div className="w-full h-1.5 bg-indigo-100 rounded-full mt-2 overflow-hidden">
                <div 
                  style={{ width: `${totalOriginalPairs > 0 ? (pendingPairs / totalOriginalPairs) * 100 : 0}%` }} 
                  className="h-full bg-indigo-500 rounded-full" 
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* =========================================================================
          SECTION C - ORDER HISTORY (BOTTOM - TABS):
          Tab 1: Glove Items Status (Original vs Given vs Pending)
          Tab 2: Cutting History (from cuttings collection)
          Tab 3: Stitching History
          Tab 4: Stock Movement (from stock_ledger)
          Tab 5: Dispatch History / Billed History (from sales_invoices + order_dispatch_history)
          ========================================================================= */}
      <section className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        {/* Tab Navigation Header */}
        <div className="p-4 sm:p-5 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/50">
          <div>
            <h2 className="text-base font-black text-slate-900 tracking-tight">
              Section C: Order History & Audit Trail
            </h2>
            <p className="text-xs text-slate-500">
              Detailed tracking across cutting assignments, stock receipts, and dispatches.
            </p>
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto p-1 bg-slate-100 rounded-xl">
            <button
              onClick={() => setActiveTab('items')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition whitespace-nowrap cursor-pointer ${
                activeTab === 'items'
                  ? 'bg-white text-blue-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Tab 1: Glove Status
            </button>
            <button
              onClick={() => setActiveTab('cutting')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition whitespace-nowrap cursor-pointer ${
                activeTab === 'cutting'
                  ? 'bg-white text-blue-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Tab 2: Cutting History ({orderCuttingRecords.length})
            </button>
            <button
              onClick={() => setActiveTab('stitching')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition whitespace-nowrap cursor-pointer ${
                activeTab === 'stitching'
                  ? 'bg-white text-blue-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Tab 3: Stitching History ({orderStitchingHistory.filter(entry => entry.type === 'ISSUE').length})
            </button>
            <button
              onClick={() => setActiveTab('stock')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition whitespace-nowrap cursor-pointer ${
                activeTab === 'stock'
                  ? 'bg-white text-blue-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Tab 4: Stock Movement ({orderStockLedger.length})
            </button>
            <button
              onClick={() => setActiveTab('dispatch')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition whitespace-nowrap cursor-pointer ${
                activeTab === 'dispatch'
                  ? 'bg-white text-blue-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Tab 5: Dispatch / Bills ({orderInvoices.length + orderDispatches.length})
            </button>
          </div>
        </div>

        {/* Tab 1 Content: Glove Items Status (Original vs Given vs Pending table) */}
        {activeTab === 'items' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200 uppercase text-[10px] tracking-wider">
                  <th className="py-3 px-4">#</th>
                  <th className="py-3 px-4">Glove Type / Article</th>
                  <th className="py-3 px-4">Size Matrix</th>
                  <th className="py-3 px-4 text-right font-black text-blue-700">Original Qty</th>
                  <th className="py-3 px-4 text-right font-bold text-amber-700">Cutting Given</th>
                  <th className="py-3 px-4 text-right font-bold text-emerald-700">Stock Received</th>
                  <th className="py-3 px-4 text-right font-bold text-blue-700">Dispatched</th>
                  <th className="py-3 px-4 text-right font-bold text-indigo-700">Pending</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {(order.items || []).map((itm, idx) => {
                  const orig = Number(itm.originalQty) || Number(itm.totalPairs) || Number(itm.qty) || 0;
                  const given = Number(itm.cuttingGivenQty) || 0;
                  const stockRec = Number(itm.stockReceivedQty) || 0;
                  const billed = Number(itm.billedQty) || 0;
                  const pend = Math.max(0, orig - billed);
                  const sz = itm.sizes || { small: 0, medium: 0, large: 0, xl: 0, xxl: 0 };

                  return (
                    <tr key={itm.id || idx} className="hover:bg-slate-50/70 transition">
                      <td className="py-3.5 px-4 font-mono text-slate-400">{idx + 1}</td>
                      <td className="py-3.5 px-4">
                        <span className="font-bold text-slate-900">{itm.title || itm.gloveType}</span>
                        {itm.color && (
                          <span className="text-[10px] text-slate-400 block">Color: {itm.color}</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="text-[11px] font-mono text-slate-600">
                          S:{sz.small || 0} M:{sz.medium || 0} L:{sz.large || 0} XL:{sz.xl || 0} 2XL:{sz.xxl || 0}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono font-black text-blue-700">
                        {orig}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono font-bold text-amber-700">
                        {given}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono font-bold text-emerald-700">
                        {stockRec}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono font-bold text-blue-700">
                        {billed}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono font-black text-indigo-700">
                        {pend}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Tab 2 Content: Cutting History (from cuttings and cutting_transactions) */}
        {activeTab === 'cutting' && (
          <div className="space-y-4 p-4 sm:p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="relative w-full sm:max-w-sm">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <input
                  type="search"
                  value={cuttingArticleSearch}
                  onChange={event => setCuttingArticleSearch(event.target.value)}
                  placeholder="Search by article or size"
                  className="w-full rounded-xl border border-slate-300 py-2 pl-9 pr-3 text-sm"
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setNewCuttingArticle('');
                    setNewCuttingSize('');
                    setIsAddArticleSizeOpen(true);
                  }}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-blue-200 bg-white px-4 py-2.5 text-sm font-bold text-blue-700 hover:bg-blue-50"
                >
                  <Plus className="h-4 w-4" />
                  Add Article &amp; Size
                </button>
                <button
                  type="button"
                  onClick={() => onOpenCuttingModalForOrder(order.id)}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-amber-500 px-4 py-2.5 text-sm font-bold text-white hover:bg-amber-600"
                >
                  <Scissors className="h-4 w-4" />
                  Add Cutting Entry
                </button>
              </div>
            </div>

            {cuttingArticleGroups.filter(group => {
              const query = cuttingArticleSearch.trim().toLocaleLowerCase();
              return !query || group.article.toLocaleLowerCase().includes(query) || group.size.toLocaleLowerCase().includes(query);
            }).length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-slate-500">
                <Scissors className="mx-auto mb-2 h-8 w-8 opacity-40" />
                <p className="text-sm font-semibold">{cuttingArticleSearch ? 'No matching articles or sizes.' : 'No article or size groups are available for this order.'}</p>
                {!cuttingArticleSearch && (
                  <button
                    type="button"
                    onClick={() => onOpenCuttingModalForOrder(order.id)}
                    className="mt-3 rounded-lg bg-amber-500 px-3 py-2 text-xs font-bold text-white hover:bg-amber-600"
                  >
                    Add Cutting Entry
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                {cuttingArticleGroups
                  .filter(group => {
                    const query = cuttingArticleSearch.trim().toLocaleLowerCase();
                    return !query || group.article.toLocaleLowerCase().includes(query) || group.size.toLocaleLowerCase().includes(query);
                  })
                  .map((group, index) => {
                    const issuedPairs = group.rows.reduce((sum, row) =>
                      sum + (row.type === 'GIVE' || row.isLegacyCut ? row.qty : 0), 0);
                    const receivedPairs = group.rows.reduce((sum, row) =>
                      sum + (row.type === 'RECEIVE' ? row.qty : 0), 0);
                    const remainingPairs = Math.max(0, group.orderedPairs - receivedPairs);
                    const progress = group.orderedPairs > 0
                      ? Math.min(100, Math.round((receivedPairs / group.orderedPairs) * 100))
                      : 0;
                    const cutterTotals = new Map<string, { issued: number; received: number; rows: CuttingHistoryRow[] }>();
                    group.rows.forEach(row => {
                      const totals = cutterTotals.get(row.cutterName) || { issued: 0, received: 0, rows: [] };
                      if (row.isLegacyCut) {
                        totals.issued += row.qty;
                        if (row.type === 'RECEIVE') totals.received += row.qty;
                      } else if (row.type === 'GIVE') {
                        totals.issued += row.qty;
                      } else {
                        totals.received += row.qty;
                      }
                      totals.rows.push(row);
                      cutterTotals.set(row.cutterName, totals);
                    });
                    const expanded = expandedCuttingGroup === group.key;

                    return (
                      <section key={group.key} className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                        <button
                          type="button"
                          onClick={() => setExpandedCuttingGroup(expanded ? null : group.key)}
                          aria-expanded={expanded}
                          className={`grid w-full grid-cols-1 gap-3 p-4 text-left transition hover:bg-blue-50/70 sm:grid-cols-[minmax(180px,1.3fr)_minmax(90px,.45fr)_repeat(3,minmax(115px,.7fr))_auto] sm:items-center ${expanded ? 'bg-blue-50/70' : ''}`}
                        >
                          <span className="flex min-w-0 items-center gap-2">
                            {expanded
                              ? <ChevronDown className="h-4 w-4 shrink-0 text-blue-700" />
                              : <ChevronRight className="h-4 w-4 shrink-0 text-slate-500" />}
                            <span className="min-w-0">
                              <span className="block truncate text-sm font-black text-slate-900">{group.article}</span>
                              <span className="block text-[11px] text-slate-500">Article</span>
                            </span>
                          </span>
                          <span>
                            <span className="block text-sm font-bold text-slate-800">{group.size}</span>
                            <span className="block text-[11px] text-slate-500">Size</span>
                          </span>
                          <span>
                            <span className="block text-sm font-bold text-slate-800">{group.rows.length} Entries</span>
                            <span className="block text-[11px] text-slate-500">History records</span>
                          </span>
                          <span>
                            <span className="block text-sm font-black text-amber-700">{issuedPairs.toLocaleString()} Pairs</span>
                            <span className="block text-[11px] text-slate-500">Cutting issued</span>
                          </span>
                          <span>
                            <span className="block text-sm font-bold text-blue-800">{remainingPairs.toLocaleString()} Pairs</span>
                            <span className="block text-[11px] text-slate-500">Remaining from order</span>
                          </span>
                          <span className="flex items-center gap-2 sm:min-w-[95px]">
                            <span className="h-2 min-w-14 flex-1 overflow-hidden rounded-full bg-slate-200">
                              <span className={`block h-full rounded-full ${progress === 100 ? 'bg-emerald-500' : 'bg-blue-600'}`} style={{ width: `${progress}%` }} />
                            </span>
                            <span className="text-xs font-bold text-slate-600">{progress}%</span>
                          </span>
                        </button>

                        {expanded && (
                          <div className="border-t border-blue-200 bg-slate-50 p-3 sm:p-4">
                            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                              <div>
                                <h4 className="text-sm font-black text-slate-900">Article: {group.article} <span className="text-slate-400">|</span> Size: {group.size}</h4>
                                <p className="mt-1 text-xs text-slate-600">
                                  Ordered: {group.orderedPairs.toLocaleString()} · Issued: {issuedPairs.toLocaleString()} · Received: {receivedPairs.toLocaleString()} · Remaining: {remainingPairs.toLocaleString()} Pairs
                                </p>
                              </div>
                            </div>
                            {group.rows.length === 0 ? (
                              <div className="rounded-lg border border-dashed border-slate-300 bg-white p-5 text-center text-xs text-slate-500">
                                No cutting history recorded for this article and size yet.
                                <button
                                  type="button"
                                  onClick={() => {
                                    const matchingItem = order.items.find(item =>
                                      (item.title || item.gloveType || '').trim().toLocaleLowerCase() === group.article.trim().toLocaleLowerCase()
                                    );
                                    onOpenCuttingModalForOrder(order.id, matchingItem?.id);
                                  }}
                                  className="ml-2 font-bold text-blue-700 hover:underline"
                                >
                                  Add cutting entry
                                </button>
                              </div>
                            ) : (
                              <>
                                <div className="overflow-x-auto rounded-lg border border-slate-300 bg-white">
                                  <table className="w-full min-w-[850px] border-collapse text-left text-xs">
                                    <thead>
                                      <tr className="bg-blue-400 font-bold text-white">
                                        <th className="border border-slate-300 px-3 py-2">Sr #</th>
                                        <th className="border border-slate-300 px-3 py-2">Date</th>
                                        <th className="border border-slate-300 px-3 py-2">Cutter Name / Worker</th>
                                        <th className="border border-slate-300 px-3 py-2 text-right">Cutting (Pairs)</th>
                                        <th className="border border-slate-300 px-3 py-2 text-right">Rate</th>
                                        <th className="border border-slate-300 px-3 py-2 text-right">Total Amount</th>
                                        <th className="border border-slate-300 px-3 py-2">Status</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {group.rows.map((row, rowIndex) => (
                                        <tr key={row.id} className={rowIndex % 2 ? 'bg-slate-100' : 'bg-white'}>
                                          <td className="border border-slate-300 px-3 py-2 font-mono">{rowIndex + 1}</td>
                                          <td className="border border-slate-300 px-3 py-2 font-mono">{formatDate(row.date)}</td>
                                          <td className="border border-slate-300 px-3 py-2">
                                            <button
                                              type="button"
                                              onClick={() => setSelectedCutterHistory({
                                                article: group.article,
                                                size: group.size,
                                                cutterName: row.cutterName,
                                                rows: group.rows.filter(item => item.cutterName === row.cutterName)
                                              })}
                                              className="font-bold text-blue-700 underline decoration-dotted underline-offset-2 hover:text-blue-900"
                                            >
                                              {row.cutterName}
                                            </button>
                                          </td>
                                          <td className="border border-slate-300 px-3 py-2 text-right font-mono font-bold">{row.qty.toLocaleString()}</td>
                                          <td className="border border-slate-300 px-3 py-2 text-right font-mono">{row.rate > 0 ? `Rs. ${row.rate}` : '-'}</td>
                                          <td className="border border-slate-300 px-3 py-2 text-right font-mono">{row.amount > 0 ? `Rs. ${row.amount.toLocaleString()}` : '-'}</td>
                                          <td className="border border-slate-300 px-3 py-2">
                                            <span className={`rounded-full px-2 py-1 text-[10px] font-bold ${row.type === 'GIVE' ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'}`}>
                                              {row.status}
                                            </span>
                                          </td>
                                        </tr>
                                      ))}
                                      <tr className="bg-amber-50 font-black">
                                        <td className="border border-slate-300 px-3 py-2" colSpan={3}>TOTAL ISSUED / RECEIVED</td>
                                        <td className="border border-slate-300 px-3 py-2 text-right font-mono">{issuedPairs.toLocaleString()} / {receivedPairs.toLocaleString()}</td>
                                        <td className="border border-slate-300 px-3 py-2" />
                                        <td className="border border-slate-300 px-3 py-2 text-right font-mono">
                                          Rs. {group.rows.reduce((sum, row) => sum + row.amount, 0).toLocaleString()}
                                        </td>
                                        <td className="border border-slate-300 px-3 py-2" />
                                      </tr>
                                    </tbody>
                                  </table>
                                </div>
                                <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                                  {[...cutterTotals.entries()].map(([cutterName, totals]) => (
                                    <button
                                      key={cutterName}
                                      type="button"
                                      onClick={() => setSelectedCutterHistory({
                                        article: group.article,
                                        size: group.size,
                                        cutterName,
                                        rows: totals.rows
                                      })}
                                      className="rounded-lg border border-slate-200 bg-white p-3 text-left text-xs hover:border-blue-300 hover:bg-blue-50/50"
                                    >
                                      <span className="block font-bold text-slate-900">{cutterName}</span>
                                      <span className="mt-1 block text-slate-600">
                                        Issued: {totals.issued.toLocaleString()} · Received: {totals.received.toLocaleString()} Pairs
                                      </span>
                                    </button>
                                  ))}
                                </div>
                                <p className="mt-3 text-right text-sm font-black text-slate-900">
                                  Total Cutting: {issuedPairs.toLocaleString()} Pairs
                                </p>
                              </>
                            )}
                          </div>
                        )}
                      </section>
                    );
                  })}
              </div>
            )}
          </div>
        )}

        {/* Tab 3: Stitching History */}
        {activeTab === 'stitching' && (
          <div className="space-y-4 p-4 sm:p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="relative w-full sm:max-w-sm">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <input
                  type="search"
                  value={stitchingArticleSearch}
                  onChange={event => setStitchingArticleSearch(event.target.value)}
                  placeholder="Search by article or size"
                  className="w-full rounded-xl border border-slate-300 py-2 pl-9 pr-3 text-sm"
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setNewCuttingArticle('');
                    setNewCuttingSize('');
                    setIsAddArticleSizeOpen(true);
                  }}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-blue-200 bg-white px-4 py-2.5 text-sm font-bold text-blue-700 hover:bg-blue-50"
                >
                  <Plus className="h-4 w-4" />
                  Add Article &amp; Size
                </button>
                <button
                  type="button"
                  onClick={() => openAddStitchingEntry()}
                  disabled={availableStitchingGroups.length === 0 || !stitchers.some(stitcher => stitcher.isActive)}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-amber-500 px-4 py-2.5 text-sm font-bold text-white hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Scissors className="h-4 w-4" />
                  Add Stitching Entry
                </button>
              </div>
            </div>

            {stitchingArticleGroups.filter(group => {
              const query = stitchingArticleSearch.trim().toLocaleLowerCase();
              return !query || group.article.toLocaleLowerCase().includes(query) || group.size.toLocaleLowerCase().includes(query);
            }).length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-slate-500">
                <Scissors className="mx-auto mb-2 h-8 w-8 opacity-40" />
                <p className="text-sm font-semibold">
                  {stitchingArticleSearch ? 'No matching articles or sizes.' : 'No article or size groups are available for this order.'}
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {stitchingArticleGroups.filter(group => {
                  const query = stitchingArticleSearch.trim().toLocaleLowerCase();
                  return !query || group.article.toLocaleLowerCase().includes(query) || group.size.toLocaleLowerCase().includes(query);
                }).map(group => {
                  const issuedEntries = group.rows.filter(entry => entry.type === 'ISSUE');
                  const issuedPairs = issuedEntries.reduce((total, entry) => total + (Number(entry.quantity) || 0), 0);
                  const remainingPairs = Math.max(0, group.cuttingReceivedPairs - issuedPairs);
                  const progress = group.cuttingReceivedPairs > 0
                    ? Math.min(100, Math.round((issuedPairs / group.cuttingReceivedPairs) * 100))
                    : 0;
                  const expanded = expandedStitchingGroup === group.key;
                  return (
                    <section key={group.key} className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                      <button
                        type="button"
                        onClick={() => setExpandedStitchingGroup(expanded ? null : group.key)}
                        aria-expanded={expanded}
                        className={`grid w-full grid-cols-1 gap-3 p-4 text-left transition hover:bg-blue-50/70 sm:grid-cols-[minmax(180px,1.3fr)_minmax(90px,.45fr)_repeat(3,minmax(115px,.7fr))_auto] sm:items-center ${expanded ? 'bg-blue-50/70' : ''}`}
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          {expanded
                            ? <ChevronDown className="h-4 w-4 shrink-0 text-blue-700" />
                            : <ChevronRight className="h-4 w-4 shrink-0 text-slate-500" />}
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-black text-slate-900">{group.article}</span>
                            <span className="block text-[11px] text-slate-500">Article</span>
                          </span>
                        </span>
                        <span>
                          <span className="block text-sm font-bold text-slate-800">{group.size}</span>
                          <span className="block text-[11px] text-slate-500">Size</span>
                        </span>
                        <span>
                          <span className="block text-sm font-bold text-slate-800">{issuedEntries.length} Entries</span>
                          <span className="block text-[11px] text-slate-500">History records</span>
                        </span>
                        <span>
                          <span className="block text-sm font-black text-amber-700">{issuedPairs.toLocaleString()} Pairs</span>
                          <span className="block text-[11px] text-slate-500">Stitching issued</span>
                        </span>
                        <span>
                          <span className="block text-sm font-bold text-blue-800">{remainingPairs.toLocaleString()} Pairs</span>
                          <span className="block text-[11px] text-slate-500">Remaining from Cutting Received</span>
                        </span>
                        <span className="flex items-center gap-2 sm:min-w-[95px]">
                          <span className="h-2 min-w-14 flex-1 overflow-hidden rounded-full bg-slate-200">
                            <span className={`block h-full rounded-full ${progress === 100 ? 'bg-emerald-500' : 'bg-blue-600'}`} style={{ width: `${progress}%` }} />
                          </span>
                          <span className="text-xs font-bold text-slate-600">{progress}%</span>
                        </span>
                      </button>
                      {expanded && (
                        <div className="border-t border-blue-200 bg-slate-50 p-3 sm:p-4">
                          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                            <div>
                              <h4 className="text-sm font-black text-slate-900">Article: {group.article} <span className="text-slate-400">|</span> Size: {group.size}</h4>
                              <p className="mt-1 text-xs text-slate-600">
                                Cutting Received: {group.cuttingReceivedPairs.toLocaleString()} · Stitching Issued: {issuedPairs.toLocaleString()} · Remaining: {remainingPairs.toLocaleString()} Pairs
                              </p>
                            </div>
                            <button
                              type="button"
                              disabled={remainingPairs === 0 || !stitchers.some(stitcher => stitcher.isActive)}
                              onClick={() => openAddStitchingEntry(group.key)}
                              className="rounded-lg bg-amber-500 px-3 py-2 text-xs font-bold text-white hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              Add Stitching Entry
                            </button>
                          </div>
                          {group.cuttingReceivedPairs === 0 && (
                            <div className="mb-3 rounded-lg border border-dashed border-slate-300 bg-white p-4 text-center text-xs text-slate-500">
                              No cutting history received for this article and size yet.
                              <button
                                type="button"
                                onClick={() => onOpenCuttingModalForOrder(order.id)}
                                className="ml-2 font-bold text-blue-700 hover:underline"
                              >
                                Add cutting entry
                              </button>
                            </div>
                          )}
                          {issuedEntries.length === 0 ? (
                            <div className="rounded-lg border border-dashed border-slate-300 bg-white p-5 text-center text-xs text-slate-500">
                              No stitching history recorded for this article and size yet.
                            </div>
                          ) : (
                            <div className="overflow-x-auto rounded-lg border border-slate-300 bg-white">
                              <table className="w-full min-w-[850px] border-collapse text-left text-xs">
                                <thead>
                                  <tr className="bg-blue-400 font-bold text-white">
                                    <th className="border border-slate-300 px-3 py-2">Date</th>
                                    <th className="border border-slate-300 px-3 py-2">Customer Name</th>
                                    <th className="border border-slate-300 px-3 py-2">Article</th>
                                    <th className="border border-slate-300 px-3 py-2">Size</th>
                                    <th className="border border-slate-300 px-3 py-2 text-right">Pairs</th>
                                    <th className="border border-slate-300 px-3 py-2 text-right">Rate</th>
                                    <th className="border border-slate-300 px-3 py-2 text-right">Total Balance</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {issuedEntries.map((entry, rowIndex) => (
                                    <tr key={entry.id} className={rowIndex % 2 ? 'bg-slate-100' : 'bg-white'}>
                                      <td className="border border-slate-300 px-3 py-2 font-mono">{formatDate(entry.date)}</td>
                                      <td className="border border-slate-300 px-3 py-2">{entry.customerName}</td>
                                      <td className="border border-slate-300 px-3 py-2 font-bold text-slate-900">{entry.article}</td>
                                      <td className="border border-slate-300 px-3 py-2">{entry.size || group.size}</td>
                                      <td className="border border-slate-300 px-3 py-2 text-right font-mono font-bold">{entry.quantity.toLocaleString()}</td>
                                      <td className="border border-slate-300 px-3 py-2 text-right font-mono">Rs. {entry.rate.toLocaleString()}</td>
                                      <td className="border border-slate-300 px-3 py-2 text-right font-mono">Rs. {entry.amount.toLocaleString()}</td>
                                    </tr>
                                  ))}
                                  <tr className="bg-amber-50 font-black">
                                    <td className="border border-slate-300 px-3 py-2" colSpan={4}>TOTAL STITCHING ISSUED</td>
                                    <td className="border border-slate-300 px-3 py-2 text-right font-mono">{issuedPairs.toLocaleString()}</td>
                                    <td className="border border-slate-300 px-3 py-2" />
                                    <td className="border border-slate-300 px-3 py-2 text-right font-mono">Rs. {issuedEntries.reduce((total, entry) => total + (Number(entry.amount) || 0), 0).toLocaleString()}</td>
                                  </tr>
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      )}
                    </section>
                  );
                })}
              </div>
            )}
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <h3 className="mb-2 flex items-center gap-2 text-sm font-black text-slate-900"><ShieldCheck className="h-4 w-4 text-blue-600" />Stitching History &amp; Audit Trail</h3>
              {orderStitchingHistory.length === 0
                ? <p className="text-xs text-slate-500">No stitching audit events have been recorded yet.</p>
                : (
                  <div className="space-y-4">
                    {orderStitchingOrders.map(stitchingOrder => (
                      <div key={stitchingOrder.id} className="border-b border-slate-200 pb-3 last:border-0 last:pb-0">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="text-xs">
                            <b className="text-slate-800">{stitchingOrder.article}</b>
                            <span className="ml-2 text-slate-500">{stitchingOrder.stitcherName} · {stitchingOrder.status}</span>
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            <button type="button" onClick={() => void handleStitchingStatusChange(stitchingOrder.id, 'Customer Stock Created')} className="rounded-md bg-blue-600 px-2 py-1.5 text-[10px] font-bold text-white hover:bg-blue-700">Create Customer Stock</button>
                            <button type="button" onClick={() => void handleStitchingStatusChange(stitchingOrder.id, 'Stock Received')} className="rounded-md bg-green-600 px-2 py-1.5 text-[10px] font-bold text-white hover:bg-green-700">Stock Received</button>
                            <button type="button" onClick={() => void handleStitchingStatusChange(stitchingOrder.id, 'Ready for Stitching')} className="rounded-md bg-amber-500 px-2 py-1.5 text-[10px] font-bold text-white hover:bg-amber-600">Ready for Stitching</button>
                            <button type="button" onClick={() => void handleStitchingStatusChange(stitchingOrder.id, 'Packing')} className="rounded-md bg-slate-700 px-2 py-1.5 text-[10px] font-bold text-white hover:bg-slate-800">Packing</button>
                          </div>
                        </div>
                        <ol className="mt-2 space-y-1">
                          {orderStitchingHistory.filter(entry => entry.stitchingOrderId === stitchingOrder.id).map(entry => (
                            <li key={entry.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                              <span className="font-mono text-slate-500">{formatDate(entry.date)}</span>
                              <b className="text-slate-800">{entry.type === 'STATUS' ? entry.status || 'Status updated' : entry.type === 'ISSUE' ? 'Stitching issued' : 'Stitching received'}</b>
                              <span className="text-slate-600">{entry.article} · {entry.quantity} pairs · {entry.stitcherName}</span>
                              {entry.remarks && <span className="text-slate-500">{entry.remarks}</span>}
                            </li>
                          ))}
                        </ol>
                      </div>
                    ))}
                  </div>
                )}
            </div>
          </div>
        )}

        {/* Tab 3 Content: Stock Movement (from stock_ledger) */}
        {activeTab === 'stock' && (
          <div className="overflow-x-auto">
            {orderStockLedger.length === 0 ? (
              <div className="p-8 text-center text-slate-400">
                <Boxes className="w-8 h-8 mx-auto mb-2 opacity-40" />
                <p className="text-xs">No stock ledger movements logged for this order yet.</p>
              </div>
            ) : (
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200 uppercase text-[10px] tracking-wider">
                    <th className="py-3 px-4">Date</th>
                    <th className="py-3 px-4">Movement Type</th>
                    <th className="py-3 px-4">Product / Item</th>
                    <th className="py-3 px-4 text-right">Quantity</th>
                    <th className="py-3 px-4">Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {orderStockLedger.map(entry => (
                    <tr key={entry.id} className="hover:bg-slate-50/70 transition">
                      <td className="py-3 px-4 font-mono">{formatDate(entry.date)}</td>
                      <td className="py-3 px-4">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                          entry.type === 'in' || entry.type === 'cutting_received'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-rose-50 text-rose-700 border border-rose-200'
                        }`}>
                          {entry.type === 'in' || entry.type === 'cutting_received' ? 'Stock In (+)' : 'Stock Out / Sale (-)'}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-bold text-slate-900">{entry.productName}</td>
                      <td className="py-3 px-4 text-right font-mono font-black text-slate-900">{entry.qty} Pairs</td>
                      <td className="py-3 px-4 text-slate-500">{entry.notes || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* Tab 4 Content: Dispatch / Billing History (from sales_invoices + order_dispatch_history) */}
        {activeTab === 'dispatch' && (
          <div className="overflow-x-auto">
            {orderInvoices.length === 0 && orderDispatches.length === 0 ? (
              <div className="p-8 text-center text-slate-400">
                <Receipt className="w-8 h-8 mx-auto mb-2 opacity-40" />
                <p className="text-xs">No customer sales invoices or dispatches created yet.</p>
                <button
                  onClick={() => onOpenInvoiceModalForOrder(order.id)}
                  className="mt-3 px-3 py-1.5 rounded-lg text-xs font-bold bg-blue-600 text-white hover:bg-blue-700 transition"
                >
                  + Create Sale Invoice & Dispatch
                </button>
              </div>
            ) : (
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200 uppercase text-[10px] tracking-wider">
                    <th className="py-3 px-4">Date</th>
                    <th className="py-3 px-4">Invoice / Action</th>
                    <th className="py-3 px-4">Customer Name</th>
                    <th className="py-3 px-4 text-right">Dispatched Qty</th>
                    <th className="py-3 px-4 text-right">Invoice Value</th>
                    <th className="py-3 px-4">Payment</th>
                    <th className="py-3 px-4">Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {orderInvoices.map(inv => {
                    const totalInvPairs = (inv.items || []).reduce((s, i) => s + (Number(i.qty) || 0), 0);
                    return (
                      <tr key={inv.id} className="hover:bg-slate-50/70 transition">
                        <td className="py-3 px-4 font-mono">{formatDate(inv.date)}</td>
                        <td className="py-3 px-4">
                          <span className="font-mono font-bold text-blue-700">#{inv.invoiceNo}</span>
                        </td>
                        <td className="py-3 px-4 font-bold text-slate-900">{inv.customerName}</td>
                        <td className="py-3 px-4 text-right font-mono font-black text-slate-900">{totalInvPairs} Pairs</td>
                        <td className="py-3 px-4 text-right font-mono font-bold text-slate-800">
                          {formatCurrency(inv.grandTotal, settings.currency)}
                        </td>
                        <td className="py-3 px-4">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            inv.paymentStatus === 'paid' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                          }`}>
                            {inv.paymentStatus.toUpperCase()} ({inv.paymentMode})
                          </span>
                        </td>
                        <td className="py-3 px-4 text-slate-500">{inv.notes || '-'}</td>
                      </tr>
                    );
                  })}
                  {orderDispatches.map(disp => (
                    <tr key={disp.id} className="hover:bg-slate-50/70 transition bg-slate-50/30">
                      <td className="py-3 px-4 font-mono">{formatDate(disp.date)}</td>
                      <td className="py-3 px-4">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                          Dispatch Entry
                        </span>
                      </td>
                      <td className="py-3 px-4 font-bold text-slate-900">{disp.personName || order.customerName}</td>
                      <td className="py-3 px-4 text-right font-mono font-black text-slate-900">{disp.quantity} Pairs</td>
                      <td className="py-3 px-4 text-right text-slate-400 font-mono">-</td>
                      <td className="py-3 px-4 text-slate-400">-</td>
                      <td className="py-3 px-4 text-slate-500">{disp.notes || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </section>

      {isAddArticleSizeOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/60 p-4">
          <form onSubmit={handleSaveArticleSize} className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Add Article &amp; Size</h3>
                <p className="mt-1 text-xs text-slate-500">This article and size will be saved to this order.</p>
              </div>
              <button
                type="button"
                onClick={() => setIsAddArticleSizeOpen(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"
                aria-label="Close article and size form"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <label className="mt-4 block text-sm font-semibold text-slate-700">
              Article Name
              <input
                autoFocus
                required
                value={newCuttingArticle}
                onChange={event => setNewCuttingArticle(event.target.value)}
                placeholder="Enter article name"
                className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"
              />
            </label>
            <label className="mt-3 block text-sm font-semibold text-slate-700">
              Size
              <input
                required
                value={newCuttingSize}
                onChange={event => setNewCuttingSize(event.target.value)}
                placeholder="Enter size"
                className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"
              />
            </label>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsAddArticleSizeOpen(false)}
                disabled={isSavingArticleSize}
                className="rounded-xl px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSavingArticleSize}
                className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-60"
              >
                {isSavingArticleSize ? 'Saving...' : 'Save Article & Size'}
              </button>
            </div>
          </form>
        </div>
      )}

      {isAddStitchingOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/60 p-4">
          <form onSubmit={handleSaveStitchingEntry} className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Add Stitching Entry</h3>
                <p className="mt-1 text-xs text-slate-500">Issue only pairs already received from Cutting.</p>
              </div>
              <button
                type="button"
                onClick={() => setIsAddStitchingOpen(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"
                aria-label="Close stitching entry form"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="text-sm font-semibold text-slate-700">
                Article &amp; Size *
                <select
                  required
                  value={stitchingForm.articleSizeKey}
                  onChange={event => setStitchingForm({ ...stitchingForm, articleSizeKey: event.target.value })}
                  className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2"
                >
                  <option value="">Select article and size</option>
                  {stitchingArticleGroups.map(group => {
                    const remaining = Math.max(0, group.cuttingReceivedPairs - group.rows
                      .filter(entry => entry.type === 'ISSUE')
                      .reduce((total, entry) => total + (Number(entry.quantity) || 0), 0));
                    return (
                      <option key={group.key} value={group.key} disabled={remaining === 0}>
                        {group.article} / {group.size} — {remaining} pairs available
                      </option>
                    );
                  })}
                </select>
              </label>
              <label className="text-sm font-semibold text-slate-700">
                Stitcher Name *
                <select
                  required
                  value={stitchingForm.stitcherId}
                  onChange={event => {
                    const stitcher = stitchers.find(item => item.id === event.target.value);
                    setStitchingForm({
                      ...stitchingForm,
                      stitcherId: event.target.value,
                      rate: stitcher?.perPairRate ? String(stitcher.perPairRate) : stitchingForm.rate
                    });
                  }}
                  className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2"
                >
                  <option value="">Select a stitcher</option>
                  {stitchers.filter(stitcher => stitcher.isActive).map(stitcher => (
                    <option key={stitcher.id} value={stitcher.id}>{stitcher.name}</option>
                  ))}
                </select>
              </label>
              <label className="text-sm font-semibold text-slate-700">
                Date (WASOOLI DATE) *
                <input
                  required
                  type="date"
                  value={stitchingForm.date}
                  onChange={event => setStitchingForm({ ...stitchingForm, date: event.target.value })}
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"
                />
              </label>
              <label className="text-sm font-semibold text-slate-700">
                Customer Name
                <input
                  readOnly
                  value={order.customerName}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-slate-500"
                />
              </label>
              <label className="text-sm font-semibold text-slate-700">
                Pairs *
                <input
                  required
                  min="1"
                  max={selectedStitchingAvailablePairs}
                  type="number"
                  value={stitchingForm.qty}
                  onChange={event => setStitchingForm({ ...stitchingForm, qty: event.target.value })}
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"
                />
                <span className="mt-1 block text-[11px] font-normal text-slate-500">
                  {selectedStitchingAvailablePairs} Cutting Received pairs available
                </span>
              </label>
              <label className="text-sm font-semibold text-slate-700">
                Rate (Rs.) *
                <input
                  required
                  min="0"
                  step="0.01"
                  type="number"
                  value={stitchingForm.rate}
                  onChange={event => setStitchingForm({ ...stitchingForm, rate: event.target.value })}
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"
                />
              </label>
            </div>
            <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm">
              <span className="font-semibold text-blue-800">Total</span>
              <span className="float-right font-mono font-black text-blue-900">
                Rs. {((Number(stitchingForm.qty) || 0) * (Number(stitchingForm.rate) || 0)).toLocaleString()}
              </span>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsAddStitchingOpen(false)}
                disabled={isSavingStitching}
                className="rounded-xl px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSavingStitching || !selectedStitchingAvailablePairs}
                className="rounded-xl bg-amber-500 px-4 py-2 text-sm font-bold text-white hover:bg-amber-600 disabled:opacity-60"
              >
                {isSavingStitching ? 'Saving...' : 'Save Stitching Entry'}
              </button>
            </div>
          </form>
        </div>
      )}

      {selectedCutterHistory && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/60 p-4">
          <div className="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-4 bg-blue-700 px-5 py-4 text-white">
              <div>
                <h3 className="font-bold">{selectedCutterHistory.cutterName} — Cutting History</h3>
                <p className="mt-1 text-xs text-blue-100">
                  Article: {selectedCutterHistory.article} · Size: {selectedCutterHistory.size}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedCutterHistory(null)}
                className="rounded-lg p-1 hover:bg-white/15"
                aria-label="Close cutter history"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="max-h-[65vh] space-y-2 overflow-y-auto p-4">
              {selectedCutterHistory.rows.map(row => (
                <div key={row.id} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 p-3 text-sm">
                  <div>
                    <div className="font-semibold text-slate-800">{formatDate(row.date)}</div>
                    <div className="mt-1 text-xs text-slate-500">{row.status}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-mono font-bold text-slate-900">{row.qty.toLocaleString()} Pairs</div>
                    <div className="mt-1 text-xs text-slate-500">{row.rate > 0 ? `Rs. ${row.amount.toLocaleString()}` : 'Rate not recorded'}</div>
                  </div>
                </div>
              ))}
              <div className="rounded-lg bg-blue-50 p-3 text-right text-sm font-black text-blue-900">
                Issued: {selectedCutterHistory.rows.reduce((sum, row) => sum + (row.type === 'GIVE' || row.isLegacyCut ? row.qty : 0), 0).toLocaleString()} Pairs
                <span className="mx-2 text-blue-300">|</span>
                Received: {selectedCutterHistory.rows.reduce((sum, row) => sum + (row.type === 'RECEIVE' ? row.qty : 0), 0).toLocaleString()} Pairs
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
