import React, { useEffect, useMemo, useState } from 'react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import {
  ArrowDownLeft, ArrowLeft, ArrowUpRight, BookOpen, Boxes, Building, CheckCircle2, Clock3,
  Download, FileText, Pencil, Phone, Plus, Printer, Search, Scissors, Shirt, Trash2, UserRound, Wallet, X
} from 'lucide-react';
import { useFactory } from '../context/FactoryContext';
import { Stitcher, StitcherCategory, StitchingHistoryEntry, StitchingOrder, StitchingOrderStatus } from '../types/factory';
import { formatCurrency, formatDate } from '../utils/factoryFormatters';

type StitchingView = 'dashboard' | 'orders' | 'ready' | 'khata';

const today = () => new Date().toISOString().slice(0, 10);
const numberValue = (value: string) => Number(value) || 0;
const getStitcherIdFromPath = () => {
  if (typeof window === 'undefined') return null;
  const match = window.location.pathname.match(/^\/stitching\/khata\/([^/]+)$/);
  return match ? decodeURIComponent(match[1]) : null;
};

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[character] || character));

interface StitcherLedgerRow {
  id: string;
  date: string;
  description: string;
  article: string;
  size: string;
  issueQty: number;
  receiveQty: number;
  rate: number;
  debit: number;
  credit: number;
  balance: number;
  customerName: string;
  type: 'issue' | 'receiving' | 'payment' | 'status';
}

export const StitchingPage: React.FC = () => {
  const {
    orders, cuttings, cuttingTransactions, stitchers, stitchingOrders, stitcherKhataTransactions, stitchingHistory,
    addStitcher, updateStitcher, deleteStitcher, createStitchingOrder, updateStitchingOrderStatus,
    receiveStitchingOrder, updateStitchingHistoryEntry, deleteStitchingHistoryEntry,
    addStitcherKhataPayment, updateStitcherKhataPayment, deleteStitcherKhataPayment, showToast
  } = useFactory();

  const [view, setView] = useState<StitchingView>(() => 'khata');
  const [search, setSearch] = useState('');
  const [ledgerSearch, setLedgerSearch] = useState('');
  const [stitcherSearch, setStitcherSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [stitcherFilter, setStitcherFilter] = useState('all');
  const [articleFilter, setArticleFilter] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [isOrderModalOpen, setIsOrderModalOpen] = useState(false);
  const [isStitcherModalOpen, setIsStitcherModalOpen] = useState(false);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [isReceiveModalOpen, setIsReceiveModalOpen] = useState(false);
  const [editingLedgerRow, setEditingLedgerRow] = useState<StitcherLedgerRow | null>(null);
  const [deletingLedgerRow, setDeletingLedgerRow] = useState<StitcherLedgerRow | null>(null);
  const [showStitcherModal, setShowStitcherModal] = useState(false);
  const [selectedStitcherForActions, setSelectedStitcherForActions] = useState<Stitcher | null>(null);
  const [editingStitcher, setEditingStitcher] = useState<Stitcher | null>(null);
  const [deleteStitcherTarget, setDeleteStitcherTarget] = useState<Stitcher | null>(null);
  const [selectedStitcherId, setSelectedStitcherId] = useState<string | null>(getStitcherIdFromPath);
  const [saving, setSaving] = useState(false);
  const [khataTypeFilter, setKhataTypeFilter] = useState<'all' | 'issue' | 'receiving' | 'payment'>('all');
  const [khataCustomerFilter, setKhataCustomerFilter] = useState('all');
  const [khataFromDate, setKhataFromDate] = useState('');
  const [khataToDate, setKhataToDate] = useState('');
  const [isDatePdfModalOpen, setIsDatePdfModalOpen] = useState(false);
  const [pdfFromDate, setPdfFromDate] = useState('');
  const [pdfToDate, setPdfToDate] = useState('');
  const [stitcherCategory, setStitcherCategory] = useState<StitcherCategory>('factory_worker');
  const [stitcherStatusFilter, setStitcherStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');

  const [form, setForm] = useState({
    orderId: '', orderItemId: '', stitcherId: '', qty: '', small: '0', medium: '0', large: '0', xl: '0',
    issueDate: today(), dueDate: '', rate: '', advancePaid: '0', status: 'Pending' as StitchingOrderStatus, remarks: ''
  });
  const [stitcherForm, setStitcherForm] = useState({ name: '', phone: '', city: '', perPairRate: '', stitcherType: 'factory_worker' as StitcherCategory, isActive: true });
  const [receiveForm, setReceiveForm] = useState({ stitchingOrderId: '', date: today(), receivedQuantity: '', lossQuantity: '0', remarks: '' });
  const [paymentForm, setPaymentForm] = useState({
    type: 'ADVANCE' as 'ADVANCE' | 'PAYMENT_RETURN', date: today(), amount: '', description: '', stitchingOrderId: ''
  });
  const [ledgerEditForm, setLedgerEditForm] = useState({
    date: today(), quantity: '', rate: '', article: '', remarks: '',
    amount: '', description: '', paymentType: 'ADVANCE' as 'ADVANCE' | 'PAYMENT_RETURN'
  });

  useEffect(() => {
    const restoreStitcherRoute = () => {
      const stitcherId = getStitcherIdFromPath();
      setView('khata');
      setSelectedStitcherId(stitcherId);
    };
    window.addEventListener('popstate', restoreStitcherRoute);
    return () => window.removeEventListener('popstate', restoreStitcherRoute);
  }, []);

  const readyOrderIds = useMemo(() => {
    const ids = new Set<string>();
    cuttings.filter(cutting => cutting.status === 'Received').forEach(cutting => ids.add(cutting.orderId));
    cuttingTransactions.filter(tx => tx.type === 'RECEIVE' && tx.orderId).forEach(tx => ids.add(tx.orderId as string));
    orders.filter(order => order.status === 'Stock-Ready' || order.status === 'Completed').forEach(order => ids.add(order.id));
    return ids;
  }, [cuttings, cuttingTransactions, orders]);
  const readyOrders = useMemo(
    () => orders.filter(order => readyOrderIds.has(order.id)),
    [orders, readyOrderIds]
  );
  const selectedCustomerOrder = orders.find(order => order.id === form.orderId);
  const selectedItem = selectedCustomerOrder?.items.find(item => item.id === form.orderItemId);

  const orderRows = useMemo(() => stitchingOrders.filter(order => {
    const query = search.trim().toLowerCase();
    const matchesSearch = !query || [order.orderNo, order.article, order.stitcherName, order.customerName]
      .some(value => value.toLowerCase().includes(query));
    const matchesStatus = statusFilter === 'all' || order.status === statusFilter;
    const matchesStitcher = stitcherFilter === 'all' || order.stitcherId === stitcherFilter;
    const matchesArticle = !articleFilter.trim() || order.article.toLowerCase().includes(articleFilter.trim().toLowerCase());
    const matchesFrom = !fromDate || order.issueDate >= fromDate;
    const matchesTo = !toDate || order.issueDate <= toDate;
    return matchesSearch && matchesStatus && matchesStitcher && matchesArticle && matchesFrom && matchesTo;
  }), [stitchingOrders, search, statusFilter, stitcherFilter, articleFilter, fromDate, toDate]);

  const selectedStitcher = stitchers.find(stitcher => stitcher.id === selectedStitcherId);
  const selectedStitcherOrders = stitchingOrders.filter(order => order.stitcherId === selectedStitcherId);
  const selectedStitcherHistory = stitchingHistory.filter(entry => entry.stitcherId === selectedStitcherId);
  const ledgerRows = useMemo(() => {
    const rows: Omit<StitcherLedgerRow, 'balance'>[] = [
      ...selectedStitcherHistory.map(entry => ({
        id: entry.id,
        date: entry.date,
        description: entry.type === 'ISSUE'
          ? `Stitching issued · ${entry.orderNo}`
          : entry.type === 'RECEIVE'
            ? `Stitching received · ${entry.orderNo}`
            : `${entry.remarks || 'Status updated'} · ${entry.orderNo}`,
        article: entry.article,
        size: (() => {
          const order = stitchingOrders.find(item => item.id === entry.stitchingOrderId);
          return order ? `S:${order.sizes.small} M:${order.sizes.medium} L:${order.sizes.large} XL:${order.sizes.xl}` : '-';
        })(),
        issueQty: entry.type === 'ISSUE' ? entry.quantity : 0,
        receiveQty: entry.type === 'RECEIVE' ? entry.quantity : 0,
        rate: entry.rate,
        debit: entry.type === 'RECEIVE' ? entry.amount : 0,
        credit: 0,
        customerName: entry.customerName,
        type: entry.type === 'ISSUE' ? 'issue' as const : entry.type === 'RECEIVE' ? 'receiving' as const : 'status' as const
      })),
      ...stitcherKhataTransactions
        .filter(tx => tx.stitcherId === selectedStitcherId && tx.type !== 'WORK')
        .map(tx => ({
          id: tx.id,
          date: tx.date,
          description: tx.description,
          article: tx.stitchingOrderId ? stitchingOrders.find(order => order.id === tx.stitchingOrderId)?.article || '' : '',
          size: tx.stitchingOrderId ? (() => {
            const order = stitchingOrders.find(item => item.id === tx.stitchingOrderId);
            return order ? `S:${order.sizes.small} M:${order.sizes.medium} L:${order.sizes.large} XL:${order.sizes.xl}` : '-';
          })() : '-',
          issueQty: 0,
          receiveQty: 0,
          rate: 0,
          debit: tx.type === 'PAYMENT_RETURN' ? tx.amount : 0,
          credit: tx.type === 'ADVANCE' ? tx.amount : 0,
          customerName: tx.orderId ? orders.find(order => order.id === tx.orderId)?.customerName || '' : '',
          type: 'payment' as const
        }))
    ].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
    let balance = 0;
    return rows.map(row => {
      balance += row.debit - row.credit;
      return { ...row, balance };
    });
  }, [selectedStitcherHistory, stitcherKhataTransactions, selectedStitcherId, stitchingOrders, orders]);
  const filteredLedgerRows = useMemo(() => ledgerRows.filter(row => {
    const typeMatches = khataTypeFilter === 'all' || row.type === khataTypeFilter;
    const customerMatches = khataCustomerFilter === 'all' || row.customerName === khataCustomerFilter;
    const fromMatches = !khataFromDate || row.date >= khataFromDate;
    const toMatches = !khataToDate || row.date <= khataToDate;
    const searchMatches = !ledgerSearch.trim() || row.customerName.toLowerCase().includes(ledgerSearch.trim().toLowerCase());
    return typeMatches && customerMatches && fromMatches && toMatches && searchMatches;
  }), [ledgerRows, khataTypeFilter, khataCustomerFilter, khataFromDate, khataToDate, ledgerSearch]);
  const khataCustomers = [...new Set(ledgerRows.map(row => row.customerName).filter(Boolean))].sort();

  const metrics = useMemo(() => ({
    total: stitchingOrders.length,
    pending: stitchingOrders.filter(order => order.status === 'Pending' || order.status === 'In Progress').length,
    completedToday: stitchingOrders.filter(order => (order.status === 'Completed' || order.status === 'Received') && order.updatedAt?.slice(0, 10) === today()).length,
    activeStitchers: stitchers.filter(stitcher => stitcher.isActive).length,
    baqaya: stitchingHistory.filter(entry => entry.type === 'RECEIVE').reduce((balance, entry) => balance + entry.amount, 0) +
      stitcherKhataTransactions.reduce((balance, tx) =>
        balance + (tx.type === 'PAYMENT_RETURN' ? tx.amount : tx.type === 'ADVANCE' ? -tx.amount : 0), 0)
  }), [stitchingOrders, stitchers, stitcherKhataTransactions, stitchingHistory]);

  const openOrderModal = (orderId?: string, stitcherId?: string) => {
    const initialOrder = (orderId && orders.find(order => order.id === orderId)) || readyOrders[0] || orders[0];
    const item = initialOrder?.items[0];
    const sizes = item?.sizes;
    const initialStitcher = stitchers.find(stitcher => stitcher.id === stitcherId && stitcher.isActive)
      || stitchers.find(stitcher => stitcher.isActive);
    setForm({
      orderId: initialOrder?.id || '',
      orderItemId: item?.id || '',
      stitcherId: initialStitcher?.id || '',
      qty: String(item?.totalPairs || item?.qty || ''),
      small: String(sizes?.small || 0),
      medium: String(sizes?.medium || 0),
      large: String(sizes?.large || 0),
      xl: String(sizes?.xl || 0),
      issueDate: today(),
      dueDate: initialOrder?.deliveryDate || '',
      rate: String(initialStitcher?.perPairRate || ''),
      advancePaid: '0',
      status: 'Pending',
      remarks: ''
    });
    setIsOrderModalOpen(true);
  };

  useEffect(() => {
    const openStitchingOrder = () => {
      setSelectedStitcherForActions(null);
      openOrderModal();
    };
    window.addEventListener('factory:open-stitching-order', openStitchingOrder);
    return () => window.removeEventListener('factory:open-stitching-order', openStitchingOrder);
  }, []);

  const handleCreateOrder = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedCustomerOrder || !selectedItem || !form.stitcherId) {
      showToast('Choose a customer order, article, and stitcher.', 'error');
      return;
    }
    const qty = numberValue(form.qty);
    const rate = numberValue(form.rate);
    const advancePaid = numberValue(form.advancePaid);
    if (qty <= 0 || rate < 0 || advancePaid < 0 || advancePaid > qty * rate) {
      showToast('Enter a valid quantity, rate, and advance not exceeding the total.', 'error');
      return;
    }
    const stitcher = stitchers.find(person => person.id === form.stitcherId);
    if (!stitcher) {
      showToast('The selected stitcher could not be found.', 'error');
      return;
    }
    setSaving(true);
    try {
      await createStitchingOrder({
        orderId: selectedCustomerOrder.id,
        orderNo: selectedCustomerOrder.orderNo,
        orderItemId: selectedItem.id,
        article: selectedItem.title || selectedItem.gloveType,
        customerName: selectedCustomerOrder.customerName,
        stitcherId: stitcher.id,
        stitcherName: stitcher.name,
        stitcherPhone: stitcher.phone,
        qty,
        sizes: {
          small: numberValue(form.small),
          medium: numberValue(form.medium),
          large: numberValue(form.large),
          xl: numberValue(form.xl)
        },
        issueDate: form.issueDate,
        dueDate: form.dueDate,
        rate,
        totalAmount: qty * rate,
        advancePaid,
        remainingBalance: qty * rate - advancePaid,
        status: form.status,
        remarks: form.remarks.trim()
      });
      showToast('Stitching order created successfully.');
      setIsOrderModalOpen(false);
    } catch (error) {
      console.error('Unable to create stitching order:', error);
      showToast(error instanceof Error ? error.message : 'Unable to save the stitching order.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleAddStitcher = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!stitcherForm.name.trim()) {
      showToast('Enter a stitcher name.', 'error');
      return;
    }
    setSaving(true);
    try {
      if (editingStitcher) {
        await updateStitcher(editingStitcher.id, {
          name: stitcherForm.name,
          phone: stitcherForm.phone,
          city: stitcherForm.city,
          perPairRate: numberValue(stitcherForm.perPairRate),
          stitcherType: stitcherForm.stitcherType,
          isActive: stitcherForm.isActive
        });
        showToast('Stitcher updated successfully.');
      } else {
        const stitcher = await addStitcher({
          name: stitcherForm.name,
          phone: stitcherForm.phone,
          city: stitcherForm.city,
          perPairRate: numberValue(stitcherForm.perPairRate),
          stitcherType: stitcherForm.stitcherType,
          isActive: stitcherForm.isActive
        });
        setForm(current => ({ ...current, stitcherId: stitcher.id, rate: String(stitcher.perPairRate || current.rate) }));
        showToast('Stitcher added successfully.');
      }
      setEditingStitcher(null);
      setStitcherForm({ name: '', phone: '', city: '', perPairRate: '', stitcherType: stitcherCategory, isActive: true });
      setIsStitcherModalOpen(false);
    } catch (error) {
      console.error('Unable to save stitcher:', error);
      showToast(error instanceof Error ? error.message : 'Unable to save stitcher.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const openStitcherEditor = (stitcher?: Stitcher) => {
    setEditingStitcher(stitcher || null);
    setStitcherForm({
      name: stitcher?.name || '',
      phone: stitcher?.phone || '',
      city: stitcher?.city || '',
      perPairRate: String(stitcher?.perPairRate || ''),
      stitcherType: stitcher?.stitcherType === 'outside_contractor' ? 'stitching_maker' : stitcher?.stitcherType || stitcherCategory,
      isActive: stitcher?.isActive !== false
    });
    setIsStitcherModalOpen(true);
  };

  const handleDeleteStitcher = async () => {
    if (!deleteStitcherTarget) return;
    setSaving(true);
    try {
      await deleteStitcher(deleteStitcherTarget.id);
      if (selectedStitcherId === deleteStitcherTarget.id) setSelectedStitcherId(null);
      if (selectedStitcherForActions?.id === deleteStitcherTarget.id) {
        setSelectedStitcherForActions(null);
        setShowStitcherModal(false);
      }
      setDeleteStitcherTarget(null);
      showToast('Stitcher deleted successfully.');
    } catch (error) {
      console.error('Unable to delete stitcher:', error);
      showToast(error instanceof Error ? error.message : 'Unable to delete stitcher.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const toggleStitcherActive = async (stitcher: Stitcher) => {
    try {
      await updateStitcher(stitcher.id, {
        name: stitcher.name,
        phone: stitcher.phone,
        city: stitcher.city,
        perPairRate: stitcher.perPairRate,
        stitcherType: stitcher.stitcherType,
        isActive: stitcher.isActive === false
      });
      showToast(`${stitcher.name} marked ${stitcher.isActive === false ? 'active' : 'inactive'}.`);
    } catch (error) {
      console.error('Unable to update stitcher status:', error);
      showToast(error instanceof Error ? error.message : 'Unable to update stitcher status.', 'error');
    }
  };

  const openReceivingForm = (stitcher: Stitcher) => {
    setSelectedStitcherForActions(stitcher);
    const availableOrder = stitchingOrders.find(order =>
      order.stitcherId === stitcher.id &&
      order.status !== 'Cancelled' &&
      (order.receivedQuantity || 0) + (order.lossQuantity || 0) < order.qty
    );
    setReceiveForm({
      stitchingOrderId: availableOrder?.id || '',
      date: today(),
      receivedQuantity: String(Math.max(0, (availableOrder?.qty || 0) - (availableOrder?.receivedQuantity || 0) - (availableOrder?.lossQuantity || 0))),
      lossQuantity: '0',
      remarks: ''
    });
    setShowStitcherModal(false);
    setIsReceiveModalOpen(true);
  };

  const handleReceiveStitching = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      await receiveStitchingOrder({
        stitchingOrderId: receiveForm.stitchingOrderId,
        date: receiveForm.date,
        receivedQuantity: numberValue(receiveForm.receivedQuantity),
        lossQuantity: numberValue(receiveForm.lossQuantity),
        remarks: receiveForm.remarks
      });
      setIsReceiveModalOpen(false);
      showToast('Stitching receipt recorded and history updated.');
    } catch (error) {
      console.error('Unable to receive stitching:', error);
      showToast(error instanceof Error ? error.message : 'Unable to save stitching receipt.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleSavePayment = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedStitcher) return;
    setSaving(true);
    try {
      await addStitcherKhataPayment({
        stitcherId: selectedStitcher.id,
        stitchingOrderId: paymentForm.stitchingOrderId || undefined,
        type: paymentForm.type,
        date: paymentForm.date,
        amount: numberValue(paymentForm.amount),
        description: paymentForm.description
      });
      setIsPaymentModalOpen(false);
      setPaymentForm({ type: 'ADVANCE', date: today(), amount: '', description: '', stitchingOrderId: '' });
      showToast(paymentForm.type === 'ADVANCE' ? 'Advance payment recorded.' : 'Payment return recorded.');
    } catch (error) {
      console.error('Unable to save stitcher payment:', error);
      showToast(error instanceof Error ? error.message : 'Unable to save payment.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const openLedgerRowEditor = (row: StitcherLedgerRow) => {
    const historyEntry = stitchingHistory.find(entry => entry.id === row.id);
    const payment = stitcherKhataTransactions.find(tx => tx.id === row.id && tx.type !== 'WORK');
    if (historyEntry?.type === 'STATUS') {
      showToast('Status audit entries cannot be edited; change the order status instead.', 'error');
      return;
    }
    setLedgerEditForm({
      date: row.date,
      quantity: String(historyEntry?.quantity ?? ''),
      rate: String(historyEntry?.rate ?? ''),
      article: historyEntry?.article || row.article,
      remarks: historyEntry?.remarks || '',
      amount: String(payment?.amount ?? ''),
      description: payment?.description || '',
      paymentType: payment?.type === 'PAYMENT_RETURN' ? 'PAYMENT_RETURN' : 'ADVANCE'
    });
    setEditingLedgerRow(row);
  };

  const handleSaveLedgerEdit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!editingLedgerRow) return;
    setSaving(true);
    try {
      const historyEntry = stitchingHistory.find(entry => entry.id === editingLedgerRow.id);
      const payment = stitcherKhataTransactions.find(tx => tx.id === editingLedgerRow.id && tx.type !== 'WORK');
      if (historyEntry) {
        await updateStitchingHistoryEntry(historyEntry.id, {
          date: ledgerEditForm.date,
          quantity: numberValue(ledgerEditForm.quantity),
          rate: numberValue(ledgerEditForm.rate),
          article: ledgerEditForm.article,
          remarks: ledgerEditForm.remarks
        });
      } else if (payment) {
        await updateStitcherKhataPayment(payment.id, {
          date: ledgerEditForm.date,
          amount: numberValue(ledgerEditForm.amount),
          description: ledgerEditForm.description,
          type: ledgerEditForm.paymentType
        });
      } else {
        throw new Error('The selected ledger entry could not be found.');
      }
      setEditingLedgerRow(null);
      showToast('Stitching ledger entry updated.');
    } catch (error) {
      console.error('Unable to update stitching ledger entry:', error);
      showToast(error instanceof Error ? error.message : 'Unable to update ledger entry.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteLedgerRow = async () => {
    if (!deletingLedgerRow) return;
    setSaving(true);
    try {
      const historyEntry = stitchingHistory.find(entry => entry.id === deletingLedgerRow.id);
      const payment = stitcherKhataTransactions.find(tx => tx.id === deletingLedgerRow.id && tx.type !== 'WORK');
      if (historyEntry) await deleteStitchingHistoryEntry(historyEntry.id);
      else if (payment) await deleteStitcherKhataPayment(payment.id);
      else throw new Error('The selected ledger entry could not be found.');
      setDeletingLedgerRow(null);
      showToast('Stitching ledger entry deleted.');
    } catch (error) {
      console.error('Unable to delete stitching ledger entry:', error);
      showToast(error instanceof Error ? error.message : 'Unable to delete ledger entry.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const printChallan = (order: StitchingOrder) => {
    const popup = window.open('', '_blank', 'width=850,height=700');
    if (!popup) {
      showToast('Allow pop-ups to print the stitching challan.', 'error');
      return;
    }
    popup.document.write(`<!doctype html><html><head><title>Stitching Challan ${escapeHtml(order.orderNo)}</title>
      <style>body{font:14px Arial,sans-serif;margin:36px;color:#172554}h1{text-align:center}table{width:100%;border-collapse:collapse;margin-top:24px}td,th{border:1px solid #94a3b8;padding:10px;text-align:left}.meta{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:28px}.sign{margin-top:90px;display:flex;justify-content:space-between}</style></head>
      <body><h1>STITCHING CHALLAN</h1><hr><div class="meta">
      <div><b>Job Card / Customer Order:</b> ${escapeHtml(order.orderNo)}</div><div><b>Issue Date:</b> ${escapeHtml(formatDate(order.issueDate))}</div>
      <div><b>Customer:</b> ${escapeHtml(order.customerName)}</div><div><b>Due Date:</b> ${escapeHtml(formatDate(order.dueDate))}</div>
      <div><b>Stitcher:</b> ${escapeHtml(order.stitcherName)}</div><div><b>Phone:</b> ${escapeHtml(order.stitcherPhone || '-')}</div></div>
      <table><thead><tr><th>Article</th><th>Quantity</th><th>S</th><th>M</th><th>L</th><th>XL</th><th>Rate</th><th>Total</th></tr></thead>
      <tbody><tr><td>${escapeHtml(order.article)}</td><td>${order.qty}</td><td>${order.sizes.small}</td><td>${order.sizes.medium}</td><td>${order.sizes.large}</td><td>${order.sizes.xl}</td><td>${formatCurrency(order.rate)}</td><td>${formatCurrency(order.totalAmount)}</td></tr></tbody></table>
      <p><b>Remarks:</b> ${escapeHtml(order.remarks || '-')}</p><div class="sign"><span>Issued By: __________________</span><span>Stitcher Signature: __________________</span></div>
      <script>window.onload=()=>window.print()</script></body></html>`);
    popup.document.close();
  };

  const generateKhataPdf = (rows: StitcherLedgerRow[], title: string) => {
    if (!selectedStitcher) return;
    const pdf = new jsPDF({ orientation: 'landscape' });
    pdf.setFontSize(16);
    pdf.text(`${title} - ${selectedStitcher.name}`, 14, 16);
    pdf.setFontSize(10);
    pdf.text(`Phone: ${selectedStitcher.phone || '-'}  |  Closing Baqaya: ${formatCurrency(rows.at(-1)?.balance || 0)}`, 14, 23);
    autoTable(pdf, {
      startY: 30,
      head: [['Date', 'Customer Name', 'Article', 'Size', 'Pairs', 'Average', 'Rate (Rs.)', 'Total Balance']],
      body: rows.map(row => [
        formatDate(row.date), row.customerName || '-', row.article || '-', row.size || '-',
        row.issueQty || row.receiveQty || '-', '-', row.rate ? formatCurrency(row.rate) : '-',
        formatCurrency(row.type === 'issue' ? row.issueQty * row.rate : row.debit)
      ]),
      styles: { fontSize: 8, cellPadding: 3 },
      headStyles: { fillColor: [30, 64, 175] }
    });
    pdf.save(`${selectedStitcher.name.replace(/[^a-z0-9]+/gi, '-')}-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.pdf`);
  };

  const printKhata = () => generateKhataPdf(filteredLedgerRows, 'Full Stitching Ledger');
  const printDateRangeKhata = () => {
    if (!pdfFromDate || !pdfToDate) {
      showToast('Select both dates for the date-range ledger PDF.', 'error');
      return;
    }
    if (pdfToDate < pdfFromDate) {
      showToast('The end date must be on or after the start date.', 'error');
      return;
    }
    generateKhataPdf(ledgerRows.filter(row => row.date >= pdfFromDate && row.date <= pdfToDate), 'Date-Range Stitching Ledger');
    setIsDatePdfModalOpen(false);
  };
  const printCustomerKhata = () => generateKhataPdf(
    ledgerSearch.trim()
      ? ledgerRows.filter(row => row.customerName.toLowerCase().includes(ledgerSearch.trim().toLowerCase()))
      : ledgerRows,
    'Customer Stitching Ledger'
  );

  const exportKhata = () => {
    if (!selectedStitcher) return;
    const sheet = XLSX.utils.json_to_sheet(filteredLedgerRows.map(row => ({
      Date: formatDate(row.date),
      Description: row.description,
      Article: row.article || '-',
      'Issue Qty': row.issueQty || '',
      'Receive Qty': row.receiveQty || '',
      Rate: row.rate || '',
      Debit: row.debit,
      Credit: row.credit,
      Balance: row.balance,
      Customer: row.customerName || '-'
    })));
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, 'Stitcher Khata');
    XLSX.writeFile(workbook, `${selectedStitcher.name.replace(/[^a-z0-9]+/gi, '-')}-stitcher-khata.xlsx`);
  };

  const updateStatus = async (orderId: string, status: StitchingOrderStatus) => {
    try {
      await updateStitchingOrderStatus(orderId, status);
      showToast(`Stitching order marked ${status.toLowerCase()}.`);
    } catch (error) {
      console.error('Unable to update stitching order status:', error);
      showToast(error instanceof Error ? error.message : 'Unable to update status.', 'error');
    }
  };

  const openPayment = (stitcher: Stitcher) => {
    setSelectedStitcherId(stitcher.id);
    setPaymentForm({ type: 'ADVANCE', date: today(), amount: '', description: '', stitchingOrderId: '' });
    setShowStitcherModal(false);
    setIsPaymentModalOpen(true);
  };

  const handleNameClick = (stitcher: Stitcher) => {
    openStitcherKhata(stitcher);
  };

  const issueStitchingFor = (stitcher: Stitcher) => {
    setSelectedStitcherForActions(stitcher);
    openOrderModal(undefined, stitcher.id);
  };

  const startIssueStitching = (stitcher: Stitcher) => {
    setShowStitcherModal(false);
    openOrderModal(undefined, stitcher.id);
  };

  const openStitcherKhata = (stitcher: Stitcher) => {
    setSelectedStitcherId(stitcher.id);
    setLedgerSearch('');
    setShowStitcherModal(false);
    setView('khata');
    window.history.pushState(null, '', `/stitching/khata/${encodeURIComponent(stitcher.id)}`);
  };

  const navigateToStitchingSection = (section: StitchingView) => {
    setView(section);
    setSelectedStitcherId(null);
    if (window.location.pathname.startsWith('/stitching/khata/')) {
      window.history.pushState(null, '', '/stitching');
    }
  };

  const stitcherOrdersForReceiving = selectedStitcherForActions
    ? stitchingOrders.filter(order =>
      order.stitcherId === selectedStitcherForActions.id &&
      order.status !== 'Cancelled' &&
      (order.receivedQuantity || 0) + (order.lossQuantity || 0) < order.qty
    )
    : [];
  const receivingOrder = stitcherOrdersForReceiving.find(order => order.id === receiveForm.stitchingOrderId);

  const filteredStitchers = stitchers.filter(person => {
    const category = person.stitcherType || 'factory_worker';
    const isCategoryMatch = category === stitcherCategory;
    const isStatusMatch = stitcherStatusFilter === 'all' ||
      (stitcherStatusFilter === 'active' ? person.isActive !== false : person.isActive === false);
    const query = stitcherSearch.trim().toLowerCase();
    const isSearchMatch = !query || [person.name, person.phone || '', person.city || '']
      .some(value => value.toLowerCase().includes(query));
    return isCategoryMatch && isStatusMatch && isSearchMatch;
  });

  const stitcherCategories: Array<{ id: StitcherCategory; title: string; subtitle: string; color: string; label: string }> = [
    { id: 'factory_worker', title: 'Stitching Man', subtitle: 'In-house operator who stitches leather gloves', color: 'amber', label: 'Active Stitchers' },
    { id: 'stitching_maker', title: 'Stitching Maker', subtitle: 'Stitcher Maker / Outside Die Maker Contractors', color: 'blue', label: 'Active Makers' },
    { id: 'product', title: 'Product / Purchase', subtitle: 'Material Product related stitching & fabrication', color: 'indigo', label: 'Active Units' }
  ];

  const belongsToStitcherCategory = (stitcher: Stitcher, category: StitcherCategory) => {
    const stitcherType = stitcher.stitcherType || 'factory_worker';
    return stitcherType === category || (category === 'stitching_maker' && stitcherType === 'outside_contractor');
  };

  const nav: { id: StitchingView; title: string; subtitle: string; icon: React.FC<{ className?: string }>; count: string; color: string }[] = [
    { id: 'khata', title: 'Stitcher Roster', subtitle: 'Stitcher list & individual khata', icon: UserRound, count: `${stitchers.length} Stitchers`, color: 'blue' },
    { id: 'orders', title: 'All Stitching Orders', subtitle: 'Assignments & production status', icon: FileText, count: `${stitchingOrders.length} Orders`, color: 'amber' },
    { id: 'ready', title: 'Ready for Stitching', subtitle: 'Orders with completed cutting', icon: Scissors, count: `${readyOrders.length} Ready`, color: 'emerald' },
    { id: 'dashboard', title: 'Stitching Dashboard', subtitle: 'Overview & production metrics', icon: Shirt, count: `${metrics.activeStitchers} Active`, color: 'indigo' }
  ];

  const renderOrderTable = (rows: StitchingOrder[]) => (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
      <table className="w-full min-w-[900px] text-left text-sm">
        <thead className="bg-slate-50 text-xs uppercase text-slate-500">
          <tr><th className="px-4 py-3">Order / Article</th><th className="px-4 py-3">Stitcher</th><th className="px-4 py-3">Qty</th><th className="px-4 py-3">Rate / Total</th><th className="px-4 py-3">Issue / Due</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Actions</th></tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map(order => (
            <tr key={order.id} className="hover:bg-slate-50/80">
              <td className="px-4 py-3"><b className="block text-blue-700">#{order.orderNo}</b><span className="text-xs text-slate-500">{order.article}</span></td>
              <td className="px-4 py-3"><b>{order.stitcherName}</b><span className="block text-xs text-slate-500">{order.customerName}</span></td>
              <td className="px-4 py-3 font-bold">{order.qty.toLocaleString()}<span className="block text-xs font-normal text-slate-500">S:{order.sizes.small} M:{order.sizes.medium} L:{order.sizes.large} XL:{order.sizes.xl}</span></td>
              <td className="px-4 py-3">{formatCurrency(order.rate)} / pc<span className="block text-xs font-bold text-slate-700">{formatCurrency(order.totalAmount)}</span></td>
              <td className="px-4 py-3 text-xs">{formatDate(order.issueDate)}<span className="block text-slate-500">Due {formatDate(order.dueDate)}</span></td>
              <td className="px-4 py-3"><select value={order.status} onChange={event => void updateStatus(order.id, event.target.value as StitchingOrderStatus)} className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-bold">{['Pending', 'In Progress', 'Completed', 'Received', 'Returned', 'Cancelled', 'Customer Stock Created', 'Stock Received', 'Ready for Stitching', 'Packing'].map(status => <option key={status}>{status}</option>)}</select></td>
              <td className="px-4 py-3"><button onClick={() => printChallan(order)} className="inline-flex items-center gap-1 rounded-lg bg-blue-50 px-2.5 py-1.5 text-xs font-bold text-blue-700 hover:bg-blue-100"><Printer className="h-3.5 w-3.5" />Challan</button></td>
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan={7} className="px-4 py-10 text-center text-slate-500">No stitching orders match the current filters.</td></tr>}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="mx-auto max-w-7xl space-y-6 pb-12">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-black text-slate-900">Stitching Management</h1>
          <p className="mt-1 text-sm text-slate-500">Leather Gloves Manufacturing ERP System</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => selectedStitcher ? issueStitchingFor(selectedStitcher) : openOrderModal()} className="inline-flex items-center justify-center gap-2 rounded-xl bg-orange-500 px-4 py-2.5 text-sm font-bold text-white shadow-md shadow-orange-500/25 hover:bg-orange-600"><Plus className="h-4 w-4" />Give Stitching</button>
          <button onClick={() => openOrderModal()} className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-blue-700"><Plus className="h-4 w-4" />New Order</button>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {stitcherCategories.map((category, index) => {
            const selected = stitcherCategory === category.id;
            const activeCount = stitchers.filter(stitcher =>
              belongsToStitcherCategory(stitcher, category.id) && stitcher.isActive !== false
            ).length;
            const color = category.color === 'amber' ? 'amber' : category.color === 'blue' ? 'blue' : 'indigo';
            const selectedClass = color === 'amber' ? 'border-amber-500 bg-amber-50/70 shadow-sm' : color === 'blue' ? 'border-blue-600 bg-blue-50/70 shadow-sm' : 'border-indigo-600 bg-indigo-50/70 shadow-sm';
            const badgeClass = color === 'amber' ? 'bg-amber-500' : color === 'blue' ? 'bg-blue-600' : 'bg-indigo-600';
            const iconClass = color === 'amber' ? 'text-amber-600' : color === 'blue' ? 'text-blue-600' : 'text-indigo-600';
            const countClass = color === 'amber' ? 'text-amber-800' : color === 'blue' ? 'text-blue-800' : 'text-indigo-800';
            return (
              <button key={category.id} type="button" onClick={() => { setStitcherCategory(category.id); navigateToStitchingSection('khata'); }} className={`rounded-xl border-2 p-4 text-left transition-all cursor-pointer ${selected ? selectedClass : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'}`}>
                <div className="mb-2 flex items-center justify-between">
                  <span className={`rounded-md px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider ${selected ? `${badgeClass} text-white` : 'bg-slate-100 text-slate-600'}`}>Option {String.fromCharCode(65 + index)}</span>
                  {index === 0 ? <Shirt className={`h-5 w-5 ${selected ? iconClass : 'text-slate-400'}`} /> : index === 1 ? <Building className={`h-5 w-5 ${selected ? iconClass : 'text-slate-400'}`} /> : <Boxes className={`h-5 w-5 ${selected ? iconClass : 'text-slate-400'}`} />}
                </div>
                <h2 className="text-base font-black text-slate-900">{category.title}</h2>
                <p className="mt-0.5 text-xs text-slate-500">{category.subtitle}</p>
                <p className={`mt-2 text-xs font-bold ${selected ? countClass : 'text-slate-600'}`}>{activeCount} {category.label}</p>
              </button>
            );
          })}
        </div>
        <div className="mt-3 flex justify-end gap-4 text-xs font-bold">
          <button type="button" onClick={() => navigateToStitchingSection('orders')} className="text-blue-700 hover:underline">All Stitching Orders</button>
          <button type="button" onClick={() => navigateToStitchingSection('dashboard')} className="text-blue-700 hover:underline">Stitching Dashboard</button>
        </div>
      </div>

      {view === 'dashboard' && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            {[
              { label: 'Total Stitching Orders', value: metrics.total, icon: FileText, color: 'text-blue-600' },
              { label: 'Pending Stitching', value: metrics.pending, icon: Clock3, color: 'text-amber-600' },
              { label: 'Completed Today', value: metrics.completedToday, icon: CheckCircle2, color: 'text-emerald-600' },
              { label: 'Active Stitchers', value: metrics.activeStitchers, icon: UserRound, color: 'text-violet-600' },
              { label: 'Total Baqaya Amount', value: formatCurrency(metrics.baqaya), icon: Wallet, color: 'text-rose-600' }
            ].map(card => {
              const Icon = card.icon;
              return <div key={card.label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-center justify-between"><span className="text-xs font-bold text-slate-500">{card.label}</span><Icon className={`h-5 w-5 ${card.color}`} /></div><p className="mt-3 text-2xl font-black text-slate-900">{card.value}</p></div>;
            })}
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-black text-slate-900">Recent Stitching Activity</h2><p className="text-xs text-slate-500">Latest stitching assignments and progress</p></div><button onClick={() => navigateToStitchingSection('orders')} className="text-xs font-bold text-blue-700 hover:underline">View all orders</button></div>
            {renderOrderTable(stitchingOrders.slice(0, 8))}
          </div>
        </>
      )}

      {(view === 'orders' || view === 'ready') && (
        <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div><h2 className="font-black text-slate-900">{view === 'ready' ? 'Ready for Stitching' : 'All Stitching Orders'}</h2><p className="text-xs text-slate-500">{view === 'ready' ? 'Customer orders with cutting completed or received.' : 'Search and filter all stitching assignments.'}</p></div>
            {view === 'ready' && <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">{readyOrders.length} Ready Orders</span>}
          </div>
          {view === 'ready' && <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{readyOrders.map(order => <div key={order.id} className="flex items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50/60 p-3"><div className="min-w-0"><b className="text-sm text-slate-900">#{order.orderNo}</b><p className="truncate text-xs text-slate-600">{order.customerName} · {order.totalPairs} pairs</p></div><button onClick={() => openOrderModal(order.id)} className="shrink-0 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-700">Assign</button></div>)}{readyOrders.length === 0 && <p className="rounded-xl border border-dashed border-slate-300 p-5 text-center text-sm text-slate-500 sm:col-span-2 lg:col-span-3">No completed cutting orders are ready for stitching yet.</p>}</div>}
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-6">
            <label className="relative"><Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Order, article, stitcher..." className="w-full rounded-xl border border-slate-200 py-2 pl-9 pr-3 text-xs" /></label>
            <select value={statusFilter} onChange={event => setStatusFilter(event.target.value)} className="rounded-xl border border-slate-200 px-3 py-2 text-xs"><option value="all">All statuses</option>{['Pending', 'In Progress', 'Completed', 'Received', 'Returned', 'Cancelled', 'Customer Stock Created', 'Stock Received', 'Ready for Stitching', 'Packing'].map(status => <option key={status}>{status}</option>)}</select>
            <select value={stitcherFilter} onChange={event => setStitcherFilter(event.target.value)} className="rounded-xl border border-slate-200 px-3 py-2 text-xs"><option value="all">All stitchers</option>{stitchers.map(stitcher => <option key={stitcher.id} value={stitcher.id}>{stitcher.name}</option>)}</select>
            <input value={articleFilter} onChange={event => setArticleFilter(event.target.value)} placeholder="Article" className="rounded-xl border border-slate-200 px-3 py-2 text-xs" />
            <input type="date" value={fromDate} onChange={event => setFromDate(event.target.value)} className="rounded-xl border border-slate-200 px-3 py-2 text-xs" aria-label="From date" />
            <input type="date" value={toDate} onChange={event => setToDate(event.target.value)} className="rounded-xl border border-slate-200 px-3 py-2 text-xs" aria-label="To date" />
          </div>
          {renderOrderTable(view === 'ready'
            ? orderRows.filter(row => readyOrderIds.has(row.orderId))
            : orderRows)}
        </section>
      )}

      {view === 'khata' && (selectedStitcher ? (
        <div className="space-y-6">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <button onClick={() => navigateToStitchingSection('khata')} className="rounded-xl border border-slate-200 p-2.5 text-slate-700 transition hover:bg-slate-100" title="Back to Stitcher List"><ArrowLeft className="h-5 w-5" /></button>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="rounded-md bg-amber-100 px-2 py-0.5 text-xs font-bold uppercase text-amber-800">Stitching Ledger</span>
                    <span className="font-mono text-xs text-slate-500">ID: #{selectedStitcher.id.slice(-6)}</span>
                  </div>
                  <h2 className="mt-0.5 text-xl font-black text-slate-900 sm:text-2xl">Ledger - {selectedStitcher.name}</h2>
                  {selectedStitcher.phone && <p className="mt-0.5 text-xs text-slate-500">Phone: {selectedStitcher.phone}</p>}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button onClick={() => issueStitchingFor(selectedStitcher)} className="inline-flex items-center justify-center gap-2 rounded-xl bg-orange-500 px-4 py-2.5 text-xs font-bold text-white shadow-md shadow-orange-500/25 transition hover:bg-orange-600"><ArrowUpRight className="h-4 w-4" />Issue Stitching</button>
                <button onClick={() => openReceivingForm(selectedStitcher)} disabled={stitchingOrders.filter(order => order.stitcherId === selectedStitcher.id && order.status !== 'Cancelled' && (order.receivedQuantity || 0) + (order.lossQuantity || 0) < order.qty).length === 0} className="inline-flex items-center justify-center gap-2 rounded-xl bg-green-600 px-4 py-2.5 text-xs font-bold text-white shadow-sm transition hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"><ArrowDownLeft className="h-4 w-4" />Receive Stitching</button>
                <button onClick={() => openPayment(selectedStitcher)} className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-bold text-white shadow-sm transition hover:bg-blue-700"><Wallet className="h-4 w-4" />Cash Payment</button>
                <button onClick={() => document.getElementById('stitching-notebook-ledger')?.scrollIntoView({ behavior: 'smooth' })} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-700 shadow-sm transition hover:bg-slate-50"><BookOpen className="h-4 w-4" />Stitching Ledger</button>
              </div>
            </div>
            <div className="mt-6 grid grid-cols-1 gap-3.5 border-t border-slate-100 pt-5 sm:grid-cols-3">
              {[
                { label: 'TOTAL STITCHING ISSUED', value: selectedStitcherOrders.reduce((sum, order) => sum + order.qty, 0), note: `All batches given to ${selectedStitcher.name}`, style: 'amber' },
                { label: 'TOTAL STITCHING RECEIVED', value: selectedStitcherOrders.reduce((sum, order) => sum + (order.receivedQuantity || (order.status === 'Completed' || order.status === 'Received' ? order.qty : 0)), 0), note: 'Finished pairs returned to factory', style: 'emerald' },
                { label: 'PENDING BALANCE', value: Math.max(0, selectedStitcherOrders.reduce((sum, order) => sum + order.qty - (order.receivedQuantity || (order.status === 'Completed' || order.status === 'Received' ? order.qty : 0)) - (order.lossQuantity || 0), 0)), note: 'Pairs remaining with stitcher', style: 'blue' }
              ].map(card => (
                <div key={card.label} className={`rounded-xl border p-4 ${card.style === 'amber' ? 'border-amber-200 bg-amber-50/80' : card.style === 'emerald' ? 'border-emerald-200 bg-emerald-50/80' : 'border-blue-200 bg-blue-50/80'}`}>
                  <span className={`block text-[11px] font-bold uppercase tracking-wider ${card.style === 'amber' ? 'text-amber-800' : card.style === 'emerald' ? 'text-emerald-800' : 'text-blue-800'}`}>{card.label}</span>
                  <div className={`mt-1 font-mono text-2xl font-black ${card.style === 'amber' ? 'text-amber-700' : card.style === 'emerald' ? 'text-emerald-700' : 'text-blue-700'}`}>{card.value.toLocaleString()} <span className="text-xs font-normal text-slate-500">Pairs</span></div>
                  <p className="mt-1 text-[11px] text-slate-600">{card.note}</p>
                </div>
              ))}
            </div>
            <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 border-t border-slate-100 pt-4 text-xs">
              <span className="text-slate-500">Total Work Amount: <b className="text-slate-900">{formatCurrency(selectedStitcherOrders.reduce((sum, order) => sum + order.totalAmount, 0))}</b></span>
              <span className="text-slate-500">Net Advance Paid: <b className="text-emerald-700">{formatCurrency(stitcherKhataTransactions.filter(tx => tx.stitcherId === selectedStitcher.id).reduce((sum, tx) => sum + (tx.type === 'ADVANCE' ? tx.amount : tx.type === 'PAYMENT_RETURN' ? -tx.amount : 0), 0))}</b></span>
              <span className="text-slate-500">Current Baqaya: <b className="text-blue-700">{formatCurrency(ledgerRows.at(-1)?.balance || 0)}</b></span>
            </div>
          </section>

          <section id="stitching-notebook-ledger" className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="space-y-3 border-b border-slate-200 p-4 sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div><h3 className="text-base font-bold text-slate-900">Notebook Ledger &bull; {selectedStitcher.name}</h3><p className="text-xs text-slate-500">Stitching ledger with totals and running balances.</p></div>
                <div className="flex flex-wrap gap-2">
                  <button onClick={() => setIsDatePdfModalOpen(true)} className="rounded-lg bg-orange-500 px-3 py-2 text-xs font-bold text-white hover:bg-orange-600">Date-Range Ledger PDF</button>
                  <button onClick={printCustomerKhata} className="rounded-lg bg-sky-100 px-3 py-2 text-xs font-bold text-sky-800 hover:bg-sky-200">Customer Ledger PDF</button>
                  <button onClick={printKhata} className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-bold text-white hover:bg-blue-700">Full Ledger PDF</button>
                  <button onClick={exportKhata} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-700"><Download className="h-3.5 w-3.5" />Download Excel</button>
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <input type="search" value={ledgerSearch} onChange={event => setLedgerSearch(event.target.value)} placeholder="Search by customer name" className="w-full max-w-sm rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">{filteredLedgerRows.length} Entries</span>
              </div>
            </div>
            <div className="overflow-x-auto">
              {filteredLedgerRows.length === 0 ? (
                <div className="p-12 text-center text-slate-400"><BookOpen className="mx-auto mb-2 h-8 w-8 opacity-40" /><p className="text-xs">No entries in {selectedStitcher.name}'s notebook yet.</p><p className="mt-1 text-xs text-slate-500">Select "Issue Stitching" or "Record Payment" above to add the first record.</p></div>
              ) : (
                <table className="min-w-[1250px] w-full text-left text-xs">
                  <thead><tr className="border-b border-slate-200 bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-600"><th className="px-4 py-3">Date (Wasooli Date)</th><th className="px-4 py-3">Customer Name</th><th className="px-4 py-3">Article</th><th className="px-4 py-3">Size</th><th className="px-4 py-3 text-right">Pairs</th><th className="px-4 py-3">Average</th><th className="px-4 py-3 text-right">Rate (Rs.)</th><th className="px-4 py-3 text-right">Total Balance</th><th className="px-4 py-3 text-center">Action</th></tr></thead>
                  <tbody className="divide-y divide-slate-100 font-medium">
                    {filteredLedgerRows.map(row => (
                      <tr key={row.id} className="transition hover:bg-slate-50/70">
                        <td className="px-4 py-3.5 font-mono">{formatDate(row.date)}</td>
                        <td className="px-4 py-3.5">{row.customerName || '-'}</td>
                        <td className="px-4 py-3.5 font-bold text-slate-900">{row.article || '-'}</td>
                        <td className="px-4 py-3.5">{row.size}</td>
                        <td className="px-4 py-3.5 text-right font-mono">{row.issueQty || row.receiveQty || '-'}</td>
                        <td className="px-4 py-3.5">-</td>
                        <td className="px-4 py-3.5 text-right font-mono">{row.rate ? formatCurrency(row.rate) : '-'}</td>
                        <td className="px-4 py-3.5 text-right font-mono font-bold text-slate-900">{formatCurrency(row.type === 'issue' ? row.issueQty * row.rate : row.debit || row.credit)}</td>
                        <td className="px-4 py-3.5 text-center">
                          {(() => {
                            const historyEntry = stitchingHistory.find(entry => entry.id === row.id);
                            const payment = stitcherKhataTransactions.find(tx => tx.id === row.id && tx.type !== 'WORK');
                            const linkedOrderId = historyEntry?.stitchingOrderId || payment?.stitchingOrderId;
                            const linkedOrder = linkedOrderId ? stitchingOrders.find(order => order.id === linkedOrderId) : undefined;
                            const canEdit = historyEntry?.type !== 'STATUS' && (Boolean(historyEntry) || Boolean(payment));
                            return <div className="flex items-center justify-center gap-1.5">
                              {canEdit && <button type="button" onClick={() => openLedgerRowEditor(row)} className="rounded p-1.5 text-slate-400 transition hover:text-blue-600" title="Edit ledger entry"><Pencil className="h-4 w-4" /></button>}
                              {canEdit && <button type="button" onClick={() => setDeletingLedgerRow(row)} className="rounded p-1.5 text-slate-400 transition hover:text-rose-600" title="Delete ledger entry"><Trash2 className="h-4 w-4" /></button>}
                              {linkedOrder && <select aria-label={`Change stitching status for ${linkedOrder.orderNo}`} value={linkedOrder.status} onChange={event => void updateStatus(linkedOrder.id, event.target.value as StitchingOrderStatus)} className="max-w-[150px] rounded border border-slate-200 bg-white px-1.5 py-1 text-[10px] font-bold text-slate-700"><option>Pending</option><option>In Progress</option><option>Completed</option><option>Received</option><option>Returned</option><option>Cancelled</option><option>Customer Stock Created</option><option>Stock Received</option><option>Ready for Stitching</option><option>Packing</option></select>}
                              {row.type === 'status' && !linkedOrder && <span className="text-[10px] text-slate-400">Audit</span>}
                            </div>;
                          })()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot><tr className="border-t-2 border-slate-200 bg-slate-50 text-xs font-black text-slate-900"><td className="px-4 py-3" colSpan={4}>TOTAL</td><td className="px-4 py-3 text-right font-mono">{filteredLedgerRows.reduce((sum, row) => sum + row.issueQty, 0).toLocaleString()}</td><td></td><td></td><td className="px-4 py-3 text-right font-mono">{formatCurrency(filteredLedgerRows.reduce((sum, row) => sum + (row.type === 'issue' ? row.issueQty * row.rate : 0), 0))}</td><td></td></tr></tfoot>
                </table>
              )}
            </div>
          </section>
        </div>
      ) : (
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="space-y-4 border-b border-slate-200 p-4 sm:p-5">
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
              <div><h2 className="flex items-center gap-2 text-lg font-black text-slate-900"><UserRound className="h-5 w-5 text-amber-500" />Factory Stitchers Roster</h2><p className="text-xs text-slate-500">In-house glove stitching operators. Select a name to open the individual stitching ledger.</p></div>
              <button onClick={() => openStitcherEditor()} className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-orange-500 px-4 py-2.5 text-xs font-bold text-white shadow-md shadow-orange-500/25 transition hover:bg-orange-600"><Plus className="h-4 w-4" />Add Stitcher</button>
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input value={stitcherSearch} onChange={event => setStitcherSearch(event.target.value)} placeholder="Search Stitcher by name or phone..." className="w-full rounded-xl border border-slate-300 bg-white py-2 pl-9 pr-3 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20" />
            </div>
            <div className="flex flex-wrap gap-2">
              {(['all', 'active', 'inactive'] as const).map(filter => {
                const count = stitchers.filter(person =>
                  belongsToStitcherCategory(person, stitcherCategory) &&
                  (filter === 'all' || (filter === 'active' ? person.isActive !== false : person.isActive === false))
                ).length;
                const label = filter === 'all' ? 'All Stitchers' : filter === 'active' ? 'Active' : 'Inactive';
                return <button key={filter} type="button" onClick={() => setStitcherStatusFilter(filter)} className={`rounded-full px-3 py-1.5 text-xs font-bold ${stitcherStatusFilter === filter ? filter === 'inactive' ? 'bg-rose-600 text-white' : 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600'}`}>{label} ({count})</button>;
              })}
            </div>
          </div>
          <div className="overflow-x-auto">
            {filteredStitchers.length === 0 ? (
              <div className="p-12 text-center text-slate-400"><UserRound className="mx-auto mb-2 h-10 w-10 opacity-30" /><p className="text-sm font-semibold">{stitcherSearch ? 'No matching stitchers found' : 'No stitchers have been added yet'}</p><p className="mt-1 text-xs">Click "+ Add Stitcher" above to create a profile.</p></div>
            ) : (
              <div className="divide-y divide-slate-100">
                {filteredStitchers.map((stitcher, index) => {
                  const personOrders = stitchingOrders.filter(order => order.stitcherId === stitcher.id);
                  const issuedPairs = personOrders.reduce((sum, order) => sum + order.qty, 0);
                  const receivedPairs = personOrders.reduce((sum, order) => sum + (order.receivedQuantity || (order.status === 'Completed' || order.status === 'Received' ? order.qty : 0)), 0);
                  const pendingPairs = Math.max(0, issuedPairs - receivedPairs);
                  const lastWork = stitchingHistory.filter(entry => entry.stitcherId === stitcher.id).sort((a, b) => b.date.localeCompare(a.date))[0]?.date;
                  const isActive = stitcher.isActive !== false;
                  return <div key={stitcher.id} onClick={() => handleNameClick(stitcher)} className={`group flex cursor-pointer items-center justify-between gap-4 p-4 transition sm:px-6 ${isActive ? 'hover:bg-amber-50/50' : 'bg-slate-100 opacity-70'}`}>
                    <div className="flex min-w-0 items-center gap-3 sm:gap-4">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-slate-100 font-mono text-sm font-black text-slate-700 transition-colors group-hover:bg-amber-500 group-hover:text-white sm:h-10 sm:w-10">{index + 1}</div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h4 className="text-sm font-black text-slate-900 transition group-hover:text-amber-700 sm:text-base">{stitcher.name}</h4>
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>{isActive ? '● Active' : '● Inactive'}</span>
                          {pendingPairs > 0 ? <span className="rounded-full border border-amber-200 bg-amber-100 px-2 py-0.5 text-[10px] font-black text-amber-800">Pending: {pendingPairs} Pairs</span> : <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">Balanced</span>}
                          <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-700">{stitcher.name} Ledger</span>
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                          <span className="text-[11px]">Rate: Rs.{stitcher.perPairRate || 0}/Pair</span>
                          {stitcher.phone ? <span className="flex items-center gap-1 font-mono text-[11px]"><Phone className="h-3 w-3 text-slate-400" />{stitcher.phone}</span> : <span className="text-[11px] text-slate-400">No phone</span>}
                          <span className="text-slate-300">&bull;</span><span className="text-[11px]">Last Work: <span className="font-semibold text-slate-700">{lastWork ? formatDate(lastWork) : 'Recently'}</span></span>
                        </div>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2 text-right" onClick={event => event.stopPropagation()}>
                      <div className="hidden sm:block"><span className="block text-[10px] font-bold uppercase text-slate-400">Pending Balance</span><span className="font-mono text-base font-black text-amber-700">{pendingPairs} <span className="text-xs font-normal text-slate-500">Pairs</span></span></div>
                      <button type="button" onClick={() => void toggleStitcherActive(stitcher)} className={`rounded-full px-3 py-2 text-xs font-bold ${isActive ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white'}`}>{isActive ? 'Active' : 'Inactive'}</button>
                      <button type="button" onClick={() => openStitcherEditor(stitcher)} className="rounded p-2 text-slate-500 hover:text-blue-600" title="Edit stitcher"><Pencil className="h-4 w-4" /></button>
                      <button type="button" onClick={() => setDeleteStitcherTarget(stitcher)} className="rounded p-2 text-slate-500 hover:text-rose-600" title="Delete stitcher"><Trash2 className="h-4 w-4" /></button>
                    </div>
                  </div>;
                })}
              </div>
            )}
          </div>
        </section>
      ))}

      {isOrderModalOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/60 p-3 sm:p-5">
          <form onSubmit={handleCreateOrder} className="max-h-[92vh] w-full max-w-2xl space-y-4 overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl sm:p-6">
            <div className="flex items-start justify-between"><div><h2 className="text-lg font-black text-slate-900">{selectedStitcherForActions && form.stitcherId === selectedStitcherForActions.id ? 'Issue Stitching' : 'Add New Stitching Order'}</h2><p className="text-xs text-slate-500">Assign work from a customer order and record the stitcher's khata.</p></div><button type="button" onClick={() => setIsOrderModalOpen(false)} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"><X className="h-5 w-5" /></button></div>
            <label className="block text-xs font-bold text-slate-700">Job Card / Customer Order *<select required value={form.orderId} onChange={event => { const order = orders.find(item => item.id === event.target.value); const item = order?.items[0]; setForm(current => ({ ...current, orderId: event.target.value, orderItemId: item?.id || '', qty: String(item?.totalPairs || item?.qty || ''), small: String(item?.sizes?.small || 0), medium: String(item?.sizes?.medium || 0), large: String(item?.sizes?.large || 0), xl: String(item?.sizes?.xl || 0), dueDate: order?.deliveryDate || current.dueDate })); }} className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm">{orders.length === 0 && <option value="">No customer orders</option>}{orders.map(order => <option key={order.id} value={order.id}>#{order.orderNo} · {order.customerName}</option>)}</select></label>
            {selectedCustomerOrder && <label className="block text-xs font-bold text-slate-700">Article No / Style No *<select required value={form.orderItemId} onChange={event => { const item = selectedCustomerOrder.items.find(entry => entry.id === event.target.value); setForm(current => ({ ...current, orderItemId: event.target.value, qty: String(item?.totalPairs || item?.qty || ''), small: String(item?.sizes?.small || 0), medium: String(item?.sizes?.medium || 0), large: String(item?.sizes?.large || 0), xl: String(item?.sizes?.xl || 0) })); }} className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm">{selectedCustomerOrder.items.map(item => <option key={item.id} value={item.id}>{item.title || item.gloveType}</option>)}</select></label>}
            <div className="grid gap-3 sm:grid-cols-[1fr_auto]"><label className="block text-xs font-bold text-slate-700">Stitcher *<select required value={form.stitcherId} onChange={event => { const worker = stitchers.find(item => item.id === event.target.value); setForm(current => ({ ...current, stitcherId: event.target.value, rate: String(worker?.perPairRate || current.rate) })); }} className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm"><option value="">Select stitcher</option>{stitchers.filter(worker => worker.isActive).map(worker => <option key={worker.id} value={worker.id}>{worker.name}{worker.phone ? ` · ${worker.phone}` : ''}</option>)}</select></label><button type="button" onClick={() => openStitcherEditor()} className="self-end rounded-xl border border-blue-200 bg-blue-50 px-3 py-2.5 text-xs font-bold text-blue-700 hover:bg-blue-100"><Plus className="mr-1 inline h-4 w-4" />Add New Stitcher</button></div>
            {form.stitcherId && <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">Stitcher ID: <b>{form.stitcherId}</b><span className="mx-2 text-slate-300">|</span>Phone Number: <b>{stitchers.find(worker => worker.id === form.stitcherId)?.phone || 'Not provided'}</b></p>}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{(['small', 'medium', 'large', 'xl'] as const).map((size, index) => <label key={size} className="text-xs font-bold text-slate-700">{['S', 'M', 'L', 'XL'][index]} Quantity<input min="0" type="number" value={form[size]} onChange={event => { const next = { ...form, [size]: event.target.value }; setForm({ ...next, qty: String(numberValue(next.small) + numberValue(next.medium) + numberValue(next.large) + numberValue(next.xl)) }); }} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2" /></label>)}</div>
            <div className="grid gap-3 sm:grid-cols-2"><label className="text-xs font-bold text-slate-700">Quantity *<input required min="1" type="number" value={form.qty} onChange={event => setForm({ ...form, qty: event.target.value })} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2" /></label><label className="text-xs font-bold text-slate-700">Rate Per Piece *<input required min="0" type="number" step="0.01" value={form.rate} onChange={event => setForm({ ...form, rate: event.target.value })} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2" /></label><label className="text-xs font-bold text-slate-700">Issue Date *<input required type="date" value={form.issueDate} onChange={event => setForm({ ...form, issueDate: event.target.value })} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2" /></label><label className="text-xs font-bold text-slate-700">Due Date<input type="date" value={form.dueDate} onChange={event => setForm({ ...form, dueDate: event.target.value })} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2" /></label><label className="text-xs font-bold text-slate-700">Advance Paid<input min="0" type="number" step="0.01" value={form.advancePaid} onChange={event => setForm({ ...form, advancePaid: event.target.value })} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2" /></label><label className="text-xs font-bold text-slate-700">Status<select value={form.status} onChange={event => setForm({ ...form, status: event.target.value as StitchingOrderStatus })} className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2"><option>Pending</option><option>In Progress</option><option>Completed</option><option>Received</option><option>Returned</option><option>Cancelled</option></select></label></div>
            <div className="rounded-xl bg-blue-50 p-3 text-sm"><span className="font-semibold text-blue-800">Total Amount: </span><b className="text-blue-950">{formatCurrency(numberValue(form.qty) * numberValue(form.rate))}</b><span className="ml-4 font-semibold text-amber-800">Remaining: </span><b>{formatCurrency(Math.max(0, numberValue(form.qty) * numberValue(form.rate) - numberValue(form.advancePaid)))}</b></div>
            <label className="block text-xs font-bold text-slate-700">Remarks / Notes<textarea value={form.remarks} onChange={event => setForm({ ...form, remarks: event.target.value })} rows={2} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2" /></label>
            <div className="flex justify-end gap-2"><button type="button" onClick={() => setIsOrderModalOpen(false)} className="rounded-xl px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-100">Cancel</button><button disabled={saving || !selectedItem} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-60">{saving ? 'Saving...' : selectedStitcherForActions && form.stitcherId === selectedStitcherForActions.id ? 'Issue Stitching' : 'Create Stitching Order'}</button></div>
          </form>
        </div>
      )}

      {isStitcherModalOpen && <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/60 p-4"><form onSubmit={handleAddStitcher} className="w-full max-w-md space-y-3 rounded-2xl bg-white p-5 shadow-2xl"><div className="flex justify-between"><h3 className="font-black">{editingStitcher ? 'Edit Stitcher' : 'Add New Stitcher'}</h3><button type="button" onClick={() => { setIsStitcherModalOpen(false); setEditingStitcher(null); }}><X className="h-5 w-5" /></button></div><label className="block text-xs font-bold">Stitcher Name *<input required value={stitcherForm.name} onChange={event => setStitcherForm({ ...stitcherForm, name: event.target.value })} className="mt-1 w-full rounded-lg border p-2.5" /></label><label className="block text-xs font-bold">Category<select value={stitcherForm.stitcherType} onChange={event => setStitcherForm({ ...stitcherForm, stitcherType: event.target.value as StitcherCategory })} className="mt-1 w-full rounded-lg border bg-white p-2.5"><option value="factory_worker">Stitching Man</option><option value="stitching_maker">Stitching Maker / Outside Contractors</option><option value="product">Product / Purchase</option></select></label><label className="block text-xs font-bold">Phone Number<input value={stitcherForm.phone} onChange={event => setStitcherForm({ ...stitcherForm, phone: event.target.value })} className="mt-1 w-full rounded-lg border p-2.5" /></label><label className="block text-xs font-bold">City<input value={stitcherForm.city} onChange={event => setStitcherForm({ ...stitcherForm, city: event.target.value })} className="mt-1 w-full rounded-lg border p-2.5" /></label><label className="block text-xs font-bold">Rate Per Piece<input min="0" type="number" step="0.01" value={stitcherForm.perPairRate} onChange={event => setStitcherForm({ ...stitcherForm, perPairRate: event.target.value })} className="mt-1 w-full rounded-lg border p-2.5" /></label><label className="flex items-center gap-2 text-xs font-bold text-slate-700"><input type="checkbox" checked={stitcherForm.isActive} onChange={event => setStitcherForm({ ...stitcherForm, isActive: event.target.checked })} className="h-4 w-4 rounded border-slate-300" />Active stitcher</label><div className="flex justify-end gap-2"><button type="button" onClick={() => { setIsStitcherModalOpen(false); setEditingStitcher(null); }} className="rounded-lg px-3 py-2 text-sm font-bold text-slate-600">Cancel</button><button disabled={saving} className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-bold text-white disabled:opacity-50">{saving ? 'Saving...' : editingStitcher ? 'Update Stitcher' : 'Save Stitcher'}</button></div></form></div>}

      {isDatePdfModalOpen && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50 p-4">
          <form onSubmit={event => { event.preventDefault(); printDateRangeKhata(); }} className="w-full max-w-md space-y-4 rounded-xl bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between"><h3 className="text-lg font-bold text-slate-900">Date-Range Ledger PDF</h3><button type="button" onClick={() => setIsDatePdfModalOpen(false)} aria-label="Close date range form"><X className="h-5 w-5 text-slate-500" /></button></div>
            <label className="block text-xs font-bold text-slate-700">From Date<input required type="date" value={pdfFromDate} onChange={event => setPdfFromDate(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 p-2.5" /></label>
            <label className="block text-xs font-bold text-slate-700">To Date<input required type="date" min={pdfFromDate || undefined} value={pdfToDate} onChange={event => setPdfToDate(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 p-2.5" /></label>
            <div className="flex justify-end gap-2"><button type="button" onClick={() => setIsDatePdfModalOpen(false)} className="rounded-lg px-4 py-2 text-sm font-bold text-slate-600">Cancel</button><button className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-bold text-white hover:bg-orange-600">Generate PDF</button></div>
          </form>
        </div>
      )}

      {editingLedgerRow && (
        <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/50 p-4">
          <form onSubmit={handleSaveLedgerEdit} className="max-h-[90vh] w-full max-w-lg space-y-4 overflow-y-auto rounded-xl bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between">
              <div><h3 className="text-lg font-bold text-slate-900">Edit Notebook Ledger Entry</h3><p className="text-xs text-slate-500">{editingLedgerRow.description}</p></div>
              <button type="button" onClick={() => setEditingLedgerRow(null)} aria-label="Close edit form"><X className="h-5 w-5 text-slate-500" /></button>
            </div>
            {stitchingHistory.some(entry => entry.id === editingLedgerRow.id) ? (
              <>
                <label className="block text-xs font-bold text-slate-700">Date<input required type="date" value={ledgerEditForm.date} onChange={event => setLedgerEditForm(current => ({ ...current, date: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-300 p-2.5" /></label>
                <label className="block text-xs font-bold text-slate-700">Article<input required value={ledgerEditForm.article} onChange={event => setLedgerEditForm(current => ({ ...current, article: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-300 p-2.5" /></label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block text-xs font-bold text-slate-700">Pairs<input required min="1" type="number" value={ledgerEditForm.quantity} onChange={event => setLedgerEditForm(current => ({ ...current, quantity: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-300 p-2.5" /></label>
                  <label className="block text-xs font-bold text-slate-700">Rate (Rs.)<input required min="0" step="0.01" type="number" value={ledgerEditForm.rate} onChange={event => setLedgerEditForm(current => ({ ...current, rate: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-300 p-2.5" /></label>
                </div>
                <label className="block text-xs font-bold text-slate-700">Remarks<textarea rows={2} value={ledgerEditForm.remarks} onChange={event => setLedgerEditForm(current => ({ ...current, remarks: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-300 p-2.5" /></label>
                <p className="rounded-lg bg-amber-50 p-2.5 text-xs text-amber-800">Changing issued or received pairs also updates the linked stitching order and its balance.</p>
              </>
            ) : (
              <>
                <label className="block text-xs font-bold text-slate-700">Entry Type<select value={ledgerEditForm.paymentType} onChange={event => setLedgerEditForm(current => ({ ...current, paymentType: event.target.value as 'ADVANCE' | 'PAYMENT_RETURN' }))} className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2.5"><option value="ADVANCE">Cash Payment / Advance</option><option value="PAYMENT_RETURN">Payment Return</option></select></label>
                <label className="block text-xs font-bold text-slate-700">Date<input required type="date" value={ledgerEditForm.date} onChange={event => setLedgerEditForm(current => ({ ...current, date: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-300 p-2.5" /></label>
                <label className="block text-xs font-bold text-slate-700">Amount (Rs.)<input required min="0.01" step="0.01" type="number" value={ledgerEditForm.amount} onChange={event => setLedgerEditForm(current => ({ ...current, amount: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-300 p-2.5" /></label>
                <label className="block text-xs font-bold text-slate-700">Description<input value={ledgerEditForm.description} onChange={event => setLedgerEditForm(current => ({ ...current, description: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-300 p-2.5" /></label>
                <p className="rounded-lg bg-amber-50 p-2.5 text-xs text-amber-800">Changing a linked payment type or amount also recalculates the order advance and remaining balance.</p>
              </>
            )}
            <div className="flex justify-end gap-2"><button type="button" onClick={() => setEditingLedgerRow(null)} className="rounded-lg px-4 py-2 text-sm font-bold text-slate-600">Cancel</button><button disabled={saving} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{saving ? 'Saving...' : 'Save Changes'}</button></div>
          </form>
        </div>
      )}

      {deletingLedgerRow && (
        <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-bold text-slate-900">Delete Ledger Entry?</h3>
            <p className="mt-2 text-sm text-slate-600">This action cannot be undone. Removing a stitching issue also removes its linked order and khata entries. A received entry cannot be deleted until the issue is reconciled.</p>
            <div className="mt-5 flex justify-end gap-2"><button type="button" disabled={saving} onClick={() => setDeletingLedgerRow(null)} className="rounded-lg px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-100">Cancel</button><button type="button" disabled={saving} onClick={() => void handleDeleteLedgerRow()} className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{saving ? 'Deleting...' : 'Delete Entry'}</button></div>
          </div>
        </div>
      )}

      {showStitcherModal && selectedStitcherForActions && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50 p-4" onClick={() => setShowStitcherModal(false)}>
          <div className="w-full max-w-[400px] rounded-xl bg-white p-6 shadow-xl" onClick={event => event.stopPropagation()}>
            <div className="mb-5">
              <h3 className="text-lg font-bold text-slate-900">{selectedStitcherForActions.name}</h3>
              <p className="mt-1 text-sm text-gray-500">{selectedStitcherForActions.phone || 'No phone'} | {selectedStitcherForActions.city || 'No city'}</p>
            </div>
            <div className="flex flex-col gap-3">
              <button type="button" onClick={() => startIssueStitching(selectedStitcherForActions)} className="w-full rounded-lg bg-blue-600 p-3 text-left font-bold text-white hover:bg-blue-700">1. Issue Stitching</button>
              <button type="button" onClick={() => openReceivingForm(selectedStitcherForActions)} disabled={stitcherOrdersForReceiving.length === 0} className="w-full rounded-lg bg-green-600 p-3 text-left font-bold text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50">2. Receive Stitching</button>
              <button type="button" onClick={() => openStitcherKhata(selectedStitcherForActions)} className="w-full rounded-lg bg-gray-800 p-3 text-left font-bold text-white hover:bg-gray-900">3. Khata / Ledger</button>
            </div>
            <button type="button" onClick={() => setShowStitcherModal(false)} className="mt-4 w-full rounded-lg border border-gray-200 p-2.5 text-sm font-semibold text-gray-600 hover:bg-gray-50">Close</button>
          </div>
        </div>
      )}

      {isReceiveModalOpen && selectedStitcherForActions && (
        <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/50 p-4">
          <form onSubmit={handleReceiveStitching} className="w-full max-w-lg space-y-4 rounded-xl bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between">
              <div><h3 className="text-lg font-bold text-slate-900">Receive Stitching</h3><p className="text-sm text-gray-500">{selectedStitcherForActions.name}</p></div>
              <button type="button" onClick={() => setIsReceiveModalOpen(false)} aria-label="Close receiving form"><X className="h-5 w-5 text-slate-500" /></button>
            </div>
            <label className="block text-xs font-bold text-slate-700">Stitching Order *<select required value={receiveForm.stitchingOrderId} onChange={event => { const order = stitcherOrdersForReceiving.find(item => item.id === event.target.value); setReceiveForm(current => ({ ...current, stitchingOrderId: event.target.value, receivedQuantity: String(Math.max(0, (order?.qty || 0) - (order?.receivedQuantity || 0) - (order?.lossQuantity || 0))) })); }} className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2.5">{stitcherOrdersForReceiving.map(order => <option key={order.id} value={order.id}>#{order.orderNo} · {order.article} · Issued {order.qty}</option>)}</select></label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-xs font-bold text-slate-700">Receiving Date *<input required type="date" value={receiveForm.date} onChange={event => setReceiveForm({ ...receiveForm, date: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 p-2.5" /></label>
              <label className="text-xs font-bold text-slate-700">Received Quantity *<input required min="0" type="number" value={receiveForm.receivedQuantity} onChange={event => setReceiveForm({ ...receiveForm, receivedQuantity: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 p-2.5" /></label>
              <label className="text-xs font-bold text-slate-700">Loss Quantity<input required min="0" type="number" value={receiveForm.lossQuantity} onChange={event => setReceiveForm({ ...receiveForm, lossQuantity: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 p-2.5" /></label>
              {receivingOrder && <div className="self-end rounded-lg bg-slate-50 p-2.5 text-xs text-slate-600">Issued: <b>{receivingOrder.qty}</b> · Previously received: <b>{receivingOrder.receivedQuantity || 0}</b></div>}
            </div>
            <label className="block text-xs font-bold text-slate-700">Remarks<textarea rows={2} value={receiveForm.remarks} onChange={event => setReceiveForm({ ...receiveForm, remarks: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 p-2.5" /></label>
            <div className="flex justify-end gap-2"><button type="button" onClick={() => setIsReceiveModalOpen(false)} className="rounded-lg px-4 py-2 text-sm font-bold text-slate-600">Cancel</button><button disabled={saving || !receivingOrder} className="rounded-lg bg-green-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{saving ? 'Saving...' : 'Save Receipt'}</button></div>
          </form>
        </div>
      )}

      {deleteStitcherTarget && (
        <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-bold text-slate-900">Delete Stitcher?</h3>
            <p className="mt-2 text-sm text-slate-600">Are you sure you want to delete {deleteStitcherTarget.name}? Existing stitching orders and khata history will be retained.</p>
            <div className="mt-5 flex justify-end gap-2"><button type="button" disabled={saving} onClick={() => setDeleteStitcherTarget(null)} className="rounded-lg px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-100">Cancel</button><button type="button" disabled={saving} onClick={() => void handleDeleteStitcher()} className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{saving ? 'Deleting...' : 'Delete Stitcher'}</button></div>
          </div>
        </div>
      )}

      {isPaymentModalOpen && selectedStitcher && <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/60 p-4"><form onSubmit={handleSavePayment} className="w-full max-w-md space-y-3 rounded-2xl bg-white p-5 shadow-2xl"><div className="flex justify-between"><div><h3 className="font-black">Stitcher Payment Entry</h3><p className="text-xs text-slate-500">{selectedStitcher.name}</p></div><button type="button" onClick={() => setIsPaymentModalOpen(false)}><X className="h-5 w-5" /></button></div><label className="block text-xs font-bold">Entry Type<select value={paymentForm.type} onChange={event => setPaymentForm({ ...paymentForm, type: event.target.value as 'ADVANCE' | 'PAYMENT_RETURN' })} className="mt-1 w-full rounded-lg border bg-white p-2.5"><option value="ADVANCE">Advance Dena / Jama (Paid to stitcher)</option><option value="PAYMENT_RETURN">Payment Return (Received from stitcher)</option></select></label><label className="block text-xs font-bold">Link Stitching Order (optional)<select value={paymentForm.stitchingOrderId} onChange={event => setPaymentForm({ ...paymentForm, stitchingOrderId: event.target.value })} className="mt-1 w-full rounded-lg border bg-white p-2.5"><option value="">No linked order</option>{selectedStitcherOrders.map(order => <option key={order.id} value={order.id}>#{order.orderNo} · {order.article}</option>)}</select></label><label className="block text-xs font-bold">Date<input required type="date" value={paymentForm.date} onChange={event => setPaymentForm({ ...paymentForm, date: event.target.value })} className="mt-1 w-full rounded-lg border p-2.5" /></label><label className="block text-xs font-bold">Amount<input required min="0.01" type="number" step="0.01" value={paymentForm.amount} onChange={event => setPaymentForm({ ...paymentForm, amount: event.target.value })} className="mt-1 w-full rounded-lg border p-2.5" /></label><label className="block text-xs font-bold">Description<input value={paymentForm.description} onChange={event => setPaymentForm({ ...paymentForm, description: event.target.value })} className="mt-1 w-full rounded-lg border p-2.5" placeholder="Payment note" /></label><div className="flex justify-end gap-2"><button type="button" onClick={() => setIsPaymentModalOpen(false)} className="rounded-lg px-3 py-2 text-sm font-bold text-slate-600">Cancel</button><button disabled={saving} className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-bold text-white disabled:opacity-50">{saving ? 'Saving...' : 'Save Entry'}</button></div></form></div>}
    </div>
  );
};
