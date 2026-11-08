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
  Truck,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  Layers,
  PackageCheck,
  Check
} from 'lucide-react';
import { useFactory } from '../../context/FactoryContext';
import { DistinctArticleStock, StockInHistoryItem, StockOutHistoryItem } from '../../types/factory';
import { formatCurrency, formatDate, safeStringCompare } from '../../utils/factoryFormatters';
import { 
  db, 
  collection, 
  doc, 
  setDoc, 
  updateDoc, 
  increment, 
  arrayUnion 
} from '../../firebase';

export const StockManagement: React.FC = () => {
  const { 
    orders = [],
    stockManagement = [],
    deliveryHistory = [],
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

  // Bulk Delivery modal state (New Delivery / Deliver Stock button)
  const [isBulkDeliveryOpen, setIsBulkDeliveryOpen] = useState(false);
  const [bulkBillNo, setBulkBillNo] = useState('Bill No. 19');
  const [bulkDeliveryDate, setBulkDeliveryDate] = useState(new Date().toISOString().split('T')[0]);
  const [bulkReferenceNo, setBulkReferenceNo] = useState('');
  const [bulkCustomerType, setBulkCustomerType] = useState<'existing' | 'new'>('existing');
  const [bulkSelectedOrderId, setBulkSelectedOrderId] = useState('');
  const [bulkCustomerName, setBulkCustomerName] = useState('');
  const [deliveredItems, setDeliveredItems] = useState<Array<{
    id: string;
    articleName: string;
    size: string;
    availableStock: number;
    qty: number;
    rate: number;
    detail: string;
    amount: number;
  }>>([]);
  const [bulkArticleRows, setBulkArticleRows] = useState<Array<{
    articleName: string;
    availableStock: number;
    size: string;
    selected: boolean;
    deliverQty: string;
  }>>([]);
  const [isSavingBulkDelivery, setIsSavingBulkDelivery] = useState(false);

  // "Add Items" modal state inside Deliver Stock
  const [isDeliverItemPickerOpen, setIsDeliverItemPickerOpen] = useState(false);
  const [pickerSearch, setPickerSearch] = useState('');
  const [pickerNewItemOpen, setPickerNewItemOpen] = useState(false);
  const [pickerNewItemName, setPickerNewItemName] = useState('');
  const [pickerNewItemSize, setPickerNewItemSize] = useState('Standard');
  const [pickerNewItemStock, setPickerNewItemStock] = useState('1000');
  const [pickerArticleRows, setPickerArticleRows] = useState<Array<{
    articleName: string;
    size: string;
    availableStock: number;
    selected: boolean;
    qty: string;
    rate: string;
    detail: string;
  }>>([]);

  // Add Item / New Stock Entry modal state (+ Add Item / + New Stock Entry button)
  const [isAddItemModalOpen, setIsAddItemModalOpen] = useState(false);
  const [addItemDate, setAddItemDate] = useState(new Date().toISOString().split('T')[0]);
  const [addItemSource, setAddItemSource] = useState('Factory Workshop / Direct Stock');
  const [addItemBillNo, setAddItemBillNo] = useState('');
  const [addItemSearch, setAddItemSearch] = useState('');
  const [isAddingNewCustomArticle, setIsAddingNewCustomArticle] = useState(false);
  const [newCustomArticleInput, setNewCustomArticleInput] = useState('');
  const [addItemEntries, setAddItemEntries] = useState<Array<{
    articleName: string;
    size: string;
    qty: string;
    rate: string;
    selected: boolean;
  }>>([]);
  const [isSavingAddItem, setIsSavingAddItem] = useState(false);

  // Transfer to Order modal state (from Transaction History)
  const [transferTargetRow, setTransferTargetRow] = useState<any | null>(null);
  const [transferOrderId, setTransferOrderId] = useState('');
  const [transferQty, setTransferQty] = useState('');
  const [transferDate, setTransferDate] = useState(new Date().toISOString().split('T')[0]);
  const [transferNote, setTransferNote] = useState('');
  const [isSavingTransfer, setIsSavingTransfer] = useState(false);

  // Expanded deliveries in Stock OUT Report
  const [expandedDeliveries, setExpandedDeliveries] = useState<Set<string>>(new Set());

  // Edit return / wapsi state
  const [editingReturnItem, setEditingReturnItem] = useState<{ id: string; date: string; qty: number; remarks: string; rate?: number } | null>(null);
  const [editReturnDate, setEditReturnDate] = useState('');
  const [editReturnQty, setEditReturnQty] = useState('');
  const [editReturnRemarks, setEditReturnRemarks] = useState('');
  const [isSavingReturnEdit, setIsSavingReturnEdit] = useState(false);

  // Global ESC key listener to dismiss any active modal and prevent screen freeze
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isDeliverItemPickerOpen) setIsDeliverItemPickerOpen(false);
        else if (isBulkDeliveryOpen) setIsBulkDeliveryOpen(false);
        else if (isAddItemModalOpen) setIsAddItemModalOpen(false);
        else if (transferTargetRow) setTransferTargetRow(null);
        else if (deliverTarget) setDeliverTarget(null);
        else if (isAllocateModalOpen) setIsAllocateModalOpen(false);
        else if (isInModalOpen) setIsInModalOpen(false);
        else if (isOutModalOpen) setIsOutModalOpen(false);
        else if (isWapsiModalOpen) setIsWapsiModalOpen(false);
        else if (editingInItem) setEditingInItem(null);
        else if (editingOutItem) setEditingOutItem(null);
        else if (editingReturnItem) setEditingReturnItem(null);
        else if (deletingItem) setDeletingItem(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    isDeliverItemPickerOpen,
    isBulkDeliveryOpen,
    isAddItemModalOpen,
    transferTargetRow,
    deliverTarget,
    isAllocateModalOpen,
    isInModalOpen,
    isOutModalOpen,
    isWapsiModalOpen,
    editingInItem,
    editingOutItem,
    editingReturnItem,
    deletingItem
  ]);

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
      transferDate?: string;
      formattedDateTime: string;
      source: string;
      orderLink: string;
      qtyIn?: number;
      qtyOut?: number;
      type: 'IN' | 'OUT' | 'RETURN';
      billNo?: string;
      canTransfer?: boolean;
      raw: any;
    }> = [];

    // 1. IN / Receipts
    selectedArticleInHistory.forEach(item => {
      const raw = item.rawEntry as Record<string, any> | undefined;
      const isReturn = raw?.type === 'RETURN' || Number(item.quantity) < 0;
      const transferDate = raw?.transferDate || '';
      const orderLink = raw?.orderNo 
        ? `Against Order: ${raw.customerName ? `${raw.customerName} ` : ''}(${raw.orderNo})`
        : (raw?.customerOrder ? `Against Order: ${raw.customerOrder}` : 'Direct Cutting / Stock');
      const isUnlinked = !raw?.orderId && (!raw?.orderNo || raw?.orderNo === '') && (!raw?.customerOrder || raw?.customerOrder.toLowerCase().includes('direct') || raw?.customerOrder.toLowerCase().includes('stock'));
      const canTransfer = !isReturn && isUnlinked;

      list.push({
        id: item.id,
        date: item.date,
        transferDate,
        formattedDateTime: item.formattedDateTime || `${formatDate(item.date)} ${item.time || ''}`.trim(),
        source: item.source || 'From Cutting Master',
        orderLink,
        qtyIn: isReturn ? undefined : item.quantity,
        qtyOut: isReturn ? Math.abs(item.quantity) : undefined,
        type: isReturn ? 'RETURN' : 'IN',
        billNo: item.billNo || (raw?.billNo ? `Bill ${raw.billNo}` : '—'),
        canTransfer,
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
        transferDate: raw?.transferDate || '',
        formattedDateTime: formatDate(item.date),
        source: item.customerName ? `Dispatched to Customer (${item.customerName})` : 'Dispatched to Customer',
        orderLink,
        qtyOut: item.quantity,
        type: 'OUT',
        billNo: raw?.billNo || '—',
        canTransfer: false,
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

  // Handle Opening Bulk Delivery Modal
  const handleOpenBulkDelivery = () => {
    const nextBillNo = `Bill No. ${deliveryHistory.length + 19}`;
    setBulkBillNo(nextBillNo);
    setBulkDeliveryDate(new Date().toISOString().split('T')[0]);
    setBulkReferenceNo('');
    const firstOrder = orders.length > 0 ? orders[0] : null;
    setBulkSelectedOrderId(firstOrder ? firstOrder.id : '');
    setBulkCustomerName(firstOrder?.customerName || '');
    setBulkCustomerType('existing');
    setDeliveredItems([]);
    setIsDeliverItemPickerOpen(false);
    setIsBulkDeliveryOpen(true);
  };

  const handleOpenDeliverItemPicker = () => {
    setPickerSearch('');
    setPickerNewItemOpen(false);
    setPickerNewItemName('');
    const existingMap = new Map(deliveredItems.map(item => [item.articleName, item]));
    const available = distinctArticles.filter(a => a.availableStock > 0);
    setPickerArticleRows(
      available.map(a => {
        const existing = existingMap.get(a.articleName);
        return {
          articleName: a.articleName,
          size: (a.sizes && a.sizes.length > 0) ? a.sizes.join(', ') : 'Standard',
          availableStock: a.availableStock,
          selected: !!existing,
          qty: existing ? String(existing.qty) : '',
          rate: existing && existing.rate > 0 ? String(existing.rate) : '',
          detail: existing ? existing.detail : ''
        };
      })
    );
    setIsDeliverItemPickerOpen(true);
  };

  const handleTogglePickerRow = (articleName: string) => {
    setPickerArticleRows(prev => prev.map(row => {
      if (row.articleName === articleName) {
        const nextSel = !row.selected;
        return {
          ...row,
          selected: nextSel,
          qty: nextSel && !row.qty ? (row.availableStock > 0 ? String(row.availableStock) : '100') : row.qty
        };
      }
      return row;
    }));
  };

  const handlePickerFieldChange = (articleName: string, field: 'qty' | 'rate' | 'detail', value: string) => {
    setPickerArticleRows(prev => prev.map(row => {
      if (row.articleName === articleName) {
        return { ...row, [field]: value };
      }
      return row;
    }));
  };

  const handleAddPickerCustomItem = () => {
    const name = pickerNewItemName.trim();
    if (!name) {
      showToast('Enter article name', 'error');
      return;
    }
    const stock = Number(pickerNewItemStock) || 1000;
    const newRow = {
      articleName: name,
      size: pickerNewItemSize.trim() || 'Standard',
      availableStock: stock,
      selected: true,
      qty: String(stock),
      rate: '',
      detail: ''
    };
    setPickerArticleRows(prev => [newRow, ...prev]);
    setPickerNewItemName('');
    setPickerNewItemOpen(false);
    showToast(`Added ${name} to article list with ${stock.toLocaleString()} pairs stock.`);
  };

  const handleDonePicker = () => {
    const selected = pickerArticleRows.filter(r => r.selected && Number(r.qty) > 0);
    if (selected.length === 0) {
      showToast('Select at least one article and enter quantity.', 'error');
      return;
    }
    for (const r of selected) {
      const q = Number(r.qty);
      if (q > r.availableStock) {
        showToast(`Quantity for ${r.articleName} (${q}) exceeds available stock (${r.availableStock}).`, 'error');
        return;
      }
    }
    const newDelivered = selected.map(r => {
      const q = Number(r.qty);
      const rateVal = Number(r.rate) || 0;
      return {
        id: `${r.articleName}-${Date.now()}`,
        articleName: r.articleName,
        size: r.size,
        availableStock: r.availableStock,
        qty: q,
        rate: rateVal,
        detail: r.detail.trim(),
        amount: q * rateVal
      };
    });
    setDeliveredItems(newDelivered);
    setIsDeliverItemPickerOpen(false);
    showToast(`Added ${newDelivered.length} article(s) to delivery bill.`);
  };

  const handleRemoveDeliveredItem = (articleName: string) => {
    setDeliveredItems(prev => prev.filter(i => i.articleName !== articleName));
  };

  const handleSaveBulkDelivery = async (e: React.FormEvent) => {
    e.preventDefault();
    if (deliveredItems.length === 0) {
      showToast('Please add at least one article to deliver using [+ Add Item].', 'error');
      return;
    }
    const customer = bulkCustomerName.trim() || (bulkCustomerType === 'existing' && bulkSelectedOrderId ? (orders.find(o => o.id === bulkSelectedOrderId)?.customerName || 'Customer') : 'Direct Customer');
    if (!bulkDeliveryDate) {
      showToast('Please select a delivery date.', 'error');
      return;
    }
    for (const item of deliveredItems) {
      if (item.qty > item.availableStock) {
        showToast(`Quantity for ${item.articleName} exceeds available stock (${item.availableStock}).`, 'error');
        return;
      }
    }

    setIsSavingBulkDelivery(true);
    try {
      const targetOrder = orders.find(o => o.id === bulkSelectedOrderId);
      const now = new Date().toISOString();
      const batchId = `DEL-${Date.now()}`;
      const totalDelivered = deliveredItems.reduce((sum, item) => sum + item.qty, 0);

      for (const item of deliveredItems) {
        const qty = item.qty;
        const matched = stockManagement.find(s => 
          (s.article || s.articleName || '').trim().toLowerCase() === item.articleName.trim().toLowerCase()
        );

        if (matched && targetOrder && deliverFromStock) {
          await deliverFromStock({
            stockId: matched.id,
            orderId: targetOrder.id,
            customerName: customer,
            quantity: qty,
            date: bulkDeliveryDate
          });
        } else if (db) {
          const normId = item.articleName.replace(/[^a-zA-Z0-9_-]/g, '_');
          const deliveryRef = doc(collection(db, 'stock_delivery_history'));
          const articleRef = doc(db, 'article_stock', normId);

          const deliveryDoc = {
            id: deliveryRef.id,
            deliveryGroupId: batchId,
            billNo: bulkBillNo,
            referenceNo: bulkReferenceNo.trim(),
            biltyNo: bulkReferenceNo.trim(),
            orderId: targetOrder?.id || '',
            orderNo: targetOrder?.orderNo || '',
            date: bulkDeliveryDate,
            deliveryDate: bulkDeliveryDate,
            customerName: customer,
            partyName: customer,
            article: item.articleName,
            size: item.size || 'Standard',
            quantity: qty,
            rate: item.rate || 0,
            amount: item.amount || 0,
            detail: item.detail || '',
            createdAt: now
          };

          await setDoc(deliveryRef, deliveryDoc);
          await updateDoc(articleRef, {
            totalAvailable: increment(-qty),
            totalDelivered: increment(qty),
            deliveryHistory: arrayUnion({
              date: bulkDeliveryDate,
              orderNo: targetOrder?.orderNo || (bulkReferenceNo ? `Bilty: ${bulkReferenceNo}` : bulkBillNo),
              customerName: customer,
              pairs: qty,
              remainingAfter: Math.max(0, item.availableStock - qty),
              deliveryId: deliveryRef.id,
              billNo: bulkBillNo,
              rate: item.rate || 0,
              amount: item.amount || 0,
              detail: item.detail || ''
            })
          }).catch(async () => {
            await setDoc(articleRef, {
              articleName: item.articleName,
              totalAvailable: Math.max(0, item.availableStock - qty),
              totalDelivered: qty,
              deliveryHistory: [{
                date: bulkDeliveryDate,
                orderNo: targetOrder?.orderNo || (bulkReferenceNo ? `Bilty: ${bulkReferenceNo}` : bulkBillNo),
                customerName: customer,
                pairs: qty,
                remainingAfter: Math.max(0, item.availableStock - qty),
                deliveryId: deliveryRef.id,
                billNo: bulkBillNo,
                rate: item.rate || 0,
                amount: item.amount || 0,
                detail: item.detail || ''
              }]
            }, { merge: true });
          });

          if (targetOrder) {
            const subHistoryRef = doc(collection(db, 'customer_orders', targetOrder.id, 'order_history'));
            await setDoc(subHistoryRef, {
              date: bulkDeliveryDate,
              actionType: 'dispatched_to_customer',
              quantity: qty,
              article: item.articleName,
              size: item.size || 'Standard',
              notes: bulkReferenceNo ? `Bilty/Ref: ${bulkReferenceNo}` : `${bulkBillNo} from Stock Management`,
              createdAt: now
            });
          }
        }
      }

      showToast(`Delivery recorded (${bulkBillNo}): ${totalDelivered.toLocaleString()} pairs across ${deliveredItems.length} article(s).`);
      setIsBulkDeliveryOpen(false);
      setDeliveredItems([]);
    } catch (err) {
      console.error('Error processing bulk delivery:', err);
      showToast(err instanceof Error ? err.message : 'Could not process bulk delivery.', 'error');
    } finally {
      setIsSavingBulkDelivery(false);
    }
  };

  // Handle Opening Add Item Modal
  const handleOpenAddItemModal = () => {
    setAddItemDate(new Date().toISOString().split('T')[0]);
    setAddItemSource('Factory Workshop / Direct Stock');
    setAddItemBillNo('');
    setAddItemSearch('');
    setIsAddingNewCustomArticle(false);
    setNewCustomArticleInput('');
    setAddItemEntries(
      distinctArticles.map(a => ({
        articleName: a.articleName,
        size: (a.sizes && a.sizes.length > 0) ? a.sizes[0] : 'Standard',
        qty: '',
        rate: String(a.unitRate || 450),
        selected: false
      }))
    );
    setIsAddItemModalOpen(true);
  };

  const handleAddCustomArticleEntry = () => {
    const trimmed = newCustomArticleInput.trim();
    if (!trimmed) {
      showToast('Enter article name first.', 'error');
      return;
    }
    const already = addItemEntries.find(e => e.articleName.toLowerCase() === trimmed.toLowerCase());
    if (already) {
      showToast('Article already exists in list.', 'error');
      return;
    }
    setAddItemEntries(prev => [
      {
        articleName: trimmed,
        size: 'Standard',
        qty: '',
        rate: '450',
        selected: true
      },
      ...prev
    ]);
    setNewCustomArticleInput('');
    setIsAddingNewCustomArticle(false);
    showToast(`Added ${trimmed} to stock entry list.`);
  };

  const handleToggleAddItem = (articleName: string) => {
    setAddItemEntries(prev => prev.map(entry => {
      if (entry.articleName === articleName) {
        return { ...entry, selected: !entry.selected };
      }
      return entry;
    }));
  };

  const handleAddItemFieldChange = (articleName: string, field: 'size' | 'qty' | 'rate', val: string) => {
    setAddItemEntries(prev => prev.map(entry => {
      if (entry.articleName === articleName) {
        return { ...entry, [field]: val };
      }
      return entry;
    }));
  };

  const handleSaveAddItem = async (e: React.FormEvent) => {
    e.preventDefault();
    const selected = addItemEntries.filter(e => e.selected && Number(e.qty) > 0);
    if (selected.length === 0) {
      showToast('Select at least one item with a valid positive quantity.', 'error');
      return;
    }
    if (!addItemDate) {
      showToast('Please select a date.', 'error');
      return;
    }
    setIsSavingAddItem(true);
    try {
      for (const item of selected) {
        const qty = Number(item.qty);
        const rate = Number(item.rate) || 0;
        await addStockReceipt({
          article: item.articleName,
          size: item.size || 'Standard',
          quantity: qty,
          date: addItemDate,
          source: addItemSource.trim() || 'Factory Workshop / Direct Stock',
          totalBalance: qty * rate
        });
      }
      const totalPairs = selected.reduce((sum, i) => sum + Number(i.qty), 0);
      showToast(`Stock IN recorded: ${totalPairs.toLocaleString()} pairs added across ${selected.length} items.`);
      setIsAddItemModalOpen(false);
    } catch (err) {
      console.error('Error adding stock items:', err);
      showToast(err instanceof Error ? err.message : 'Could not add stock items.', 'error');
    } finally {
      setIsSavingAddItem(false);
    }
  };

  // Handle Transfer to Order Modal
  const handleOpenTransferModal = (row: any) => {
    setTransferTargetRow(row);
    setTransferOrderId(orders.length > 0 ? orders[0].id : '');
    setTransferQty(String(row.qtyIn || ''));
    setTransferDate(new Date().toISOString().split('T')[0]);
    setTransferNote(`Transferred to Order (Original Received: ${formatDate(row.date)})`);
  };

  const handleSaveTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!transferTargetRow || !selectedArticleName) return;
    const qty = Number(transferQty);
    if (!transferOrderId) {
      showToast('Please select a customer order to transfer to.', 'error');
      return;
    }
    if (!Number.isFinite(qty) || qty <= 0) {
      showToast('Enter a valid positive transfer quantity.', 'error');
      return;
    }
    const chosenOrder = orders.find(o => o.id === transferOrderId);
    if (!chosenOrder) {
      showToast('Selected customer order not found.', 'error');
      return;
    }
    setIsSavingTransfer(true);
    try {
      const now = new Date().toISOString();
      if (db) {
        // 1. If row has raw entry id, update it in cuttingEntries
        if (transferTargetRow.id) {
          const cuttingRef = doc(db, 'cuttingEntries', transferTargetRow.id);
          await updateDoc(cuttingRef, {
            orderId: chosenOrder.id,
            orderNo: chosenOrder.orderNo,
            customerOrder: `${chosenOrder.customerName || ''} (${chosenOrder.orderNo})`.trim(),
            transferDate: transferDate,
            updatedAt: now
          }).catch(() => {
            // Document might be in another collection or local
          });
        }

        // 2. Add to Order Cutting History (sub-collection customer_orders/{id}/order_history)
        const subHistoryRef = doc(collection(db, 'customer_orders', chosenOrder.id, 'order_history'));
        await setDoc(subHistoryRef, {
          date: transferDate,
          actionType: 'stock_received',
          quantity: qty,
          personName: transferTargetRow.source || 'Stock Transfer',
          article: selectedArticleName,
          notes: transferNote || `Transferred from Stock (Received: ${formatDate(transferTargetRow.date)})`,
          createdAt: now
        });

        // 3. Add to order_dispatch_history
        const topHistoryRef = doc(collection(db, 'order_dispatch_history'));
        await setDoc(topHistoryRef, {
          orderId: chosenOrder.id,
          orderNo: chosenOrder.orderNo,
          date: transferDate,
          actionType: 'stock_received',
          quantity: qty,
          personName: transferTargetRow.source || 'Stock Transfer',
          article: selectedArticleName,
          notes: transferNote || `Transferred from Stock (Received: ${formatDate(transferTargetRow.date)})`,
          createdAt: now
        });
      }

      showToast(`Transferred ${qty.toLocaleString()} pairs of ${selectedArticleName} to Order #${chosenOrder.orderNo} (${chosenOrder.customerName}).`);
      setTransferTargetRow(null);
    } catch (err) {
      console.error('Error transferring stock to order:', err);
      showToast(err instanceof Error ? err.message : 'Could not transfer stock to order.', 'error');
    } finally {
      setIsSavingTransfer(false);
    }
  };

  // Toggle delivery expansion in Stock OUT report
  const toggleDeliveryExpand = (id: string) => {
    setExpandedDeliveries(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Grouped deliveries for Stock OUT Report tab
  const groupedDeliveries = useMemo(() => {
    const groupMap = new Map<string, {
      id: string;
      date: string;
      customerName: string;
      referenceNo: string;
      totalPairs: number;
      items: Array<{
        id: string;
        article: string;
        size: string;
        quantity: number;
        orderNo?: string;
      }>;
    }>();

    (deliveryHistory || []).forEach(d => {
      const date = d.date || (d as any).deliveryDate || '';
      const customer = d.customerName || (d as any).partyName || 'Customer';
      const ref = (d as any).referenceNo || (d as any).biltyNo || d.orderNo || '';
      const groupId = (d as any).deliveryGroupId || `${customer}__${date}__${ref || d.id}`;

      if (!groupMap.has(groupId)) {
        groupMap.set(groupId, {
          id: groupId,
          date,
          customerName: customer,
          referenceNo: ref || (d.orderNo ? `Order #${d.orderNo}` : '—'),
          totalPairs: 0,
          items: []
        });
      }

      const g = groupMap.get(groupId)!;
      g.totalPairs += Number(d.quantity) || 0;
      g.items.push({
        id: d.id,
        article: d.article || 'Article',
        size: d.size || 'Standard',
        quantity: Number(d.quantity) || 0,
        orderNo: d.orderNo
      });
    });

    const list = Array.from(groupMap.values());
    return list.sort((a, b) => safeStringCompare(b.date, a.date));
  }, [deliveryHistory]);

  const filteredGroupedDeliveries = useMemo(() => {
    if (!searchQuery.trim()) return groupedDeliveries;
    const q = searchQuery.toLowerCase().trim();
    return groupedDeliveries.filter(g => 
      g.customerName.toLowerCase().includes(q) ||
      g.referenceNo.toLowerCase().includes(q) ||
      g.items.some(i => i.article.toLowerCase().includes(q))
    );
  }, [groupedDeliveries, searchQuery]);

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
                  <th className="px-4 py-3.5">TRANSFER DATE</th>
                  <th className="px-4 py-3.5">SOURCE / CUTTING MASTER</th>
                  <th className="px-4 py-3.5">ORDER LINK</th>
                  <th className="px-4 py-3.5 text-right">QTY</th>
                  <th className="px-4 py-3.5">BILL NO</th>
                  <th className="px-4 py-3.5 text-center">ACT</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                {filteredCombinedHistory.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-slate-400">
                      <Boxes className="mx-auto mb-2 h-8 w-8 opacity-40" />
                      <p className="font-semibold text-slate-600">No movement records found</p>
                      <p className="mt-1 text-xs text-slate-400">Click [IN / BUY] or receive cutting lots to log stock movements.</p>
                    </td>
                  </tr>
                ) : (
                  filteredCombinedHistory.map(row => (
                    <tr key={row.id} className="hover:bg-slate-50 transition">
                      <td className="px-4 py-3.5 font-mono text-slate-900 font-semibold whitespace-nowrap">
                        <div className="flex flex-col">
                          <span>{row.formattedDateTime}</span>
                          {row.transferDate ? (
                            <span className="text-[10px] text-slate-400 font-normal">
                              Received: {formatDate(row.date)}
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        {row.transferDate ? (
                          <span className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-2 py-0.5 text-[11px] font-mono font-bold text-blue-700 border border-blue-200">
                            <Calendar className="h-3 w-3" />
                            {formatDate(row.transferDate)}
                          </span>
                        ) : (
                          <span className="text-slate-300 font-mono">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-slate-800 font-semibold">
                        {row.source}
                      </td>
                      <td className="px-4 py-3.5 text-slate-600">
                        <span className={`rounded-md px-2 py-0.5 text-[11px] font-mono font-semibold ${
                          row.orderLink.toLowerCase().includes('against order') || row.orderLink.toLowerCase().includes('to order')
                            ? 'bg-blue-50 text-blue-800 border border-blue-200'
                            : 'bg-slate-100 text-slate-700'
                        }`}>
                          {row.orderLink}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-right font-mono font-bold whitespace-nowrap">
                        {row.qtyIn !== undefined ? (
                          <span className="text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-md border border-emerald-200 text-xs font-mono font-bold">
                            +{row.qtyIn.toLocaleString()}
                          </span>
                        ) : row.qtyOut !== undefined ? (
                          <span className="text-rose-700 bg-rose-50 px-2.5 py-1 rounded-md border border-rose-200 text-xs font-mono font-bold">
                            -{row.qtyOut.toLocaleString()}
                          </span>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3.5 font-mono text-slate-500">
                        {row.billNo || '—'}
                      </td>
                      <td className="px-4 py-3.5 text-center">
                        <div className="flex items-center justify-center gap-1.5 flex-wrap">
                          {row.canTransfer && (
                            <button
                              type="button"
                              onClick={() => handleOpenTransferModal(row)}
                              className="inline-flex items-center gap-1 rounded-lg bg-blue-600 hover:bg-blue-700 text-white px-2.5 py-1 text-[11px] font-bold shadow-2xs transition active:scale-95 cursor-pointer whitespace-nowrap"
                              title="Transfer this stock entry to a customer order"
                            >
                              <Plus className="h-3 w-3" />
                              <span>Add to Order</span>
                            </button>
                          )}
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
                                setEditOutCustomer(row.raw?.customerName || '');
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
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-3 sm:p-4 backdrop-blur-xs overflow-y-auto"
            onClick={(e) => {
              if (e.target === e.currentTarget) setIsInModalOpen(false);
            }}
          >
            <div
              className="w-full max-w-md rounded-2xl bg-white p-5 sm:p-6 shadow-2xl my-auto animate-in fade-in zoom-in-95 duration-150"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h3 className="text-lg font-black text-emerald-800">Add Stock IN / Buy</h3>
                <button
                  type="button"
                  onClick={() => setIsInModalOpen(false)}
                  className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition cursor-pointer"
                  aria-label="Close / Back"
                  title="Close / Back (Esc)"
                >
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
                  <button
                    type="button"
                    onClick={() => setIsInModalOpen(false)}
                    className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 transition cursor-pointer flex items-center gap-1.5"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>Cancel / Back</span>
                  </button>
                  <button type="submit" disabled={isSavingIn} className="rounded-xl bg-emerald-600 px-5 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50 transition cursor-pointer">
                    {isSavingIn ? 'Saving...' : 'Add Stock IN'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal: OUT / SELL */}
        {isOutModalOpen && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-3 sm:p-4 backdrop-blur-xs overflow-y-auto"
            onClick={(e) => {
              if (e.target === e.currentTarget) setIsOutModalOpen(false);
            }}
          >
            <div
              className="w-full max-w-md rounded-2xl bg-white p-5 sm:p-6 shadow-2xl my-auto animate-in fade-in zoom-in-95 duration-150"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h3 className="text-lg font-black text-purple-800">Dispatch Stock OUT / Sell</h3>
                <button
                  type="button"
                  onClick={() => setIsOutModalOpen(false)}
                  className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition cursor-pointer"
                  aria-label="Close / Back"
                  title="Close / Back (Esc)"
                >
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
                  <button
                    type="button"
                    onClick={() => setIsOutModalOpen(false)}
                    className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 transition cursor-pointer flex items-center gap-1.5"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>Cancel / Back</span>
                  </button>
                  <button type="submit" disabled={isSavingOut} className="rounded-xl bg-purple-600 px-5 py-2 text-xs font-bold text-white hover:bg-purple-700 disabled:opacity-50 transition cursor-pointer">
                    {isSavingOut ? 'Saving...' : 'Dispatch OUT'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal: ALLOCATE TO ORDER */}
        {isAllocateModalOpen && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-3 sm:p-4 backdrop-blur-xs overflow-y-auto"
            onClick={(e) => {
              if (e.target === e.currentTarget) setIsAllocateModalOpen(false);
            }}
          >
            <div
              className="w-full max-w-md rounded-2xl bg-white p-5 sm:p-6 shadow-2xl my-auto animate-in fade-in zoom-in-95 duration-150"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h3 className="text-lg font-black text-blue-800">Allocate Stock to Order</h3>
                <button
                  type="button"
                  onClick={() => setIsAllocateModalOpen(false)}
                  className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition cursor-pointer"
                  aria-label="Close / Back"
                  title="Close / Back (Esc)"
                >
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
                  <button
                    type="button"
                    onClick={() => setIsAllocateModalOpen(false)}
                    className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 transition cursor-pointer flex items-center gap-1.5"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>Cancel / Back</span>
                  </button>
                  <button type="submit" disabled={isSavingAllocate} className="rounded-xl bg-blue-600 px-5 py-2 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-50 transition cursor-pointer">
                    {isSavingAllocate ? 'Allocating...' : 'Confirm Allocation'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal: RETURN / WAPSI ADD */}
        {isWapsiModalOpen && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-3 sm:p-4 backdrop-blur-xs overflow-y-auto"
            onClick={(e) => {
              if (e.target === e.currentTarget) setIsWapsiModalOpen(false);
            }}
          >
            <div
              className="w-full max-w-md rounded-2xl bg-white p-5 sm:p-6 shadow-2xl my-auto animate-in fade-in zoom-in-95 duration-150"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h3 className="text-lg font-black text-rose-800">Add Stock Return / Wapsi</h3>
                <button
                  type="button"
                  onClick={() => setIsWapsiModalOpen(false)}
                  className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition cursor-pointer"
                  aria-label="Close / Back"
                  title="Close / Back (Esc)"
                >
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
                  <button
                    type="button"
                    onClick={() => setIsWapsiModalOpen(false)}
                    className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 transition cursor-pointer flex items-center gap-1.5"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>Cancel / Back</span>
                  </button>
                  <button type="submit" disabled={isSavingWapsi} className="rounded-xl bg-gradient-to-r from-orange-600 to-rose-600 px-5 py-2 text-xs font-bold text-white hover:from-orange-700 hover:to-rose-700 disabled:opacity-50 transition cursor-pointer">
                    {isSavingWapsi ? 'Saving...' : 'Add Wapsi'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Edit Stock IN Entry Modal */}
        {editingInItem && (
          <div
            className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/60 p-3 sm:p-4 backdrop-blur-xs overflow-y-auto"
            onClick={(e) => {
              if (e.target === e.currentTarget) setEditingInItem(null);
            }}
          >
            <div
              className="w-full max-w-md rounded-2xl bg-white p-5 sm:p-6 shadow-2xl my-auto animate-in fade-in zoom-in-95 duration-150"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <div>
                  <h3 className="text-base font-bold text-slate-900">Edit Stock In Receipt</h3>
                  <p className="mt-0.5 text-xs text-slate-500">{editingInItem.source}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setEditingInItem(null)}
                  className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition cursor-pointer"
                  aria-label="Close / Back"
                  title="Close / Back (Esc)"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
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
                    className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 transition cursor-pointer flex items-center gap-1.5"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>Cancel / Back</span>
                  </button>
                  <button
                    type="submit"
                    disabled={isSavingInEdit}
                    className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-50 transition cursor-pointer"
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
          <div
            className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/60 p-3 sm:p-4 backdrop-blur-xs overflow-y-auto"
            onClick={(e) => {
              if (e.target === e.currentTarget) setEditingOutItem(null);
            }}
          >
            <div
              className="w-full max-w-md rounded-2xl bg-white p-5 sm:p-6 shadow-2xl my-auto animate-in fade-in zoom-in-95 duration-150"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <div>
                  <h3 className="text-base font-bold text-slate-900">Edit Stock Delivery</h3>
                  <p className="mt-0.5 text-xs text-slate-500">{editingOutItem.orderName}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setEditingOutItem(null)}
                  className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition cursor-pointer"
                  aria-label="Close / Back"
                  title="Close / Back (Esc)"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
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
                    className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 transition cursor-pointer flex items-center gap-1.5"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>Cancel / Back</span>
                  </button>
                  <button
                    type="submit"
                    disabled={isSavingOutEdit}
                    className="rounded-xl bg-purple-600 px-4 py-2 text-xs font-bold text-white hover:bg-purple-700 disabled:opacity-50 transition cursor-pointer"
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
          <div
            className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/60 p-3 sm:p-4 backdrop-blur-xs overflow-y-auto"
            onClick={(e) => {
              if (e.target === e.currentTarget) setEditingReturnItem(null);
            }}
          >
            <div
              className="w-full max-w-md rounded-2xl bg-white p-5 sm:p-6 shadow-2xl my-auto animate-in fade-in zoom-in-95 duration-150"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h3 className="text-base font-bold text-slate-900">Edit Return / Wapsi Entry</h3>
                <button
                  type="button"
                  onClick={() => setEditingReturnItem(null)}
                  className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition cursor-pointer"
                  aria-label="Close / Back"
                  title="Close / Back (Esc)"
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
                    required
                  />
                </div>
                <div className="mt-5 flex justify-end gap-2 pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setEditingReturnItem(null)}
                    className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 transition cursor-pointer flex items-center gap-1.5"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>Cancel / Back</span>
                  </button>
                  <button
                    type="submit"
                    disabled={isSavingReturnEdit}
                    className="rounded-xl bg-amber-600 px-4 py-2 text-xs font-bold text-white hover:bg-amber-700 disabled:opacity-50 cursor-pointer shadow-xs transition"
                  >
                    {isSavingReturnEdit ? 'Saving...' : 'Save Return'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
        {deletingItem && (
          <div
            className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/60 p-3 sm:p-4 backdrop-blur-xs overflow-y-auto"
            onClick={(e) => {
              if (e.target === e.currentTarget) setDeletingItem(null);
            }}
          >
            <div
              className="w-full max-w-sm rounded-2xl bg-white p-5 sm:p-6 shadow-2xl my-auto animate-in fade-in zoom-in-95 duration-150"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <div className="flex items-center gap-2 text-rose-600">
                  <AlertCircle className="h-5 w-5" />
                  <h3 className="text-base font-bold">Delete History Record?</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setDeletingItem(null)}
                  className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition cursor-pointer"
                  aria-label="Close / Back"
                  title="Close / Back (Esc)"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <p className="mt-3 text-xs text-slate-600">
                Are you sure you want to remove <span className="font-semibold text-slate-800">{deletingItem.label}</span>?
                This will automatically update the calculated available balance.
              </p>
              <div className="mt-5 flex justify-end gap-2 border-t border-slate-100 pt-3">
                <button
                  type="button"
                  onClick={() => setDeletingItem(null)}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 transition cursor-pointer flex items-center gap-1.5"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Cancel / Back</span>
                </button>
                <button
                  type="button"
                  disabled={isDeleting}
                  onClick={handleConfirmDelete}
                  className="rounded-xl bg-rose-600 px-4 py-2 text-xs font-bold text-white hover:bg-rose-700 disabled:opacity-50 transition cursor-pointer"
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
          <button
            type="button"
            onClick={handleOpenBulkDelivery}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-700 px-4 py-2.5 text-xs font-bold text-white shadow-md shadow-blue-600/20 transition active:scale-95 cursor-pointer whitespace-nowrap self-start sm:self-center"
            title="Create Delivery / Deliver Stock to Customer"
          >
            <Truck className="h-4 w-4" />
            <span>+ Deliver Stock / New Delivery</span>
          </button>
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

        {/* Tabs and Action Buttons Header Bar - clean row with zero overlap */}
        <div className="mt-6 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-4 border-t border-slate-100">
          <div className="flex items-center gap-2 p-1 bg-slate-100 rounded-xl shrink-0">
            <button
              type="button"
              onClick={() => setActiveTab('IN')}
              className={`flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg text-xs font-bold transition-all ${
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
              className={`flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg text-xs font-bold transition-all ${
                activeTab === 'OUT'
                  ? 'bg-purple-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
              }`}
            >
              <ArrowUpRight className="h-4 w-4" />
              Stock OUT Report
            </button>
          </div>

          {/* Search Bar - small (w-52), clean right aligned */}
          <div className="relative w-full sm:w-52 shrink-0">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder={activeTab === 'IN' ? "Search article..." : "Search delivery..."}
              className="w-full rounded-xl border border-slate-300 py-2 pl-9 pr-3 text-xs bg-white text-slate-800 focus:border-blue-500 focus:outline-none"
            />
          </div>
        </div>
      </div>

      {/* Directory / Reports Section */}
      {activeTab === 'IN' ? (
        /* ================= STOCK IN ARTICLES DIRECTORY ================= */
        <div className="rounded-2xl border border-slate-200 bg-white shadow-xs overflow-hidden">
          <div className="border-b border-slate-200 bg-slate-50/70 p-4 sm:px-6 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-blue-600" />
              <h2 className="text-sm font-black text-slate-800 uppercase tracking-wider">
                Stock IN Articles Directory
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
                    : 'Click [+ Add Item / + New Stock Entry] or receive cutting lots to log stock.'}
                </p>
              </div>
            ) : (
              filteredArticles.map((article, index) => (
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
                        <span>Total Received: {article.totalIn.toLocaleString()} Pairs</span>
                        <span className="text-slate-300">·</span>
                        <span className="text-purple-600">Delivered: {article.totalOut.toLocaleString()} Pairs</span>
                      </div>
                    </div>
                  </div>

                  {/* Right Side: Stock Count (Per-article Deliver button removed) */}
                  <div className="text-right shrink-0">
                    <div className="font-mono text-base sm:text-lg font-black text-slate-900 group-hover:text-blue-700 transition">
                      {article.availableStock.toLocaleString()} <span className="text-xs font-normal text-slate-500">Pairs</span>
                    </div>
                    <div className="text-[10px] font-semibold text-slate-400">
                      Click to Open Full Ledger &rarr;
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      ) : (
        /* ================= STOCK OUT DELIVERIES REPORT ================= */
        <div className="rounded-2xl border border-slate-200 bg-white shadow-xs overflow-hidden">
          <div className="border-b border-slate-200 bg-purple-50/70 p-4 sm:px-6 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-purple-600" />
              <div>
                <h2 className="text-sm font-black text-slate-800 uppercase tracking-wider">
                  Stock OUT Deliveries & Dispatches
                </h2>
                <p className="text-[11px] text-slate-500">
                  Each delivery shown per customer shipment with expandable articles breakdown
                </p>
              </div>
            </div>
            <span className="rounded-full bg-white border border-purple-200 px-3 py-1 font-mono text-xs font-bold text-purple-700">
              {filteredGroupedDeliveries.length} Shipments Recorded
            </span>
          </div>

          <div className="divide-y divide-slate-100">
            {filteredGroupedDeliveries.length === 0 ? (
              <div className="p-12 text-center text-slate-400">
                <Truck className="mx-auto mb-2 h-10 w-10 opacity-30 text-purple-600" />
                <p className="text-sm font-semibold text-slate-600">No stock deliveries recorded</p>
                <p className="mt-1 text-xs text-slate-400">
                  {searchQuery
                    ? `No deliveries matching "${searchQuery}".`
                    : 'Click [+ New Delivery / Deliver Stock] on top to dispatch stock to customers.'}
                </p>
              </div>
            ) : (
              filteredGroupedDeliveries.map((delivery) => {
                const isExpanded = expandedDeliveries.has(delivery.id);
                return (
                  <div key={delivery.id} className="transition-colors hover:bg-slate-50/60">
                    {/* Header Row for Delivery */}
                    <div
                      onClick={() => toggleDeliveryExpand(delivery.id)}
                      className="flex flex-col sm:flex-row sm:items-center justify-between p-4 sm:px-6 gap-3 cursor-pointer"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <button
                          type="button"
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-200 transition"
                          title={isExpanded ? 'Collapse articles' : 'Expand articles'}
                        >
                          {isExpanded ? (
                            <ChevronUp className="h-4 w-4" />
                          ) : (
                            <ChevronDown className="h-4 w-4" />
                          )}
                        </button>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-bold text-slate-900 text-sm sm:text-base">
                              {delivery.customerName}
                            </span>
                            {delivery.referenceNo && delivery.referenceNo !== '—' && (
                              <span className="rounded-md bg-purple-50 px-2 py-0.5 font-mono text-[11px] font-bold text-purple-700 border border-purple-200">
                                Ref: {delivery.referenceNo}
                              </span>
                            )}
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-2.5 text-xs text-slate-500">
                            <span className="inline-flex items-center gap-1 font-mono">
                              <Calendar className="h-3 w-3 text-slate-400" />
                              {formatDate(delivery.date)}
                            </span>
                            <span className="text-slate-300">·</span>
                            <span className="font-semibold text-slate-700">
                              {delivery.items.length} Article{delivery.items.length === 1 ? '' : 's'}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center justify-between sm:justify-end gap-4 shrink-0 pl-11 sm:pl-0">
                        <div className="text-left sm:text-right">
                          <span className="text-[10px] uppercase tracking-wider font-bold text-purple-700 block">
                            Delivered Quantity
                          </span>
                          <span className="font-mono text-base sm:text-lg font-black text-purple-900">
                            {delivery.totalPairs.toLocaleString()} <span className="text-xs font-normal text-purple-700">Pairs</span>
                          </span>
                        </div>
                        <span className="text-xs font-bold text-blue-600 hover:text-blue-800">
                          {isExpanded ? 'Hide Items ↑' : 'View Items ↓'}
                        </span>
                      </div>
                    </div>

                    {/* Expandable Articles Table */}
                    {isExpanded && (
                      <div className="bg-slate-50/80 px-4 sm:px-12 py-3 border-t border-slate-100">
                        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
                          <table className="w-full text-left text-xs">
                            <thead className="border-b border-slate-200 bg-slate-100/70 text-[10px] font-bold uppercase tracking-wider text-slate-600">
                              <tr>
                                <th className="px-4 py-2.5">#</th>
                                <th className="px-4 py-2.5">ARTICLE NAME</th>
                                <th className="px-4 py-2.5">SIZE</th>
                                <th className="px-4 py-2.5 text-right">DISPATCHED QTY</th>
                                <th className="px-4 py-2.5">ORDER REFERENCE</th>
                                <th className="px-4 py-2.5 text-center">ACTION</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                              {delivery.items.map((item, i) => (
                                <tr key={item.id || `${item.article}-${i}`} className="hover:bg-slate-50/60">
                                  <td className="px-4 py-2.5 font-mono text-slate-400">{i + 1}</td>
                                  <td className="px-4 py-2.5 font-bold text-slate-900">{item.article}</td>
                                  <td className="px-4 py-2.5 text-slate-600 font-mono text-[11px]">{item.size || 'Standard'}</td>
                                  <td className="px-4 py-2.5 text-right font-mono font-bold text-purple-700">
                                    {item.quantity.toLocaleString()} Pairs
                                  </td>
                                  <td className="px-4 py-2.5 text-slate-500 font-mono text-[11px]">
                                    {item.orderNo ? `Order #${item.orderNo}` : (delivery.referenceNo || 'Direct Dispatch')}
                                  </td>
                                  <td className="px-4 py-2.5 text-center">
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleSelectArticle(item.article);
                                      }}
                                      className="inline-flex items-center gap-1 rounded-md bg-blue-50 hover:bg-blue-100 px-2.5 py-1 text-[11px] font-bold text-blue-700 transition cursor-pointer"
                                    >
                                      <span>Ledger &rarr;</span>
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Deliver Modal (Opened from Deliver button in front of each Article in list) */}
      {deliverTarget && (
        <div 
          onClick={(e) => {
            if (e.target === e.currentTarget) setDeliverTarget(null);
          }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs overflow-y-auto"
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-150 my-auto max-h-[92vh] overflow-y-auto"
          >
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
                title="Close / Back (Esc)"
                aria-label="Close / Back"
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
                  className="flex items-center gap-1 rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 cursor-pointer"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  Cancel / Back
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

      {/* ========================================================================= */}
      {/* MODAL 1: DELIVER STOCK (Deliver Stock / Bulk Delivery with Add Items Flow)  */}
      {/* ========================================================================= */}
      {isBulkDeliveryOpen && (
        <div 
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsBulkDeliveryOpen(false);
          }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs overflow-y-auto"
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-4xl rounded-2xl bg-white p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-150 my-auto max-h-[92vh] flex flex-col"
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 shrink-0">
              <div className="flex items-center gap-3">
                <div className="rounded-xl bg-blue-100 p-2 text-blue-700">
                  <Truck className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="text-lg font-black text-slate-900">
                    Deliver Stock
                  </h3>
                  <p className="text-xs text-slate-500 font-medium">
                    Dispatch finished goods inventory to customer orders or generate delivery challan
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsBulkDeliveryOpen(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 cursor-pointer transition"
                title="Close / Back (Esc)"
                aria-label="Close / Back"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSaveBulkDelivery} className="mt-4 flex-1 flex flex-col min-h-0 space-y-4">
              {/* Customer & Shipment Details Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3.5 shrink-0 bg-slate-50 p-4 rounded-xl border border-slate-200">
                {/* 1. Bill Number (Auto) */}
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    Bill Number
                  </label>
                  <input
                    type="text"
                    value={bulkBillNo}
                    onChange={e => setBulkBillNo(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 bg-white p-2 text-xs font-mono font-bold text-blue-900 focus:border-blue-500 focus:outline-none"
                    placeholder="e.g. Bill No. 19"
                  />
                </div>

                {/* 2. Delivery Date */}
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    Date *
                  </label>
                  <input
                    type="date"
                    required
                    value={bulkDeliveryDate}
                    onChange={e => setBulkDeliveryDate(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 bg-white p-2 text-xs focus:border-blue-500 focus:outline-none"
                  />
                </div>

                {/* 3. Customer / Company Selection */}
                <div className="sm:col-span-1">
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    Party / Customer *
                  </label>
                  <div className="flex items-center gap-2 mb-1.5 text-[11px] font-semibold text-slate-600">
                    <label className="inline-flex items-center gap-1 cursor-pointer">
                      <input
                        type="radio"
                        name="customerType"
                        checked={bulkCustomerType === 'existing'}
                        onChange={() => setBulkCustomerType('existing')}
                        className="text-blue-600"
                      />
                      <span>From Order</span>
                    </label>
                    <label className="inline-flex items-center gap-1 cursor-pointer">
                      <input
                        type="radio"
                        name="customerType"
                        checked={bulkCustomerType === 'new'}
                        onChange={() => setBulkCustomerType('new')}
                        className="text-blue-600"
                      />
                      <span>Direct Company</span>
                    </label>
                  </div>
                  {bulkCustomerType === 'existing' ? (
                    <select
                      value={bulkSelectedOrderId}
                      onChange={e => {
                        setBulkSelectedOrderId(e.target.value);
                        const ord = orders.find(o => o.id === e.target.value);
                        if (ord) setBulkCustomerName(ord.customerName || '');
                      }}
                      className="w-full rounded-xl border border-slate-300 bg-white p-2 text-xs font-medium focus:border-blue-500 focus:outline-none"
                    >
                      <option value="">-- Select Customer Order --</option>
                      {orders.map(o => (
                        <option key={o.id} value={o.id}>
                          Order #{o.orderNo} - {o.customerName}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      required
                      placeholder="e.g. BESTWAY, Abdullah Sports, BARLAS"
                      value={bulkCustomerName}
                      onChange={e => setBulkCustomerName(e.target.value)}
                      className="w-full rounded-xl border border-slate-300 bg-white p-2 text-xs focus:border-blue-500 focus:outline-none"
                    />
                  )}
                </div>

                {/* 4. Reference / Bilty No */}
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    Reference / Bilty No
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. BL-1092, Challan 42"
                    value={bulkReferenceNo}
                    onChange={e => setBulkReferenceNo(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 bg-white p-2 text-xs focus:border-blue-500 focus:outline-none font-mono"
                  />
                </div>
              </div>

              {/* Items Section: [+ Add Item] and Selected Items Table */}
              <div className="flex-1 flex flex-col min-h-0">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
                    Articles to Deliver
                  </span>
                  {deliveredItems.length > 0 && (
                    <button
                      type="button"
                      onClick={handleOpenDeliverItemPicker}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-800 transition cursor-pointer"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      <span>+ Add More Items</span>
                    </button>
                  )}
                </div>

                {deliveredItems.length === 0 ? (
                  <div className="flex-1 flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-200 bg-slate-50/60 p-8 text-center min-h-[180px]">
                    <div className="rounded-full bg-blue-50 p-3 text-blue-600 mb-2">
                      <Boxes className="h-8 w-8" />
                    </div>
                    <p className="text-sm font-bold text-slate-700">
                      No articles selected for delivery yet
                    </p>
                    <p className="text-xs text-slate-500 mt-1 mb-4 max-w-sm">
                      Click "+ Add Item" below to browse available articles from stock, select quantities, and optional rates.
                    </p>
                    <button
                      type="button"
                      onClick={handleOpenDeliverItemPicker}
                      className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 px-5 py-2.5 text-xs font-bold text-white shadow-md shadow-emerald-600/20 transition active:scale-95 cursor-pointer"
                    >
                      <Plus className="h-4 w-4" />
                      <span>+ Add Item</span>
                    </button>
                  </div>
                ) : (
                  <div className="flex-1 flex flex-col min-h-0 overflow-hidden rounded-xl border border-slate-200">
                    <div className="flex-1 overflow-y-auto">
                      <table className="w-full text-left text-xs min-w-[600px]">
                        <thead className="sticky top-0 bg-slate-100 border-b border-slate-200 text-[10px] font-bold uppercase tracking-wider text-slate-600">
                          <tr>
                            <th className="px-3.5 py-2.5">ITEM / ARTICLE</th>
                            <th className="px-3 py-2.5 text-right font-mono">QTY</th>
                            <th className="px-3 py-2.5 text-right font-mono">RATE</th>
                            <th className="px-3 py-2.5 text-right font-mono">AMOUNT</th>
                            <th className="px-3 py-2.5 text-center w-16">ACTION</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                          {deliveredItems.map((item) => (
                            <tr key={item.articleName} className="hover:bg-slate-50/80 transition">
                              <td className="px-3.5 py-3">
                                <div className="font-bold text-slate-900">{item.articleName}</div>
                                <div className="text-[11px] text-slate-500 font-mono mt-0.5">
                                  Size: {item.size} &bull; Available: {item.availableStock.toLocaleString()} Pairs
                                  {item.detail && <span className="ml-2 font-normal text-slate-600 italic">({item.detail})</span>}
                                </div>
                              </td>
                              <td className="px-3 py-3 text-right font-mono font-bold text-slate-900">
                                {item.qty.toLocaleString()} <span className="text-[10px] text-slate-500 font-normal">Pairs</span>
                              </td>
                              <td className="px-3 py-3 text-right font-mono text-slate-600">
                                {item.rate > 0 ? `Rs. ${item.rate.toLocaleString()}` : '—'}
                              </td>
                              <td className="px-3 py-3 text-right font-mono font-bold text-blue-900">
                                {item.amount > 0 ? `Rs. ${item.amount.toLocaleString()}` : '—'}
                              </td>
                              <td className="px-3 py-3 text-center">
                                <button
                                  type="button"
                                  onClick={() => handleRemoveDeliveredItem(item.articleName)}
                                  className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer"
                                  title="Remove Article"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>

              {/* Bottom Summary Bar and Actions */}
              <div className="shrink-0 flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t border-slate-200 bg-slate-50 p-4 rounded-xl">
                <div className="flex flex-wrap items-center gap-4 text-xs font-semibold text-slate-700">
                  <span>
                    Total Items: <strong className="text-slate-900 font-mono">{deliveredItems.length}</strong>
                  </span>
                  <span className="text-slate-300">|</span>
                  <span>
                    Total Qty: <strong className="text-blue-700 font-mono text-sm">
                      {deliveredItems.reduce((sum, item) => sum + item.qty, 0).toLocaleString()}
                    </strong> Pairs
                  </span>
                  <span className="text-slate-300">|</span>
                  <span>
                    Total Amount: <strong className="text-emerald-700 font-mono text-sm">
                      Rs. {deliveredItems.reduce((sum, item) => sum + item.amount, 0).toLocaleString()}
                    </strong>
                  </span>
                </div>

                <div className="flex items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => setIsBulkDeliveryOpen(false)}
                    className="flex items-center gap-1 rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 cursor-pointer"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    Cancel / Back
                  </button>
                  <button
                    type="submit"
                    disabled={isSavingBulkDelivery || deliveredItems.length === 0}
                    className="inline-flex items-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-700 px-5 py-2 text-xs font-bold text-white shadow-md shadow-blue-600/25 transition active:scale-95 disabled:opacity-40 cursor-pointer"
                  >
                    {isSavingBulkDelivery ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        <span>Processing Delivery...</span>
                      </>
                    ) : (
                      <>
                        <Truck className="h-4 w-4" />
                        <span>Deliver / Confirm Delivery</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SUB-MODAL: "ADD ITEMS" FROM STOCK POPUP (Exact flow as requested)          */}
      {/* ========================================================================= */}
      {isDeliverItemPickerOpen && (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsDeliverItemPickerOpen(false);
          }}
          className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs overflow-y-auto"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-3xl rounded-2xl bg-white p-5 sm:p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-150 my-auto max-h-[90vh] flex flex-col"
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 shrink-0">
              <div>
                <h3 className="text-lg font-black text-slate-900">
                  Add Items from Stock
                </h3>
                <p className="text-xs text-slate-500 font-medium">
                  Tick articles to deliver, enter quantity and optional rate or detail notes
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsDeliverItemPickerOpen(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 cursor-pointer transition"
                title="Close / Back (Esc)"
                aria-label="Close / Back"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Search Bar + Add New Item Button */}
            <div className="mt-3 shrink-0 flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <input
                  type="search"
                  value={pickerSearch}
                  onChange={e => setPickerSearch(e.target.value)}
                  placeholder="Search article e.g. MG, CE, Driver..."
                  className="w-full rounded-xl border border-slate-300 py-2 pl-9 pr-3 text-xs bg-white text-slate-800 focus:border-blue-500 focus:outline-none"
                />
              </div>
              <button
                type="button"
                onClick={() => setPickerNewItemOpen(prev => !prev)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-blue-300 bg-blue-50 hover:bg-blue-100 px-3 py-2 text-xs font-bold text-blue-700 transition cursor-pointer whitespace-nowrap"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>+ ADD NEW ITEM</span>
              </button>
            </div>

            {/* Inline Add New Custom Item Form */}
            {pickerNewItemOpen && (
              <div className="mt-2.5 p-3.5 bg-blue-50/70 border border-blue-200 rounded-xl shrink-0 flex flex-wrap items-end gap-2.5">
                <div className="flex-1 min-w-[140px]">
                  <label className="text-[11px] font-bold text-blue-900 block mb-1">Article Name *</label>
                  <input
                    type="text"
                    value={pickerNewItemName}
                    onChange={e => setPickerNewItemName(e.target.value)}
                    placeholder="e.g. Driver Gloves tig short"
                    className="w-full rounded-lg border border-blue-300 bg-white p-1.5 text-xs focus:outline-none"
                  />
                </div>
                <div className="w-24">
                  <label className="text-[11px] font-bold text-blue-900 block mb-1">Size</label>
                  <input
                    type="text"
                    value={pickerNewItemSize}
                    onChange={e => setPickerNewItemSize(e.target.value)}
                    placeholder="e.g. 10"
                    className="w-full rounded-lg border border-blue-300 bg-white p-1.5 text-xs focus:outline-none"
                  />
                </div>
                <div className="w-28">
                  <label className="text-[11px] font-bold text-blue-900 block mb-1">Stock Pairs</label>
                  <input
                    type="number"
                    value={pickerNewItemStock}
                    onChange={e => setPickerNewItemStock(e.target.value)}
                    placeholder="Pairs"
                    className="w-full rounded-lg border border-blue-300 bg-white p-1.5 text-xs focus:outline-none"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleAddPickerCustomItem}
                  className="rounded-lg bg-blue-600 hover:bg-blue-700 px-3.5 py-1.5 text-xs font-bold text-white transition cursor-pointer"
                >
                  Add to List
                </button>
                <button
                  type="button"
                  onClick={() => setPickerNewItemOpen(false)}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-100 transition cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            )}

            {/* Full List of Articles in Stock */}
            <div className="mt-3 flex-1 min-h-0 overflow-y-auto rounded-xl border border-slate-200 divide-y divide-slate-100">
              {pickerArticleRows
                .filter(row => {
                  if (!pickerSearch.trim()) return true;
                  const q = pickerSearch.toLowerCase();
                  return row.articleName.toLowerCase().includes(q) || row.size.toLowerCase().includes(q);
                })
                .map(row => {
                  const qVal = Number(row.qty) || 0;
                  const rVal = Number(row.rate) || 0;
                  const rowAmount = qVal * rVal;
                  const isOver = qVal > row.availableStock;

                  return (
                    <div
                      key={row.articleName}
                      className={`p-3.5 transition ${row.selected ? 'bg-blue-50/40' : 'hover:bg-slate-50'}`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <label className="flex items-center gap-3 cursor-pointer flex-1">
                          <input
                            type="checkbox"
                            checked={row.selected}
                            onChange={() => handleTogglePickerRow(row.articleName)}
                            className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                          />
                          <div>
                            <span className="font-bold text-xs text-slate-900 block">
                              {row.articleName}
                            </span>
                            <span className="text-[11px] text-slate-500 font-mono">
                              Size: {row.size}
                            </span>
                          </div>
                        </label>
                        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold font-mono bg-emerald-100 text-emerald-800">
                          Stock: {row.availableStock.toLocaleString()} Pairs
                        </span>
                      </div>

                      {/* Expand row when ticked with 3 fields: Qty (required), Rate (optional), Detail (optional) */}
                      {row.selected && (
                        <div className="mt-3 pl-7 pt-2.5 border-t border-blue-100 grid grid-cols-1 sm:grid-cols-4 gap-2.5 items-end">
                          <div>
                            <label className="text-[10px] font-bold text-slate-700 block mb-1">
                              Qty * <span className="text-slate-400 font-normal">(Max {row.availableStock})</span>
                            </label>
                            <input
                              type="number"
                              min="1"
                              max={row.availableStock}
                              value={row.qty}
                              onChange={e => handlePickerFieldChange(row.articleName, 'qty', e.target.value)}
                              placeholder="Required"
                              className={`w-full rounded-lg border p-1.5 text-xs font-mono font-bold focus:outline-none ${
                                isOver
                                  ? 'border-rose-500 bg-rose-50 text-rose-700'
                                  : 'border-blue-400 bg-white text-blue-900'
                              }`}
                            />
                            {isOver && (
                              <span className="text-[10px] text-rose-600 font-semibold block mt-0.5">
                                Exceeds stock!
                              </span>
                            )}
                          </div>

                          <div>
                            <label className="text-[10px] font-bold text-slate-700 block mb-1">
                              Rate <span className="text-slate-400 font-normal">(Optional)</span>
                            </label>
                            <input
                              type="number"
                              min="0"
                              step="any"
                              value={row.rate}
                              onChange={e => handlePickerFieldChange(row.articleName, 'rate', e.target.value)}
                              placeholder="e.g. 235"
                              className="w-full rounded-lg border border-slate-300 bg-white p-1.5 text-xs font-mono focus:border-blue-500 focus:outline-none"
                            />
                          </div>

                          <div>
                            <label className="text-[10px] font-bold text-slate-700 block mb-1">
                              Detail <span className="text-slate-400 font-normal">(Optional)</span>
                            </label>
                            <input
                              type="text"
                              value={row.detail}
                              onChange={e => handlePickerFieldChange(row.articleName, 'detail', e.target.value)}
                              placeholder="e.g. colour, size note"
                              className="w-full rounded-lg border border-slate-300 bg-white p-1.5 text-xs focus:border-blue-500 focus:outline-none"
                            />
                          </div>

                          <div>
                            <span className="text-[10px] font-bold text-slate-500 block mb-1">
                              Amount = Qty &times; Rate
                            </span>
                            <div className="rounded-lg bg-slate-100 p-1.5 text-xs font-mono font-bold text-slate-800 text-right">
                              {rowAmount > 0 ? `Rs. ${rowAmount.toLocaleString()}` : 'Rs. 0'}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
            </div>

            {/* Bottom Total Bar & Done Button */}
            <div className="mt-3 pt-3 border-t border-slate-200 shrink-0 flex flex-col sm:flex-row items-center justify-between gap-3 bg-slate-50 p-3.5 rounded-xl">
              <div className="flex items-center gap-4 text-xs font-semibold text-slate-700">
                <span>
                  Ticked: <strong className="text-slate-900 font-mono">{pickerArticleRows.filter(r => r.selected).length}</strong> Articles
                </span>
                <span className="text-slate-300">|</span>
                <span>
                  Total Qty: <strong className="text-blue-700 font-mono text-sm">
                    {pickerArticleRows
                      .filter(r => r.selected)
                      .reduce((sum, r) => sum + (Number(r.qty) || 0), 0)
                      .toLocaleString()}
                  </strong> Pairs
                </span>
                <span className="text-slate-300">|</span>
                <span>
                  Total Amount: <strong className="text-emerald-700 font-mono text-sm">
                    Rs. {pickerArticleRows
                      .filter(r => r.selected)
                      .reduce((sum, r) => sum + ((Number(r.qty) || 0) * (Number(r.rate) || 0)), 0)
                      .toLocaleString()}
                  </strong>
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsDeliverItemPickerOpen(false)}
                  className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 cursor-pointer"
                >
                  Cancel / Back
                </button>
                <button
                  type="button"
                  onClick={handleDonePicker}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 px-5 py-2 text-xs font-bold text-white shadow-md shadow-emerald-600/25 transition active:scale-95 cursor-pointer"
                >
                  <Check className="h-4 w-4" />
                  <span>Done / Add Selected</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 2: ADD ITEM / NEW STOCK ENTRY (+ Add Item / + New Stock Entry)       */}
      {/* ========================================================================= */}
      {isAddItemModalOpen && (
        <div 
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsAddItemModalOpen(false);
          }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs overflow-y-auto"
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-4xl rounded-2xl bg-white p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-150 my-auto max-h-[92vh] flex flex-col"
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 shrink-0">
              <div className="flex items-center gap-3">
                <div className="rounded-xl bg-emerald-100 p-2 text-emerald-700">
                  <Plus className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="text-lg font-black text-slate-900">
                    Add Items / New Stock Entry (Stock IN)
                  </h3>
                  <p className="text-xs text-slate-500 font-medium">
                    Add physical stock pairs directly into finished goods inventory with rate and sizes
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsAddItemModalOpen(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 cursor-pointer transition"
                title="Close / Back (Esc)"
                aria-label="Close / Back"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSaveAddItem} className="mt-4 flex-1 flex flex-col min-h-0 space-y-4">
              {/* Receipt Metadata Bar */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 shrink-0 bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Stock IN Date *</label>
                  <input
                    type="date"
                    required
                    value={addItemDate}
                    onChange={e => setAddItemDate(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 bg-white p-2 text-xs focus:border-emerald-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Source / Cutting Master</label>
                  <input
                    type="text"
                    value={addItemSource}
                    onChange={e => setAddItemSource(e.target.value)}
                    placeholder="e.g. Factory Workshop, Cutter NAEM"
                    className="w-full rounded-xl border border-slate-300 bg-white p-2 text-xs focus:border-emerald-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Bill / Lot Reference</label>
                  <input
                    type="text"
                    value={addItemBillNo}
                    onChange={e => setAddItemBillNo(e.target.value)}
                    placeholder="e.g. LOT-42, Rec-10"
                    className="w-full rounded-xl border border-slate-300 bg-white p-2 text-xs font-mono focus:border-emerald-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* Search & Add New Article Bar */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 shrink-0">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    type="search"
                    value={addItemSearch}
                    onChange={e => setAddItemSearch(e.target.value)}
                    placeholder="Filter articles list..."
                    className="w-full rounded-xl border border-slate-300 py-1.5 pl-9 pr-3 text-xs bg-white text-slate-800 focus:border-emerald-500 focus:outline-none"
                  />
                </div>

                {!isAddingNewCustomArticle ? (
                  <button
                    type="button"
                    onClick={() => setIsAddingNewCustomArticle(true)}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 px-3 py-1.5 text-xs font-bold transition cursor-pointer"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>+ Add New Article / Item</span>
                  </button>
                ) : (
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      placeholder="New article name..."
                      value={newCustomArticleInput}
                      onChange={e => setNewCustomArticleInput(e.target.value)}
                      className="rounded-xl border border-emerald-400 px-3 py-1.5 text-xs font-bold focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={handleAddCustomArticleEntry}
                      className="rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 text-xs font-bold transition cursor-pointer"
                    >
                      Add
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsAddingNewCustomArticle(false)}
                      className="rounded-xl border border-slate-300 px-2 py-1.5 text-xs font-bold text-slate-500 hover:bg-slate-100 cursor-pointer"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
              </div>

              {/* Items Table with Checkboxes */}
              <div className="flex-1 overflow-y-auto rounded-xl border border-slate-200">
                <table className="w-full text-left text-xs min-w-[650px]">
                  <thead className="sticky top-0 bg-slate-100 border-b border-slate-200 text-[10px] font-bold uppercase tracking-wider text-slate-600">
                    <tr>
                      <th className="px-3 py-2.5 text-center w-12">SELECT</th>
                      <th className="px-3 py-2.5">ARTICLE NAME</th>
                      <th className="px-3 py-2.5 w-32">SIZE</th>
                      <th className="px-3 py-2.5 text-right w-32">QTY TO ADD *</th>
                      <th className="px-3 py-2.5 text-right w-28">RATE (RS.)</th>
                      <th className="px-3 py-2.5 text-right font-mono">TOTAL (RS.)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                    {addItemEntries
                      .filter(e => !addItemSearch || e.articleName.toLowerCase().includes(addItemSearch.toLowerCase()))
                      .map(item => {
                        const total = (Number(item.qty) || 0) * (Number(item.rate) || 0);
                        return (
                          <tr key={item.articleName} className={item.selected ? "bg-emerald-50/50" : "hover:bg-slate-50"}>
                            <td className="px-3 py-2.5 text-center">
                              <input
                                type="checkbox"
                                checked={item.selected}
                                onChange={() => handleToggleAddItem(item.articleName)}
                                className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                              />
                            </td>
                            <td className="px-3 py-2.5 font-bold text-slate-900">
                              {item.articleName}
                            </td>
                            <td className="px-3 py-2.5">
                              <input
                                type="text"
                                placeholder="Size (e.g. 8, L)"
                                disabled={!item.selected}
                                value={item.size}
                                onChange={e => handleAddItemFieldChange(item.articleName, 'size', e.target.value)}
                                className="w-full rounded-lg border border-slate-300 px-2 py-1 text-xs focus:outline-none focus:border-emerald-500 disabled:bg-slate-100 disabled:text-slate-400"
                              />
                            </td>
                            <td className="px-3 py-2.5 text-right">
                              <input
                                type="number"
                                min="1"
                                placeholder="Pairs"
                                disabled={!item.selected}
                                value={item.qty}
                                onChange={e => handleAddItemFieldChange(item.articleName, 'qty', e.target.value)}
                                className="w-24 rounded-lg border border-slate-300 px-2 py-1 text-right text-xs font-mono font-bold focus:outline-none focus:border-emerald-500 disabled:bg-slate-100 disabled:text-slate-400"
                              />
                            </td>
                            <td className="px-3 py-2.5 text-right">
                              <input
                                type="number"
                                min="0"
                                placeholder="Rate"
                                disabled={!item.selected}
                                value={item.rate}
                                onChange={e => handleAddItemFieldChange(item.articleName, 'rate', e.target.value)}
                                className="w-20 rounded-lg border border-slate-300 px-2 py-1 text-right text-xs font-mono focus:outline-none focus:border-emerald-500 disabled:bg-slate-100 disabled:text-slate-400"
                              />
                            </td>
                            <td className="px-3 py-2.5 text-right font-mono font-bold text-emerald-800">
                              Rs. {total.toLocaleString()}
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>

              {/* Bottom Summary Bar and Actions */}
              <div className="shrink-0 flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t border-slate-200 bg-slate-50 p-4 rounded-xl">
                <div className="flex items-center gap-4 text-xs font-semibold text-slate-700">
                  <span>
                    Selected: <strong className="text-slate-900 font-mono">{addItemEntries.filter(i => i.selected).length}</strong> Items
                  </span>
                  <span className="text-slate-300">|</span>
                  <span>
                    Total Pairs: <strong className="text-emerald-700 font-mono text-sm">
                      {addItemEntries.filter(i => i.selected).reduce((sum, i) => sum + (Number(i.qty) || 0), 0).toLocaleString()}
                    </strong> Pairs
                  </span>
                  <span className="text-slate-300">|</span>
                  <span>
                    Total Value: <strong className="text-emerald-800 font-mono">
                      Rs. {addItemEntries.filter(i => i.selected).reduce((sum, i) => sum + ((Number(i.qty) || 0) * (Number(i.rate) || 0)), 0).toLocaleString()}
                    </strong>
                  </span>
                </div>

                <div className="flex items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => setIsAddItemModalOpen(false)}
                    className="flex items-center gap-1 rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 cursor-pointer"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    Cancel / Back
                  </button>
                  <button
                    type="submit"
                    disabled={isSavingAddItem || addItemEntries.filter(i => i.selected && Number(i.qty) > 0).length === 0}
                    className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 px-5 py-2 text-xs font-bold text-white shadow-md shadow-emerald-600/25 transition active:scale-95 disabled:opacity-40 cursor-pointer"
                  >
                    {isSavingAddItem ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        <span>Saving Stock Entries...</span>
                      </>
                    ) : (
                      <>
                        <Plus className="h-4 w-4" />
                        <span>Save Stock IN Entries</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 3: TRANSFER TO ORDER MODAL (From Transaction History)               */}
      {/* ========================================================================= */}
      {transferTargetRow && selectedArticleName && (
        <div 
          onClick={(e) => {
            if (e.target === e.currentTarget) setTransferTargetRow(null);
          }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs overflow-y-auto"
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-150 my-auto max-h-[92vh] overflow-y-auto"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
                  <Plus className="h-5 w-5 text-blue-600" />
                  <span>Transfer Stock to Customer Order</span>
                </h3>
                <p className="text-xs text-slate-500 font-medium mt-0.5">
                  Link this unallocated stock entry directly to a customer purchase order
                </p>
              </div>
              <button
                type="button"
                onClick={() => setTransferTargetRow(null)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 cursor-pointer transition"
                title="Close / Back (Esc)"
                aria-label="Close / Back"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSaveTransfer} className="mt-4 space-y-4">
              {/* Locked Article Info */}
              <div className="rounded-xl border border-blue-200 bg-blue-50/70 p-3.5 flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-blue-700 block">Selected Article</span>
                  <span className="text-base font-black text-blue-950">{selectedArticleName}</span>
                  <span className="text-xs text-slate-500 block mt-0.5">
                    Original Received: {formatDate(transferTargetRow.date)}
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-blue-700 block">Available Stock</span>
                  <span className="text-sm font-mono font-bold text-blue-900 bg-white px-2.5 py-1 rounded-md border border-blue-200 inline-block mt-0.5">
                    {selectedArticleSummary?.availableStock.toLocaleString()} Pairs
                  </span>
                </div>
              </div>

              {/* Order Selection */}
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Select Customer Order *
                </label>
                <select
                  required
                  value={transferOrderId}
                  onChange={e => setTransferOrderId(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 bg-white p-2.5 text-xs font-medium focus:border-blue-500 focus:outline-none"
                >
                  <option value="" disabled>-- Select Customer Order (PO) --</option>
                  {orders.map(o => (
                    <option key={o.id} value={o.id}>
                      Order #{o.orderNo} - {o.customerName} (Total: {Number(o.totalPairs || 0).toLocaleString()} pairs)
                    </option>
                  ))}
                </select>
              </div>

              {/* Quantity and Transfer Date Grid */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    Qty to Transfer *
                  </label>
                  <input
                    type="number"
                    required
                    min="1"
                    max={selectedArticleSummary?.availableStock || transferTargetRow.qtyIn}
                    value={transferQty}
                    onChange={e => setTransferQty(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 p-2.5 text-xs font-mono font-bold focus:border-blue-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    Transfer Date *
                  </label>
                  <input
                    type="date"
                    required
                    value={transferDate}
                    onChange={e => setTransferDate(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 p-2.5 text-xs focus:border-blue-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* Transfer Note */}
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Reference Note
                </label>
                <input
                  type="text"
                  value={transferNote}
                  onChange={e => setTransferNote(e.target.value)}
                  placeholder="e.g. Transferred from direct cutting stock"
                  className="w-full rounded-xl border border-slate-300 p-2.5 text-xs focus:border-blue-500 focus:outline-none"
                />
              </div>

              {/* Date Comparison Banner */}
              <div className="rounded-xl bg-slate-50 border border-slate-200 p-3 text-xs text-slate-600 flex items-center justify-between">
                <span>Received Date: <strong className="font-mono text-slate-800">{formatDate(transferTargetRow.date)}</strong></span>
                <span className="text-slate-400">&rarr;</span>
                <span>Transfer Date: <strong className="font-mono text-blue-700">{formatDate(transferDate)}</strong></span>
              </div>

              {/* Modal Actions */}
              <div className="mt-5 flex justify-end gap-2.5 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setTransferTargetRow(null)}
                  className="flex items-center gap-1 rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 cursor-pointer"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  Cancel / Back
                </button>
                <button
                  type="submit"
                  disabled={isSavingTransfer}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 px-5 py-2 text-xs font-bold text-white shadow-md shadow-blue-600/25 transition active:scale-95 disabled:opacity-50 cursor-pointer"
                >
                  {isSavingTransfer ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      <span>Transferring...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      <span>Confirm Transfer to Order</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
