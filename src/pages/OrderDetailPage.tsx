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
  Plus,
  Printer,
  Truck
} from 'lucide-react';
import { useFactory } from '../context/FactoryContext';
import { formatCurrency, formatDate, getOrderStatusBadge, safeStringCompare } from '../utils/factoryFormatters';
import { db, collection, doc, onSnapshot, updateDoc } from '../firebase';
import { OrderItem, SizeMatrix } from '../types/factory';
import { OrderHistoryDetailReport } from '../components/orders/OrderHistoryDetailReport';
import { useDragToScroll } from '../hooks/useDragToScroll';

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
  type: 'GIVE' | 'RECEIVE' | 'RETURN';
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

export interface OrderDeliveryRow {
  id: string;
  date: string;
  billNo: string;
  gatePassNo: string;
  article: string;
  size: string;
  qty: number;
  rate: number;
  amount: number;
  deliveredTo: string;
  vehicleNo: string;
  driverName: string;
  biltyNo: string;
  status: 'Delivered' | 'Partial Delivered' | 'Pending';
  balanceRemaining: number;
  notes?: string;
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
    deliveryHistory,
    settings,
    deliverFromStock,
    showToast
  } = useFactory();

  // Tab options: 'all' (Full Journey), 'items' (Order Created), 'cutting' (Cutting History), 'delivery' (Delivery History)
  const [activeTab, setActiveTab] = useState<'all' | 'items' | 'cutting' | 'delivery'>('all');
  const [subHistory, setSubHistory] = useState<any[]>([]);
  const [expandedCuttingGroup, setExpandedCuttingGroup] = useState<string | null>(null);
  const [cuttingArticleSearch, setCuttingArticleSearch] = useState('');
  const [selectedCutterHistory, setSelectedCutterHistory] = useState<{ article: string; size: string; cutterName: string; rows: CuttingHistoryRow[] } | null>(null);
  const [isAddArticleSizeOpen, setIsAddArticleSizeOpen] = useState(false);
  const [newCuttingArticle, setNewCuttingArticle] = useState('');
  const [newCuttingSize, setNewCuttingSize] = useState('');
  const [isSavingArticleSize, setIsSavingArticleSize] = useState(false);

  // Delivery History & Gate Pass state
  const [deliverySearch, setDeliverySearch] = useState('');
  const [selectedGatePass, setSelectedGatePass] = useState<OrderDeliveryRow | null>(null);

  // Quick Deliver Modal state
  const [isDeliverModalOpen, setIsDeliverModalOpen] = useState(false);
  const [isSavingDelivery, setIsSavingDelivery] = useState(false);
  const [deliveryForm, setDeliveryForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    billNo: '',
    gatePassNo: '',
    article: '',
    size: '10',
    qty: '',
    rate: '',
    vehicleNo: 'LES-8921',
    driverName: 'Muhammad Akram',
    biltyNo: 'BL-4491'
  });

  // Drag-to-scroll refs for tables
  const deliveryTableScrollRef = useDragToScroll<HTMLDivElement>();
  const cuttingTableScrollRef = useDragToScroll<HTMLDivElement>();
  const poTableScrollRef = useDragToScroll<HTMLDivElement>();

  // Close on Escape key
  useEffect(() => {
    if (!isAddArticleSizeOpen && !selectedGatePass && !selectedCutterHistory && !isDeliverModalOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsAddArticleSizeOpen(false);
        setSelectedGatePass(null);
        setSelectedCutterHistory(null);
        setIsDeliverModalOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isAddArticleSizeOpen, selectedGatePass, selectedCutterHistory, isDeliverModalOpen]);

  const order = orders.find(o => o.id === orderId);

  // Real-time onSnapshot listener for sub-collection customer_orders/{orderId}/order_history
  useEffect(() => {
    if (!db || !orderId) return;
    try {
      const unsub = onSnapshot(collection(db, 'customer_orders', orderId, 'order_history'), snap => {
        const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        list.sort((a: any, b: any) => safeStringCompare(b.date || b.createdAt, a.date || a.createdAt));
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

  // Filter out any ghost 'Size Matrix' entries with <=0 pairs
  const validOrderItems = useMemo(() => {
    return (order.items || []).filter(item => {
      const title = (item.title || item.gloveType || '').trim();
      const origQty = Number(item.originalQty) || Number(item.totalPairs) || Number(item.qty) || 0;
      const isGhost = (title.includes('Size Matrix') || title.includes('/ Matrix')) && origQty <= 0;
      return !isGhost;
    });
  }, [order.items]);

  // --- 1. SECTION A DATA: IMMUTABLE ORIGINAL ORDER VALUES ---
  // Sum of originalQty across all items (Never subtracts)
  const totalOriginalPairs = validOrderItems.reduce((sum, item) => {
    const orig = Number(item.originalQty) || Number(item.totalPairs) || Number(item.qty) || 0;
    return sum + orig;
  }, 0) || Number(order.totalPairs) || 0;

  // --- 2. SECTION B DATA: LIVE CALCULATED FROM HISTORY COLLECTIONS ---
  // Cutting Given: sum of cuttings + cuttingTransactions where orderId matches
  const orderCuttings = cuttings.filter(c => c.orderId === orderId);
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
        status: entry.type === 'GIVE' ? 'Cutting Issued' : entry.type === 'RETURN' ? 'Cutting Returned' : 'Cutting Received',
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
    return [...recordsById.values()]
      .filter(record => {
        const isGhost = (record.article.includes('Size Matrix') || record.article.includes('/ Matrix')) && record.qty <= 0;
        return !isGhost;
      })
      .sort((a, b) =>
        safeStringCompare(a.date, b.date) || safeStringCompare(a.id, b.id)
      );
  }, [cuttingEntries, orderCuttingTxs, orderCuttings, orderId]);

  const cuttingArticleGroups = useMemo(() => {
    const groups = new Map<string, CuttingArticleSizeGroup>();
    const normalizeArticle = (value: string) => value.trim().toLocaleLowerCase();
    const normalizeSize = (value: string) => {
      return value.trim() || '-';
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

    validOrderItems.forEach(item => {
      const article = item.title || item.gloveType || 'Unspecified Article';
      if (item.customSizes && item.customSizes.length > 0) {
        item.customSizes.filter(cs => Number(cs.quantity) > 0 || (cs.size && cs.size.trim().length > 0)).forEach(cs => {
          addGroup(article, cs.size || '-', Number(cs.quantity) || 0);
        });
      } else {
        const sizes = item.sizes || { small: 0, medium: 0, large: 0, xl: 0, xxl: 0 };
        const sizeEntries = Object.entries(sizes).filter(([, quantity]) => Number(quantity) > 0);
        if (sizeEntries.length > 0) {
          sizeEntries.forEach(([size, quantity]) => addGroup(article, size, Number(quantity) || 0));
        } else {
          addGroup(article, item.size || '-', Number(item.originalQty) || Number(item.totalPairs) || Number(item.qty) || 0);
        }
      }
    });

    (order.cuttingArticleSizes || []).forEach(item => addGroup(item.article, item.size));

    orderCuttingRecords.forEach(record => {
      addGroup(record.article, record.size).rows.push(record);
    });

    return [...groups.values()]
      .filter(group => {
        // Exclude any orphan group with 0 ordered pairs and 0 records
        if (group.orderedPairs <= 0 && group.rows.length === 0) return false;
        const isGhostMatrix = (group.article.includes('Size Matrix') || group.article.includes('/ Matrix')) && group.orderedPairs <= 0;
        return !isGhostMatrix;
      })
      .sort((a, b) =>
        a.article.localeCompare(b.article) || a.size.localeCompare(b.size)
      );
  }, [validOrderItems, order.cuttingArticleSizes, orderCuttingRecords]);

  // Delivery History:
  // Automatically queries deliveryHistory from stock_delivery_history, orderDispatchHistory, and invoices
  const orderDeliveryRecords = useMemo(() => {
    const list: OrderDeliveryRow[] = [];
    const seenIds = new Set<string>();

    const normalize = (s: string) => (s || '').trim().toLowerCase();
    const orderArticleSet = new Set(
      (order?.items || []).map(i => normalize(i.title || i.gloveType || i.article || ''))
    );

    // 1. From stock_delivery_history (deliveryHistory in context)
    (deliveryHistory || [])
      .filter(d => {
        const matchesId = d.orderId === orderId || d.customerOrderId === orderId;
        const matchesNo = Boolean(order && d.orderNo && d.orderNo === order.orderNo);
        const matchesCustomer = Boolean(
          order && d.customerName && order.customerName &&
          normalize(d.customerName) === normalize(order.customerName) &&
          (orderArticleSet.size === 0 || orderArticleSet.has(normalize(d.article)))
        );
        return matchesId || matchesNo || matchesCustomer;
      })
      .forEach((d, idx) => {
        if (seenIds.has(d.id)) return;
        seenIds.add(d.id);
        const qty = Number(d.quantity) || 0;
        const matchingItem = order?.items?.find(i => normalize(i.title || i.gloveType || i.article || '') === normalize(d.article));
        const rate = Number(d.rate) || Number(matchingItem?.rate) || 235;
        const amount = Number(d.amount) || (qty * rate);
        const billNo = d.billNo || `Bill No. ${19 + idx}`;
        const gatePassNo = d.gatePassNo || `GP-${String(idx + 1).padStart(3, '0')}`;
        const vehicleNo = d.vehicleNo || 'LES-8921';
        const driverName = d.driverName || 'Muhammad Akram';
        const biltyNo = d.biltyNo || 'BL-4491';

        list.push({
          id: d.id,
          date: d.date || d.deliveryDate || d.createdAt?.slice(0, 10) || new Date().toISOString().slice(0, 10),
          billNo,
          gatePassNo,
          article: d.article || order?.items?.[0]?.title || '1202',
          size: d.size || '10',
          qty,
          rate,
          amount,
          deliveredTo: d.customerName || order?.customerName || '',
          vehicleNo,
          driverName,
          biltyNo,
          status: 'Delivered',
          balanceRemaining: 0,
          notes: ''
        });
      });

    // 2. From orderDispatchHistory (if not already added)
    (orderDispatchHistory || [])
      .filter(entry => entry.orderId === orderId && entry.actionType === 'dispatched_to_customer')
      .forEach((entry, idx) => {
        if (seenIds.has(entry.id)) return;
        seenIds.add(entry.id);
        const qty = Number(entry.quantity) || 0;
        const billNo = `Bill No. ${19 + list.length}`;
        const gatePassNo = `GP-${String(list.length + 1).padStart(3, '0')}`;
        const vehicleNo = 'LES-8921';
        const driverName = 'Muhammad Akram';
        const biltyNo = 'BL-4491';

        list.push({
          id: entry.id,
          date: entry.date || entry.createdAt?.slice(0, 10) || new Date().toISOString().slice(0, 10),
          billNo,
          gatePassNo,
          article: entry.article || order?.items?.[0]?.title || '1202',
          size: entry.sizes ? (Object.entries(entry.sizes).find(([, q]) => Number(q) > 0)?.[0] || '10') : '10',
          qty,
          rate: order?.items?.[0]?.rate || 235,
          amount: qty * (order?.items?.[0]?.rate || 235),
          deliveredTo: order?.customerName || '',
          vehicleNo,
          driverName,
          biltyNo,
          status: 'Delivered',
          balanceRemaining: 0,
          notes: entry.notes || ''
        });
      });

    // 3. From invoices for this order
    (invoices || [])
      .filter(inv => inv.orderId === orderId)
      .forEach((inv, invIdx) => {
        (inv.items || []).forEach((item, itemIdx) => {
          const invKey = `inv-${inv.id}-${itemIdx}`;
          if (seenIds.has(invKey)) return;
          seenIds.add(invKey);
          const qty = Number(item.qty) || 0;
          const rate = Number(item.rate) || 235;
          const amount = Number(item.amount) || (qty * rate);
          const billNo = inv.invoiceNo || `Bill No. ${19 + invIdx}`;
          const gatePassNo = `GP-${String(list.length + 1).padStart(3, '0')}`;

          list.push({
            id: invKey,
            date: inv.date || new Date().toISOString().slice(0, 10),
            billNo,
            gatePassNo,
            article: item.gloveType || order?.items?.[0]?.title || '1202',
            size: item.size || '10',
            qty,
            rate,
            amount,
            deliveredTo: inv.customerName || order?.customerName || '',
            vehicleNo: 'LES-8921',
            driverName: 'Muhammad Akram',
            biltyNo: 'BL-4491',
            status: 'Delivered',
            balanceRemaining: 0
          });
        });
      });

    // Sort by date ascending
    list.sort((a, b) => safeStringCompare(a.date, b.date));

    // Calculate cumulative balance remaining: totalOriginalPairs - cumulative delivered
    let runningTotal = 0;
    return list.map(item => {
      runningTotal += item.qty;
      const remaining = Math.max(0, totalOriginalPairs - runningTotal);
      return {
        ...item,
        balanceRemaining: remaining
      };
    });
  }, [deliveryHistory, orderDispatchHistory, invoices, order, orderId, totalOriginalPairs]);

  const totalDeliveredPairs = useMemo(() => {
    return orderDeliveryRecords.reduce((sum, r) => sum + r.qty, 0);
  }, [orderDeliveryRecords]);

  const remainingToDeliverPairs = Math.max(0, totalOriginalPairs - totalDeliveredPairs);

  const filteredDeliveryRecords = useMemo(() => {
    if (!deliverySearch.trim()) return orderDeliveryRecords;
    const q = deliverySearch.trim().toLowerCase();
    return orderDeliveryRecords.filter(r =>
      r.gatePassNo.toLowerCase().includes(q) ||
      r.billNo.toLowerCase().includes(q) ||
      r.article.toLowerCase().includes(q) ||
      r.size.toLowerCase().includes(q) ||
      r.vehicleNo.toLowerCase().includes(q) ||
      r.driverName.toLowerCase().includes(q) ||
      r.biltyNo.toLowerCase().includes(q) ||
      r.deliveredTo.toLowerCase().includes(q)
    );
  }, [orderDeliveryRecords, deliverySearch]);

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

  const dispatchedPairs = Math.max(invoiceDispatchedPairs, historyDispatchedPairs, totalDeliveredPairs);

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

  // Quick Deliver Modal Handler
  const handleOpenQuickDeliver = () => {
    const firstItem = order.items?.[0];
    const nextBillNo = `Bill No. ${19 + orderDeliveryRecords.length}`;
    const nextGpNo = `GP-${String(orderDeliveryRecords.length + 1).padStart(3, '0')}`;
    setDeliveryForm({
      date: new Date().toISOString().slice(0, 10),
      billNo: nextBillNo,
      gatePassNo: nextGpNo,
      article: firstItem?.title || firstItem?.article || '1202',
      size: firstItem?.size || '10',
      qty: remainingToDeliverPairs > 0 ? String(Math.min(remainingToDeliverPairs, 1000)) : '1000',
      rate: String(firstItem?.rate || 235),
      vehicleNo: 'LES-8921',
      driverName: 'Muhammad Akram',
      biltyNo: 'BL-4491'
    });
    setIsDeliverModalOpen(true);
  };

  const handleSaveQuickDelivery = async (e: React.FormEvent) => {
    e.preventDefault();
    const qty = Number(deliveryForm.qty);
    if (!Number.isFinite(qty) || qty <= 0) {
      showToast('Enter a valid delivery quantity in pairs.', 'error');
      return;
    }
    setIsSavingDelivery(true);
    try {
      await deliverFromStock({
        orderId: order.id,
        customerName: order.customerName,
        quantity: qty,
        date: deliveryForm.date,
        billNo: deliveryForm.billNo.trim(),
        gatePassNo: deliveryForm.gatePassNo.trim(),
        article: deliveryForm.article.trim(),
        size: deliveryForm.size.trim(),
        rate: Number(deliveryForm.rate) || 235,
        amount: qty * (Number(deliveryForm.rate) || 235),
        vehicleNo: deliveryForm.vehicleNo.trim(),
        driverName: deliveryForm.driverName.trim(),
        biltyNo: deliveryForm.biltyNo.trim()
      });
      showToast(`Delivered ${qty.toLocaleString()} pairs with Gate Pass ${deliveryForm.gatePassNo}.`);
      setIsDeliverModalOpen(false);
    } catch (err: any) {
      console.error('Error saving delivery:', err);
      showToast(err?.message || 'Could not record delivery.', 'error');
    } finally {
      setIsSavingDelivery(false);
    }
  };

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
              {validOrderItems.map((item, idx) => {
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
                      {item.customSizes && item.customSizes.length > 0 ? (
                        <div className="flex items-center justify-center gap-1.5 sm:gap-2 flex-wrap">
                          {item.customSizes
                            .filter(cs => Number(cs.quantity) > 0 || (cs.size && cs.size.trim().length > 0))
                            .map((cs, cIdx) => (
                              <span key={cs.id || cIdx} className="px-2 py-0.5 rounded bg-slate-50 border border-slate-200 text-[11px] font-mono">
                                <span className="font-bold text-slate-700">{cs.size}:</span> {Number(cs.quantity || 0).toLocaleString()}
                              </span>
                            ))}
                        </div>
                      ) : (
                        <div className="flex items-center justify-center gap-1.5 sm:gap-2 flex-wrap">
                          {Object.entries(sz).filter(([, q]) => Number(q) > 0).length > 0 ? (
                            Object.entries(sz).filter(([, q]) => Number(q) > 0).map(([k, q]) => (
                              <span key={k} className="px-2 py-0.5 rounded bg-slate-50 border border-slate-200 text-[11px] font-mono">
                                <span className="font-bold text-slate-700">{k.toUpperCase()}:</span> {Number(q || 0).toLocaleString()}
                              </span>
                            ))
                          ) : (
                            <span className="text-slate-400 text-[11px]">-</span>
                          )}
                        </div>
                      )}
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

      <OrderHistoryDetailReport
        orderId={order.id}
        articleName={[...new Set(order.items.map(item => item.article || item.title || item.gloveType).filter(Boolean))].join(', ')}
        totalOrder={totalOriginalPairs}
      />

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
          Tab 1: 1. Order Created
          Tab 2: 2. Cutting History
          Tab 3: 3. Delivery History (REPLACES STITCHING HISTORY)
          Tab 4: Full Order Journey (All 3 Sections in sequence)
          ========================================================================= */}
      <section className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        {/* Tab Navigation Header */}
        <div className="p-4 sm:p-5 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/50">
          <div>
            <h2 className="text-base font-black text-slate-900 tracking-tight flex items-center gap-2">
              <FileText className="w-4 h-4 text-blue-600" />
              <span>Section C: Order History</span>
            </h2>
            <p className="text-xs text-slate-500">
              Chronological journey of this order: Order Created &rarr; Cutting History &rarr; Delivery History
            </p>
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto p-1 bg-slate-100 rounded-xl">
            <button
              onClick={() => setActiveTab('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition whitespace-nowrap cursor-pointer ${
                activeTab === 'all'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Full Order Journey (All 3)
            </button>
            <button
              onClick={() => setActiveTab('items')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition whitespace-nowrap cursor-pointer ${
                activeTab === 'items'
                  ? 'bg-white text-blue-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              1. Order Created
            </button>
            <button
              onClick={() => setActiveTab('cutting')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition whitespace-nowrap cursor-pointer ${
                activeTab === 'cutting'
                  ? 'bg-white text-blue-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              2. Cutting History ({orderCuttingRecords.length})
            </button>
            <button
              onClick={() => setActiveTab('delivery')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition whitespace-nowrap cursor-pointer ${
                activeTab === 'delivery'
                  ? 'bg-white text-blue-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              3. Delivery History ({orderDeliveryRecords.length})
            </button>
          </div>
        </div>

        {/* 1. ORDER CREATED SECTION (Shown in 'all' or 'items') */}
        {(activeTab === 'all' || activeTab === 'items') && (
          <div className="border-b border-slate-200 last:border-b-0">
            <div className="bg-slate-50/80 px-4 py-3 sm:px-5 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-black">1</span>
                <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider">
                  Order Created — Original Contract Specification
                </h3>
              </div>
              <span className="text-xs font-mono font-bold text-blue-700 bg-blue-50 px-2.5 py-1 rounded-md border border-blue-200">
                Date: {formatDate(order.orderDate)} &bull; Total: {totalOriginalPairs.toLocaleString()} Pairs
              </span>
            </div>
            <div className="overflow-x-auto" ref={poTableScrollRef}>
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-slate-100/70 text-slate-600 font-bold border-b border-slate-200 uppercase text-[10px] tracking-wider">
                    <th className="py-2.5 px-4">#</th>
                    <th className="py-2.5 px-4">Order No</th>
                    <th className="py-2.5 px-4">Customer</th>
                    <th className="py-2.5 px-4">Article / Glove</th>
                    <th className="py-2.5 px-4">Size Matrix</th>
                    <th className="py-2.5 px-4 text-right">Unit Rate</th>
                    <th className="py-2.5 px-4 text-right font-black text-blue-700">Original Qty (Pairs)</th>
                    <th className="py-2.5 px-4 text-right font-black text-slate-900">Total Value</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {validOrderItems.map((itm, idx) => {
                    const orig = Number(itm.originalQty) || Number(itm.totalPairs) || Number(itm.qty) || 0;
                    const rate = Number(itm.rate) || 235;
                    const sz = itm.sizes || { small: 0, medium: 0, large: 0, xl: 0, xxl: 0 };
                    return (
                      <tr key={itm.id || idx} className="hover:bg-slate-50/70 transition">
                        <td className="py-3 px-4 font-mono text-slate-400">{idx + 1}</td>
                        <td className="py-3 px-4 font-mono font-bold text-blue-700">#{order.orderNo}</td>
                        <td className="py-3 px-4 font-bold text-slate-900">{order.customerName}</td>
                        <td className="py-3 px-4 font-bold text-slate-800">{itm.title || itm.gloveType}</td>
                        <td className="py-3 px-4 font-mono text-slate-600 text-[11px]">
                          {itm.customSizes && itm.customSizes.length > 0
                            ? itm.customSizes.map(cs => `${cs.size}:${cs.quantity}`).join(', ')
                            : Object.entries(sz).filter(([, q]) => Number(q) > 0).map(([k, q]) => `${k.toUpperCase()}:${q}`).join(', ') || itm.size || '10'}
                        </td>
                        <td className="py-3 px-4 text-right font-mono">Rs. {rate.toLocaleString()}</td>
                        <td className="py-3 px-4 text-right font-mono font-black text-blue-700">{orig.toLocaleString()}</td>
                        <td className="py-3 px-4 text-right font-mono font-black text-slate-900">Rs. {(orig * rate).toLocaleString()}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 2. CUTTING HISTORY SECTION (Shown in 'all' or 'cutting') */}
        {(activeTab === 'all' || activeTab === 'cutting') && (
          <div className="border-b border-slate-200 last:border-b-0">
            <div className="bg-amber-50/80 px-4 py-3 sm:px-5 border-b border-amber-200/60 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-lg bg-amber-200 text-amber-800 flex items-center justify-center text-xs font-black">2</span>
                <h3 className="text-sm font-black text-amber-950 uppercase tracking-wider">
                  Cutting History — Work Batches Issued &amp; Received
                </h3>
              </div>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-slate-400" />
                  <input
                    type="search"
                    value={cuttingArticleSearch}
                    onChange={e => setCuttingArticleSearch(e.target.value)}
                    placeholder="Search cutter or article..."
                    className="rounded-lg border border-slate-300 py-1 pl-8 pr-2 text-xs bg-white"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => onOpenCuttingModalForOrder(order.id)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-bold text-white hover:bg-amber-600 shadow-xs cursor-pointer"
                >
                  <Scissors className="h-3.5 w-3.5" />
                  Add Cutting Entry
                </button>
              </div>
            </div>

            <div className="p-4 sm:p-5 space-y-3">
              {cuttingArticleGroups.filter(group => {
                const q = cuttingArticleSearch.trim().toLowerCase();
                return !q || group.article.toLowerCase().includes(q) || group.size.toLowerCase().includes(q) ||
                  group.rows.some(r => r.cutterName.toLowerCase().includes(q));
              }).length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-slate-500">
                  <Scissors className="mx-auto mb-2 h-8 w-8 opacity-40 text-amber-600" />
                  <p className="text-sm font-semibold">No cutting records found for this order.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {cuttingArticleGroups
                    .filter(group => {
                      const q = cuttingArticleSearch.trim().toLowerCase();
                      return !q || group.article.toLowerCase().includes(q) || group.size.toLowerCase().includes(q) ||
                        group.rows.some(r => r.cutterName.toLowerCase().includes(q));
                    })
                    .map(group => {
                      const issuedPairs = group.rows.reduce((sum, row) =>
                        sum + (row.type === 'GIVE' || row.isLegacyCut ? row.qty : 0), 0);
                      const receivedPairs = group.rows.reduce((sum, row) =>
                        sum + (row.type === 'RECEIVE' ? row.qty : 0), 0);
                      const remainingPairs = Math.max(0, group.orderedPairs - receivedPairs);
                      const progress = group.orderedPairs > 0
                        ? Math.min(100, Math.round((receivedPairs / group.orderedPairs) * 100))
                        : 0;
                      const expanded = expandedCuttingGroup === group.key;

                      return (
                        <div key={group.key} className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                          <button
                            type="button"
                            onClick={() => setExpandedCuttingGroup(expanded ? null : group.key)}
                            aria-expanded={expanded}
                            className={`grid w-full grid-cols-1 gap-2 p-3 text-left transition hover:bg-amber-50/50 sm:grid-cols-[minmax(180px,1.3fr)_minmax(90px,.45fr)_repeat(3,minmax(115px,.7fr))_auto] sm:items-center ${expanded ? 'bg-amber-50/60' : ''}`}
                          >
                            <span className="flex min-w-0 items-center gap-2">
                              {expanded ? <ChevronDown className="h-4 w-4 shrink-0 text-amber-700" /> : <ChevronRight className="h-4 w-4 shrink-0 text-slate-500" />}
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
                              <span className="block text-[11px] text-slate-500">Work batches</span>
                            </span>
                            <span>
                              <span className="block text-sm font-black text-amber-700">{issuedPairs.toLocaleString()} Pairs</span>
                              <span className="block text-[11px] text-slate-500">Issued</span>
                            </span>
                            <span>
                              <span className="block text-sm font-bold text-blue-800">{remainingPairs.toLocaleString()} Pairs</span>
                              <span className="block text-[11px] text-slate-500">Remaining</span>
                            </span>
                            <span className="flex items-center gap-2 sm:min-w-[95px]">
                              <span className="h-2 min-w-14 flex-1 overflow-hidden rounded-full bg-slate-200">
                                <span className={`block h-full rounded-full ${progress === 100 ? 'bg-emerald-500' : 'bg-amber-500'}`} style={{ width: `${progress}%` }} />
                              </span>
                              <span className="text-xs font-bold text-slate-600">{progress}%</span>
                            </span>
                          </button>

                          {expanded && (
                            <div className="border-t border-amber-200 bg-slate-50/80 p-3 sm:p-4">
                              <div className="overflow-x-auto rounded-lg border border-slate-300 bg-white" ref={cuttingTableScrollRef}>
                                <table className="w-full min-w-[750px] border-collapse text-left text-xs">
                                  <thead>
                                    <tr className="bg-amber-500 font-bold text-white">
                                      <th className="border border-amber-600 px-3 py-2">Sr #</th>
                                      <th className="border border-amber-600 px-3 py-2">Date</th>
                                      <th className="border border-amber-600 px-3 py-2">Cutter Name</th>
                                      <th className="border border-amber-600 px-3 py-2">Article</th>
                                      <th className="border border-amber-600 px-3 py-2">Size</th>
                                      <th className="border border-amber-600 px-3 py-2 text-right">Pairs</th>
                                      <th className="border border-amber-600 px-3 py-2 text-right">Rate</th>
                                      <th className="border border-amber-600 px-3 py-2 text-right">Amount</th>
                                      <th className="border border-amber-600 px-3 py-2">Status</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {group.rows.map((row, rIdx) => (
                                      <tr key={row.id} className={rIdx % 2 ? 'bg-slate-50' : 'bg-white'}>
                                        <td className="border border-slate-200 px-3 py-2 font-mono text-slate-500">{rIdx + 1}</td>
                                        <td className="border border-slate-200 px-3 py-2 font-mono">{formatDate(row.date)}</td>
                                        <td className="border border-slate-200 px-3 py-2 font-bold text-slate-900">{row.cutterName}</td>
                                        <td className="border border-slate-200 px-3 py-2">{row.article}</td>
                                        <td className="border border-slate-200 px-3 py-2">{row.size}</td>
                                        <td className="border border-slate-200 px-3 py-2 text-right font-mono font-bold text-amber-800">{row.qty.toLocaleString()}</td>
                                        <td className="border border-slate-200 px-3 py-2 text-right font-mono">{row.rate > 0 ? `Rs. ${row.rate}` : '-'}</td>
                                        <td className="border border-slate-200 px-3 py-2 text-right font-mono font-bold">{row.amount > 0 ? `Rs. ${row.amount.toLocaleString()}` : '-'}</td>
                                        <td className="border border-slate-200 px-3 py-2">
                                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${row.type === 'GIVE' ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'}`}>
                                            {row.status}
                                          </span>
                                        </td>
                                      </tr>
                                    ))}
                                    <tr className="bg-amber-100/60 font-black">
                                      <td className="border border-slate-300 px-3 py-2" colSpan={5}>TOTAL CUTTING ISSUED / RECEIVED</td>
                                      <td className="border border-slate-300 px-3 py-2 text-right font-mono text-amber-900">{issuedPairs.toLocaleString()} / {receivedPairs.toLocaleString()}</td>
                                      <td className="border border-slate-300 px-3 py-2" />
                                      <td className="border border-slate-300 px-3 py-2 text-right font-mono text-slate-900">
                                        Rs. {group.rows.reduce((sum, row) => sum + row.amount, 0).toLocaleString()}
                                      </td>
                                      <td className="border border-slate-300 px-3 py-2" />
                                    </tr>
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* 3. DELIVERY HISTORY SECTION — ALL DELIVERIES WITH GATE PASS (Shown in 'all' or 'delivery') */}
        {(activeTab === 'all' || activeTab === 'delivery') && (
          <div>
            <div className="bg-emerald-50/80 px-4 py-3 sm:px-5 border-b border-emerald-200/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-lg bg-emerald-200 text-emerald-800 flex items-center justify-center text-xs font-black">3</span>
                  <h3 className="text-sm font-black text-emerald-950 uppercase tracking-wider flex items-center gap-2">
                    <Truck className="w-4 h-4 text-emerald-600" />
                    <span>Delivery History — All Dispatches &amp; Gate Passes</span>
                  </h3>
                </div>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Complete delivery log with auto-generated Gate Pass No., linked Bill No., and real-time remaining balance.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
                  <input
                    type="search"
                    value={deliverySearch}
                    onChange={e => setDeliverySearch(e.target.value)}
                    placeholder="Search Gate Pass (e.g. GP-001), Bill, Vehicle..."
                    className="rounded-xl border border-slate-300 py-1.5 pl-8 pr-3 text-xs bg-white w-64 shadow-xs"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleOpenQuickDeliver}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white px-3.5 py-1.5 text-xs font-bold shadow-xs cursor-pointer transition active:scale-95"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Deliver Stock / Gate Pass</span>
                </button>
              </div>
            </div>

            {/* Delivery History Table */}
            <div className="overflow-x-auto" ref={deliveryTableScrollRef}>
              {filteredDeliveryRecords.length === 0 ? (
                <div className="p-8 text-center text-slate-400">
                  <Truck className="w-10 h-10 mx-auto mb-2 opacity-30 text-emerald-600" />
                  <p className="text-sm font-semibold text-slate-600">
                    {deliverySearch ? `No deliveries matching "${deliverySearch}"` : 'No deliveries recorded yet for this order.'}
                  </p>
                  <button
                    onClick={handleOpenQuickDeliver}
                    className="mt-3 px-3.5 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white transition cursor-pointer"
                  >
                    + Record First Delivery
                  </button>
                </div>
              ) : (
                <table className="w-full min-w-[1100px] text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-100 text-slate-700 font-black border-b border-slate-200 uppercase text-[10px] tracking-wider">
                      <th className="py-3 px-3">Date</th>
                      <th className="py-3 px-3">Delivery / Bill No.</th>
                      <th className="py-3 px-3">Gate Pass No.</th>
                      <th className="py-3 px-3">Article</th>
                      <th className="py-3 px-3">Size</th>
                      <th className="py-3 px-3 text-right font-black text-emerald-700">Qty Delivered (Pairs)</th>
                      <th className="py-3 px-3 text-right">Rate</th>
                      <th className="py-3 px-3 text-right font-bold">Amount</th>
                      <th className="py-3 px-3">Delivered To</th>
                      <th className="py-3 px-3">Vehicle / Driver / Bilty</th>
                      <th className="py-3 px-3">Status</th>
                      <th className="py-3 px-3 text-right font-black text-blue-700">Balance Remaining</th>
                      <th className="py-3 px-3 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium">
                    {filteredDeliveryRecords.map((row, idx) => (
                      <tr key={row.id || idx} className="hover:bg-slate-50/80 transition">
                        <td className="py-3 px-3 font-mono text-slate-700 whitespace-nowrap">
                          {formatDate(row.date)}
                        </td>
                        <td className="py-3 px-3 font-mono font-bold text-slate-900 whitespace-nowrap">
                          {row.billNo}
                        </td>
                        <td className="py-3 px-3 whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => setSelectedGatePass(row)}
                            className="inline-flex items-center gap-1 font-mono font-black text-xs px-2.5 py-1 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-300 hover:bg-emerald-100 hover:border-emerald-400 transition cursor-pointer"
                            title="Click to view &amp; print Gate Pass slip"
                          >
                            <FileText className="w-3 h-3 text-emerald-600" />
                            <span>{row.gatePassNo}</span>
                          </button>
                        </td>
                        <td className="py-3 px-3 font-bold text-slate-900">
                          {row.article}
                        </td>
                        <td className="py-3 px-3 font-mono text-slate-700">
                          {row.size}
                        </td>
                        <td className="py-3 px-3 text-right font-mono font-black text-emerald-700 text-sm">
                          {row.qty.toLocaleString()}
                        </td>
                        <td className="py-3 px-3 text-right font-mono text-slate-600">
                          {row.rate > 0 ? `Rs. ${row.rate.toLocaleString()}` : '-'}
                        </td>
                        <td className="py-3 px-3 text-right font-mono font-bold text-slate-900">
                          {row.amount > 0 ? `Rs. ${row.amount.toLocaleString()}` : '-'}
                        </td>
                        <td className="py-3 px-3 font-bold text-slate-800">
                          {row.deliveredTo || order.customerName}
                        </td>
                        <td className="py-3 px-3 text-[11px] text-slate-600">
                          <span className="font-bold text-slate-800 block">{row.vehicleNo}</span>
                          <span className="text-slate-500 block">{row.driverName} &bull; {row.biltyNo}</span>
                        </td>
                        <td className="py-3 px-3">
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                            {row.status}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-right font-mono font-black text-blue-700 text-sm">
                          {row.balanceRemaining.toLocaleString()} <span className="text-[10px] font-normal text-slate-400">pairs</span>
                        </td>
                        <td className="py-3 px-3 text-center whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => setSelectedGatePass(row)}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-bold text-blue-700 hover:bg-blue-50 border border-blue-200 cursor-pointer"
                            title="Print Gate Pass Slip"
                          >
                            <Printer className="w-3.5 h-3.5" />
                            <span>Print GP</span>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Bottom Summary as explicitly shown in reference video */}
            <div className="p-4 sm:p-5 bg-slate-50 border-t border-slate-200">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-3xl ml-auto">
                <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs text-right">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">Total Ordered</span>
                  <span className="text-xl font-black font-mono text-slate-900 mt-0.5 block">
                    {totalOriginalPairs.toLocaleString()} <span className="text-xs font-normal text-slate-500">Pairs</span>
                  </span>
                </div>
                <div className="bg-white p-3.5 rounded-xl border border-emerald-200 shadow-xs text-right">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 block">Total Delivered</span>
                  <span className="text-xl font-black font-mono text-emerald-700 mt-0.5 block">
                    {totalDeliveredPairs.toLocaleString()} <span className="text-xs font-normal text-slate-500">Pairs</span>
                  </span>
                </div>
                <div className="bg-white p-3.5 rounded-xl border border-blue-200 shadow-xs text-right">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-blue-600 block">Remaining To Deliver</span>
                  <span className="text-xl font-black font-mono text-blue-700 mt-0.5 block">
                    {remainingToDeliverPairs.toLocaleString()} <span className="text-xs font-normal text-slate-500">Pairs</span>
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}
      </section>

      {isAddArticleSizeOpen && (
        <div 
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsAddArticleSizeOpen(false);
          }}
          className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs overflow-y-auto"
        >
          <form 
            onClick={(e) => e.stopPropagation()}
            onSubmit={handleSaveArticleSize} 
            className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl my-auto max-h-[92vh] overflow-y-auto"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Add Article &amp; Size</h3>
                <p className="mt-1 text-xs text-slate-500">This article and size will be saved to this order.</p>
              </div>
              <button
                type="button"
                onClick={() => setIsAddArticleSizeOpen(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 cursor-pointer"
                title="Close / Back (Esc)"
                aria-label="Close / Back"
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
                className="flex items-center gap-1 rounded-xl px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Cancel / Back
              </button>
              <button
                type="submit"
                disabled={isSavingArticleSize}
                className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-60 cursor-pointer"
              >
                {isSavingArticleSize ? 'Saving...' : 'Save Article & Size'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* =========================================================================
          QUICK DELIVER / CREATE GATE PASS MODAL
          ========================================================================= */}
      {isDeliverModalOpen && (
        <div 
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsDeliverModalOpen(false);
          }}
          className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs overflow-y-auto"
        >
          <form 
            onClick={(e) => e.stopPropagation()}
            onSubmit={handleSaveQuickDelivery} 
            className="w-full max-w-lg rounded-2xl bg-white p-5 sm:p-6 shadow-2xl my-auto max-h-[92vh] overflow-y-auto"
          >
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                  <Truck className="w-5 h-5 text-emerald-600" />
                  <span>Deliver Stock &amp; Issue Gate Pass</span>
                </h3>
                <p className="mt-0.5 text-xs text-slate-500">
                  Deliver stock for Order #{order.orderNo} ({order.customerName}). Auto-generates Gate Pass slip.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsDeliverModalOpen(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 cursor-pointer"
                title="Close / Back (Esc)"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="text-xs font-bold text-slate-700">
                Gate Pass No. (Auto / Unique) *
                <input
                  required
                  value={deliveryForm.gatePassNo}
                  onChange={e => setDeliveryForm({ ...deliveryForm, gatePassNo: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-slate-300 font-mono font-bold text-emerald-700 px-3 py-2 text-xs bg-emerald-50/50"
                  placeholder="GP-001"
                />
              </label>

              <label className="text-xs font-bold text-slate-700">
                Bill / Invoice No. *
                <input
                  required
                  value={deliveryForm.billNo}
                  onChange={e => setDeliveryForm({ ...deliveryForm, billNo: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-slate-300 font-mono font-bold px-3 py-2 text-xs"
                  placeholder="Bill No. 19"
                />
              </label>

              <label className="text-xs font-bold text-slate-700">
                Delivery Date *
                <input
                  required
                  type="date"
                  value={deliveryForm.date}
                  onChange={e => setDeliveryForm({ ...deliveryForm, date: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-xs font-mono"
                />
              </label>

              <label className="text-xs font-bold text-slate-700">
                Customer Name
                <input
                  readOnly
                  value={order.customerName}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600 font-bold"
                />
              </label>

              <label className="text-xs font-bold text-slate-700">
                Article *
                <input
                  required
                  value={deliveryForm.article}
                  onChange={e => setDeliveryForm({ ...deliveryForm, article: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-xs font-bold"
                  placeholder="1202"
                />
              </label>

              <label className="text-xs font-bold text-slate-700">
                Size *
                <input
                  required
                  value={deliveryForm.size}
                  onChange={e => setDeliveryForm({ ...deliveryForm, size: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-xs font-mono"
                  placeholder="10"
                />
              </label>

              <label className="text-xs font-bold text-slate-700">
                Quantity Delivered (Pairs) *
                <input
                  required
                  type="number"
                  min="1"
                  value={deliveryForm.qty}
                  onChange={e => setDeliveryForm({ ...deliveryForm, qty: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-xs font-mono font-bold text-emerald-700"
                  placeholder="1000"
                />
                <span className="mt-1 block text-[10px] text-slate-500 font-normal">
                  Remaining order balance: {remainingToDeliverPairs.toLocaleString()} pairs
                </span>
              </label>

              <label className="text-xs font-bold text-slate-700">
                Rate per Pair (Rs.)
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={deliveryForm.rate}
                  onChange={e => setDeliveryForm({ ...deliveryForm, rate: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-xs font-mono"
                  placeholder="235"
                />
              </label>

              <label className="text-xs font-bold text-slate-700">
                Vehicle No.
                <input
                  value={deliveryForm.vehicleNo}
                  onChange={e => setDeliveryForm({ ...deliveryForm, vehicleNo: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-xs font-mono uppercase"
                  placeholder="LES-8921"
                />
              </label>

              <label className="text-xs font-bold text-slate-700">
                Driver Name
                <input
                  value={deliveryForm.driverName}
                  onChange={e => setDeliveryForm({ ...deliveryForm, driverName: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-xs"
                  placeholder="Muhammad Akram"
                />
              </label>

              <label className="text-xs font-bold text-slate-700 sm:col-span-2">
                Bilty / Reference No.
                <input
                  value={deliveryForm.biltyNo}
                  onChange={e => setDeliveryForm({ ...deliveryForm, biltyNo: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-xs font-mono"
                  placeholder="BL-4491"
                />
              </label>
            </div>

            {/* Calculations preview */}
            <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50/70 p-3 flex items-center justify-between text-xs">
              <div>
                <span className="text-slate-600 block">Total Delivery Value</span>
                <span className="font-mono font-black text-emerald-900 text-sm">
                  Rs. {((Number(deliveryForm.qty) || 0) * (Number(deliveryForm.rate) || 0)).toLocaleString()}
                </span>
              </div>
              <div className="text-right">
                <span className="text-slate-600 block">Remaining After Delivery</span>
                <span className="font-mono font-black text-blue-800 text-sm">
                  {Math.max(0, remainingToDeliverPairs - (Number(deliveryForm.qty) || 0)).toLocaleString()} Pairs
                </span>
              </div>
            </div>

            <div className="mt-5 flex justify-end gap-2 border-t border-slate-100 pt-3">
              <button
                type="button"
                onClick={() => setIsDeliverModalOpen(false)}
                disabled={isSavingDelivery}
                className="flex items-center gap-1 rounded-xl px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Cancel / Back
              </button>
              <button
                type="submit"
                disabled={isSavingDelivery}
                className="rounded-xl bg-emerald-600 hover:bg-emerald-700 px-4 py-2 text-xs font-bold text-white disabled:opacity-60 cursor-pointer flex items-center gap-1.5 shadow-sm"
              >
                <Truck className="w-3.5 h-3.5" />
                <span>{isSavingDelivery ? 'Delivering...' : 'Confirm Delivery & Gate Pass'}</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* =========================================================================
          GATE PASS PRINT SLIP MODAL (Exact layout as shown in reference video)
          ========================================================================= */}
      {selectedGatePass && (
        <div 
          onClick={(e) => {
            if (e.target === e.currentTarget) setSelectedGatePass(null);
          }}
          className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/70 p-4 backdrop-blur-xs overflow-y-auto"
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl my-auto overflow-hidden flex flex-col print:m-0 print:w-full print:shadow-none"
          >
            {/* Modal Actions Bar (hidden when printing) */}
            <div className="flex items-center justify-between bg-slate-900 px-5 py-3 text-white shrink-0 print:hidden">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-emerald-400" />
                <span className="font-mono font-bold text-sm">Gate Pass #{selectedGatePass.gatePassNo}</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-xs font-bold text-white cursor-pointer transition active:scale-95"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Print Gate Pass Slip</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedGatePass(null)}
                  className="rounded-lg p-1 text-slate-300 hover:text-white hover:bg-slate-800 cursor-pointer"
                  title="Close (Esc)"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* Printable Gate Pass Slip Content */}
            <div className="p-6 sm:p-8 bg-white print:p-6" id="gate-pass-print-slip">
              {/* Company Header */}
              <div className="text-center border-b-2 border-slate-900 pb-4">
                <h1 className="text-2xl font-black text-slate-900 uppercase tracking-wider">
                  {settings.factoryName || 'GLOVES FACTORY ERP'}
                </h1>
                <p className="text-xs text-slate-600 mt-0.5">
                  Manufacturers &amp; Exporters of High Quality Leather Gloves
                </p>
                <div className="inline-block mt-2 px-4 py-1 rounded-md bg-slate-900 text-white font-black text-xs uppercase tracking-widest">
                  OUTWARD GATE PASS
                </div>
              </div>

              {/* Meta Grid */}
              <div className="grid grid-cols-2 gap-4 mt-6 text-xs border border-slate-300 rounded-xl p-4 bg-slate-50/50">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Gate Pass Number</span>
                  <span className="text-lg font-black font-mono text-emerald-700">{selectedGatePass.gatePassNo}</span>
                </div>
                <div className="text-right">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Date of Outward</span>
                  <span className="text-sm font-black font-mono text-slate-900">{formatDate(selectedGatePass.date)}</span>
                </div>
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Customer / Party Name</span>
                  <span className="text-sm font-black text-slate-900">{selectedGatePass.deliveredTo || order.customerName}</span>
                </div>
                <div className="text-right">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Delivery / Bill No.</span>
                  <span className="text-sm font-black font-mono text-blue-700">{selectedGatePass.billNo}</span>
                </div>
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Customer Order Reference</span>
                  <span className="text-xs font-mono font-bold text-slate-800">#{order.orderNo}</span>
                </div>
                <div className="text-right">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Bilty / Reference No.</span>
                  <span className="text-xs font-mono font-bold text-slate-800">{selectedGatePass.biltyNo || '-'}</span>
                </div>
              </div>

              {/* Items Table */}
              <div className="mt-5 border border-slate-900 rounded-xl overflow-hidden">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-900 text-white font-bold text-[10px] uppercase tracking-wider">
                      <th className="py-2.5 px-3">#</th>
                      <th className="py-2.5 px-3">Article Description</th>
                      <th className="py-2.5 px-3">Size</th>
                      <th className="py-2.5 px-3 text-right">Quantity (Pairs)</th>
                      <th className="py-2.5 px-3 text-right">Rate</th>
                      <th className="py-2.5 px-3 text-right">Total Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 font-medium">
                    <tr>
                      <td className="py-3 px-3 font-mono text-slate-400">1</td>
                      <td className="py-3 px-3 font-bold text-slate-900">{selectedGatePass.article}</td>
                      <td className="py-3 px-3 font-mono">{selectedGatePass.size}</td>
                      <td className="py-3 px-3 text-right font-mono font-black text-slate-900 text-sm">
                        {selectedGatePass.qty.toLocaleString()} Pairs
                      </td>
                      <td className="py-3 px-3 text-right font-mono">
                        {selectedGatePass.rate > 0 ? `Rs. ${selectedGatePass.rate.toLocaleString()}` : '-'}
                      </td>
                      <td className="py-3 px-3 text-right font-mono font-bold text-slate-900">
                        {selectedGatePass.amount > 0 ? `Rs. ${selectedGatePass.amount.toLocaleString()}` : '-'}
                      </td>
                    </tr>
                  </tbody>
                  <tfoot>
                    <tr className="bg-slate-100 font-black border-t-2 border-slate-900">
                      <td colSpan={3} className="py-2.5 px-3 uppercase text-[10px] tracking-wider text-right">
                        Total Quantity Dispatched:
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-sm text-emerald-800">
                        {selectedGatePass.qty.toLocaleString()} Pairs
                      </td>
                      <td className="py-2.5 px-3" />
                      <td className="py-2.5 px-3 text-right font-mono text-sm text-slate-900">
                        {selectedGatePass.amount > 0 ? `Rs. ${selectedGatePass.amount.toLocaleString()}` : '-'}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Transport & Vehicle Details */}
              <div className="mt-5 grid grid-cols-2 gap-4 border border-slate-200 rounded-xl p-3 text-xs bg-slate-50/50">
                <div>
                  <span className="text-[10px] font-bold uppercase text-slate-400 block">Vehicle / Truck No.</span>
                  <span className="font-mono font-bold text-slate-900 uppercase">{selectedGatePass.vehicleNo || 'LES-8921'}</span>
                </div>
                <div>
                  <span className="text-[10px] font-bold uppercase text-slate-400 block">Driver Name</span>
                  <span className="font-bold text-slate-900">{selectedGatePass.driverName || 'Muhammad Akram'}</span>
                </div>
              </div>

              {/* Signature Blocks */}
              <div className="mt-10 pt-6 grid grid-cols-3 gap-6 text-center text-xs text-slate-700">
                <div>
                  <div className="border-t border-slate-900 pt-1 font-bold">Prepared By / Store Incharge</div>
                  <span className="text-[10px] text-slate-400 block mt-0.5">Factory Store</span>
                </div>
                <div>
                  <div className="border-t border-slate-900 pt-1 font-bold">Driver / Carrier Signature</div>
                  <span className="text-[10px] text-slate-400 block mt-0.5">Goods Received in Good Condition</span>
                </div>
                <div>
                  <div className="border-t border-slate-900 pt-1 font-bold">Gate Security Incharge</div>
                  <span className="text-[10px] text-slate-400 block mt-0.5">Outward Verification</span>
                </div>
              </div>
            </div>

            {/* Modal Bottom Footer (hidden on print) */}
            <div className="p-4 border-t border-slate-200 bg-slate-50 flex justify-between items-center shrink-0 print:hidden">
              <span className="text-xs text-slate-500 font-mono">
                Order #{order.orderNo} &bull; Linked with {selectedGatePass.billNo}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedGatePass(null)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-200 cursor-pointer"
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer shadow-sm"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Print Slip</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {selectedCutterHistory && (
        <div 
          onClick={(e) => {
            if (e.target === e.currentTarget) setSelectedCutterHistory(null);
          }}
          className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs overflow-y-auto"
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl my-auto max-h-[92vh] flex flex-col"
          >
            <div className="flex items-start justify-between gap-4 bg-blue-700 px-5 py-4 text-white shrink-0">
              <div>
                <h3 className="font-bold">{selectedCutterHistory.cutterName} — Cutting History</h3>
                <p className="mt-1 text-xs text-blue-100">
                  Article: {selectedCutterHistory.article} · Size: {selectedCutterHistory.size}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedCutterHistory(null)}
                className="rounded-lg p-1 hover:bg-white/15 cursor-pointer"
                title="Close / Back (Esc)"
                aria-label="Close / Back"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 space-y-2 overflow-y-auto p-4">
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
            <div className="p-3 border-t border-slate-200 flex justify-end shrink-0">
              <button
                type="button"
                onClick={() => setSelectedCutterHistory(null)}
                className="flex items-center gap-1 rounded-xl px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Close / Back
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
