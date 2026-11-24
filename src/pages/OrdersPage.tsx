import React, { useState, useMemo, useEffect } from 'react';
import {
  FileText,
  Search,
  Plus,
  Filter,
  ChevronDown,
  ChevronRight,
  ArrowLeft,
  Scissors,
  Pencil,
  Trash2,
  AlertCircle,
  Building2,
  CheckCircle2,
  Clock,
  RotateCcw,
  Phone,
  MapPin,
  User,
  X,
  ExternalLink,
  PackageCheck
} from 'lucide-react';
import { useFactory } from '../context/FactoryContext';
import { formatDate, getOrderStatusBadge, safeStringCompare } from '../utils/factoryFormatters';
import { CustomerOrder, CompanyOrderStats, OrderCompany, CuttingEntry } from '../types/factory';
import { OrderDetailPage } from './OrderDetailPage';

interface OrdersPageProps {
  initialCompanyName?: string;
  onOpenCreateOrder: (initialCustomer?: string) => void;
  onEditOrder?: (order: CustomerOrder) => void;
  onOpenCuttingForOrder: (orderId: string, itemId?: string) => void;
  onOpenInvoiceForOrder?: (orderId: string) => void;
}

interface OrderSizeRow {
  article: string;
  size: string;
  ordered: number;
}

const normalizeKey = (v: string | undefined | null) => (v || '').trim().toLowerCase();

const extractOrderSizeRows = (order: CustomerOrder): OrderSizeRow[] => {
  const rows: OrderSizeRow[] = [];
  (order.items || []).forEach(item => {
    const article = (item.title || item.gloveType || item.article || 'Glove Article').trim();
    const origQty = Number(item.originalQty) || Number(item.totalPairs) || Number(item.qty) || 0;
    if ((article.includes('Size Matrix') || article.includes('/ Matrix')) && origQty <= 0) {
      return;
    }

    if (item.customSizes && item.customSizes.length > 0) {
      const validCustom = item.customSizes.filter(
        cs => Number(cs.quantity) > 0 || (cs.size && cs.size.trim().length > 0)
      );
      if (validCustom.length > 0) {
        validCustom.forEach(cs => {
          rows.push({
            article,
            size: cs.size?.trim() || 'Standard',
            ordered: Number(cs.quantity) || 0
          });
        });
        return;
      }
    }

    if (item.size) {
      const rawSize = item.size.trim();
      const cleanSize =
        rawSize === '10000' || rawSize === '10,000' || rawSize === String(origQty)
          ? '10'
          : rawSize;
      rows.push({ article, size: cleanSize || 'Standard', ordered: origQty });
      return;
    }

    const szEntries = Object.entries(item.sizes || {}).filter(([, q]) => Number(q) > 0);
    if (szEntries.length > 0) {
      szEntries.forEach(([s, q]) => {
        rows.push({ article, size: s.toUpperCase(), ordered: Number(q) || 0 });
      });
      return;
    }

    rows.push({ article, size: 'Standard', ordered: origQty });
  });
  return rows;
};

export const OrdersPage: React.FC<OrdersPageProps> = ({
  initialCompanyName,
  onOpenCreateOrder,
  onEditOrder,
  onOpenCuttingForOrder,
  onOpenInvoiceForOrder
}) => {
  const {
    orders,
    cuttingEntries,
    deliveryHistory,
    stitchingHistory,
    stitchingOrders,
    stockLedger,
    getCompanyStats,
    upsertOrderCompany,
    updateCompanyAndSyncOrders,
    toggleCompanyComplete,
    deleteCustomerOrder,
    selectedOrderId,
    setSelectedOrderId,
    selectedCompanyName,
    setSelectedCompanyName,
    activeModule,
    setActiveModule
  } = useFactory();

  // Step 1 & 2 search / filters
  const [companySearch, setCompanySearch] = useState('');
  const [companyFilterTab, setCompanyFilterTab] = useState<'all' | 'active' | 'completed'>('all');

  const [orderSearch, setOrderSearch] = useState('');
  const [orderStatusFilter, setOrderStatusFilter] = useState<string>('all');
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);
  const [orderToDelete, setOrderToDelete] = useState<CustomerOrder | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Add / Edit Company Modals
  const [isAddCompanyOpen, setIsAddCompanyOpen] = useState(false);
  const [addCompanyForm, setAddCompanyForm] = useState({
    name: '',
    contactPerson: '',
    phone: '',
    address: '',
    notes: ''
  });
  const [isSavingAddCompany, setIsSavingAddCompany] = useState(false);

  const [editingCompany, setEditingCompany] = useState<OrderCompany | null>(null);
  const [editCompanyForm, setEditCompanyForm] = useState({
    name: '',
    contactPerson: '',
    phone: '',
    address: '',
    notes: ''
  });
  const [isSavingEditCompany, setIsSavingEditCompany] = useState(false);

  // Sync initialCompanyName prop if provided
  useEffect(() => {
    if (initialCompanyName && !selectedCompanyName) {
      setSelectedCompanyName(initialCompanyName);
    }
  }, [initialCompanyName, selectedCompanyName, setSelectedCompanyName]);

  // Listen for sidebar reset event -> go back to Step 1 (Companies List)
  useEffect(() => {
    const handleReset = () => {
      setExpandedOrderId(null);
      setOrderSearch('');
      setOrderStatusFilter('all');
    };
    window.addEventListener('factory:reset-orders-view', handleReset);
    return () => window.removeEventListener('factory:reset-orders-view', handleReset);
  }, []);

  // Helper: Live deduplicated cutting entries per order (Single Source of Truth)
  const liveCuttingByOrderId = useMemo(() => {
    const map = new Map<string, CuttingEntry[]>();
    const seenIds = new Set<string>();

    (cuttingEntries || []).forEach(entry => {
      if (entry.isDeleted) return;
      if (seenIds.has(entry.id)) return;
      seenIds.add(entry.id);

      const matchedOrder =
        (entry.orderId ? orders.find(o => o.id === entry.orderId) : undefined) ||
        (entry.orderNo ? orders.find(o => o.orderNo === entry.orderNo) : undefined);

      if (!matchedOrder) return;
      const list = map.get(matchedOrder.id) || [];
      list.push(entry);
      map.set(matchedOrder.id, list);
    });

    return map;
  }, [cuttingEntries, orders]);

  // Helper: Live deduplicated delivery history per order
  const liveDeliveriesByOrderId = useMemo(() => {
    const map = new Map<string, number>();
    const seenIds = new Set<string>();

    (deliveryHistory || []).forEach(d => {
      if (seenIds.has(d.id)) return;
      if (d.article && d.article.includes(',')) return;
      seenIds.add(d.id);

      const matchedOrder =
        (d.orderId ? orders.find(o => o.id === d.orderId) : undefined) ||
        (d.customerOrderId ? orders.find(o => o.id === d.customerOrderId) : undefined) ||
        (d.orderNo ? orders.find(o => o.orderNo === d.orderNo) : undefined);

      if (!matchedOrder) return;
      map.set(matchedOrder.id, (map.get(matchedOrder.id) || 0) + (Number(d.quantity) || 0));
    });

    return map;
  }, [deliveryHistory, orders]);

  // Compute live summary metrics for a single order (Zero double counting)
  // Exact Formulas:
  // Remaining = Total Order Qty - Total Cutting Received (negative when Cutting > Order)
  // Stock Received = Stitching / non-cutting Stock ONLY (0 if none; NEVER copies cutting)
  // Pending = Total Order Qty - Dispatched
  const getOrderLiveMetrics = (order: CustomerOrder) => {
    const totalOriginal =
      Number(order.originalTotalPairs) || Number(order.totalPairs) || Number(order.totalQty) || 0;
    const entries = liveCuttingByOrderId.get(order.id) || [];

    let rawGiven = 0;
    let totalReceive = 0;
    let returnedCutting = 0;
    let flaggedExtraCutting = 0;
    const seen = new Set<string>();
    const cuttingRefIds = new Set<string>();
    entries.forEach(e => {
      if (seen.has(e.id)) return;
      seen.add(e.id);
      cuttingRefIds.add(e.id);
      const qty = Math.abs(Number(e.pairs ?? e.totalQty ?? 0));
      if (e.type === 'GIVE') rawGiven += qty;
      else if (e.type === 'RECEIVE') {
        totalReceive += qty;
        if (e.isExtraCutting) {
          flaggedExtraCutting += Math.abs(Number(e.extraCuttingQty ?? qty) || qty);
        }
      } else if (e.type === 'RETURN') {
        returnedCutting += qty;
      }
    });

    const cuttingReceived = totalReceive - returnedCutting;
    const cuttingGiven = rawGiven > 0 ? rawGiven : cuttingReceived;
    // Remaining = Total Order Qty - Total Cutting Received (never clamped to 0)
    const cuttingRemaining = totalOriginal - cuttingReceived;
    const extraCutting = cuttingRemaining < 0 ? Math.abs(cuttingRemaining) : flaggedExtraCutting;

    // Stock Received: strictly from Stitching / non-cutting Stock IN (never copies cutting)
    const stitchHistReceive = (stitchingHistory || [])
      .filter(h => (h.orderId === order.id || Boolean(order.orderNo && h.orderNo === order.orderNo)) && h.type === 'RECEIVE')
      .reduce((sum, h) => sum + (Number(h.quantity) || 0), 0);
    const stitchOrderReceive = (stitchingOrders || [])
      .filter(so => so.orderId === order.id || Boolean(order.orderNo && so.orderNo === order.orderNo))
      .reduce((sum, so) => sum + (Number(so.receivedQuantity) || 0), 0);
    const nonCuttingStockIn = (stockLedger || [])
      .filter(s => {
        if ((s as any).isDeleted) return false;
        const match = s.orderId === order.id || Boolean(order.orderNo && s.orderNo === order.orderNo);
        if (!match || s.type !== 'in') return false;
        if (s.id.startsWith('stk-') || (s.referenceId && cuttingRefIds.has(s.referenceId))) return false;
        if ((s.notes || '').toLowerCase().includes('cutting')) return false;
        return true;
      })
      .reduce((sum, s) => sum + (Number(s.qty) || 0), 0);
    const stockReceived = (stitchHistReceive > 0 ? stitchHistReceive : stitchOrderReceive) + nonCuttingStockIn;

    const dispatched = liveDeliveriesByOrderId.get(order.id) || 0;
    const inStock = Math.max(0, stockReceived - dispatched);
    const remaining = Math.max(0, totalOriginal - dispatched);

    return {
      totalOriginal,
      cuttingGiven,
      cuttingReceived,
      cuttingRemaining,
      extraCutting,
      stockReceived,
      inStock,
      dispatched,
      remaining,
      entries
    };
  };

  // Companies stats enriched with live Stock & Cutting counts
  const allCompanyStats = useMemo(() => {
    const stats = getCompanyStats();
    return stats.map((comp: CompanyOrderStats) => {
      let companyCuttingReceived = 0;
      let companyDispatched = 0;

      comp.allOrders.forEach(ord => {
        const m = getOrderLiveMetrics(ord);
        companyCuttingReceived += m.cuttingReceived;
        companyDispatched += m.dispatched;
      });

      const companyInStock = Math.max(0, companyCuttingReceived - companyDispatched);
      return {
        ...comp,
        companyCuttingReceived,
        companyInStock
      };
    });
  }, [getCompanyStats, liveCuttingByOrderId, liveDeliveriesByOrderId, stitchingHistory, stitchingOrders, stockLedger]);

  // Filtered companies (supports searching by Company Name OR Order No)
  const filteredCompanies = useMemo(() => {
    const q = companySearch.trim().toLowerCase();
    return allCompanyStats.filter(comp => {
      if (companyFilterTab === 'active' && comp.isCompleted) return false;
      if (companyFilterTab === 'completed' && !comp.isCompleted) return false;
      if (!q) return true;

      const matchName = comp.name.toLowerCase().includes(q);
      const matchContact = comp.company.contactPerson?.toLowerCase().includes(q);
      const matchPhone = comp.company.phone?.toLowerCase().includes(q);
      const matchOrderNo = comp.allOrders.some(
        o =>
          o.orderNo?.toLowerCase().includes(q) ||
          o.items?.some(i => i.title?.toLowerCase().includes(q) || i.gloveType?.toLowerCase().includes(q))
      );
      return matchName || matchContact || matchPhone || matchOrderNo;
    });
  }, [allCompanyStats, companyFilterTab, companySearch]);

  // Matching orders quick-results when searching by Order No on Step 1
  const matchingOrdersFromSearch = useMemo(() => {
    const q = companySearch.trim().toLowerCase();
    if (!q) return [];
    return orders.filter(
      o =>
        o.orderNo?.toLowerCase().includes(q) ||
        o.items?.some(i => i.title?.toLowerCase().includes(q) || i.gloveType?.toLowerCase().includes(q))
    );
  }, [orders, companySearch]);

  // Aggregate KPI totals
  const totalCompaniesCount = allCompanyStats.length;
  const activeCompaniesCount = allCompanyStats.filter(c => !c.isCompleted).length;
  const grandTotalPairs = allCompanyStats.reduce((s, c) => s + c.totalPairsLifetime, 0);
  const grandDispatchedPairs = allCompanyStats.reduce((s, c) => s + c.totalDeliveredPairs, 0);

  // Handlers for Step navigation
  const handleSelectCompany = (name: string) => {
    setSelectedOrderId(null);
    setSelectedCompanyName(name);
    setExpandedOrderId(null);
    setOrderSearch('');
    setOrderStatusFilter('all');
    if (activeModule !== 'orders') setActiveModule('orders');
  };

  const handleOpenFullOrder = (order: CustomerOrder) => {
    setSelectedCompanyName(order.customerName);
    setSelectedOrderId(order.id);
    setActiveModule('order_detail');
  };

  const handleBackToCompanies = () => {
    setSelectedOrderId(null);
    setSelectedCompanyName(null);
    setExpandedOrderId(null);
    setActiveModule('orders');
  };

  const handleBackToCompanyOrders = () => {
    setSelectedOrderId(null);
    setActiveModule('orders');
  };

  // Company Add / Edit Handlers
  const handleSaveAddCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addCompanyForm.name.trim()) return;
    setIsSavingAddCompany(true);
    try {
      await upsertOrderCompany({
        name: addCompanyForm.name.trim(),
        contactPerson: addCompanyForm.contactPerson.trim(),
        phone: addCompanyForm.phone.trim(),
        address: addCompanyForm.address.trim(),
        notes: addCompanyForm.notes.trim(),
        status: 'active',
        isCompleted: false
      });
      setIsAddCompanyOpen(false);
      setAddCompanyForm({ name: '', contactPerson: '', phone: '', address: '', notes: '' });
    } catch (err) {
      console.error('Failed to add company:', err);
    } finally {
      setIsSavingAddCompany(false);
    }
  };

  const handleOpenEditCompany = (comp: OrderCompany) => {
    setEditingCompany(comp);
    setEditCompanyForm({
      name: comp.name || '',
      contactPerson: comp.contactPerson || '',
      phone: comp.phone || '',
      address: comp.address || '',
      notes: comp.notes || ''
    });
  };

  const handleSaveEditCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCompany || !editCompanyForm.name.trim()) return;
    setIsSavingEditCompany(true);
    try {
      const oldName = editingCompany.name;
      const newName = editCompanyForm.name.trim();
      await updateCompanyAndSyncOrders(oldName, {
        name: newName,
        contactPerson: editCompanyForm.contactPerson.trim(),
        phone: editCompanyForm.phone.trim(),
        address: editCompanyForm.address.trim(),
        notes: editCompanyForm.notes.trim()
      });
      if (selectedCompanyName && normalizeKey(selectedCompanyName) === normalizeKey(oldName)) {
        setSelectedCompanyName(newName);
      }
      setEditingCompany(null);
    } catch (err) {
      console.error('Failed to update company:', err);
    } finally {
      setIsSavingEditCompany(false);
    }
  };

  const handleConfirmDeleteOrder = async () => {
    if (!orderToDelete) return;
    setIsDeleting(true);
    try {
      await deleteCustomerOrder(orderToDelete.id);
      if (expandedOrderId === orderToDelete.id) setExpandedOrderId(null);
      setOrderToDelete(null);
    } catch (err) {
      console.error('Delete order error:', err);
    } finally {
      setIsDeleting(false);
    }
  };

  // =========================================================================
  // STEP 4: FULL ORDER DETAIL VIEW (inside Customer Orders)
  // =========================================================================
  if (selectedOrderId && (activeModule === 'order_detail' || activeModule === 'orders')) {
    const activeOrder = orders.find(o => o.id === selectedOrderId);
    const activeCompanyLabel = selectedCompanyName || activeOrder?.customerName || 'Company';

    return (
      <div className="space-y-4 max-w-7xl mx-auto">
        {/* Clean Step 4 Breadcrumb Bar */}
        <div className="bg-white rounded-xl border border-slate-200 px-4 py-3 flex flex-wrap items-center justify-between gap-2 shadow-2xs">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleBackToCompanies}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-xs font-bold text-slate-700 transition cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to Companies</span>
            </button>
            <ChevronRight className="w-4 h-4 text-slate-300" />
            <button
              type="button"
              onClick={() => {
                setSelectedCompanyName(activeCompanyLabel);
                handleBackToCompanyOrders();
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-blue-200 bg-blue-50 hover:bg-blue-100 text-xs font-bold text-blue-800 transition cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to {activeCompanyLabel} Orders</span>
            </button>
          </div>
          <span className="text-xs font-semibold text-slate-500">
            Customer Orders &rsaquo; {activeCompanyLabel} &rsaquo; {activeOrder?.orderNo || selectedOrderId}
          </span>
        </div>

        <OrderDetailPage
          orderId={selectedOrderId}
          onBack={() => {
            setSelectedCompanyName(activeCompanyLabel);
            handleBackToCompanyOrders();
          }}
          onOpenCuttingModalForOrder={(ordId, itemId) => onOpenCuttingForOrder(ordId, itemId)}
          onOpenInvoiceModalForOrder={(ordId) => onOpenInvoiceForOrder?.(ordId)}
        />
      </div>
    );
  }

  // =========================================================================
  // STEP 2 & STEP 3: SELECTED COMPANY — ALL ORDERS + EXPANDABLE ORDER DETAIL
  // =========================================================================
  if (selectedCompanyName) {
    const compStats = allCompanyStats.find(
      c => c.normalizedName === normalizeKey(selectedCompanyName)
    );
    const companyOrdersRaw = compStats?.allOrders || orders.filter(
      o => normalizeKey(o.customerName) === normalizeKey(selectedCompanyName)
    );

    // Sort Active on top, Completed at bottom, then newest date first
    const companyOrdersSorted = [...companyOrdersRaw].sort((a, b) => {
      const aComp = a.status === 'Completed' ? 1 : 0;
      const bComp = b.status === 'Completed' ? 1 : 0;
      if (aComp !== bComp) return aComp - bComp;
      return safeStringCompare(b.orderDate || b.createdAt, a.orderDate || a.createdAt);
    });

    const filteredCompanyOrders = companyOrdersSorted.filter(ord => {
      if (orderStatusFilter !== 'all' && ord.status !== orderStatusFilter) return false;
      if (orderSearch.trim()) {
        const q = orderSearch.trim().toLowerCase();
        const matchNo = ord.orderNo?.toLowerCase().includes(q);
        const matchItems = ord.items?.some(
          i => i.title?.toLowerCase().includes(q) || i.gloveType?.toLowerCase().includes(q)
        );
        return matchNo || matchItems;
      }
      return true;
    });

    const compTotalOrders = companyOrdersRaw.length;
    const compTotalPairs = compStats?.totalPairsLifetime || companyOrdersRaw.reduce(
      (sum, o) => sum + (Number(o.originalTotalPairs) || Number(o.totalPairs) || Number(o.totalQty) || 0),
      0
    );
    const compInStock = compStats?.companyInStock || 0;
    const compFulfilled = compStats?.totalDeliveredPairs || 0;

    return (
      <div className="space-y-5 max-w-7xl mx-auto pb-16">
        {/* Step 2 Header Bar */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-4 sm:p-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1.5">
              <button
                type="button"
                onClick={handleBackToCompanies}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-xs font-bold text-slate-700 transition cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Back to Companies</span>
              </button>

              <div className="flex flex-wrap items-center gap-2.5 pt-1">
                <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                  {compStats?.name || selectedCompanyName} &mdash; All Orders
                </h1>
                {compStats?.isCompleted ? (
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-slate-200 text-slate-700">
                    Completed
                  </span>
                ) : (
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                    Active Company
                  </span>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs font-medium text-slate-600 font-mono tabular-nums">
                <span><strong className="text-slate-900">{compTotalOrders}</strong> Orders</span>
                <span className="text-slate-300">&middot;</span>
                <span><strong className="text-blue-700">{compTotalPairs.toLocaleString()}</strong> Total Pairs</span>
                <span className="text-slate-300">&middot;</span>
                <span><strong className="text-emerald-700">{compInStock.toLocaleString()}</strong> In Stock</span>
                <span className="text-slate-300">&middot;</span>
                <span><strong className="text-slate-900">{compFulfilled.toLocaleString()}</strong> Fulfilled</span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {compStats && (
                <button
                  type="button"
                  onClick={() => handleOpenEditCompany(compStats.company)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl text-xs font-bold border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 transition cursor-pointer"
                >
                  <Pencil className="w-3.5 h-3.5" />
                  <span>Edit Company</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => onOpenCreateOrder(compStats?.name || selectedCompanyName)}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-500/25 transition active:scale-95 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>+ New Order for {compStats?.name || selectedCompanyName}</span>
              </button>
            </div>
          </div>

          {/* Search & Stage Filter inside Company */}
          <div className="mt-5 pt-4 border-t border-slate-100 flex flex-col sm:flex-row items-center gap-3">
            <div className="relative flex-1 w-full">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Search order # or article inside this company..."
                value={orderSearch}
                onChange={e => setOrderSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-xs sm:text-sm rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500/20 bg-white"
              />
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <Filter className="w-4 h-4 text-slate-400 shrink-0" />
              <select
                value={orderStatusFilter}
                onChange={e => setOrderStatusFilter(e.target.value)}
                className="w-full sm:w-auto px-3 py-2 text-xs font-semibold rounded-xl border border-slate-300 bg-white"
              >
                <option value="all">All Stages</option>
                <option value="Pending">Pending</option>
                <option value="Cutting-Given">Cutting-Given</option>
                <option value="In-Production">In-Production</option>
                <option value="Stock-Ready">Stock-Ready</option>
                <option value="Partial-Billed">Partial-Billed</option>
                <option value="Completed">Completed</option>
              </select>
            </div>
          </div>
        </div>

        {/* Delete Order Confirmation Banner */}
        {orderToDelete && (
          <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs text-rose-900">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
              <div>
                <span className="font-bold">
                  Order #{orderToDelete.orderNo} ({orderToDelete.customerName}): Is order ko delete karne se is ka Cutting, Stitching, Stock aur Stock Out sab delete ho jayega. Kya aap confirm karti hain?
                </span>
                <p className="text-[11px] text-rose-700 mt-0.5">
                  {(orderToDelete.totalPairs || orderToDelete.totalQty || 0).toLocaleString()} pairs aur is se mutaliqa tamaam records permanently delete ho jayenge.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
              <button
                type="button"
                onClick={() => setOrderToDelete(null)}
                disabled={isDeleting}
                className="px-3 py-1.5 rounded-lg bg-white border border-slate-300 text-slate-700 font-semibold hover:bg-slate-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteOrder}
                disabled={isDeleting}
                className="px-4 py-1.5 rounded-lg bg-rose-600 text-white font-bold hover:bg-rose-700 cursor-pointer disabled:opacity-50"
              >
                {isDeleting ? 'Deleting...' : 'Yes, Delete All'}
              </button>
            </div>
          </div>
        )}

        {/* Step 2 Orders List (Collapsed initially; Step 3 expands directly below clicked row) */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          {filteredCompanyOrders.length === 0 ? (
            <div className="py-16 text-center text-slate-400 text-sm">
              <FileText className="w-10 h-10 text-slate-300 mx-auto mb-2" />
              <p>No orders found for {compStats?.name || selectedCompanyName}.</p>
              <button
                type="button"
                onClick={() => onOpenCreateOrder(compStats?.name || selectedCompanyName)}
                className="mt-3 text-xs font-bold text-blue-600 hover:underline cursor-pointer"
              >
                + Create first order for {compStats?.name || selectedCompanyName}
              </button>
            </div>
          ) : (
            <div className="divide-y divide-slate-200">
              {filteredCompanyOrders.map(ord => {
                const isExpanded = expandedOrderId === ord.id;
                const badge = getOrderStatusBadge(ord.status);
                const sizeRows = extractOrderSizeRows(ord);
                const uniqueArticles = Array.from(new Set(sizeRows.map(r => r.article)));
                const articleCount = uniqueArticles.length || ord.items?.length || 0;
                const live = getOrderLiveMetrics(ord);

                // Chronological cutting entries for this order (Section C - Cutting History)
                const sortedCuttingEntries = [...live.entries].sort(
                  (a, b) => safeStringCompare(b.date, a.date) || safeStringCompare(b.id, a.id)
                );

                // Section C - Total History grouped by Article + Size
                const summaryMap = new Map<
                  string,
                  {
                    article: string;
                    size: string;
                    ordered: number;
                    given: number;
                    received: number;
                    extraCutting: number;
                    dispatched: number;
                  }
                >();

                sizeRows.forEach(sr => {
                  const key = `${normalizeKey(sr.article)}___${normalizeKey(sr.size)}`;
                  const existing = summaryMap.get(key);
                  if (existing) {
                    existing.ordered += sr.ordered;
                  } else {
                    summaryMap.set(key, {
                      article: sr.article,
                      size: sr.size,
                      ordered: sr.ordered,
                      given: 0,
                      received: 0,
                      extraCutting: 0,
                      dispatched: 0
                    });
                  }
                });

                live.entries.forEach(entry => {
                  const art = (entry.articleTitle || entry.article || 'Glove Article').trim();
                  const sz = (entry.sizeName || entry.size || 'Standard').trim() || 'Standard';
                  const key = `${normalizeKey(art)}___${normalizeKey(sz)}`;
                  const existing = summaryMap.get(key) || {
                    article: art,
                    size: sz,
                    ordered: 0,
                    given: 0,
                    received: 0,
                    extraCutting: 0,
                    dispatched: 0
                  };
                  const qty = Math.abs(Number(entry.pairs ?? entry.totalQty ?? 0));
                  if (entry.type === 'GIVE') existing.given += qty;
                  else if (entry.type === 'RECEIVE') {
                    existing.received += qty;
                    if (entry.isExtraCutting) {
                      existing.extraCutting += Math.abs(Number(entry.extraCuttingQty ?? qty) || qty);
                    }
                  } else if (entry.type === 'RETURN') {
                    existing.received -= qty;
                  }
                  summaryMap.set(key, existing);
                });

                (deliveryHistory || []).forEach(del => {
                  if (del.article && del.article.includes(',')) return;
                  const matchOrd =
                    del.orderId === ord.id ||
                    del.customerOrderId === ord.id ||
                    (ord.orderNo && del.orderNo === ord.orderNo);
                  if (!matchOrd) return;

                  const art = (del.article || 'Glove Article').trim();
                  const sz = (del.size || 'Standard').trim() || 'Standard';
                  const key = `${normalizeKey(art)}___${normalizeKey(sz)}`;
                  const existing = summaryMap.get(key) || {
                    article: art,
                    size: sz,
                    ordered: 0,
                    given: 0,
                    received: 0,
                    extraCutting: 0,
                    dispatched: 0
                  };
                  existing.dispatched += Math.abs(Number(del.quantity) || 0);
                  summaryMap.set(key, existing);
                });

                const totalHistoryRows = Array.from(summaryMap.values());
                const givenPct =
                  live.totalOriginal > 0 ? Math.min(100, Math.round((live.cuttingGiven / live.totalOriginal) * 100)) : 0;
                const stockPct =
                  live.totalOriginal > 0 ? Math.min(100, Math.round((live.stockReceived / live.totalOriginal) * 100)) : 0;
                const dispatchedPct =
                  live.totalOriginal > 0 ? Math.min(100, Math.round((live.dispatched / live.totalOriginal) * 100)) : 0;
                const pendingPct =
                  live.totalOriginal > 0 ? Math.min(100, Math.round((live.remaining / live.totalOriginal) * 100)) : 0;

                return (
                  <div key={ord.id} className="bg-white">
                    {/* Collapsed Order Summary Row */}
                    <div
                      onClick={() => setExpandedOrderId(isExpanded ? null : ord.id)}
                      className={`px-4 sm:px-6 py-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3 cursor-pointer transition ${
                        isExpanded ? 'bg-blue-50/50 border-b border-blue-100' : 'hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 min-w-0">
                        <span className="font-mono font-black text-sm sm:text-base text-blue-700 shrink-0">
                          {ord.orderNo}
                        </span>
                        <span className="text-xs text-slate-500 font-mono tabular-nums shrink-0">
                          {formatDate(ord.orderDate)}
                        </span>
                        <span className="text-xs font-semibold text-slate-700 truncate max-w-[320px]">
                          Detail: {articleCount} {articleCount === 1 ? 'Article' : 'Articles'}
                          {uniqueArticles.length > 0 ? ` (${uniqueArticles.join(', ')})` : ''}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center justify-between lg:justify-end gap-3 shrink-0">
                        <span className="font-mono tabular-nums font-black text-sm text-slate-900">
                          {live.totalOriginal.toLocaleString()} Pairs
                        </span>
                        {(live.cuttingRemaining < 0 || live.extraCutting > 0) && (
                          <span className="inline-flex items-center gap-1 rounded-md border border-rose-300 bg-rose-100 px-2 py-0.5 font-mono tabular-nums text-[11px] font-black text-rose-700">
                            <span className="rounded bg-rose-600 px-1 py-0.5 text-[9px] font-black uppercase text-white">Extra</span>
                            Extra Cutting -{(live.cuttingRemaining < 0 ? Math.abs(live.cuttingRemaining) : live.extraCutting).toLocaleString()}
                          </span>
                        )}
                        <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${badge.bg}`}>
                          {badge.label}
                        </span>

                        <div
                          className="flex items-center gap-1"
                          onClick={e => e.stopPropagation()}
                        >
                          <button
                            type="button"
                            onClick={() => onEditOrder?.(ord)}
                            className="p-1.5 rounded-lg text-blue-700 hover:bg-blue-100 transition cursor-pointer"
                            title="Edit Order"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setOrderToDelete(ord)}
                            className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-100 transition cursor-pointer"
                            title="Delete Order"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => onOpenCuttingForOrder(ord.id)}
                            className="p-1.5 rounded-lg text-amber-700 hover:bg-amber-100 transition cursor-pointer"
                            title="Assign Cutting"
                          >
                            <Scissors className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setExpandedOrderId(isExpanded ? null : ord.id)}
                            className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                              isExpanded
                                ? 'bg-blue-600 text-white'
                                : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-100'
                            }`}
                          >
                            <span>{isExpanded ? 'Hide Detail' : 'View Detail'}</span>
                            {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* =========================================================
                        STEP 3: EXPANDED ORDER DETAIL DIRECTLY BELOW ORDER ROW
                       ========================================================= */}
                    {isExpanded && (
                      <div className="bg-slate-50/80 px-4 sm:px-6 py-5 space-y-5 border-t border-slate-200">
                        {/* a) Order Header */}
                        <div className="bg-white rounded-xl border border-slate-200 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <div>
                            <h3 className="text-sm sm:text-base font-black text-slate-900">
                              {ord.customerName} &mdash; {ord.orderNo} &mdash; {formatDate(ord.orderDate)} &mdash;{' '}
                              <span className="font-mono text-blue-700">{live.totalOriginal.toLocaleString()} Pairs</span>
                              {(live.cuttingRemaining < 0 || live.extraCutting > 0) && (
                                <span className="ml-2 inline-flex items-center gap-1 rounded-md border border-rose-300 bg-rose-100 px-2 py-0.5 font-mono text-xs font-black text-rose-700">
                                  <span className="rounded bg-rose-600 px-1 py-0.5 text-[9px] font-black uppercase text-white">Extra</span>
                                  Extra Cutting -{(live.cuttingRemaining < 0 ? Math.abs(live.cuttingRemaining) : live.extraCutting).toLocaleString()}
                                </span>
                              )}
                            </h3>
                            <p className="text-xs text-slate-500 mt-0.5">
                              Target Delivery: {formatDate(ord.deliveryDate)}
                              {ord.customerPhone ? ` · ${ord.customerPhone}` : ''}
                            </p>
                          </div>

                          <div className="flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              onClick={() => handleOpenFullOrder(ord)}
                              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-xs transition cursor-pointer"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                              <span>Open Full Order</span>
                            </button>
                          </div>
                        </div>

                        {/* b) Section A: CUTTING DETAIL (Article | Size | Pairs) */}
                        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                          <div className="px-4 py-2.5 bg-slate-100 border-b border-slate-200 flex items-center justify-between">
                            <span className="text-xs font-black uppercase tracking-wider text-slate-800">
                              Section A: Cutting Detail (Original Order)
                            </span>
                            <span className="font-mono text-xs font-bold text-blue-700">
                              {live.totalOriginal.toLocaleString()} Total Pairs
                            </span>
                          </div>
                          <div className="overflow-x-auto">
                            <table className="w-full text-left text-xs">
                              <thead className="bg-slate-50 border-b border-slate-200 text-[10px] font-bold uppercase tracking-wider text-slate-600">
                                <tr>
                                  <th className="px-4 py-2">Article</th>
                                  <th className="px-4 py-2">Size</th>
                                  <th className="px-4 py-2 text-right">Pairs</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100">
                                {sizeRows.length === 0 ? (
                                  <tr>
                                    <td colSpan={3} className="px-4 py-4 text-center text-slate-400">
                                      No article rows found.
                                    </td>
                                  </tr>
                                ) : (
                                  sizeRows.map((sr, idx) => (
                                    <tr key={idx} className="hover:bg-slate-50">
                                      <td className="px-4 py-2 font-bold text-slate-900">{sr.article}</td>
                                      <td className="px-4 py-2 font-mono text-slate-700">{sr.size}</td>
                                      <td className="px-4 py-2 text-right font-mono tabular-nums font-bold text-slate-900">
                                        {sr.ordered.toLocaleString()}
                                      </td>
                                    </tr>
                                  ))
                                )}
                              </tbody>
                            </table>
                          </div>
                        </div>

                        {/* c) Section B: Live Order Progress */}
                        <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-black uppercase tracking-wider text-slate-800">
                              Section B: Live Order Progress
                            </span>
                            <span className="text-[11px] font-semibold text-slate-500">
                              Calculated live from cutting &amp; dispatch entries
                            </span>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                            {[
                              {
                                label: '1. Cutting Given',
                                qty: live.cuttingGiven,
                                pct: givenPct,
                                barClass: 'bg-amber-500'
                              },
                              {
                                label: '2. Stock Received',
                                qty: live.stockReceived,
                                pct: stockPct,
                                barClass: 'bg-blue-600'
                              },
                              {
                                label: '3. Billed / Dispatched',
                                qty: live.dispatched,
                                pct: dispatchedPct,
                                barClass: 'bg-emerald-600'
                              },
                              {
                                label: '4. Pending',
                                qty: live.remaining,
                                pct: pendingPct,
                                barClass: 'bg-slate-600'
                              }
                            ].map(metric => (
                              <div key={metric.label} className="rounded-lg bg-slate-50 border border-slate-200/80 p-3">
                                <div className="flex items-center justify-between text-xs mb-1.5">
                                  <span className="font-semibold text-slate-700">{metric.label}</span>
                                  <span className="font-mono tabular-nums font-bold text-slate-900">
                                    {metric.qty.toLocaleString()} / {live.totalOriginal.toLocaleString()}
                                  </span>
                                </div>
                                <div className="h-2 rounded-full bg-slate-200 overflow-hidden">
                                  <div style={{ width: `${metric.pct}%` }} className={`h-full rounded-full ${metric.barClass}`} />
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* d) Section C: Order History (Cutting History + Total History + Grand Total) */}
                        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden space-y-0">
                          <div className="px-4 py-2.5 bg-slate-100 border-b border-slate-200">
                            <span className="text-xs font-black uppercase tracking-wider text-slate-800">
                              Section C: Order History
                            </span>
                          </div>

                          {/* 1. Cutting History */}
                          <div className="p-4 border-b border-slate-200 space-y-2">
                            <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wide">
                              Cutting History ({sortedCuttingEntries.length} Live Entries)
                            </h4>
                            <div className="overflow-x-auto rounded-lg border border-slate-200">
                              <table className="w-full text-left text-xs">
                                <thead className="bg-slate-50 border-b border-slate-200 text-[10px] font-bold uppercase text-slate-600">
                                  <tr>
                                    <th className="px-3 py-2">Date</th>
                                    <th className="px-3 py-2">Type</th>
                                    <th className="px-3 py-2">Cutter</th>
                                    <th className="px-3 py-2">Article</th>
                                    <th className="px-3 py-2">Size</th>
                                    <th className="px-3 py-2 text-right">Pairs</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                  {sortedCuttingEntries.length === 0 ? (
                                    <tr>
                                      <td colSpan={6} className="px-3 py-4 text-center text-slate-400">
                                        No live cutting entries linked to this order yet.
                                      </td>
                                    </tr>
                                  ) : (
                                    sortedCuttingEntries.map(entry => {
                                      const pairsVal = Math.abs(Number(entry.pairs ?? entry.totalQty ?? 0));
                                      const isExtra = entry.type === 'RECEIVE' && Boolean(entry.isExtraCutting);
                                      return (
                                        <tr key={entry.id} className={isExtra ? 'bg-rose-50 hover:bg-rose-100/70 text-rose-900 font-semibold' : 'hover:bg-slate-50'}>
                                          <td className="px-3 py-2 font-mono whitespace-nowrap">{formatDate(entry.date)}</td>
                                          <td className="px-3 py-2 whitespace-nowrap">
                                            <span
                                              className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                                isExtra
                                                  ? 'bg-rose-100 text-rose-800 border border-rose-300'
                                                  : entry.type === 'RECEIVE'
                                                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                                    : entry.type === 'RETURN'
                                                      ? 'bg-rose-50 text-rose-700 border border-rose-200'
                                                      : 'bg-amber-50 text-amber-800 border border-amber-200'
                                              }`}
                                            >
                                              {isExtra ? 'EXTRA CUTTING' : entry.type}
                                            </span>
                                          </td>
                                          <td className={`px-3 py-2 font-semibold ${isExtra ? 'text-rose-900' : 'text-slate-800'}`}>{entry.cutterName}</td>
                                          <td className={`px-3 py-2 font-bold ${isExtra ? 'text-rose-900' : 'text-slate-900'}`}>{entry.articleTitle || entry.article}</td>
                                          <td className={`px-3 py-2 font-mono ${isExtra ? 'text-rose-800' : 'text-slate-600'}`}>{entry.sizeName || entry.size || 'Standard'}</td>
                                          <td className={`px-3 py-2 text-right font-mono tabular-nums font-bold ${isExtra ? 'text-rose-700' : 'text-slate-900'}`}>
                                            {isExtra
                                              ? `-${pairsVal.toLocaleString()} pcs`
                                              : entry.type === 'RETURN'
                                                ? `-${pairsVal.toLocaleString()}`
                                                : pairsVal.toLocaleString()}
                                          </td>
                                        </tr>
                                      );
                                    })
                                  )}
                                </tbody>
                              </table>
                            </div>
                          </div>

                          {/* 2. Total History + Grand Total */}
                          <div className="p-4 space-y-2">
                            <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wide">
                              Total History &amp; Grand Total
                            </h4>
                            <div className="overflow-x-auto rounded-lg border border-slate-200">
                              <table className="w-full text-left text-xs">
                                <thead className="bg-slate-50 border-b border-slate-200 text-[10px] font-bold uppercase text-slate-600">
                                  <tr>
                                    <th className="px-3 py-2">Article</th>
                                    <th className="px-3 py-2">Size</th>
                                    <th className="px-3 py-2 text-right">Ordered</th>
                                    <th className="px-3 py-2 text-right">Cutting Given</th>
                                    <th className="px-3 py-2 text-right">Cutting Received</th>
                                    <th className="px-3 py-2 text-right">Dispatched</th>
                                    <th className="px-3 py-2 text-right">Remaining</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                  {totalHistoryRows.map((row, idx) => {
                                    // Remaining = Total Order Qty - Total Cutting Received (negative when Cutting > Order)
                                    const rowCuttingRemaining = row.ordered - row.received;
                                    const isExtraRow = rowCuttingRemaining < 0 || row.extraCutting > 0;
                                    return (
                                    <tr key={idx} className={isExtraRow ? 'bg-rose-50/70 hover:bg-rose-50' : 'hover:bg-slate-50'}>
                                      <td className="px-3 py-2 font-bold text-slate-900">{row.article}</td>
                                      <td className="px-3 py-2 font-mono text-slate-600">{row.size}</td>
                                      <td className="px-3 py-2 text-right font-mono tabular-nums font-semibold">
                                        {row.ordered.toLocaleString()}
                                      </td>
                                      <td className="px-3 py-2 text-right font-mono tabular-nums text-amber-700 font-semibold">
                                        {row.given.toLocaleString()}
                                      </td>
                                      <td className="px-3 py-2 text-right font-mono tabular-nums text-emerald-700 font-semibold">
                                        <span>{row.received.toLocaleString()}</span>
                                      </td>
                                      <td className="px-3 py-2 text-right font-mono tabular-nums text-blue-700 font-semibold">
                                        {row.dispatched.toLocaleString()}
                                      </td>
                                      <td className={`px-3 py-2 text-right font-mono tabular-nums font-bold ${rowCuttingRemaining < 0 ? 'text-rose-700' : 'text-slate-900'}`}>
                                        {rowCuttingRemaining < 0
                                          ? `Extra Cutting -${Math.abs(rowCuttingRemaining).toLocaleString()}`
                                          : rowCuttingRemaining.toLocaleString()}
                                      </td>
                                    </tr>
                                    );
                                  })}
                                </tbody>
                                <tfoot className="bg-slate-100 border-t-2 border-slate-300 font-black text-slate-900">
                                  <tr>
                                    <td className="px-3 py-2.5 uppercase" colSpan={2}>
                                      Grand Total (Sum of Article Totals)
                                    </td>
                                    <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                                      {live.totalOriginal.toLocaleString()}
                                    </td>
                                    <td className="px-3 py-2.5 text-right font-mono tabular-nums text-amber-800">
                                      {live.cuttingGiven.toLocaleString()}
                                    </td>
                                    <td className="px-3 py-2.5 text-right font-mono tabular-nums text-emerald-800">
                                      <span>{live.cuttingReceived.toLocaleString()}</span>
                                    </td>
                                    <td className="px-3 py-2.5 text-right font-mono tabular-nums text-blue-800">
                                      {live.dispatched.toLocaleString()}
                                    </td>
                                    <td className={`px-3 py-2.5 text-right font-mono tabular-nums ${live.cuttingRemaining < 0 ? 'text-rose-700' : ''}`}>
                                      {live.cuttingRemaining < 0
                                        ? `Extra Cutting -${Math.abs(live.cuttingRemaining).toLocaleString()}`
                                        : live.cuttingRemaining.toLocaleString()}
                                    </td>
                                  </tr>
                                </tfoot>
                              </table>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Edit Company Modal (also accessible from Step 2) */}
        {editingCompany && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs"
            onClick={e => {
              if (e.target === e.currentTarget) setEditingCompany(null);
            }}
          >
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
              <div className="px-5 py-4 bg-slate-900 text-white flex items-center justify-between">
                <h3 className="font-bold text-sm">Edit Company: {editingCompany.name}</h3>
                <button type="button" onClick={() => setEditingCompany(null)} className="p-1 rounded-lg hover:bg-white/10">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <form onSubmit={handleSaveEditCompany} className="p-5 space-y-3 text-xs">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Company Name *</label>
                  <input
                    type="text"
                    required
                    value={editCompanyForm.name}
                    onChange={e => setEditCompanyForm(prev => ({ ...prev, name: e.target.value }))}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Contact Person</label>
                    <input
                      type="text"
                      value={editCompanyForm.contactPerson}
                      onChange={e => setEditCompanyForm(prev => ({ ...prev, contactPerson: e.target.value }))}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Phone</label>
                    <input
                      type="text"
                      value={editCompanyForm.phone}
                      onChange={e => setEditCompanyForm(prev => ({ ...prev, phone: e.target.value }))}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300"
                    />
                  </div>
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Address</label>
                  <input
                    type="text"
                    value={editCompanyForm.address}
                    onChange={e => setEditCompanyForm(prev => ({ ...prev, address: e.target.value }))}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300"
                  />
                </div>
                <div className="pt-2 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setEditingCompany(null)}
                    className="px-4 py-2 rounded-xl border border-slate-300 font-semibold text-slate-600"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSavingEditCompany}
                    className="px-4 py-2 rounded-xl bg-blue-600 text-white font-bold hover:bg-blue-700 disabled:opacity-50"
                  >
                    {isSavingEditCompany ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    );
  }

  // =========================================================================
  // STEP 1 (DEFAULT): COMPANIES WISE LIST INSIDE CUSTOMER ORDERS
  // =========================================================================
  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16">
      {/* Top KPI Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200 shadow-xs">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block">
            Total Companies
          </span>
          <div className="text-2xl font-black text-slate-900 mt-1 font-mono tabular-nums">
            {totalCompaniesCount}
          </div>
        </div>
        <div className="bg-white rounded-2xl p-4 sm:p-5 border border-emerald-200 shadow-xs">
          <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-700 block">
            Active Companies
          </span>
          <div className="text-2xl font-black text-emerald-700 mt-1 font-mono tabular-nums">
            {activeCompaniesCount}
          </div>
        </div>
        <div className="bg-white rounded-2xl p-4 sm:p-5 border border-blue-200 shadow-xs">
          <span className="text-[11px] font-bold uppercase tracking-wider text-blue-700 block">
            Total Ordered Pairs
          </span>
          <div className="text-2xl font-black text-blue-800 mt-1 font-mono tabular-nums">
            {grandTotalPairs.toLocaleString()}
          </div>
        </div>
        <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200 shadow-xs">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600 block">
            Fulfilled / Dispatched
          </span>
          <div className="text-2xl font-black text-slate-900 mt-1 font-mono tabular-nums">
            {grandDispatchedPairs.toLocaleString()}
          </div>
        </div>
      </div>

      {/* Main Directory Card */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-4 sm:p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
              Customer Orders &mdash; Companies
            </h1>
            <p className="text-xs text-slate-500">
              Click any company card to view its orders, expandable summaries, and full order details
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setIsAddCompanyOpen(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl text-xs sm:text-sm font-bold border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 transition cursor-pointer"
            >
              <Building2 className="w-4 h-4 text-blue-600" />
              <span>+ Add Company</span>
            </button>
            <button
              type="button"
              onClick={() => onOpenCreateOrder()}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-500/25 transition active:scale-95 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>+ New Order</span>
            </button>
          </div>
        </div>

        {/* Search & Filter Bar */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2 border-t border-slate-100">
          <div className="relative flex-1 w-full">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
            <input
              type="text"
              placeholder="Search Company or Search by Order No (e.g. traders, BESTWAY, ORD-004)..."
              value={companySearch}
              onChange={e => setCompanySearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 text-xs sm:text-sm rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500/20 bg-white"
            />
          </div>

          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl w-full sm:w-auto">
            {(
              [
                ['all', `All (${allCompanyStats.length})`],
                ['active', `Active (${activeCompaniesCount})`],
                ['completed', `Completed (${allCompanyStats.length - activeCompaniesCount})`]
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setCompanyFilterTab(key)}
                className={`flex-1 sm:flex-none px-3.5 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                  companyFilterTab === key
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Quick Order Matches when searching by Order No */}
        {companySearch.trim() && matchingOrdersFromSearch.length > 0 && (
          <div className="rounded-xl border border-blue-200 bg-blue-50/70 p-3 space-y-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-blue-800 block">
              Matching Orders ({matchingOrdersFromSearch.length})
            </span>
            <div className="flex flex-wrap gap-2">
              {matchingOrdersFromSearch.slice(0, 8).map(ord => (
                <button
                  key={ord.id}
                  type="button"
                  onClick={() => handleOpenFullOrder(ord)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-blue-200 hover:border-blue-400 text-xs font-bold text-slate-800 shadow-2xs transition cursor-pointer"
                >
                  <span className="font-mono text-blue-700">{ord.orderNo}</span>
                  <span className="text-slate-400">&middot;</span>
                  <span>{ord.customerName}</span>
                  <span className="text-slate-400">&middot;</span>
                  <span className="font-mono text-slate-600">{(ord.totalPairs || ord.totalQty || 0).toLocaleString()} Pairs</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Company Cards Grid */}
        {filteredCompanies.length === 0 ? (
          <div className="py-16 text-center text-slate-400 text-sm">
            <Building2 className="w-10 h-10 text-slate-300 mx-auto mb-2" />
            <p>No companies found matching your search.</p>
            <button
              type="button"
              onClick={() => onOpenCreateOrder()}
              className="mt-3 text-xs font-bold text-blue-600 hover:underline cursor-pointer"
            >
              + Create Customer Order
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredCompanies.map(comp => (
              <div
                key={comp.normalizedName}
                onClick={() => handleSelectCompany(comp.name)}
                className={`rounded-xl border p-4 sm:p-5 transition cursor-pointer flex flex-col justify-between gap-4 ${
                  comp.isCompleted
                    ? 'border-slate-200 bg-slate-50/70 hover:border-slate-300'
                    : 'border-slate-200 bg-white hover:border-blue-400 hover:shadow-sm'
                }`}
              >
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="text-base sm:text-lg font-black text-slate-900 truncate">
                        {comp.name}
                      </h2>
                      {(comp.company.contactPerson || comp.company.phone) && (
                        <p className="text-xs text-slate-500 mt-0.5 truncate">
                          {[comp.company.contactPerson, comp.company.phone].filter(Boolean).join(' · ')}
                        </p>
                      )}
                    </div>

                    <span
                      className={`shrink-0 px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                        comp.isCompleted
                          ? 'bg-slate-200 text-slate-700'
                          : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      }`}
                    >
                      {comp.isCompleted ? 'Completed' : 'Active'}
                    </span>
                  </div>

                  {/* Clean unboxed summary metadata */}
                  <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs font-mono tabular-nums text-slate-600 pt-1">
                    <span>
                      <strong className="text-slate-900">{comp.totalOrdersCount}</strong> Orders
                    </span>
                    <span className="text-slate-300">&middot;</span>
                    <span>
                      <strong className="text-blue-700">{comp.totalPairsLifetime.toLocaleString()}</strong> Total Pairs
                    </span>
                    <span className="text-slate-300">&middot;</span>
                    <span>
                      <strong className="text-emerald-700">{comp.companyInStock.toLocaleString()}</strong> In Stock
                    </span>
                    <span className="text-slate-300">&middot;</span>
                    <span>
                      <strong className="text-slate-900">{comp.totalDeliveredPairs.toLocaleString()}</strong> Fulfilled
                    </span>
                  </div>
                </div>

                {/* Card Actions */}
                <div
                  className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2"
                  onClick={e => e.stopPropagation()}
                >
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleOpenEditCompany(comp.company)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 cursor-pointer"
                      title="Edit Company"
                    >
                      <Pencil className="w-3.5 h-3.5 text-slate-500" />
                      <span>Edit</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleCompanyComplete(comp.name, !comp.isCompleted)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 cursor-pointer"
                      title={comp.isCompleted ? 'Reopen Company' : 'Mark Company Complete'}
                    >
                      {comp.isCompleted ? (
                        <>
                          <RotateCcw className="w-3.5 h-3.5 text-blue-600" />
                          <span>Reopen</span>
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                          <span>Complete</span>
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => onOpenCreateOrder(comp.name)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-blue-200 bg-blue-50 hover:bg-blue-100 text-xs font-bold text-blue-700 cursor-pointer"
                      title={`New Order for ${comp.name}`}
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>New Order</span>
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleSelectCompany(comp.name)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-2xs transition cursor-pointer"
                  >
                    <span>View Orders</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add Company Modal */}
      {isAddCompanyOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs"
          onClick={e => {
            if (e.target === e.currentTarget) setIsAddCompanyOpen(false);
          }}
        >
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="px-5 py-4 bg-blue-700 text-white flex items-center justify-between">
              <h3 className="font-bold text-sm">Add New Company</h3>
              <button type="button" onClick={() => setIsAddCompanyOpen(false)} className="p-1 rounded-lg hover:bg-white/10">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleSaveAddCompany} className="p-5 space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Company Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. BESTWAY, Traders, Burlas"
                  value={addCompanyForm.name}
                  onChange={e => setAddCompanyForm(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Contact Person</label>
                  <input
                    type="text"
                    value={addCompanyForm.contactPerson}
                    onChange={e => setAddCompanyForm(prev => ({ ...prev, contactPerson: e.target.value }))}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Phone</label>
                  <input
                    type="text"
                    value={addCompanyForm.phone}
                    onChange={e => setAddCompanyForm(prev => ({ ...prev, phone: e.target.value }))}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300"
                  />
                </div>
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">Address</label>
                <input
                  type="text"
                  value={addCompanyForm.address}
                  onChange={e => setAddCompanyForm(prev => ({ ...prev, address: e.target.value }))}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300"
                />
              </div>
              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsAddCompanyOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-300 font-semibold text-slate-600"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingAddCompany}
                  className="px-4 py-2 rounded-xl bg-blue-600 text-white font-bold hover:bg-blue-700 disabled:opacity-50"
                >
                  {isSavingAddCompany ? 'Saving...' : 'Add Company'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Company Modal */}
      {editingCompany && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs"
          onClick={e => {
            if (e.target === e.currentTarget) setEditingCompany(null);
          }}
        >
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="px-5 py-4 bg-slate-900 text-white flex items-center justify-between">
              <h3 className="font-bold text-sm">Edit Company: {editingCompany.name}</h3>
              <button type="button" onClick={() => setEditingCompany(null)} className="p-1 rounded-lg hover:bg-white/10">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleSaveEditCompany} className="p-5 space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Company Name *</label>
                <input
                  type="text"
                  required
                  value={editCompanyForm.name}
                  onChange={e => setEditCompanyForm(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Contact Person</label>
                  <input
                    type="text"
                    value={editCompanyForm.contactPerson}
                    onChange={e => setEditCompanyForm(prev => ({ ...prev, contactPerson: e.target.value }))}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Phone</label>
                  <input
                    type="text"
                    value={editCompanyForm.phone}
                    onChange={e => setEditCompanyForm(prev => ({ ...prev, phone: e.target.value }))}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300"
                  />
                </div>
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">Address</label>
                <input
                  type="text"
                  value={editCompanyForm.address}
                  onChange={e => setEditCompanyForm(prev => ({ ...prev, address: e.target.value }))}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300"
                />
              </div>
              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditingCompany(null)}
                  className="px-4 py-2 rounded-xl border border-slate-300 font-semibold text-slate-600"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingEditCompany}
                  className="px-4 py-2 rounded-xl bg-blue-600 text-white font-bold hover:bg-blue-700 disabled:opacity-50"
                >
                  {isSavingEditCompany ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
