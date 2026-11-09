import React, { useState, useMemo, useEffect, useRef } from 'react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { 
  Scissors, 
  Search, 
  Plus, 
  CheckCircle2, 
  Clock, 
  Trash2, 
  ArrowLeft, 
  User, 
  Phone, 
  FileText, 
  Boxes, 
  Calendar, 
  Building, 
  Layers, 
  Tag, 
  Check, 
  ArrowDownLeft, 
  ArrowUpRight,
  BookOpen,
  X,
  AlertCircle,
  Pencil,
  Loader2,
  RotateCcw,
  Minus
} from 'lucide-react';
import { useFactory } from '../context/FactoryContext';
import { formatDate, safeStringCompare } from '../utils/factoryFormatters';
import { Cutter, CutterCategory, CuttingEntry, CuttingTransaction } from '../types/factory';
import { collection, db, deleteDoc, doc, onSnapshot, runTransaction, serverTimestamp, updateDoc } from '../firebase';
import { useDragToScroll } from '../hooks/useDragToScroll';

const formatConfirmationDate = (value: string): string => {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return formatDate(value);
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = String(date.getFullYear()).slice(-2);
  return `${day}-${month}-${year}`;
};

const getCutterLedgerName = (cutter: Cutter): string => {
  const defaultName = `${cutter.name} Ka Khata`;
  return !cutter.khataName || cutter.khataName.trim().toLowerCase() === defaultName.toLowerCase()
    ? `${cutter.name} Ledger`
    : cutter.khataName.replace(/\s+ka\s+khata$/i, ' Ledger');
};

interface CuttingsPageProps {
  onOpenCreateCutting?: () => void;
}

type LedgerPaymentMethod = 'Cash' | 'Easypaisa' | 'JazzCash' | 'Bank Transfer';

export interface LotSplitAllocation {
  lotId: string;
  lotNo: string;
  billNo?: string;
  amount: number;
}

interface NasimLedgerPayment {
  id: string;
  cutterId: string;
  cutterName: string;
  date: string;
  amount: number;
  paymentMethod: LedgerPaymentMethod;
  billNo: string;
  lotId?: string;
  lotNo?: string;
  splitAllocations?: LotSplitAllocation[];
  type: 'cash_in' | 'cash_out';
  createdAt: string;
}

const paymentIdempotencyId = (value: string): string => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
};

const safeParse = (value: string | number | null | undefined): number => {
  const parsed = Number.parseFloat(String(value ?? ''));
  return Number.isFinite(parsed) ? parsed : 0;
};

type LedgerDateFilter = 'All Time' | 'Today' | 'Last 7 Days' | 'Last 30 Days' | 'This Month' | 'Last Month' | 'Others';

const dateKey = (date: Date): string =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

const getLedgerDateRange = (filter: LedgerDateFilter, fromDate: string, toDate: string): { from: string; to: string } | null => {
  const today = new Date();
  const todayKey = dateKey(today);
  if (filter === 'All Time') return null;
  if (filter === 'Today') return { from: todayKey, to: todayKey };
  if (filter === 'Others') return { from: fromDate, to: toDate };
  if (filter === 'This Month') {
    return { from: dateKey(new Date(today.getFullYear(), today.getMonth(), 1)), to: todayKey };
  }
  if (filter === 'Last Month') {
    return {
      from: dateKey(new Date(today.getFullYear(), today.getMonth() - 1, 1)),
      to: dateKey(new Date(today.getFullYear(), today.getMonth(), 0))
    };
  }
  const days = filter === 'Last 7 Days' ? 7 : 30;
  const from = new Date(today.getFullYear(), today.getMonth(), today.getDate() - days + 1);
  return { from: dateKey(from), to: todayKey };
};

const isDateInRange = (value: string, range: { from: string; to: string } | null): boolean =>
  !range || (!!(range.from || range.to) && (!range.from || value >= range.from) && (!range.to || value <= range.to));

const formatLedgerRange = (filter: LedgerDateFilter, from: string, to: string): string => {
  if (filter === 'Others') {
    return `Date Range: ${from ? formatConfirmationDate(from) : 'Start'} to ${to ? formatConfirmationDate(to) : 'End'}`;
  }
  if (filter === 'All Time') return 'All Time';
  const range = getLedgerDateRange(filter, from, to);
  return range ? `${filter}: ${formatConfirmationDate(range.from)} to ${formatConfirmationDate(range.to)}` : filter;
};

const formatLedgerTitleFilter = (filter: LedgerDateFilter, from: string, to: string): string =>
  filter === 'Others' ? formatLedgerRange(filter, from, to) : `Filter ${formatLedgerRange(filter, from, to)}`;

const CuttingsPageContent: React.FC<CuttingsPageProps> = () => {
  const { 
    cutters, 
    cuttingTransactions, 
    orders, 
    products, 
    addCutter, 
    updateCutter,
    setCutterActive,
    deleteCutter, 
    saveCuttingTransaction, 
    cuttingEntries = [],
    articlesMaster,
    createArticleMaster,
    createCustomerOrder,
    updateCuttingEntry,
    deleteCuttingEntry,
    updateCuttingReturn,
    deleteCuttingReturn,
    returnCutting,
    showToast,
    getCuttingLedgerByCutter
  } = useFactory();

  // Selected Option at top level: Cutting Man | Cutting Maker | Product
  const [selectedCategory, setSelectedCategory] = useState<CutterCategory>('cutting_man');

  // Active cutter selected for ledger view (Step B)
  const [activeCutterId, setActiveCutterId] = useState<string | null>(null);

  // Search filter
  const [searchQuery, setSearchQuery] = useState('');
  const ledgerTableScrollRef = useDragToScroll<HTMLDivElement>();

  // Add Cutter Modal State
  const [isAddCutterOpen, setIsAddCutterOpen] = useState(false);
  const [newCutterName, setNewCutterName] = useState('');
  const [newCutterKhataName, setNewCutterKhataName] = useState('');
  const [newCutterPhone, setNewCutterPhone] = useState('');
  const [newCutterRate, setNewCutterRate] = useState('');
  const [editingCutter, setEditingCutter] = useState<Cutter | null>(null);
  const [cutterFilter, setCutterFilter] = useState<'all' | 'active' | 'deactive'>('all');
  const [cutterDeleteTarget, setCutterDeleteTarget] = useState<Cutter | null>(null);
  const [deleteKhataData, setDeleteKhataData] = useState(false);
  const [cutterStatusTarget, setCutterStatusTarget] = useState<Cutter | null>(null);
  const [isSavingCutter, setIsSavingCutter] = useState(false);

  // Transaction Modal State (Give / Receive)
  const [txModalType, setTxModalType] = useState<'GIVE' | 'RECEIVE' | null>(null);
  
  // Field Sequence strictly as requested:
  // 1. Date
  const [formDate, setFormDate] = useState(new Date().toISOString().split('T')[0]);
  // Primary pairs quantity in the size/rate section
  const [formQty, setFormQty] = useState('');
  const [formCustomerName, setFormCustomerName] = useState('');
  const [formSize, setFormSize] = useState('');
  const [formAverage, setFormAverage] = useState('');
  const [formRate, setFormRate] = useState('');
  // 3. Free-text article name
  const [formArticle, setFormArticle] = useState('');
  // 4. Order (Filtered dynamically to show only orders containing selected Article)
  const [formOrderId, setFormOrderId] = useState('');
  // 6. Bill No
  const [formBillNo, setFormBillNo] = useState('');
  // 7. Factory / Notes (e.g. "Shoaib Factory")
  const [formFactoryNotes, setFormFactoryNotes] = useState('');
  
  // Delivery choice for Receive Cutting: Checkboxes
  // 1. Add to Stock - Stock Management (independent)
  // 2. Add to Existing Order (mutually exclusive with 3)
  // 3. Add to New Order (mutually exclusive with 2)
  const [deliveryToStock, setDeliveryToStock] = useState(true);
  const [deliveryToExistingOrder, setDeliveryToExistingOrder] = useState(false);
  const [deliveryToNewOrder, setDeliveryToNewOrder] = useState(false);
  const [newOrderCustomerName, setNewOrderCustomerName] = useState('');

  // Size rows for free-text typing & multiple size matrix
  const [cuttingSizeRows, setCuttingSizeRows] = useState<Array<{ id: string; size: string; qty: string; average: string; rate: string }>>([
    { id: '1', size: '', qty: '', average: '', rate: '' }
  ]);

  const [showNewArticleForm, setShowNewArticleForm] = useState(false);
  const [newArticleForm, setNewArticleForm] = useState({ articleName: '', sizeName: '', pairs: '' });

  const [isSubmittingTx, setIsSubmittingTx] = useState(false);
  const [editingEntry, setEditingEntry] = useState<CuttingEntry | null>(null);
  const [editForm, setEditForm] = useState({ date: '', customerName: '', article: '', size: '', average: '', remarks: '', pairs: '', rate: '', billNo: '' });
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [deletingEntry, setDeletingEntry] = useState<CuttingEntry | null>(null);
  const [isDeletingEntry, setIsDeletingEntry] = useState(false);
  const [inlineEdit, setInlineEdit] = useState<{ entry: CuttingEntry; field: 'pairs' | 'rate'; value: string } | null>(null);
  const [returnTarget, setReturnTarget] = useState<CuttingEntry | null>(null);
  const [returnForm, setReturnForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    quantity: '',
    reason: 'Damaged' as 'Damaged' | 'Wrong Size' | 'Quality'
  });
  const [isSavingReturn, setIsSavingReturn] = useState(false);
  // Contractor Return Cutting Modal State
  const [isReturnCuttingModalOpen, setIsReturnCuttingModalOpen] = useState(false);
  const [returnCuttingArticle, setReturnCuttingArticle] = useState('');
  const [returnCuttingDate, setReturnCuttingDate] = useState(new Date().toISOString().slice(0, 10));
  const [returnCuttingPairs, setReturnCuttingPairs] = useState('');
  const [returnCuttingReason, setReturnCuttingReason] = useState('Damaged');
  const [returnCuttingNotes, setReturnCuttingNotes] = useState('');
  const [ledgerSearch, setLedgerSearch] = useState('');
  const [pdfExportMode, setPdfExportMode] = useState<'date' | null>(null);
  const [pdfFromDate, setPdfFromDate] = useState('');
  const [pdfToDate, setPdfToDate] = useState('');
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [ledgerDateFilter, setLedgerDateFilter] = useState<LedgerDateFilter>('All Time');
  const [filterFromDate, setFilterFromDate] = useState('');
  const [filterToDate, setFilterToDate] = useState('');
  const [ledgerPayments, setLedgerPayments] = useState<NasimLedgerPayment[]>([]);
  const [paymentModalType, setPaymentModalType] = useState<'cash_in' | 'cash_out' | null>(null);
  const [paymentForm, setPaymentForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    amount: '',
    paymentMethod: 'Cash' as 'Cash' | 'Easypaisa' | 'JazzCash' | 'Bank Transfer',
    billNo: '',
    allocationMode: 'single' as 'single' | 'split' | 'unallocated',
    lotId: '',
    splitRows: [] as { lotId: string; amount: string }[]
  });
  const [isSavingPayment, setIsSavingPayment] = useState(false);
  const savingPaymentRef = useRef(false);
  const [editingPayment, setEditingPayment] = useState<NasimLedgerPayment | null>(null);
  const [editPaymentForm, setEditPaymentForm] = useState({
    date: '',
    amount: '',
    paymentMethod: 'Cash' as 'Cash' | 'Easypaisa' | 'JazzCash' | 'Bank Transfer',
    billNo: ''
  });
  const [isSavingEditPayment, setIsSavingEditPayment] = useState(false);
  const [paymentToDelete, setPaymentToDelete] = useState<NasimLedgerPayment | null>(null);
  const [isDeletingPayment, setIsDeletingPayment] = useState(false);
  const [articleSearch, setArticleSearch] = useState('');
  const [isArticlePickerOpen, setIsArticlePickerOpen] = useState(false);
  const articlePickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isArticlePickerOpen) return;
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (event.target instanceof Node && !articlePickerRef.current?.contains(event.target)) {
        setIsArticlePickerOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsArticlePickerOpen(false);
    };
    document.addEventListener('mousedown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [isArticlePickerOpen]);

  // Global ESC key listener to dismiss any active modal and prevent screen freeze
  useEffect(() => {
    const handleGlobalEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (paymentToDelete) setPaymentToDelete(null);
        else if (paymentModalType) setPaymentModalType(null);
        else if (editingPayment) setEditingPayment(null);
        else if (isReturnCuttingModalOpen) setIsReturnCuttingModalOpen(false);
        else if (returnTarget) setReturnTarget(null);
        else if (editingEntry) setEditingEntry(null);
        else if (deletingEntry) setDeletingEntry(null);
        else if (cutterDeleteTarget) setCutterDeleteTarget(null);
        else if (cutterStatusTarget) setCutterStatusTarget(null);
        else if (isAddCutterOpen) setIsAddCutterOpen(false);
        else if (txModalType) handleCloseTxModal();
        else if (pdfExportMode) setPdfExportMode(null);
      }
    };
    window.addEventListener('keydown', handleGlobalEscape);
    return () => window.removeEventListener('keydown', handleGlobalEscape);
  }, [
    paymentToDelete,
    paymentModalType,
    editingPayment,
    isReturnCuttingModalOpen,
    returnTarget,
    editingEntry,
    deletingEntry,
    cutterDeleteTarget,
    cutterStatusTarget,
    isAddCutterOpen,
    txModalType,
    pdfExportMode
  ]);

  // Filter cutters for selected category
  const categoryCutters = useMemo(() => {
    return cutters.filter(c => c.cutterType === selectedCategory);
  }, [cutters, selectedCategory]);

  const filteredCutters = useMemo(() => {
    const q = searchQuery.toLowerCase();
    return categoryCutters.filter(c => {
      const active = c.isActive !== false;
      const matchesStatus = cutterFilter === 'all' || (cutterFilter === 'active' ? active : !active);
      const matchesSearch = !q || c.name.toLowerCase().includes(q) ||
        (c.phone && c.phone.toLowerCase().includes(q)) ||
        (c.khataName && c.khataName.toLowerCase().includes(q));
      return matchesStatus && matchesSearch;
    });
  }, [categoryCutters, searchQuery, cutterFilter]);

  // Active cutter details
  const activeCutter = cutters.find(c => c.id === activeCutterId);

  // Filter transactions for active cutter
  const activeCutterTransactions = useMemo(() => {
    if (!activeCutterId) return [];
    return cuttingTransactions.filter(t => t.cutterId === activeCutterId);
  }, [cuttingTransactions, activeCutterId]);
  const activeCutterEntries = useMemo(() => {
    if (!activeCutterId) return [];
    try {
      const data = getCuttingLedgerByCutter(activeCutterId);
      console.log('Cutting ledger data for cutter:', activeCutterId, data);
      return data || [];
    } catch (err) {
      console.error('Error fetching cutting ledger in CuttingsPage:', err);
      return [];
    }
  }, [getCuttingLedgerByCutter, activeCutterId, cuttingEntries, cuttingTransactions]);

  // Contractor name helper to match variations (NAEM, NAIM, NAEEM, NASIM)
  const isSameContractor = (a: string, b: string): boolean => {
    const normA = (a || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
    const normB = (b || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!normA || !normB) return false;
    if (normA === normB) return true;
    const isNaemA = normA === 'naem' || normA === 'naim' || normA === 'naeem' || normA === 'nasim';
    const isNaemB = normB === 'naem' || normB === 'naim' || normB === 'naeem' || normB === 'nasim';
    return isNaemA && isNaemB;
  };

  useEffect(() => {
    if (!db || !activeCutterId) {
      setLedgerPayments([]);
      return;
    }
    return onSnapshot(collection(db, 'nasim_ledger_payments'), snapshot => {
      const entries = snapshot.docs.flatMap(document => {
        const data = document.data();
        const matchesId = data.cutterId === activeCutterId || data.cutterId === activeCutter?.id;
        const matchesName = activeCutter?.name && data.cutterName && (
          data.cutterName.trim().toLowerCase() === activeCutter.name.trim().toLowerCase() ||
          isSameContractor(String(data.cutterName || ''), activeCutter.name)
        );
        const matchesContractor = activeCutter?.name && data.contractor && (
          data.contractor.trim().toLowerCase() === activeCutter.name.trim().toLowerCase() ||
          isSameContractor(String(data.contractor || ''), activeCutter.name)
        );
        if (!matchesId && !matchesName && !matchesContractor) return [];

        const method = ['Cash', 'Easypaisa', 'JazzCash', 'Bank Transfer'].includes(data.paymentMethod)
          ? data.paymentMethod as LedgerPaymentMethod
          : 'Cash';
        const createdAt = data.createdAt as { toDate?: () => Date; toMillis?: () => number } | string | undefined;
        return [{
          id: document.id,
          cutterId: String(data.cutterId || activeCutterId),
          cutterName: String(data.cutterName || activeCutter?.name || ''),
          date: String(data.date || ''),
          amount: Number(data.amount) || 0,
          paymentMethod: method,
          billNo: String(data.billNo || ''),
          lotId: data.lotId ? String(data.lotId) : undefined,
          lotNo: data.lotNo ? String(data.lotNo) : undefined,
          splitAllocations: Array.isArray(data.splitAllocations) ? data.splitAllocations : undefined,
          type: data.type === 'cash_in' ? 'cash_in' as const : 'cash_out' as const,
          createdAt: typeof createdAt === 'string'
            ? createdAt
            : createdAt?.toDate?.().toISOString() || ''
        }];
      });
      const createdAtMillis = (entry: NasimLedgerPayment): number => {
        const value = Date.parse(entry.createdAt);
        return Number.isNaN(value) ? 0 : value;
      };
      const duplicateGroups = new Map<string, NasimLedgerPayment[]>();
      entries.forEach(entry => {
        const key = JSON.stringify([entry.cutterId, entry.date, entry.type, entry.billNo.trim().toLocaleLowerCase(), entry.amount]);
        duplicateGroups.set(key, [...(duplicateGroups.get(key) || []), entry]);
      });
      const distinctEntries: NasimLedgerPayment[] = [];
      const duplicateIds: string[] = [];
      duplicateGroups.forEach(group => {
        group.sort((a, b) => createdAtMillis(b) - createdAtMillis(a));
        const kept: NasimLedgerPayment[] = [];
        group.forEach(entry => {
          const entryTime = createdAtMillis(entry);
          const latestMatch = kept.find(existing => {
            const existingTime = createdAtMillis(existing);
            return entryTime > 0 && existingTime > 0 && existingTime - entryTime <= 5000;
          });
          if (latestMatch) duplicateIds.push(entry.id);
          else kept.push(entry);
        });
        distinctEntries.push(...kept);
      });
      distinctEntries.sort((a, b) => safeStringCompare(b.date, a.date) || safeStringCompare(b.createdAt, a.createdAt));
      setLedgerPayments(distinctEntries);
      duplicateIds.forEach(id => {
        void deleteDoc(doc(db, 'nasim_ledger_payments', id)).catch(error => {
          console.error(`Unable to remove duplicate ledger payment ${id}:`, error);
        });
      });
    }, error => console.error('Unable to load Nasim ledger payments:', error));
  }, [activeCutterId, activeCutter?.name, activeCutter?.id]);

  const dateFilteredEntries = useMemo(() => {
    const range = getLedgerDateRange(ledgerDateFilter, filterFromDate, filterToDate);
    return activeCutterEntries.filter(entry => {
      return isDateInRange(entry.date || '', range);
    });
  }, [activeCutterEntries, ledgerDateFilter, filterFromDate, filterToDate]);

  const dateFilteredPayments = useMemo(() => {
    const range = getLedgerDateRange(ledgerDateFilter, filterFromDate, filterToDate);
    return ledgerPayments.filter(payment => {
      return isDateInRange(payment.date || '', range);
    });
  }, [ledgerPayments, ledgerDateFilter, filterFromDate, filterToDate]);

  const cuttingEntriesBillsTotal = useMemo(() => {
    return dateFilteredEntries
      .filter(entry => entry.type !== 'RETURN')
      .reduce((sum, entry) => sum + (Number(entry.pairs) || 0) * (Number(entry.rate) || 0), 0);
  }, [dateFilteredEntries]);

  const cuttingReturnsTotal = useMemo(() => {
    return dateFilteredEntries
      .filter(entry => entry.type === 'RETURN')
      .reduce((sum, entry) => sum + Math.abs(Number(entry.pairs) || 0) * (Number(entry.rate) || 0), 0);
  }, [dateFilteredEntries]);

  // Cash Out: Payments made to contractor (Red Minus, reduces pending balance)
  const totalCashOut = useMemo(() => {
    return dateFilteredPayments
      .filter(payment => payment.type === 'cash_out')
      .reduce((sum, payment) => sum + (Number(payment.amount) || 0), 0);
  }, [dateFilteredPayments]);

  // Cash In: Adjustments or cash received from contractor
  const totalCashIn = useMemo(() => {
    return dateFilteredPayments
      .filter(payment => payment.type === 'cash_in')
      .reduce((sum, payment) => sum + (Number(payment.amount) || 0), 0);
  }, [dateFilteredPayments]);

  // Lot-wise paid amounts calculation from payments
  const lotPaidMap = useMemo(() => {
    const map: Record<string, number> = {};
    ledgerPayments.forEach(p => {
      const sign = p.type === 'cash_out' ? 1 : -1;
      if (p.lotId) {
        map[p.lotId] = (map[p.lotId] || 0) + Number(p.amount) * sign;
      }
      if (p.splitAllocations && p.splitAllocations.length > 0) {
        p.splitAllocations.forEach(split => {
          if (split.lotId) {
            map[split.lotId] = (map[split.lotId] || 0) + Number(split.amount) * sign;
          }
        });
      }
    });
    return map;
  }, [ledgerPayments]);

  // Total Paid to Contractor:
  // Step 2: User ne contractor ko payment ki (Cash Out): Rs.10,000
  // Step 4: Formula: PENDING BALANCE = SUM(FULL BILL of all cutting in date range) - SUM(Cash Paid/Cash Out in date range) - SUM(Return Cutting)
  const totalPaid = useMemo(() => {
    if (totalCashOut > 0) {
      return totalCashOut - totalCashIn;
    }
    return totalCashIn;
  }, [totalCashOut, totalCashIn]);

  // Formula: PENDING BALANCE = SUM(FULL BILL) - SUM(Cash Paid) - SUM(Return Cutting)
  const totalCuttingAmount = cuttingEntriesBillsTotal - cuttingReturnsTotal;
  const remainingBalance = cuttingEntriesBillsTotal - totalPaid - cuttingReturnsTotal;
  const extraPaid = Math.max(0, -remainingBalance);
  const allArticleOptions = useMemo(() => {
    const options = new Map<string, { id: string; articleName: string; articleCode?: string }>();
    articlesMaster.forEach(article => {
      const key = article.articleName.trim().toLocaleLowerCase();
      if (key) options.set(key, { id: article.id, articleName: article.articleName.trim(), articleCode: article.articleCode });
    });
    const addName = (value?: string) => {
      const articleName = value?.trim();
      if (!articleName) return;
      const key = articleName.toLocaleLowerCase();
      if (!options.has(key)) options.set(key, { id: `history-${key}`, articleName });
    };
    orders.forEach(order => {
      addName(order.article);
      order.items.forEach(item => {
        addName(item.article);
        addName(item.title);
        addName(item.gloveType);
      });
    });
    cuttingEntries.forEach(entry => {
      addName(entry.articleTitle);
      addName(entry.article);
    });
    cuttingTransactions.forEach(entry => {
      addName(entry.articleTitle);
      addName(entry.article);
    });
    return [...options.values()].sort((a, b) => a.articleName.localeCompare(b.articleName));
  }, [articlesMaster, orders, cuttingEntries, cuttingTransactions]);
  const filteredArticleOptions = useMemo(() => {
    const query = articleSearch.trim().toLocaleLowerCase();
    return allArticleOptions.filter(article =>
      !query ||
      article.articleName.toLocaleLowerCase().includes(query) ||
      (article.articleCode || '').toLocaleLowerCase().includes(query)
    );
  }, [allArticleOptions, articleSearch]);

  const visibleLedgerEntries = useMemo(() => {
    const query = ledgerSearch.trim().toLowerCase();
    return query
      ? dateFilteredEntries.filter(entry => (entry.customerName || '').toLowerCase().includes(query))
      : dateFilteredEntries;
  }, [dateFilteredEntries, ledgerSearch]);

  // Unified ledger rows matching the on-screen table: combines cutting and cashbook rows
  // Strictly sorted chronologically: date ASC, createdAt ASC, id ASC
  // Newly added cuttings or payments always append at the bottom
  const unifiedLedgerRows = useMemo(() => {
    const cuttingRows = visibleLedgerEntries.map(entry => {
      const isReturn = entry.type === 'RETURN';
      const pairs = Number(entry.pairs ?? entry.totalQty) || 0;
      const rate = Number(entry.rate) || 0;
      const amount = isReturn ? -Math.abs(pairs * rate) : Math.abs(pairs * rate);
      return {
        id: entry.id,
        kind: 'cutting' as const,
        date: entry.date,
        createdAt: entry.createdAt,
        customer: entry.customerName || 'PRO4',
        article: entry.articleTitle || entry.article || '-',
        size: entry.sizeName || entry.size || '-',
        pairs,
        average: entry.average || '-',
        rate: entry.rate,
        amount,
        type: entry.type,
        remarks: entry.remarks,
        rawEntry: entry
      };
    });

    const paymentRows = dateFilteredPayments.map(payment => {
      const isCashOut = payment.type === 'cash_out';
      const amount = isCashOut ? -payment.amount : payment.amount;
      return {
        id: payment.id,
        kind: 'payment' as const,
        date: payment.date,
        createdAt: payment.createdAt,
        customer: isCashOut ? 'Cash Paid (Out)' : 'Cash In Adjustment',
        article: isCashOut
          ? `Paid to ${activeCutter?.name || 'Contractor'}${payment.billNo ? ` (Bill #${payment.billNo})` : ''}`
          : `Cash In from ${activeCutter?.name || 'Contractor'}${payment.billNo ? ` (Bill #${payment.billNo})` : ''}`,
        size: '—',
        pairs: '—' as string | number,
        average: '—',
        rate: '—' as string | number,
        amount,
        type: payment.type,
        paymentType: payment.type,
        billNo: payment.billNo,
        method: payment.paymentMethod,
        rawPayment: payment
      };
    });

    // Chronological sorting: date ASC, createdAt ASC, id ASC
    const combined = [...cuttingRows, ...paymentRows];
    combined.sort((a, b) => {
      const cmpDate = safeStringCompare(a.date, b.date);
      if (cmpDate !== 0) return cmpDate;
      const cmpCreated = safeStringCompare(a.createdAt, b.createdAt);
      if (cmpCreated !== 0) return cmpCreated;
      return safeStringCompare(a.id, b.id);
    });

    let runningBalance = 0;
    return combined.map(row => {
      runningBalance += row.amount;
      return {
        ...row,
        runningBal: runningBalance
      };
    });
  }, [visibleLedgerEntries, dateFilteredPayments, activeCutter?.name]);

  // Dynamically filter customer orders that contain the selected Article
  const filteredOrdersForArticle = useMemo(() => {
    if (!formArticle) return [];
    return orders.filter(o =>
      o.article?.toLowerCase() === formArticle.toLowerCase() ||
      o.items.some(i =>
        (i.article?.toLowerCase() === formArticle.toLowerCase()) ||
        (i.title?.toLowerCase() === formArticle.toLowerCase()) || 
        (i.gloveType?.toLowerCase() === formArticle.toLowerCase())
      )
    );
  }, [orders, formArticle]);

  // Handle open transaction modal
  const handleOpenTxModal = (type: 'GIVE' | 'RECEIVE') => {
    if (activeCutter?.isActive === false) {
      showToast('Inactive cutters cannot receive new cutting entries.', 'error');
      return;
    }
    setTxModalType(type);
    setFormDate(new Date().toISOString().split('T')[0]);
    setFormQty('');
    setFormCustomerName('');
    setFormSize('');
    setFormAverage('');
    setFormRate(activeCutter?.perPairRate ? String(activeCutter.perPairRate) : '');
    setFormArticle('');
    setFormOrderId('');
    setFormCustomerName('');
    setFormBillNo('');
    setFormFactoryNotes(activeCutter?.name ? `${activeCutter.name} Unit` : '');
    setDeliveryToStock(true);
    setDeliveryToExistingOrder(false);
    setDeliveryToNewOrder(false);
    setNewOrderCustomerName('');
    setCuttingSizeRows([
      { id: '1', size: '', qty: '', average: '', rate: activeCutter?.perPairRate ? String(activeCutter.perPairRate) : '' }
    ]);
    setShowNewArticleForm(false);
    setNewArticleForm({ articleName: '', sizeName: '', pairs: '' });
    setArticleSearch('');
    setIsArticlePickerOpen(false);
  };

  const handleArticleSelection = (articleName: string) => {
    if (articleName === '__other__') {
      setFormArticle('');
      setArticleSearch('');
      setIsArticlePickerOpen(false);
      setShowNewArticleForm(true);
      setNewArticleForm({ articleName: '', sizeName: '', pairs: '' });
      return;
    }
    setFormArticle(articleName);
    setArticleSearch('');
    setIsArticlePickerOpen(false);
    setShowNewArticleForm(false);
    const article = articlesMaster.find(item => item.articleName === articleName);
    const size = article?.sizes[0];
    if (size) {
      setFormSize(size.sizeName);
      if (size.pairs > 0) setFormQty(String(size.pairs));
    }
  };

  const handleSaveNewArticle = async () => {
    const pairs = Number(newArticleForm.pairs);
    if (!newArticleForm.articleName.trim() || !newArticleForm.sizeName.trim() || !Number.isFinite(pairs) || pairs < 0) {
      showToast('Enter an article number, size name, and valid size quantity.', 'error');
      return;
    }
    try {
      const article = await createArticleMaster({
        articleName: newArticleForm.articleName.trim(),
        sizes: [{ sizeName: newArticleForm.sizeName.trim(), pairs }]
      });
      setFormArticle(article.articleName);
      setFormSize(article.sizes[0].sizeName);
      setFormQty(String(article.sizes[0].pairs));
      setShowNewArticleForm(false);
      showToast(`${article.articleName} added to the article list.`);
    } catch (error) {
      console.error('Unable to add article to master:', error);
      showToast(error instanceof Error ? error.message : 'The article could not be saved.', 'error');
    }
  };

  // Close transaction modal
  const handleCloseTxModal = () => {
    setTxModalType(null);
  };

  // Handle transaction submission (Dual Entry Batched Write)
  const handleSubmitTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeCutter || !txModalType) return;

    const parsedQty = safeParse(formQty);
    const parsedAverage = safeParse(formAverage);
    const parsedRate = safeParse(formRate);
    if (!formDate) {
      showToast('Enter a date.', 'error');
      return;
    }
    if (!Number.isFinite(parsedQty) || parsedQty <= 0) {
      showToast('Enter a valid pair quantity.', 'error');
      return;
    }

    // Article: support free-text and auto-save
    const finalArticle = (formArticle.trim() || articleSearch.trim());
    if (!finalArticle) {
      showToast('Enter an article name.', 'error');
      return;
    }

    if (txModalType === 'RECEIVE') {
      if (!deliveryToStock && !deliveryToExistingOrder && !deliveryToNewOrder) {
        showToast('Please select at least one destination: Stock / Order / New Order', 'error');
        return;
      }
      if (deliveryToExistingOrder && !formOrderId) {
        showToast('Select a customer order (PO).', 'error');
        return;
      }
      if (deliveryToNewOrder && !newOrderCustomerName.trim()) {
        showToast('Please enter customer/company name for the new order.', 'error');
        return;
      }
    }

    // Collect size rows
    const rowsToProcess: Array<{ size: string; qty: number; average: string; rate: number }> = [];
    if (txModalType === 'RECEIVE') {
      cuttingSizeRows.forEach(r => {
        const q = safeParse(r.qty);
        if (q > 0 || r.size.trim()) {
          const rRate = safeParse(r.rate) > 0 ? safeParse(r.rate) : (safeParse(formRate) > 0 ? safeParse(formRate) : (activeCutter.perPairRate || 0));
          rowsToProcess.push({
            size: r.size.trim() || 'Standard',
            qty: q,
            average: r.average.trim() || formAverage.trim(),
            rate: rRate
          });
        }
      });
    }

    if (rowsToProcess.length === 0) {
      const fallbackQty = safeParse(formQty);
      if (fallbackQty > 0) {
        rowsToProcess.push({
          size: formSize.trim() || 'Standard',
          qty: fallbackQty,
          average: formAverage.trim(),
          rate: safeParse(formRate) > 0 ? safeParse(formRate) : (activeCutter.perPairRate || 0)
        });
      }
    }

    if (rowsToProcess.length === 0 || rowsToProcess.every(r => r.qty <= 0)) {
      showToast('Enter a valid pair quantity.', 'error');
      return;
    }

    setIsSubmittingTx(true);
    try {
      // Auto-save new article in master catalog if it doesn't already exist
      if (createArticleMaster) {
        const existsInMaster = articlesMaster.some(
          a => a.articleName.trim().toLowerCase() === finalArticle.toLowerCase()
        );
        if (!existsInMaster) {
          try {
            await createArticleMaster({
              articleName: finalArticle,
              sizes: rowsToProcess.map(r => ({ sizeName: r.size, pairs: r.qty }))
            });
            console.log(`Auto-saved new article to master catalog: "${finalArticle}"`);
          } catch (autoSaveErr) {
            console.warn('Auto-save article warning:', autoSaveErr);
          }
        }
      }

      // Check destinations
      let effectiveOrderId: string | undefined = undefined;
      let targetOrder = deliveryToExistingOrder ? orders.find(o => o.id === formOrderId) : undefined;

      if (txModalType === 'RECEIVE' && deliveryToNewOrder) {
        const totalOrderPairs = rowsToProcess.reduce((sum, r) => sum + r.qty, 0);
        const newOrder = await createCustomerOrder({
          customerName: newOrderCustomerName.trim(),
          orderDate: formDate,
          deliveryDate: formDate,
          items: [{
            title: finalArticle,
            gloveType: finalArticle,
            customSizes: rowsToProcess.map(r => ({ size: r.size, quantity: r.qty })),
            totalPairs: totalOrderPairs,
            sizes: { small: 0, medium: 0, large: 0, xl: 0, xxl: 0 }
          }],
          notes: formFactoryNotes.trim() || `Created from Cutting Receive (${activeCutter.name})`
        });
        if (newOrder) {
          effectiveOrderId = newOrder.id;
          targetOrder = newOrder;
        }
      } else if (txModalType === 'RECEIVE' && deliveryToExistingOrder) {
        effectiveOrderId = formOrderId || undefined;
      } else if (txModalType === 'GIVE') {
        effectiveOrderId = formOrderId || undefined;
        targetOrder = orders.find(o => o.id === formOrderId);
      }

      for (const r of rowsToProcess) {
        const totalBalance = r.qty * r.rate;

        let effectiveCustomerName = 'Stock Management';
        let effectiveCustomerOrder = 'Stock Management - Direct to Stock';

        if (effectiveOrderId && targetOrder) {
          effectiveCustomerName = targetOrder.customerName;
          effectiveCustomerOrder = `${targetOrder.customerName} - ${targetOrder.orderNo}`;
        } else if (deliveryToExistingOrder) {
          effectiveCustomerName = formCustomerName.trim() || 'Customer Order';
          effectiveCustomerOrder = formCustomerName.trim() || 'Customer Order';
        } else if (txModalType === 'GIVE') {
          effectiveCustomerName = targetOrder?.customerName || formCustomerName.trim() || 'Direct Cutting';
          effectiveCustomerOrder = targetOrder ? `${targetOrder.customerName} - ${targetOrder.orderNo}` : 'Direct Cutting';
        }

        await saveCuttingTransaction({
          cutterId: activeCutter.id,
          cutterName: activeCutter.name,
          cutterType: activeCutter.cutterType,
          type: txModalType,
          date: formDate,
          qty: r.qty,
          totalQty: r.qty,
          rate: r.rate,
          article: finalArticle,
          articleTitle: finalArticle,
          orderId: effectiveOrderId,
          orderNo: targetOrder?.orderNo || undefined,
          customerName: effectiveCustomerName,
          size: r.size,
          sizeName: r.size,
          average: r.average,
          totalBalance,
          customerOrder: effectiveCustomerOrder,
          billNo: formBillNo.trim() || undefined,
          factoryName: formFactoryNotes.trim() || undefined,
          addToStock: txModalType === 'RECEIVE' ? deliveryToStock : false,
          notes: formFactoryNotes.trim() || undefined
        });
      }

      setFormQty('');
      setFormArticle('');
      setFormSize('');
      setFormAverage('');
      setFormRate('');
      setFormCustomerName('');
      setFormOrderId('');
      setFormBillNo('');
      setFormFactoryNotes('');
      setArticleSearch('');
      setNewOrderCustomerName('');
      setCuttingSizeRows([{ id: '1', size: '', qty: '', average: '', rate: '' }]);
      handleCloseTxModal();
      showToast(
        deliveryToStock 
          ? 'Cutting received and updated in Stock Management.' 
          : 'Cutting entry saved successfully.'
      );
    } catch (err) {
      console.error('Error saving transaction:', err);
      showToast(err instanceof Error ? err.message : 'The cutting entry could not be saved. Please try again.', 'error');
    } finally {
      setIsSubmittingTx(false);
    }
  };

  const openEditEntry = (entry: CuttingEntry) => {
    setEditingEntry(entry);
    setEditForm({
      date: entry.date || '',
      customerName: entry.customerName || '',
      article: entry.articleTitle || entry.article || '',
      size: entry.sizeName || entry.size || '',
      average: entry.average || '',
      remarks: entry.remarks || '',
      pairs: String(Math.abs(entry.pairs ?? (entry as any).totalQty ?? 0)),
      rate: String(entry.rate ?? ''),
      billNo: entry.billNo || ''
    });
  };

  useEffect(() => {
    if (editingEntry) {
      setEditForm({
        date: editingEntry.date || '',
        customerName: editingEntry.customerName || '',
        article: editingEntry.articleTitle || editingEntry.article || '',
        size: editingEntry.sizeName || editingEntry.size || '',
        average: editingEntry.average || '',
        remarks: editingEntry.remarks || '',
        pairs: String(Math.abs(editingEntry.pairs ?? (editingEntry as any).totalQty ?? 0)),
        rate: String(editingEntry.rate ?? ''),
        billNo: editingEntry.billNo || ''
      });
    }
  }, [editingEntry]);

  const handleUpdateEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingEntry) return;
    const pairs = Number(editForm.pairs);
    const rate = Number(editForm.rate);
    if (!editForm.date || !editForm.customerName.trim() || !editForm.article.trim() || !Number.isFinite(pairs) || pairs <= 0 || !Number.isFinite(rate) || rate < 0) {
      showToast('Date, customer, article, valid pair quantity, and rate are required.', 'error');
      return;
    }
    setIsSavingEdit(true);
    try {
      const updates = {
        date: editForm.date,
        customerName: editForm.customerName.trim(),
        article: editForm.article.trim(),
        size: editForm.size.trim(),
        average: editForm.average.trim(),
        remarks: editForm.remarks.trim(),
        pairs,
        rate,
        billNo: editForm.billNo.trim()
      };
      if (editingEntry.type === 'RETURN') {
        await updateCuttingReturn(editingEntry.id, {
          date: updates.date,
          remarks: updates.remarks,
          pairs: updates.pairs,
          rate: updates.rate
        });
      } else {
        await updateCuttingEntry(editingEntry.id, updates);
      }
      setEditingEntry(null);
      showToast('Cutting Entry Updated Successfully.');
    } catch (err) {
      console.error('Error updating cutting entry:', err);
      showToast('The cutting entry could not be updated. Please try again.', 'error');
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleDeleteEntry = async () => {
    if (!deletingEntry) return;
    setIsDeletingEntry(true);
    try {
      if (deletingEntry.type === 'RETURN') await deleteCuttingReturn(deletingEntry.id);
      else await deleteCuttingEntry(deletingEntry.id);
      setDeletingEntry(null);
      showToast('Cutting entry deleted successfully.');
    } catch (err) {
      console.error('Error deleting cutting entry:', err);
      showToast('The cutting entry could not be deleted. Please try again.', 'error');
    } finally {
      setIsDeletingEntry(false);
    }
  };

  const openReturnModal = (entry: CuttingEntry) => {
    const alreadyReturned = activeCutterEntries
      .filter(item => item.type === 'RETURN' && item.returnReferenceId === entry.id)
      .reduce((sum, item) => sum + Math.abs(item.pairs), 0);
    if (alreadyReturned >= entry.pairs) {
      showToast('All pairs from this cutting entry have already been returned.', 'error');
      return;
    }
    setReturnTarget(entry);
    setReturnForm({
      date: new Date().toISOString().slice(0, 10),
      quantity: '',
      reason: 'Damaged'
    });
  };

  const handleSaveReturn = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!returnTarget || isSavingReturn) return;
    const quantity = Number(returnForm.quantity);
    if (!returnForm.date || !Number.isInteger(quantity) || quantity <= 0) {
      showToast('Enter a valid return date and whole-number quantity.', 'error');
      return;
    }
    setIsSavingReturn(true);
    try {
      await returnCutting({
        originalEntryId: returnTarget.id,
        quantity,
        reason: returnForm.reason,
        date: returnForm.date
      });
      setReturnTarget(null);
    } catch (error) {
      console.error('Error recording cutting return:', error);
      showToast(error instanceof Error ? error.message : 'The cutting return could not be saved.', 'error');
    } finally {
      setIsSavingReturn(false);
    }
  };

  // Contractor return article list (P600, P601, P802 etc)
  const contractorArticles = useMemo(() => {
    if (!activeCutter) return [];
    const fromLedger = cuttingEntries
      .filter(e => e.cutterId === activeCutter.id && e.type === 'RECEIVE')
      .map(e => (e.articleTitle || e.article).trim())
      .filter(Boolean);
    const set = new Set(fromLedger);
    if (set.size === 0) {
      allArticleOptions.forEach(opt => set.add(opt.articleName));
    }
    return Array.from(set);
  }, [activeCutter, cuttingEntries, allArticleOptions]);

  // Entries of this cutter for this article
  const returnEligibleEntries = useMemo(() => {
    if (!activeCutter || !returnCuttingArticle) return [];
    const target = returnCuttingArticle.trim().toLowerCase();
    return cuttingEntries.filter(
      e => e.cutterId === activeCutter.id && 
           e.type === 'RECEIVE' &&
           (e.articleTitle || e.article).trim().toLowerCase() === target
    );
  }, [activeCutter, returnCuttingArticle, cuttingEntries]);

  // Target original entry matched by date
  const matchedReturnEntry = useMemo(() => {
    if (returnEligibleEntries.length === 0) return null;
    return returnEligibleEntries.find(e => e.date === returnCuttingDate) || returnEligibleEntries[0];
  }, [returnEligibleEntries, returnCuttingDate]);

  // Rate for auto calculation
  const returnRate = matchedReturnEntry?.rate || 0;

  // Maximum eligible pairs on this entry/date
  const returnMaxPairs = useMemo(() => {
    if (!matchedReturnEntry) return 999999;
    const alreadyReturned = cuttingEntries
      .filter(e => e.type === 'RETURN' && e.returnReferenceId === matchedReturnEntry.id)
      .reduce((sum, e) => sum + Math.abs(e.pairs), 0);
    return Math.max(0, matchedReturnEntry.pairs - alreadyReturned);
  }, [matchedReturnEntry, cuttingEntries]);

  // Return amount auto-calculated: Qty * Rate
  const returnAutoAmount = (Number(returnCuttingPairs) || 0) * returnRate;

  const handleOpenReturnCuttingModal = () => {
    if (!activeCutter) return;
    const cutterReceiveEntries = cuttingEntries.filter(
      e => e.cutterId === activeCutter.id && e.type === 'RECEIVE'
    );
    const distinctArticles = Array.from(
      new Set(cutterReceiveEntries.map(e => (e.articleTitle || e.article).trim()).filter(Boolean))
    );
    const defaultArticle = distinctArticles[0] || (allArticleOptions[0]?.articleName ?? '');
    setReturnCuttingArticle(defaultArticle);
    const articleEntries = cutterReceiveEntries.filter(
      e => (e.articleTitle || e.article).trim().toLowerCase() === defaultArticle.toLowerCase()
    );
    const firstDate = articleEntries[0]?.date || new Date().toISOString().slice(0, 10);
    setReturnCuttingDate(firstDate);
    setReturnCuttingPairs('');
    setReturnCuttingReason('Damaged');
    setReturnCuttingNotes('');
    setIsReturnCuttingModalOpen(true);
  };

  const handleSubmitReturnCutting = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!activeCutter || isSavingReturn) return;
    const qty = Number(returnCuttingPairs);
    if (!returnCuttingArticle.trim()) {
      showToast('Please select an article to return.', 'error');
      return;
    }
    if (!returnCuttingDate) {
      showToast('Please select the return date.', 'error');
      return;
    }
    if (!Number.isInteger(qty) || qty <= 0) {
      showToast('Please enter a valid whole-number quantity to return.', 'error');
      return;
    }
    if (matchedReturnEntry && qty > returnMaxPairs) {
      showToast(`Cannot return more than ${returnMaxPairs} pairs available on ${formatDate(returnCuttingDate)}.`, 'error');
      return;
    }

    setIsSavingReturn(true);
    try {
      if (matchedReturnEntry) {
        await returnCutting({
          originalEntryId: matchedReturnEntry.id,
          quantity: qty,
          reason: returnCuttingReason,
          date: returnCuttingDate,
          remarks: `Return Cutting - ${returnCuttingArticle.trim()} - ${qty} pairs${returnCuttingNotes.trim() ? ` (${returnCuttingNotes.trim()})` : ''}`
        });
      } else {
        await saveCuttingTransaction({
          cutterId: activeCutter.id,
          cutterName: activeCutter.name,
          cutterType: activeCutter.cutterType || 'cutting_maker',
          type: 'RECEIVE',
          date: returnCuttingDate,
          qty: -qty,
          rate: returnRate,
          article: returnCuttingArticle.trim(),
          articleTitle: returnCuttingArticle.trim(),
          remarks: `Return Cutting - ${returnCuttingArticle.trim()} - ${qty} pairs${returnCuttingNotes.trim() ? ` (${returnCuttingNotes.trim()})` : ''}`,
          notes: returnCuttingNotes.trim()
        });
      }
      setIsReturnCuttingModalOpen(false);
      showToast(`Return Cutting successfully recorded: ${qty} pairs of ${returnCuttingArticle.trim()}`);
    } catch (err) {
      console.error('Error saving return cutting:', err);
      showToast(err instanceof Error ? err.message : 'The return cutting entry could not be saved.', 'error');
    } finally {
      setIsSavingReturn(false);
    }
  };

  const saveInlineEdit = async () => {
    if (!inlineEdit) return;
    const nextValue = Number(inlineEdit.value);
    if (!Number.isFinite(nextValue) || (inlineEdit.field === 'pairs' ? nextValue <= 0 : nextValue < 0)) {
      showToast('Please enter a valid value.', 'error');
      setInlineEdit(null);
      return;
    }
    try {
      await updateCuttingEntry(inlineEdit.entry.id, {
        date: inlineEdit.entry.date,
        customerName: inlineEdit.entry.customerName || '',
        article: inlineEdit.entry.article,
        size: inlineEdit.entry.size || '',
        average: inlineEdit.entry.average || '',
        remarks: inlineEdit.entry.remarks || '',
        pairs: inlineEdit.field === 'pairs' ? nextValue : inlineEdit.entry.pairs,
        rate: inlineEdit.field === 'rate' ? nextValue : inlineEdit.entry.rate,
        billNo: inlineEdit.entry.billNo || ''
      });
      showToast('Cutting entry updated successfully.');
    } catch (err) {
      console.error('Error saving inline cutting edit:', err);
      showToast('The cutting entry could not be updated. Please try again.', 'error');
    } finally {
      setInlineEdit(null);
    }
  };

  const exportLedgerPdf = (
    rows: Array<{
      id: string;
      kind: 'cutting' | 'payment';
      date: string;
      customer: string;
      article: string;
      size: string;
      pairs: string | number;
      average: string;
      rate: string | number;
      amount: number;
      runningBal: number;
      type?: string;
      paymentType?: string;
    }>,
    fileName: string,
    rangeLabel: string
  ) => {
    let totalPairsCount = 0;

    const tableRows = rows.map(row => {
      const isCutting = row.kind === 'cutting';
      const isReturn = isCutting && row.type === 'RETURN';
      const isPayment = row.kind === 'payment';
      const isCashOut = isPayment && row.paymentType === 'cash_out';

      if (isCutting) {
        const pairs = Number(row.pairs) || 0;
        totalPairsCount += isReturn ? -Math.abs(pairs) : Math.abs(pairs);
      }

      let amountStr = '';
      if (isPayment) {
        amountStr = isCashOut ? `-Rs. ${Math.abs(row.amount).toLocaleString()}` : `+Rs. ${row.amount.toLocaleString()}`;
      } else if (isReturn) {
        amountStr = `-Rs. ${Math.abs(row.amount).toLocaleString()}`;
      } else {
        amountStr = `Rs. ${row.amount.toLocaleString()}`;
      }

      const pairsStr = isCutting
        ? (isReturn ? `-${Math.abs(Number(row.pairs) || 0)}` : String(row.pairs))
        : '—';

      const rateStr = row.rate !== '—' && row.rate !== undefined && row.rate !== '' && row.rate !== 0
        ? `Rs. ${row.rate}`
        : (isCutting ? 'Rs. 0' : '—');

      return [
        formatDate(row.date),
        row.article || '-',
        row.size || '-',
        pairsStr,
        row.average || '-',
        rateStr,
        amountStr,
        `Rs. ${row.runningBal.toLocaleString()}`
      ];
    });

    const doc = new jsPDF({ orientation: 'landscape' });
    doc.setFontSize(14);
    // Header only: "Cutting Ledger - All" + Date Range (No customer or company name)
    doc.text('Cutting Ledger - All', 14, 15);
    doc.setFontSize(9);
    doc.text(`${rangeLabel} | Total Entries: ${rows.length}`, 14, 22);

    // EXACT 8 columns: DATE, ARTICLE, SIZE, PAIRS, AVERAGE, RATE, AMOUNT, BALANCE (Customer column removed)
    autoTable(doc, {
      head: [['DATE', 'ARTICLE', 'SIZE', 'PAIRS', 'AVERAGE', 'RATE', 'AMOUNT', 'BALANCE']],
      body: tableRows,
      foot: [[
        'TOTAL',
        `Paid: Rs. ${totalPaid.toLocaleString()}`,
        '',
        `${totalPairsCount.toLocaleString()} Pairs`,
        '',
        '',
        `Rs. ${cuttingEntriesBillsTotal.toLocaleString()}`,
        `Pending: Rs. ${remainingBalance.toLocaleString()}`
      ]],
      startY: 27,
      styles: { fontSize: 8 },
      headStyles: { fillColor: [30, 64, 175] },
      footStyles: { fillColor: [241, 245, 249], textColor: [15, 23, 42], fontStyle: 'bold' }
    });

    doc.save(fileName);
    showToast('PDF downloaded successfully.');
  };

  const handleDateWisePdf = () => {
    setPdfFromDate('');
    setPdfToDate('');
    setPdfExportMode('date');
  };

  const handleFullLedgerPdf = () => {
    const filterName = ledgerDateFilter === 'Others'
      ? `${filterFromDate || 'start'}-to-${filterToDate || 'end'}`
      : ledgerDateFilter.replace(/\s+/g, '_');
    const dateSuffix = new Date().toISOString().slice(0, 10);
    // Full Ledger PDF must match the screen entries (unifiedLedgerRows) exactly
    exportLedgerPdf(
      unifiedLedgerRows,
      `Cutting_FullLedger_${filterName}_${dateSuffix}.pdf`,
      formatLedgerRange(ledgerDateFilter, filterFromDate, filterToDate)
    );
  };

  const handleCashbookPdf = () => {
    const filterName = ledgerDateFilter === 'Others'
      ? `${filterFromDate || 'start'}-to-${filterToDate || 'end'}`
      : ledgerDateFilter.replace(/\s+/g, '_');
    const dateSuffix = new Date().toISOString().slice(0, 10);
    const rangeLabel = formatLedgerRange(ledgerDateFilter, filterFromDate, filterToDate);
    const doc = new jsPDF({ orientation: 'landscape' });
    doc.setFontSize(14);
    doc.text(`Cutting Cashbook - All`, 14, 15);
    doc.setFontSize(9);
    doc.text(`${rangeLabel} | Total Transactions: ${dateFilteredPayments.length}`, 14, 22);
    autoTable(doc, {
      head: [['DATE', 'TYPE', 'AMOUNT', 'PAYMENT METHOD', 'BILL NO']],
      body: dateFilteredPayments.map(payment => [
        formatDate(payment.date),
        payment.type === 'cash_in' ? 'Cash In (Adjustment)' : 'Cash Out (Payment)',
        `Rs. ${payment.amount.toLocaleString()}`,
        payment.paymentMethod,
        payment.billNo || '-'
      ]),
      foot: [[
        'TOTAL',
        `Net Paid: Rs. ${totalPaid.toLocaleString()}`,
        `In: Rs. ${totalCashIn.toLocaleString()} | Out: Rs. ${totalCashOut.toLocaleString()}`,
        '',
        ''
      ]],
      startY: 27,
      styles: { fontSize: 8 },
      headStyles: { fillColor: [30, 64, 175] },
      footStyles: { fillColor: [241, 245, 249], textColor: [15, 23, 42], fontStyle: 'bold' }
    });
    doc.save(`Cutting_Cashbook_${filterName}_${dateSuffix}.pdf`);
    showToast('Cashbook PDF downloaded successfully.');
  };

  const handleFilteredPdfDownload = (event: React.FormEvent) => {
    event.preventDefault();
    if (!pdfFromDate || !pdfToDate || pdfFromDate > pdfToDate) {
      showToast('Enter a valid start and end date.', 'error');
      return;
    }
    setIsGeneratingPdf(true);
    try {
      const filtered = unifiedLedgerRows.filter(row => row.date >= pdfFromDate && row.date <= pdfToDate);
      if (filtered.length === 0) {
        showToast('No entries were found in this date range.', 'error');
        return;
      }
      const range = `${formatConfirmationDate(pdfFromDate)} to ${formatConfirmationDate(pdfToDate)}`;
      exportLedgerPdf(
        filtered,
        `Cutting_DateRange_${pdfFromDate}-to-${pdfToDate}.pdf`,
        `Date: ${range}`
      );
      setPdfExportMode(null);
    } catch (error) {
      console.error('Error generating cutting ledger PDF:', error);
      showToast('The PDF could not be generated. Please try again.', 'error');
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const openPaymentModal = (type: 'cash_in' | 'cash_out', initialLotId?: string) => {
    setPaymentForm({
      date: new Date().toISOString().slice(0, 10),
      amount: '',
      paymentMethod: 'Cash',
      billNo: '',
      allocationMode: initialLotId ? 'single' : 'single',
      lotId: initialLotId || '',
      splitRows: []
    });
    setPaymentModalType(type);
  };

  const handleSavePayment = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!activeCutter || !paymentModalType || savingPaymentRef.current) return;
    const amount = Number(paymentForm.amount);
    if (!paymentForm.date || !Number.isFinite(amount) || amount <= 0) {
      showToast('Enter a valid payment date and amount.', 'error');
      return;
    }
    if (!db) {
      showToast('Firestore is not available. The payment was not saved.', 'error');
      return;
    }

    // Validate allocation
    let resolvedLotId: string | undefined = undefined;
    let resolvedLotNo: string | undefined = undefined;
    let resolvedSplits: LotSplitAllocation[] | undefined = undefined;

    if (paymentForm.allocationMode === 'single' && paymentForm.lotId) {
      const targetLot = activeCutterEntries.find(e => e.id === paymentForm.lotId);
      if (targetLot) {
        resolvedLotId = targetLot.id;
        resolvedLotNo = targetLot.billNo || targetLot.id.slice(-4);
        const lotTotal = Math.abs(targetLot.pairs) * (Number(targetLot.rate) || 0);
        const alreadyPaid = Math.max(0, lotPaidMap[targetLot.id] || 0);
        const remaining = Math.max(0, lotTotal - alreadyPaid);
        if (paymentModalType === 'cash_out' && amount > remaining) {
          showToast(`Payment exceeds remaining balance for this Lot (Max: Rs. ${remaining.toLocaleString()})`, 'error');
          return;
        }
      }
    } else if (paymentForm.allocationMode === 'split') {
      const validSplits = paymentForm.splitRows.filter(r => r.lotId && Number(r.amount) > 0);
      if (validSplits.length === 0) {
        showToast('Add at least one lot allocation for Split Payment.', 'error');
        return;
      }
      const splitSum = validSplits.reduce((sum, r) => sum + Number(r.amount), 0);
      if (Math.abs(splitSum - amount) > 0.01) {
        showToast(`Split total (Rs. ${splitSum.toLocaleString()}) must match payment amount (Rs. ${amount.toLocaleString()}).`, 'error');
        return;
      }
      for (const split of validSplits) {
        const lot = activeCutterEntries.find(e => e.id === split.lotId);
        if (lot) {
          const lotTotal = Math.abs(lot.pairs) * (Number(lot.rate) || 0);
          const alreadyPaid = Math.max(0, lotPaidMap[lot.id] || 0);
          const rem = Math.max(0, lotTotal - alreadyPaid);
          if (paymentModalType === 'cash_out' && Number(split.amount) > rem) {
            showToast(`Split amount for Lot #${lot.billNo || lot.id.slice(-4)} exceeds remaining balance (Max: Rs. ${rem.toLocaleString()})`, 'error');
            return;
          }
        }
      }
      resolvedSplits = validSplits.map(r => {
        const lot = activeCutterEntries.find(e => e.id === r.lotId);
        return {
          lotId: r.lotId,
          lotNo: lot?.billNo || lot?.id?.slice(-4) || 'Lot',
          billNo: lot?.billNo || '',
          amount: Number(r.amount)
        };
      });
    }

    savingPaymentRef.current = true;
    setIsSavingPayment(true);
    try {
      const billNo = paymentForm.billNo.trim();
      const createdAtMillis = Date.now();
      const paymentRef = doc(collection(db, 'nasim_ledger_payments'));
      const idempotencyRef = doc(
        db,
        'nasim_ledger_payment_idempotency',
        paymentIdempotencyId(JSON.stringify([
          activeCutter.id,
          paymentModalType,
          paymentForm.date,
          billNo.toLocaleLowerCase(),
          amount,
          resolvedLotId || ''
        ]))
      );
      const result = await runTransaction(db, async transaction => {
        const idempotencySnapshot = await transaction.get(idempotencyRef);
        const existingPaymentId = String(idempotencySnapshot.data()?.paymentId || '');
        const existingCreatedAtMillis = Number(idempotencySnapshot.data()?.createdAtMillis) || 0;
        if (existingPaymentId && createdAtMillis - existingCreatedAtMillis >= 0 && createdAtMillis - existingCreatedAtMillis <= 5000) {
          const existingPaymentRef = doc(db, 'nasim_ledger_payments', existingPaymentId);
          const existingPaymentSnapshot = await transaction.get(existingPaymentRef);
          if (existingPaymentSnapshot.exists()) return { id: existingPaymentId, duplicate: true };
        }

        const payload: Record<string, any> = {
          id: paymentRef.id,
          transactionId: paymentRef.id,
          cutterId: activeCutter.id,
          cutterName: activeCutter.name,
          date: paymentForm.date,
          amount,
          paymentMethod: paymentForm.paymentMethod,
          billNo,
          type: paymentModalType,
          createdAt: serverTimestamp()
        };
        if (resolvedLotId) {
          payload.lotId = resolvedLotId;
          payload.lotNo = resolvedLotNo || '';
        }
        if (resolvedSplits && resolvedSplits.length > 0) {
          payload.splitAllocations = resolvedSplits;
        }

        transaction.set(paymentRef, payload);
        transaction.set(idempotencyRef, {
          paymentId: paymentRef.id,
          createdAtMillis,
          billNo,
          amount,
          cutterId: activeCutter.id
        });
        return { id: paymentRef.id, duplicate: false };
      });

      if (result.duplicate) {
        setPaymentModalType(null);
        showToast('This payment was already saved.');
        return;
      }

      setLedgerPayments(previous => [{
        id: result.id,
        cutterId: activeCutter.id,
        cutterName: activeCutter.name,
        date: paymentForm.date,
        amount,
        paymentMethod: paymentForm.paymentMethod,
        billNo,
        lotId: resolvedLotId,
        lotNo: resolvedLotNo,
        splitAllocations: resolvedSplits,
        type: paymentModalType,
        createdAt: new Date(createdAtMillis).toISOString()
      }, ...previous.filter(payment => payment.id !== result.id)]);
      setPaymentModalType(null);
      showToast(paymentModalType === 'cash_in' ? 'Cash-in recorded.' : 'Cash-out (Lot Payment) recorded.');
    } catch (error) {
      console.error('Unable to save Nasim ledger payment:', error);
      showToast(error instanceof Error ? error.message : 'The payment could not be saved.', 'error');
    } finally {
      savingPaymentRef.current = false;
      setIsSavingPayment(false);
    }
  };

  const handleDeletePayment = async (paymentId: string) => {
    if (!db) {
      showToast('Firestore is not available. The payment was not deleted.', 'error');
      return;
    }
    try {
      await deleteDoc(doc(db, 'nasim_ledger_payments', paymentId));
      setLedgerPayments(previous => previous.filter(payment => payment.id !== paymentId));
      showToast('Payment deleted. Balance recalculated.');
    } catch (error) {
      console.error('Unable to delete Nasim ledger payment:', error);
      showToast(error instanceof Error ? error.message : 'The payment could not be deleted.', 'error');
    }
  };

  const handleOpenEditPayment = (p: NasimLedgerPayment) => {
    setEditingPayment(p);
    setEditPaymentForm({
      date: p.date,
      amount: String(p.amount),
      paymentMethod: (p.paymentMethod as any) || 'Cash',
      billNo: p.billNo || ''
    });
  };

  const handleUpdatePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPayment || !db) return;
    const amt = Number(editPaymentForm.amount);
    if (!editPaymentForm.date || isNaN(amt) || amt <= 0) {
      showToast('Enter a valid date and positive amount.', 'error');
      return;
    }
    setIsSavingEditPayment(true);
    try {
      const pRef = doc(db, 'nasim_ledger_payments', editingPayment.id);
      await updateDoc(pRef, {
        date: editPaymentForm.date,
        amount: amt,
        paymentMethod: editPaymentForm.paymentMethod,
        billNo: editPaymentForm.billNo.trim(),
        updatedAt: serverTimestamp()
      });
      setLedgerPayments(prev => prev.map(p => p.id === editingPayment.id ? {
        ...p,
        date: editPaymentForm.date,
        amount: amt,
        paymentMethod: editPaymentForm.paymentMethod as any,
        billNo: editPaymentForm.billNo.trim()
      } : p));
      setEditingPayment(null);
      showToast('Payment updated successfully. Balance recalculated.');
    } catch (err) {
      console.error('Error updating payment:', err);
      showToast('Failed to update payment.', 'error');
    } finally {
      setIsSavingEditPayment(false);
    }
  };

  const confirmDeletePayment = (payment: NasimLedgerPayment) => {
    setPaymentToDelete(payment);
  };

  // Handle add new cutter
  const handleCreateCutter = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCutterName.trim()) return;

    setIsSavingCutter(true);
    try {
      if (editingCutter) {
        await updateCutter(editingCutter.id, {
          name: newCutterName.trim(),
          khataName: newCutterKhataName.trim(),
          phone: newCutterPhone.trim(),
          perPairRate: Number(newCutterRate) || 0
        });
      } else {
        const created = await addCutter({
          name: newCutterName.trim(),
          khataName: newCutterKhataName.trim(),
          phone: newCutterPhone.trim(),
          perPairRate: Number(newCutterRate) || 0,
          cutterType: selectedCategory
        });
        setActiveCutterId(created.id);
      }
      setNewCutterName('');
      setNewCutterKhataName('');
      setNewCutterPhone('');
      setNewCutterRate('');
      setEditingCutter(null);
      setIsAddCutterOpen(false);
    } catch (e) {
      console.error('Error creating cutter:', e);
      showToast(editingCutter ? 'The ledger could not be updated.' : 'The cutter could not be added.', 'error');
    } finally {
      setIsSavingCutter(false);
    }
  };

  const openCutterEdit = (cutter: Cutter) => {
    setEditingCutter(cutter);
    setNewCutterName(cutter.name);
    setNewCutterKhataName(cutter.khataName || `${cutter.name} Ledger`);
    setNewCutterPhone(cutter.phone || '');
    setNewCutterRate(String(cutter.perPairRate || ''));
    setIsAddCutterOpen(true);
  };

  const handleDeleteCutter = async () => {
    if (!cutterDeleteTarget) return;
    setIsSavingCutter(true);
    try {
      await deleteCutter(cutterDeleteTarget.id, deleteKhataData);
      if (activeCutterId === cutterDeleteTarget.id) setActiveCutterId(null);
      setCutterDeleteTarget(null);
      setDeleteKhataData(false);
    } catch (error) {
      console.error('Error deleting cutter:', error);
      showToast('The ledger could not be deleted.', 'error');
    } finally {
      setIsSavingCutter(false);
    }
  };

  const handleCutterStatusChange = async () => {
    if (!cutterStatusTarget) return;
    const isActive = cutterStatusTarget.isActive === false;
    try {
      await setCutterActive(cutterStatusTarget.id, isActive);
      showToast(isActive
        ? `${cutterStatusTarget.name} is now active and available for work.`
        : `${cutterStatusTarget.name} has been deactivated.`);
      setCutterStatusTarget(null);
    } catch (error) {
      console.error('Error updating cutter status:', error);
      showToast('The cutter status could not be updated.', 'error');
    }
  };

  // Helper label for Category
  const getCategoryTitle = (cat: CutterCategory) => {
    switch (cat) {
      case 'cutting_man':
        return { title: 'Factory Cutters', subtitle: 'In-house glove cutting operators', singular: 'Cutter' };
      case 'cutting_maker':
        return { title: 'Contract Cutters', subtitle: 'Outside cutters and die contractors', singular: 'Contract Cutter' };
      case 'product':
        return { title: 'Product / Purchase', subtitle: 'Material cutting and fabrication', singular: 'Product Cutter' };
    }
  };

  const catMeta = getCategoryTitle(selectedCategory);

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16">
      {/* =========================================================================
          TOP SELECTOR: 3 OPTIONS (Cutting Man | Cutting Maker | Product / Purchase)
          ========================================================================= */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-3 sm:p-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* Option A: Cutting Man */}
          <button
            onClick={() => {
              setSelectedCategory('cutting_man');
              setActiveCutterId(null);
            }}
            className={`p-4 rounded-xl border-2 text-left transition-all cursor-pointer ${
              selectedCategory === 'cutting_man'
                ? 'border-amber-500 bg-amber-50/70 shadow-sm'
                : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className={`px-2.5 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider ${
                selectedCategory === 'cutting_man' ? 'bg-amber-500 text-white' : 'bg-slate-100 text-slate-600'
              }`}>
                Option A
              </span>
              <Scissors className={`w-5 h-5 ${selectedCategory === 'cutting_man' ? 'text-amber-600' : 'text-slate-400'}`} />
            </div>
            <h3 className="font-black text-slate-900 text-base">Cutting Man</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              In-house operator who cuts leather gloves
            </p>
            <div className="mt-2 text-xs font-bold text-amber-800">
              {cutters.filter(c => c.cutterType === 'cutting_man' && c.isActive !== false).length} Active Cutters
            </div>
          </button>

          {/* Option B: Cutting Maker */}
          <button
            onClick={() => {
              setSelectedCategory('cutting_maker');
              setActiveCutterId(null);
            }}
            className={`p-4 rounded-xl border-2 text-left transition-all cursor-pointer ${
              selectedCategory === 'cutting_maker'
                ? 'border-blue-600 bg-blue-50/70 shadow-sm'
                : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className={`px-2.5 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider ${
                selectedCategory === 'cutting_maker' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'
              }`}>
                Option B
              </span>
              <Building className={`w-5 h-5 ${selectedCategory === 'cutting_maker' ? 'text-blue-600' : 'text-slate-400'}`} />
            </div>
            <h3 className="font-black text-slate-900 text-base">Cutting Maker</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Cutter Maker / Outside Die Maker Contractors
            </p>
            <div className="mt-2 text-xs font-bold text-blue-800">
              {cutters.filter(c => c.cutterType === 'cutting_maker').length} Active Makers
            </div>
          </button>

          {/* Option C: Product / Purchase */}
          <button
            onClick={() => {
              setSelectedCategory('product');
              setActiveCutterId(null);
            }}
            className={`p-4 rounded-xl border-2 text-left transition-all cursor-pointer ${
              selectedCategory === 'product'
                ? 'border-indigo-600 bg-indigo-50/70 shadow-sm'
                : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className={`px-2.5 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider ${
                selectedCategory === 'product' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'
              }`}>
                Option C
              </span>
              <Boxes className={`w-5 h-5 ${selectedCategory === 'product' ? 'text-indigo-600' : 'text-slate-400'}`} />
            </div>
            <h3 className="font-black text-slate-900 text-base">Product / Purchase</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Material Product related cutting & fabrication
            </p>
            <div className="mt-2 text-xs font-bold text-indigo-800">
              {cutters.filter(c => c.cutterType === 'product').length} Active Units
            </div>
          </button>
        </div>
      </div>

      {/* =========================================================================
          VIEW A: STEP A - VERTICAL WHATSAPP-STYLE NUMBERED LIST (1, 2, 3...)
          ========================================================================= */}
      {!activeCutterId && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          {/* Header & Controls */}
          <div className="p-4 sm:p-5 border-b border-slate-200 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-black text-slate-900 flex items-center gap-2">
                  <User className="w-5 h-5 text-amber-500" />
                  <span>{catMeta.title} Roster</span>
                </h2>
                <p className="text-xs text-slate-500">
                  {catMeta.subtitle}. Select a name to open the individual cutting ledger.
                </p>
              </div>

              <button
                onClick={() => {
                  setEditingCutter(null);
                  setNewCutterName('');
                  setNewCutterKhataName('');
                  setNewCutterPhone('');
                  setNewCutterRate('');
                  setIsAddCutterOpen(true);
                }}
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold bg-amber-500 hover:bg-amber-600 text-white shadow-md shadow-amber-500/25 transition active:scale-95 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>+ Add {catMeta.singular}</span>
              </button>
            </div>

            {/* Search Bar on Top */}
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder={`Search ${catMeta.singular} by name or phone...`}
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-xs sm:text-sm rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-amber-500/20 bg-white"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              {([
                ['all', 'All Cutters', categoryCutters.length],
                ['active', 'Active', categoryCutters.filter(c => c.isActive !== false).length],
                ['deactive', 'Inactive', categoryCutters.filter(c => c.isActive === false).length]
              ] as const).map(([filter, label, count]) => (
                <button
                  key={filter}
                  type="button"
                  onClick={() => setCutterFilter(filter)}
                  className={`rounded-full px-3 py-1.5 text-xs font-bold ${
                    cutterFilter === filter
                      ? filter === 'deactive' ? 'bg-rose-600 text-white' : 'bg-emerald-600 text-white'
                      : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {label} ({count})
                </button>
              ))}
            </div>
          </div>

          {/* WhatsApp-Style Numbered Vertical List */}
          <div className="divide-y divide-slate-100">
            {filteredCutters.length === 0 ? (
              <div className="p-12 text-center text-slate-400">
                <Scissors className="w-10 h-10 mx-auto mb-2 opacity-30" />
                <p className="text-sm font-semibold">No {catMeta.title} entries found</p>
                <p className="text-xs mt-1">Click "+ Add {catMeta.singular}" above to create a profile.</p>
              </div>
            ) : (
              filteredCutters.map((cutter, index) => {
                const pendingPairs = Math.max(0, (cutter.totalGiven || 0) - (cutter.totalReceived || 0));
                const pendingAmount = cuttingEntries
                  .filter(entry => entry.cutterId === cutter.id)
                  .reduce((sum, entry) => sum + (entry.totalBalance ?? entry.lotTotal), 0) ||
                  cuttingTransactions
                    .filter(tx => tx.cutterId === cutter.id)
                    .reduce((sum, tx) => sum + (tx.totalBalance ?? tx.lotTotal ?? tx.qty * (tx.rate || 0)), 0);
                const isActive = cutter.isActive !== false;
                return (
                  <div
                    key={cutter.id}
                    onClick={() => {
                      try {
                        if (!cutter || !cutter.id) {
                          console.warn('Cannot navigate: cutter or cutter.id missing', cutter);
                          return;
                        }
                        console.log('Navigating to cutter ledger:', cutter.name, cutter.id);
                        setActiveCutterId(cutter.id);
                      } catch (err) {
                        console.error('Error navigating to cutter:', err);
                      }
                    }}
                    className={`p-4 sm:px-6 flex items-center justify-between transition cursor-pointer group ${
                      isActive ? 'hover:bg-amber-50/50' : 'bg-slate-100 opacity-70'
                    }`}
                  >
                    <div className="flex items-center gap-3 sm:gap-4 min-w-0">
                      {/* Numbered Badge (1, 2, 3...) as in manual factory register / WhatsApp */}
                      <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-slate-100 group-hover:bg-amber-500 group-hover:text-white font-mono font-black text-sm text-slate-700 flex items-center justify-center shrink-0 transition-colors border border-slate-200">
                        {index + 1}
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="font-black text-slate-900 text-sm sm:text-base group-hover:text-amber-700 transition">
                            {cutter.name}
                          </h4>
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                            {isActive ? '● Active' : '● Inactive'}
                          </span>
                          {pendingPairs > 0 ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-100 text-amber-800 border border-amber-200">
                              Pending: {pendingPairs} Pairs
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              Balanced
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-3 mt-1 text-xs text-slate-500 flex-wrap">
                          <span className="font-semibold text-slate-600">{getCutterLedgerName(cutter)}</span>
                          <span className="text-[11px]">Rate: Rs.{cutter.perPairRate || 0}/Pair</span>
                          {cutter.phone ? (
                            <span className="flex items-center gap-1 font-mono text-[11px]">
                              <Phone className="w-3 h-3 text-slate-400" />
                              {cutter.phone}
                            </span>
                          ) : (
                            <span className="text-[11px] text-slate-400">No phone</span>
                          )}

                          <span className="text-slate-300">&bull;</span>
                          <span className="text-[11px]">
                            Last Work: <span className="font-semibold text-slate-700">{cutter.lastTransactionDate ? formatDate(cutter.lastTransactionDate) : 'Recently'}</span>
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Right side: status and roster actions */}
                    <div className="text-right flex items-center gap-2 shrink-0" onClick={e => e.stopPropagation()}>
                      <div className="hidden sm:block">
                        <span className="text-[10px] uppercase font-bold text-slate-400 block">Pending Balance</span>
                        <span className="text-base font-black font-mono text-amber-700">
                          {pendingPairs} <span className="text-xs font-normal text-slate-500">Pairs</span>
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setCutterStatusTarget(cutter)}
                        title={`Toggle active status. Ledger total: Rs. ${pendingAmount}`}
                        className={`rounded-full px-3 py-2 text-xs font-bold ${isActive ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white'}`}
                      >
                        {isActive ? 'Active' : 'Inactive'}
                      </button>
                      <button type="button" onClick={() => openCutterEdit(cutter)} className="rounded p-2 text-slate-500 hover:text-blue-600" title="Edit cutter">
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button type="button" onClick={() => setCutterDeleteTarget(cutter)} className="rounded p-2 text-slate-500 hover:text-rose-600" title="Delete cutter">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* =========================================================================
          VIEW B: CUTTER LEDGER PAGE
          ========================================================================= */}
      {activeCutterId && (
        !activeCutter || !activeCutterEntries ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-slate-600 shadow-sm my-6">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 text-amber-700">
              <BookOpen className="h-6 w-6" />
            </div>
            <p className="text-base font-semibold text-slate-800">
              No data found for this cutter. Please add cutting entries first.
            </p>
            <div className="mt-4 flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => setActiveCutterId(null)}
                className="rounded-xl border border-slate-200 bg-slate-100 px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-200 transition"
              >
                &larr; Back to Cutters List
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
          {/* Cutter ledger header with back button */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setActiveCutterId(null)}
                  className="p-2.5 rounded-xl border border-slate-200 hover:bg-slate-100 text-slate-700 transition cursor-pointer"
                  title="Back to Cutters List"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold px-2 py-0.5 rounded-md bg-amber-100 text-amber-800 uppercase">
                      {catMeta.singular}
                    </span>
                    <span className="text-xs text-slate-500 font-mono">
                      ID: #{activeCutter.id.slice(-6)}
                    </span>
                  </div>
                  <h1 className="text-xl sm:text-2xl font-black text-slate-900 mt-0.5">
                    {getCutterLedgerName(activeCutter)}
                  </h1>
                  {activeCutter.isActive === false && (
                    <span className="mt-1 inline-flex rounded-full bg-rose-100 px-2.5 py-1 text-xs font-bold text-rose-700">
                      {activeCutter.name} - INACTIVE - Unavailable
                    </span>
                  )}
                  {activeCutter.phone && (
                    <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                      <Phone className="w-3.5 h-3.5" />
                      <span>{activeCutter.phone}</span>
                    </p>
                  )}
                </div>
              </div>

              {/* Three Main Action Buttons as strictly required:
                  [New Cutting (orange)] [Return Cutting (orange/red)] [Receive Cutting (blue)] */}
              <div className="flex flex-wrap items-center gap-2.5 sm:gap-3">
                <button
                  type="button"
                  onClick={() => handleOpenTxModal('GIVE')}
                  disabled={activeCutter.isActive === false}
                  className="flex-1 sm:flex-none px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold bg-amber-500 hover:bg-amber-600 text-white shadow-md shadow-amber-500/25 transition active:scale-95 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  <Scissors className="w-4 h-4" />
                  <span>New Cutting</span>
                </button>

                <button
                  type="button"
                  onClick={handleOpenReturnCuttingModal}
                  disabled={activeCutter.isActive === false}
                  className="flex-1 sm:flex-none px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold bg-gradient-to-r from-orange-500 to-rose-600 hover:from-orange-600 hover:to-rose-700 text-white shadow-md shadow-rose-500/25 transition active:scale-95 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                  title="Return Cutting Entry"
                >
                  <RotateCcw className="w-4 h-4" />
                  <span>Return Cutting</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleOpenTxModal('RECEIVE')}
                  disabled={activeCutter.isActive === false}
                  className="flex-1 sm:flex-none px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-600/25 transition active:scale-95 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  <ArrowDownLeft className="w-4 h-4" />
                  <span>Receive Cutting</span>
                </button>
              </div>
            </div>

            {/* Amounts and outstanding balance follow the active date filter. */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 mt-6 pt-5 border-t border-slate-100">
              <div className="p-4 rounded-xl bg-amber-50/80 border border-amber-200">
                <span className="text-[11px] font-bold uppercase tracking-wider text-amber-800 block">
                  Total Cutting Amount
                </span>
                <div className="text-2xl font-black text-amber-700 font-mono mt-1">
                  Rs. {totalCuttingAmount.toLocaleString()}
                </div>
                <p className="text-[11px] text-amber-900/70 mt-1">Based on cutting entries in this date range</p>
              </div>

              <div className="p-4 rounded-xl bg-emerald-50/80 border border-emerald-200">
                <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-800 block">
                  Total Paid
                </span>
                <div className="text-2xl font-black text-emerald-700 font-mono mt-1">
                  Rs. {totalPaid.toLocaleString()}
                </div>
                <p className="text-[11px] text-emerald-900/70 mt-1">Cash Paid (Out) to {activeCutter.name}</p>
              </div>

              <div className="p-4 rounded-xl bg-blue-50/80 border border-blue-200">
                <span className="text-[11px] font-bold uppercase tracking-wider text-blue-800 block">
                  Pending Balance
                </span>
                <div className={`text-2xl font-black font-mono mt-1 ${remainingBalance < 0 ? 'text-emerald-700' : 'text-blue-700'}`}>
                  Rs. {remainingBalance.toLocaleString()}
                </div>
                <p className="text-[11px] text-blue-900/70 mt-1">Cutting Amount minus Total Paid & Returns</p>
                {extraPaid > 0 && (
                  <p className="mt-2 text-sm font-black text-emerald-700">Extra Paid: Rs. {extraPaid.toLocaleString()}</p>
                )}
              </div>
            </div>
          </div>

          {/* History Table like manual notebook */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="p-4 sm:p-5 border-b border-slate-200 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="font-bold text-slate-900 text-base">
                  Notebook Ledger &bull; {activeCutter.name}
                </h3>
                <p className="text-xs text-slate-500">
                  Cutting ledger with lot totals and running balances.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button onClick={handleDateWisePdf} className="rounded-lg bg-orange-500 px-3 py-2 text-xs font-bold text-white hover:bg-orange-600 cursor-pointer">Date-Range Ledger PDF</button>
                <button onClick={handleFullLedgerPdf} className="rounded-lg bg-rose-600 px-3 py-2 text-xs font-bold text-white hover:bg-rose-700 cursor-pointer">Full Ledger PDF</button>
                <button onClick={handleCashbookPdf} className="rounded-lg bg-slate-700 px-3 py-2 text-xs font-bold text-white hover:bg-slate-800 cursor-pointer">Cashbook PDF</button>
                <button onClick={() => openPaymentModal('cash_out')} className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-3 py-2 text-xs font-bold text-white hover:bg-rose-700 transition shadow-xs cursor-pointer">
                  <Minus className="w-3.5 h-3.5" />
                  <span>Cash Out (Payment)</span>
                </button>
                <button onClick={() => openPaymentModal('cash_in')} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-700 transition shadow-xs cursor-pointer">
                  <Plus className="w-3.5 h-3.5" />
                  <span>Cash In</span>
                </button>
              </div>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
                  <input
                    type="search"
                    value={ledgerSearch}
                    onChange={e => setLedgerSearch(e.target.value)}
                    placeholder="Search by customer name"
                    className="w-full max-w-sm rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                  <select value={ledgerDateFilter} onChange={event => setLedgerDateFilter(event.target.value as LedgerDateFilter)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
                    {['All Time', 'Today', 'Last 7 Days', 'Last 30 Days', 'This Month', 'Last Month', 'Others'].map(filter => <option key={filter} value={filter}>{filter}</option>)}
                  </select>
                  {ledgerDateFilter === 'Others' && (
                    <>
                      <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">
                        From <input type="date" value={filterFromDate} onChange={event => setFilterFromDate(event.target.value)} className="rounded-lg border border-slate-300 px-2 py-2 text-sm" />
                      </label>
                      <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">
                        To <input type="date" value={filterToDate} onChange={event => setFilterToDate(event.target.value)} className="rounded-lg border border-slate-300 px-2 py-2 text-sm" />
                      </label>
                    </>
                  )}
                </div>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">{unifiedLedgerRows.length} Entries</span>
              </div>
            </div>

            <div className="overflow-x-auto" ref={ledgerTableScrollRef}>
              {unifiedLedgerRows.length === 0 ? (
                <div className="p-12 text-center text-slate-400">
                  <BookOpen className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  <p className="text-xs">{ledgerSearch ? 'No matching customer entries.' : `No entries in ${activeCutter.name}'s notebook yet.`}</p>
                  <p className="text-xs mt-1 text-slate-500">
                    Select "Issue Cutting" or "Receive Cutting" above to add the first record.
                  </p>
                </div>
              ) : (
                <table className="min-w-[1050px] w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200 uppercase text-[10px] tracking-wider">
                      <th className="py-3 px-3.5 sticky left-0 bg-slate-100 z-10 border-r border-slate-200 shadow-xs">
                        1. Date
                      </th>
                      <th className="py-3 px-3">2. Customer</th>
                      <th className="py-3 px-3">3. Article</th>
                      <th className="py-3 px-2 text-center">4. Size</th>
                      <th className="py-3 px-3 text-right">5. Pairs</th>
                      <th className="py-3 px-2 text-center">6. Average</th>
                      <th className="py-3 px-3 text-right">7. Rate</th>
                      <th className="py-3 px-3 text-right">8. Amount</th>
                      <th className="py-3 px-3 text-right bg-blue-50/70 border-l border-blue-100 font-black text-blue-900">
                        9. Balance
                      </th>
                      <th className="py-3 px-3 text-center w-24">
                        10. Action
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium">
                    {unifiedLedgerRows.map((row) => {
                      if (row.kind === 'payment') {
                        const isCashOut = row.paymentType === 'cash_out';
                        return (
                          <tr key={row.id} className={isCashOut ? 'bg-rose-50/40 hover:bg-rose-50/70 transition' : 'bg-emerald-50/40 hover:bg-emerald-50/70 transition'}>
                            <td className="py-3 px-3.5 font-mono sticky left-0 bg-white z-10 border-r border-slate-200 font-bold whitespace-nowrap">
                              {formatDate(row.date)}
                            </td>
                            <td className="py-3 px-3 font-bold">
                              <span className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full font-bold ${
                                isCashOut ? 'bg-rose-100 text-rose-800' : 'bg-emerald-100 text-emerald-800'
                              }`}>
                                {isCashOut ? 'Cash Paid Out' : 'Cash In'}
                              </span>
                            </td>
                            <td className="py-3 px-3 font-semibold text-slate-800">
                              {row.article}
                            </td>
                            <td className="py-3 px-2 text-center text-slate-400">—</td>
                            <td className="py-3 px-3 text-right text-slate-400">—</td>
                            <td className="py-3 px-2 text-center text-slate-400">—</td>
                            <td className="py-3 px-3 text-right text-slate-400">—</td>
                            <td className={`py-3 px-3 text-right font-mono font-black ${
                              isCashOut ? 'text-rose-700' : 'text-emerald-700'
                            }`}>
                              {isCashOut ? `-Rs. ${Math.abs(row.amount).toLocaleString()}` : `+Rs. ${row.amount.toLocaleString()}`}
                            </td>
                            <td className={`py-3 px-3 text-right font-mono font-black border-l border-blue-100 ${
                              row.runningBal < 0 ? 'text-rose-700 bg-rose-50/50' : 'text-blue-900 bg-blue-50/60'
                            }`}>
                              {row.runningBal < 0 ? `-Rs. ${Math.abs(row.runningBal).toLocaleString()}` : `Rs. ${row.runningBal.toLocaleString()}`}
                            </td>
                            <td className="py-3 px-3 text-center">
                              <div className="flex items-center justify-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => handleOpenEditPayment(row.rawPayment)}
                                  className="p-1 rounded text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition cursor-pointer"
                                  title="Edit Payment"
                                >
                                  <Pencil className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => confirmDeletePayment(row.rawPayment)}
                                  className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer"
                                  title="Delete Payment"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      }

                        const entry = row.rawEntry;
                        const isReturn = entry.type === 'RETURN';

                        return (
                          <tr key={entry.id} className={isReturn ? 'bg-[#ffe6e6] font-bold text-[#cc0000]' : 'hover:bg-slate-50/70 transition'}>
                            <td className="py-3.5 px-3.5 font-mono sticky left-0 bg-white z-10 border-r border-slate-200 whitespace-nowrap">
                              {formatDate(entry.date)}
                            </td>
                            <td className="py-3.5 px-3 text-slate-700 font-semibold">{entry.customerName || 'PRO4'}</td>
                            <td className="py-3.5 px-3 font-bold text-slate-900">
                              {entry.articleTitle || entry.article}
                              {isReturn && <span className="mt-0.5 block text-[10px] font-semibold text-[#cc0000]">{entry.remarks}</span>}
                            </td>
                            <td className="py-3.5 px-2 text-center font-semibold text-slate-800">{entry.sizeName || entry.size || '-'}</td>
                            <td
                              className="py-3.5 px-3 text-right font-mono"
                              title={isReturn ? undefined : 'Double-click to quick edit'}
                              onDoubleClick={isReturn ? undefined : () => setInlineEdit({
                                entry,
                                field: 'pairs',
                                value: String(entry.pairs)
                              })}
                            >
                              {inlineEdit?.entry.id === entry.id && inlineEdit.field === 'pairs' ? (
                                <input
                                  autoFocus
                                  type="number"
                                  min="1"
                                  value={inlineEdit.value}
                                  onChange={e => setInlineEdit({ ...inlineEdit, value: e.target.value })}
                                  onBlur={e => {
                                    if (e.currentTarget.dataset.cancelled !== 'true') void saveInlineEdit();
                                  }}
                                  onKeyDown={e => {
                                    if (e.key === 'Enter') {
                                      e.preventDefault();
                                      e.currentTarget.blur();
                                    } else if (e.key === 'Escape') {
                                      e.currentTarget.dataset.cancelled = 'true';
                                      setInlineEdit(null);
                                    }
                                  }}
                                  className="w-20 px-2 py-1 text-right rounded border border-amber-400 outline-none"
                                />
                              ) : (
                                <span className={isReturn ? 'font-black text-[#cc0000]' : 'cursor-text font-bold text-slate-900'}>
                                  {isReturn ? '-' : ''}{Math.abs(entry.pairs).toLocaleString()}
                                </span>
                              )}
                            </td>
                            <td className="py-3.5 px-2 text-center text-slate-600">{entry.average || '-'}</td>
                            <td
                              className="py-3.5 px-3 text-right font-mono"
                              title={isReturn ? undefined : 'Double-click to quick edit'}
                              onDoubleClick={isReturn ? undefined : () => setInlineEdit({ entry, field: 'rate', value: String(entry.rate) })}
                            >
                              {inlineEdit?.entry.id === entry.id && inlineEdit.field === 'rate' ? (
                                <input
                                  autoFocus
                                  type="number"
                                  min="0"
                                  value={inlineEdit.value}
                                  onChange={e => setInlineEdit({ ...inlineEdit, value: e.target.value })}
                                  onBlur={e => {
                                    if (e.currentTarget.dataset.cancelled !== 'true') void saveInlineEdit();
                                  }}
                                  onKeyDown={e => {
                                    if (e.key === 'Enter') {
                                      e.preventDefault();
                                      e.currentTarget.blur();
                                    } else if (e.key === 'Escape') {
                                      e.currentTarget.dataset.cancelled = 'true';
                                      setInlineEdit(null);
                                    }
                                  }}
                                  className="w-20 rounded border border-amber-400 px-2 py-1 text-right outline-none"
                                />
                              ) : (
                                <span className={entry.rate ? 'cursor-text text-slate-800' : 'cursor-text text-rose-600'}>
                                  {entry.rate ? `Rs. ${entry.rate}` : 'Rs. 0'}
                                </span>
                              )}
                            </td>
                            <td className={`py-3.5 px-3 text-right font-mono font-bold ${isReturn ? 'text-[#cc0000]' : 'text-slate-900'}`}>
                              {isReturn ? `-Rs. ${Math.abs(row.amount).toLocaleString()}` : `Rs. ${row.amount.toLocaleString()}`}
                            </td>
                            <td className={`py-3.5 px-3 text-right font-mono font-bold border-l border-blue-100 ${isReturn ? 'text-[#cc0000]' : 'text-blue-900 bg-blue-50/50'}`}>
                              Rs. {row.runningBal.toLocaleString()}
                            </td>
                            <td className="py-3.5 px-3 text-center">
                              <div className="flex items-center justify-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => openEditEntry(entry)}
                                  className="p-1 rounded text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition cursor-pointer"
                                  title="Edit Cutting Entry"
                                >
                                  <Pencil className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setDeletingEntry(entry)}
                                  className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer"
                                  title="Delete Cutting Entry"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                  <tfoot className="border-t-2 border-slate-300 bg-slate-50 font-black text-xs">
                    <tr>
                      <td className="px-3.5 py-3.5 sticky left-0 bg-slate-100 z-10 border-r border-slate-200">
                        TOTAL
                      </td>
                      <td className="px-3 py-3.5 text-slate-700">
                        Paid: Rs. {totalPaid.toLocaleString()}
                      </td>
                      <td className="px-3 py-3.5 text-slate-700">
                        {totalCashIn > 0 ? `Cash In: Rs. ${totalCashIn.toLocaleString()}` : ''}
                      </td>
                      <td className="px-2 py-3.5 text-center text-slate-400">—</td>
                      <td className="px-3 py-3.5 text-right font-mono text-slate-900">
                        {visibleLedgerEntries.reduce((sum, entry) => sum + (entry.type === 'RETURN' ? -Math.abs(entry.pairs) : Math.abs(entry.pairs)), 0).toLocaleString()} Pairs
                      </td>
                      <td className="px-2 py-3.5 text-center text-slate-400">—</td>
                      <td className="px-3 py-3.5 text-right text-slate-400">—</td>
                      <td className="px-3 py-3.5 text-right font-mono text-slate-900">
                        Rs. {cuttingEntriesBillsTotal.toLocaleString()}
                      </td>
                      <td className="px-3 py-3.5 text-right font-mono text-sm text-blue-900 bg-blue-100/60 border-l border-blue-200">
                        Pending: Rs. {remainingBalance.toLocaleString()}
                      </td>
                      <td className="px-3 py-3.5 text-center text-slate-400">—</td>
                    </tr>
                  </tfoot>
                </table>
              )}
              </div>
            </div>
          </div>
        )
      )}

      {/* =========================================================================
          MODAL 1: ADD CUTTER (Cutting Man / Cutting Maker / Product Cutter)
          ========================================================================= */}
      {isAddCutterOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto"
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsAddCutterOpen(false);
          }}
        >
          <div
            className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden my-auto max-h-[92vh] flex flex-col animate-in fade-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 bg-amber-500 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Scissors className="w-5 h-5 text-white" />
                <h3 className="font-bold text-base">{editingCutter ? 'Edit Cutter' : `Add New ${catMeta.singular}`}</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsAddCutterOpen(false)}
                className="p-1.5 rounded-lg hover:bg-white/20 text-white transition cursor-pointer"
                aria-label="Close / Back"
                title="Close / Back (Esc)"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateCutter} className="p-5 space-y-4 overflow-y-auto flex-1">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Cutter / Worker Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Shani, Saleem, Junaid, Shoaib"
                  value={newCutterName}
                  onChange={e => {
                    const name = e.target.value;
                    setNewCutterName(name);
                    if (!editingCutter && (!newCutterKhataName || newCutterKhataName.endsWith(' Ledger'))) {
                      setNewCutterKhataName(name ? `${name} Ledger` : '');
                    }
                  }}
                  className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Ledger Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. NAIM Ledger"
                  value={newCutterKhataName}
                  onChange={e => setNewCutterKhataName(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Phone / WhatsApp Number
                </label>
                <input
                  type="text"
                  placeholder="0300-1234567"
                  value={newCutterPhone}
                  onChange={e => setNewCutterPhone(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Rate per Pair (Rs.)</label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  placeholder="Rate"
                  value={newCutterRate}
                  onChange={e => setNewCutterRate(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Category Type
                </label>
                <input
                  type="text"
                  readOnly
                  value={catMeta.title}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-slate-100 text-slate-600 font-bold"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsAddCutterOpen(false)}
                  disabled={isSavingCutter}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 border border-slate-200 transition cursor-pointer flex items-center gap-1.5"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Cancel / Back</span>
                </button>
                <button
                  type="submit"
                  disabled={isSavingCutter}
                  className="px-5 py-2.5 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-600 text-white shadow-sm transition cursor-pointer"
                >
                  {isSavingCutter ? 'Saving...' : editingCutter ? 'Update Cutter' : `Save ${catMeta.singular}`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL 2: ENTRY FORM SEQUENCE STRICTLY AS REQUESTED:
          1. Date (Date Picker, default today)
          2. Total pairs quantity
          3. Article (Free text)
          4. Order (Dropdown, filtered dynamically to show ONLY Customer Orders containing selected Article)
          5. Size, rate and total balance
          6. Bill No (Text input)
          7. Factory / Notes (Text input, e.g. "Shoaib Factory")
          8. Checkbox "Add to Stock Ledger?" (Receive only)
          Save Button label: "Save Entry"
          ========================================================================= */}
      {txModalType && activeCutter && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto"
          onClick={(e) => {
            if (e.target === e.currentTarget) handleCloseTxModal();
          }}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden my-auto max-h-[85vh] sm:max-h-[88vh] flex flex-col animate-in fade-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header - Sticky */}
            <div className={`px-5 py-4 text-white flex items-center justify-between shrink-0 ${
              txModalType === 'GIVE' ? 'bg-amber-500' : 'bg-emerald-600'
            }`}>
              <div className="flex items-center gap-2.5">
                <Scissors className="w-5 h-5 text-white" />
                <div>
                  <h3 className="font-black text-base sm:text-lg">
                    {txModalType === 'GIVE' ? 'Issue Cutting' : 'Receive Cutting'}
                  </h3>
                  <p className="text-xs text-white/90">
                    Cutter: <span className="font-bold underline">{activeCutter.name}</span> &bull; Auto Dual Entry
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={handleCloseTxModal}
                className="p-1.5 rounded-lg hover:bg-white/20 text-white transition cursor-pointer"
                aria-label="Close / Back"
                title="Close / Back (Esc)"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Entry Form strictly following requested sequence */}
            <form onSubmit={handleSubmitTransaction} className="flex-1 flex flex-col min-h-0 overflow-hidden">
              <div className="flex-1 min-h-0 overflow-y-auto p-5 sm:p-6 space-y-4 overscroll-contain">
              {/* Field 1: Date (Date Picker, default today) */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-slate-400" />
                  <span>1. Date *</span>
                </label>
                <input
                  type="date"
                  required
                  value={formDate}
                  onChange={e => setFormDate(e.target.value)}
                  className="w-full px-3 py-2 text-xs sm:text-sm rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-amber-500/20 bg-white"
                />
              </div>

              {/* Field 2: Article */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  2. Article / Shoes Filter *
                </label>
                {txModalType === 'RECEIVE' ? (
                  <div className="relative" ref={articlePickerRef}>
                    <div className="flex items-center gap-2">
                      <input
                        type="search"
                        role="combobox"
                        aria-expanded={isArticlePickerOpen}
                        aria-controls="receive-article-options"
                        placeholder="Search or type new article name (auto-saves)"
                        value={articleSearch || formArticle}
                        onFocus={() => {
                          setIsArticlePickerOpen(true);
                        }}
                        onChange={event => {
                          const val = event.target.value;
                          setArticleSearch(val);
                          setFormArticle(val);
                          setIsArticlePickerOpen(true);
                        }}
                        className="min-w-0 flex-1 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-amber-500/20 sm:text-sm font-semibold"
                      />
                      {(formArticle || articleSearch) && (
                        <button
                          type="button"
                          onClick={() => {
                            setFormArticle('');
                            setArticleSearch('');
                            setIsArticlePickerOpen(true);
                          }}
                          className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-100"
                          aria-label="Clear selected article"
                          title="Clear article"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      )}
                    </div>

                    {/* Auto-save helper notice when article is new */}
                    {(articleSearch || formArticle) && !articlesMaster.some(a => a.articleName.trim().toLowerCase() === (articleSearch || formArticle).trim().toLowerCase()) && (
                      <div className="mt-1.5 flex items-center gap-1.5 text-xs font-semibold text-blue-700 bg-blue-50 px-2.5 py-1 rounded-lg border border-blue-200">
                        <Check className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                        <span>New article "{articleSearch || formArticle}" will be auto-saved on Receive</span>
                      </div>
                    )}

                    {isArticlePickerOpen && (
                      <div id="receive-article-options" role="listbox" className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-xl">
                        {filteredArticleOptions.map(article => (
                          <button
                            key={`${article.id}-${article.articleName}`}
                            type="button"
                            role="option"
                            aria-selected={formArticle === article.articleName}
                            onClick={() => handleArticleSelection(article.articleName)}
                            className="block w-full rounded-lg px-3 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-amber-50 hover:text-amber-900"
                          >
                            {article.articleName}{article.articleCode ? ` (${article.articleCode})` : ''}
                          </button>
                        ))}
                        {filteredArticleOptions.length === 0 && (
                          <p className="px-3 py-2 text-xs text-slate-500">
                            Type to enter custom article (auto-saves on receive).
                          </p>
                        )}
                        <button type="button" role="option" onClick={() => handleArticleSelection('__other__')} className="block w-full rounded-lg px-3 py-2 text-left text-xs font-bold text-blue-700 hover:bg-blue-50 border-t border-slate-100">
                          + Other — configure article with size matrix
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  <input
                    type="text"
                    required
                    placeholder="e.g. Average, PUJA, Foam"
                    value={formArticle}
                    onChange={e => setFormArticle(e.target.value)}
                    className="w-full px-3 py-2 text-xs sm:text-sm rounded-xl border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                  />
                )}
                {showNewArticleForm && txModalType === 'RECEIVE' && (
                  <div className="mt-3 space-y-3 rounded-xl border border-blue-200 bg-blue-50 p-3">
                    <label className="block text-xs font-bold text-slate-700">
                      Article Number / Name
                      <input required value={newArticleForm.articleName} onChange={event => setNewArticleForm(form => ({ ...form, articleName: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-normal" />
                    </label>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="block text-xs font-bold text-slate-700">
                        Size Name
                        <input required value={newArticleForm.sizeName} onChange={event => setNewArticleForm(form => ({ ...form, sizeName: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-normal" />
                      </label>
                      <label className="block text-xs font-bold text-slate-700">
                        Size / Pairs
                        <input required type="number" min="0" value={newArticleForm.pairs} onChange={event => setNewArticleForm(form => ({ ...form, pairs: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-normal" />
                      </label>
                    </div>
                    <button type="button" onClick={() => void handleSaveNewArticle()} className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-bold text-white hover:bg-blue-700">Save Article</button>
                  </div>
                )}
              </div>

              {/* Destination Summary banner */}
              {txModalType === 'RECEIVE' && (
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-xs font-bold text-slate-800 flex items-center justify-between">
                  <span className="text-slate-600 font-semibold">This entry will go to:</span>
                  <span className="text-blue-700 font-black">
                    {[
                      deliveryToStock && 'Stock ✓',
                      deliveryToExistingOrder && (formOrderId ? `Order ${orders.find(o => o.id === formOrderId)?.orderNo || 'Selected'} ✓` : 'Existing Order (Select Below)'),
                      deliveryToNewOrder && `New Order (${newOrderCustomerName || 'Type Customer Name'}) ✓`
                    ].filter(Boolean).join(', ') || 'Please select at least one destination'}
                  </span>
                </div>
              )}

              {/* Task 4: Multi-Select Checkboxes for Delivery Destination */}
              {txModalType === 'RECEIVE' && (
                <fieldset className="space-y-2.5 rounded-xl border border-slate-200 bg-slate-50 p-3.5">
                  <legend className="px-1 text-xs font-bold text-slate-700 uppercase tracking-wider">
                    Delivery Choice * (Check destination)
                  </legend>

                  <div className="space-y-2">
                    {/* Checkbox 1: Add to Stock - Stock Management (Independent) */}
                    <label className={`flex items-start gap-2.5 text-xs font-semibold cursor-pointer p-2.5 rounded-xl border transition ${
                      deliveryToStock 
                        ? 'border-emerald-500 bg-emerald-50/80 text-emerald-950 shadow-2xs' 
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-100/60'
                    }`}>
                      <input 
                        type="checkbox" 
                        checked={deliveryToStock} 
                        onChange={e => setDeliveryToStock(e.target.checked)} 
                        className="mt-0.5 h-4 w-4 rounded text-emerald-600 focus:ring-emerald-500"
                      />
                      <div>
                        <span className="font-bold flex items-center gap-1.5">
                          <span>1. Add to Stock - Stock Management</span>
                          {deliveryToStock && <span className="text-emerald-600 font-black">✓</span>}
                        </span>
                        <span className="text-[11px] text-slate-500 font-normal block mt-0.5">
                          Direct to Stock: increases available pairs in Stock Management inventory.
                        </span>
                      </div>
                    </label>

                    {/* Checkbox 2: Add to Existing Order (Mutually exclusive with 3) */}
                    <label className={`flex items-start gap-2.5 text-xs font-semibold cursor-pointer p-2.5 rounded-xl border transition ${
                      deliveryToExistingOrder 
                        ? 'border-blue-500 bg-blue-50/80 text-blue-950 shadow-2xs' 
                        : deliveryToNewOrder
                          ? 'border-slate-100 bg-slate-50 text-slate-400 cursor-not-allowed opacity-60'
                          : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-100/60'
                    }`}>
                      <input 
                        type="checkbox" 
                        disabled={deliveryToNewOrder}
                        checked={deliveryToExistingOrder} 
                        onChange={e => {
                          if (e.target.checked) {
                            setDeliveryToExistingOrder(true);
                            setDeliveryToNewOrder(false);
                          } else {
                            setDeliveryToExistingOrder(false);
                          }
                        }} 
                        className="mt-0.5 h-4 w-4 rounded text-blue-600 focus:ring-blue-500 disabled:opacity-40"
                      />
                      <div>
                        <span className="font-bold flex items-center gap-1.5">
                          <span>2. Add to Existing Order</span>
                          {deliveryToExistingOrder && <span className="text-blue-600 font-black">✓</span>}
                        </span>
                        <span className="text-[11px] text-slate-500 font-normal block mt-0.5">
                          Links directly to an existing customer order and updates fulfillment & cutting progress.
                        </span>
                      </div>
                    </label>

                    {/* Checkbox 3: Add to New Order (Mutually exclusive with 2) */}
                    <label className={`flex items-start gap-2.5 text-xs font-semibold cursor-pointer p-2.5 rounded-xl border transition ${
                      deliveryToNewOrder 
                        ? 'border-indigo-500 bg-indigo-50/80 text-indigo-950 shadow-2xs' 
                        : deliveryToExistingOrder
                          ? 'border-slate-100 bg-slate-50 text-slate-400 cursor-not-allowed opacity-60'
                          : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-100/60'
                    }`}>
                      <input 
                        type="checkbox" 
                        disabled={deliveryToExistingOrder}
                        checked={deliveryToNewOrder} 
                        onChange={e => {
                          if (e.target.checked) {
                            setDeliveryToNewOrder(true);
                            setDeliveryToExistingOrder(false);
                          } else {
                            setDeliveryToNewOrder(false);
                          }
                        }} 
                        className="mt-0.5 h-4 w-4 rounded text-indigo-600 focus:ring-indigo-500 disabled:opacity-40"
                      />
                      <div>
                        <span className="font-bold flex items-center gap-1.5">
                          <span>3. Add to New Order</span>
                          {deliveryToNewOrder && <span className="text-indigo-600 font-black">✓</span>}
                        </span>
                        <span className="text-[11px] text-slate-500 font-normal block mt-0.5">
                          Creates a brand-new Customer Order with this Article & Size matrix automatically.
                        </span>
                      </div>
                    </label>
                  </div>
                </fieldset>
              )}

              {/* Field 3: Customer Order selection (When deliveryToExistingOrder is checked) */}
              {txModalType === 'RECEIVE' && deliveryToExistingOrder && (
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center justify-between">
                    <span>Select Customer Order (PO) *</span>
                    <span className="text-[10px] text-blue-600 font-bold">Linked Order Required</span>
                  </label>
                  <select
                    required
                    value={formOrderId}
                    onChange={e => {
                      const orderId = e.target.value;
                      setFormOrderId(orderId);
                      const order = orders.find(item => item.id === orderId);
                      if (order) setFormCustomerName(order.customerName);
                    }}
                    className="w-full px-3 py-2 text-xs sm:text-sm rounded-xl border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  >
                    <option value="">-- Select Customer Order (PO) --</option>
                    {filteredOrdersForArticle.map(ord => (
                      <option key={ord.id} value={ord.id}>
                        {ord.customerName} - {formatDate(ord.orderDate)} - {ord.orderNo}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Field 3b: New Order Name / Customer Name (When deliveryToNewOrder is checked) */}
              {txModalType === 'RECEIVE' && deliveryToNewOrder && (
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    New Order Name / Customer Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Al-Madina Traders, Shoaib Enterprises"
                    value={newOrderCustomerName}
                    onChange={e => setNewOrderCustomerName(e.target.value)}
                    className="w-full px-3 py-2 text-xs sm:text-sm rounded-xl border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                  />
                </div>
              )}

              {/* Customer Order for GIVE cutting */}
              {txModalType === 'GIVE' && (
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center justify-between">
                    <span>3. Customer Order</span>
                    <span className="text-[10px] text-slate-400 font-normal">Optional / Direct Cutting</span>
                  </label>
                  <select
                    value={formOrderId}
                    onChange={e => {
                      const orderId = e.target.value;
                      setFormOrderId(orderId);
                      const order = orders.find(item => item.id === orderId);
                      if (order) setFormCustomerName(order.customerName);
                    }}
                    className="w-full px-3 py-2 text-xs sm:text-sm rounded-xl border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                  >
                    <option value="">-- Direct Cutting / Not Linked to Specific PO --</option>
                    {filteredOrdersForArticle.map(ord => (
                      <option key={ord.id} value={ord.id}>
                        {ord.customerName} - {formatDate(ord.orderDate)} - {ord.orderNo}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Field 5: Free-text Size & Quantity Rows */}
              <div className="rounded-xl bg-[#f0f6ff] p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <label className="block text-[11px] font-black uppercase tracking-wider text-slate-700">
                      5. SIZE / QTY / AVERAGE / RATE / TOTAL - FREE TEXT TYPING
                    </label>
                    <p className="text-[11px] text-slate-500">
                      Type exact size like 8, 9, 10, 7.5, Ladies Large. Never normalized.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setCuttingSizeRows(prev => [
                        ...prev,
                        { id: String(Date.now()), size: '', qty: '', average: '', rate: activeCutter?.perPairRate ? String(activeCutter.perPairRate) : '' }
                      ]);
                    }}
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold rounded-lg bg-blue-600 text-white hover:bg-blue-700 cursor-pointer shadow-2xs"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>+ Add Size Row</span>
                  </button>
                </div>

                <div className="space-y-2.5">
                  {cuttingSizeRows.map((row, rIdx) => {
                    const rowQty = Number(row.qty) || 0;
                    const rowRate = Number(row.rate) || 0;
                    const rowTotal = rowQty * rowRate;

                    return (
                      <div key={row.id || rIdx} className="p-3 bg-white rounded-xl border border-slate-200 shadow-2xs space-y-2">
                        <div className="flex items-center justify-between text-[11px] font-bold text-slate-600 border-b border-slate-100 pb-1.5">
                          <span>Size Row #{rIdx + 1}</span>
                          {cuttingSizeRows.length > 1 && (
                            <button
                              type="button"
                              onClick={() => {
                                setCuttingSizeRows(prev => prev.filter((_, idx) => idx !== rIdx));
                              }}
                              className="text-slate-400 hover:text-rose-600 transition cursor-pointer p-0.5"
                              title="Remove size row"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
                          <div>
                            <label className="block text-[10px] font-bold text-blue-700 mb-1">
                              QUANTITY (PAIRS) *
                            </label>
                            <input
                              type="number"
                              min="1"
                              required
                              placeholder="e.g. 1000"
                              value={row.qty}
                              onChange={e => {
                                const val = e.target.value;
                                setCuttingSizeRows(prev => prev.map((r, i) => i === rIdx ? { ...r, qty: val } : r));
                                if (rIdx === 0) setFormQty(val);
                              }}
                              className="h-[42px] w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-bold font-mono"
                            />
                          </div>

                          <div>
                            <label className="block text-[10px] font-bold text-blue-700 mb-1">
                              SIZE (FREE TEXT)
                            </label>
                            <input
                              type="text"
                              placeholder="e.g. 8, 10, Large, Ladies Large"
                              value={row.size}
                              onChange={e => {
                                const val = e.target.value;
                                setCuttingSizeRows(prev => prev.map((r, i) => i === rIdx ? { ...r, size: val } : r));
                                if (rIdx === 0) setFormSize(val);
                              }}
                              className="h-[42px] w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold"
                            />
                          </div>

                          <div>
                            <label className="block text-[10px] font-bold text-blue-700 mb-1">
                              AVERAGE <span className="font-normal text-slate-400">(Optional)</span>
                            </label>
                            <input
                              type="text"
                              placeholder="Avg (Optional)"
                              value={row.average}
                              onChange={e => {
                                const val = e.target.value;
                                setCuttingSizeRows(prev => prev.map((r, i) => i === rIdx ? { ...r, average: val } : r));
                                if (rIdx === 0) setFormAverage(val);
                              }}
                              className="h-[42px] w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"
                            />
                          </div>

                          <div>
                            <label className="block text-[10px] font-bold text-blue-700 mb-1">
                              RATE <span className="font-normal text-slate-400">(Optional)</span>
                            </label>
                            <input
                              type="number"
                              min="0"
                              step="any"
                              placeholder="Rate"
                              value={row.rate}
                              onChange={e => {
                                const val = e.target.value;
                                setCuttingSizeRows(prev => prev.map((r, i) => i === rIdx ? { ...r, rate: val } : r));
                                if (rIdx === 0) setFormRate(val);
                              }}
                              className="h-[42px] w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-mono"
                            />
                          </div>

                          <div>
                            <label className="block text-[10px] font-bold text-blue-700 mb-1">
                              TOTAL BALANCE
                            </label>
                            <input
                              type="text"
                              readOnly
                              value={rowTotal > 0 ? `Rs. ${rowTotal.toLocaleString()}` : 'Rs. 0'}
                              className="h-[42px] w-full rounded-lg border border-slate-200 bg-slate-100 px-3 text-sm font-bold text-slate-900 font-mono"
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Rows Summary */}
                <div className="flex items-center justify-between p-2.5 bg-blue-100/60 rounded-xl text-xs font-bold text-blue-900">
                  <span>Total Pairs: {cuttingSizeRows.reduce((sum, r) => sum + (Number(r.qty) || 0), 0).toLocaleString()}</span>
                  <span>Total Amount: Rs. {cuttingSizeRows.reduce((sum, r) => sum + ((Number(r.qty) || 0) * (Number(r.rate) || 0)), 0).toLocaleString()}</span>
                </div>
              </div>

              {/* Field 6: Bill No (Text input) */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  6. Bill No
                </label>
                <input
                  type="text"
                  placeholder="BILL No"
                  value={formBillNo}
                  onChange={e => setFormBillNo(e.target.value)}
                  className="w-full px-3 py-2 text-xs sm:text-sm rounded-xl border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                />
              </div>

              {/* Field 7: Factory / Notes (Text input, e.g. "Shoaib Factory") */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  7. Factory / Notes
                </label>
                <input
                  type="text"
                  placeholder="e.g. Shoaib Factory, Unit 2, Urgent lot"
                  value={formFactoryNotes}
                  onChange={e => setFormFactoryNotes(e.target.value)}
                  className="w-full px-3 py-2 text-xs sm:text-sm rounded-xl border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                />
              </div>

              {/* Receipts always update article stock; the destination controls the legacy stock widget only. */}
              {txModalType === 'RECEIVE' && (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-semibold text-emerald-900">
                  This cutting receipt automatically increases article stock and appears in stock history.
                </div>
              )}

              {/* Auto Dual Entry Badges confirmation as required */}
              <div className="flex items-center gap-3 p-2.5 bg-slate-50 rounded-xl text-xs border border-slate-200">
                <span className="text-emerald-700 font-bold flex items-center gap-1">
                  <CheckCircle2 className="w-4 h-4" /> &check; Ledger Updated
                </span>
                <span className="text-slate-300">&bull;</span>
                <span className="text-blue-700 font-bold flex items-center gap-1">
                  <CheckCircle2 className="w-4 h-4" /> &check; Order Updated
                </span>
              </div>

              </div>

              {/* Actions: Sticky footer with Save and Cancel always visible */}
              <div className="shrink-0 p-4 sm:px-6 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-3 z-10">
                <button
                  type="button"
                  onClick={handleCloseTxModal}
                  className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-200/70 border border-slate-300 transition cursor-pointer flex items-center gap-1.5"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Cancel / Back</span>
                </button>

                <button
                  type="submit"
                  disabled={isSubmittingTx}
                  className={`px-6 py-2.5 rounded-xl text-xs sm:text-sm font-black text-white shadow-md transition active:scale-95 cursor-pointer flex items-center gap-2 ${
                    txModalType === 'GIVE'
                      ? 'bg-amber-500 hover:bg-amber-600 shadow-amber-500/25'
                      : 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/25'
                  }`}
                >
                  <Check className="w-4 h-4" />
                  <span>{isSubmittingTx ? 'Saving...' : 'Save Entry'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {pdfExportMode && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/60 p-3 sm:p-4 backdrop-blur-xs overflow-y-auto"
          onClick={(e) => {
            if (e.target === e.currentTarget) setPdfExportMode(null);
          }}
        >
          <form
            onSubmit={handleFilteredPdfDownload}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl my-auto animate-in fade-in zoom-in-95 duration-150"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Generate Date-Range PDF</h3>
                <p className="mt-1 text-sm text-slate-500">The PDF will download directly to your device.</p>
              </div>
              <button
                type="button"
                onClick={() => setPdfExportMode(null)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition cursor-pointer"
                aria-label="Close / Back"
                title="Close / Back (Esc)"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="text-sm font-semibold text-slate-700">
                From Date
                <input
                  type="date"
                  required
                  value={pdfFromDate}
                  onChange={event => setPdfFromDate(event.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"
                />
              </label>
              <label className="text-sm font-semibold text-slate-700">
                To Date
                <input
                  type="date"
                  required
                  value={pdfToDate}
                  onChange={event => setPdfToDate(event.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"
                />
              </label>
            </div>
            <div className="mt-5 flex justify-end gap-2 border-t border-slate-100 pt-3">
              <button
                type="button"
                onClick={() => setPdfExportMode(null)}
                disabled={isGeneratingPdf}
                className="rounded-xl px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-100 border border-slate-200 transition cursor-pointer flex items-center gap-1.5"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Cancel / Back</span>
              </button>
              <button
                type="submit"
                disabled={isGeneratingPdf}
                className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-60 transition cursor-pointer"
              >
                {isGeneratingPdf && <Loader2 className="h-4 w-4 animate-spin" />}
                {isGeneratingPdf ? 'Generating PDF...' : 'Download PDF'}
              </button>
            </div>
          </form>
        </div>
      )}

      {returnTarget && (
        <div
          className="fixed inset-0 z-[85] flex items-center justify-center bg-slate-900/60 p-3 sm:p-4 backdrop-blur-xs overflow-y-auto"
          onClick={(e) => {
            if (e.target === e.currentTarget) setReturnTarget(null);
          }}
        >
          <form
            onSubmit={handleSaveReturn}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg space-y-4 rounded-2xl bg-white p-5 shadow-2xl my-auto animate-in fade-in zoom-in-95 duration-150"
          >
            <div className="flex items-start justify-between gap-4 border-b border-rose-100 pb-3">
              <div>
                <h3 className="text-lg font-bold text-rose-700">Return Cutting</h3>
                <p className="mt-1 text-sm text-slate-500">{returnTarget.articleTitle || returnTarget.article} · {returnTarget.sizeName || returnTarget.size || '—'}</p>
              </div>
              <button
                type="button"
                onClick={() => setReturnTarget(null)}
                disabled={isSavingReturn}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition cursor-pointer"
                aria-label="Close / Back"
                title="Close / Back (Esc)"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <label className="block text-sm font-semibold text-slate-700">
              Original Cutting Date
              <input readOnly value={formatDate(returnTarget.date)} className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2" />
            </label>
            <label className="block text-sm font-semibold text-slate-700">
              Original Qty
              <input readOnly value={`${returnTarget.pairs} pairs`} className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2" />
            </label>
            <label className="block text-sm font-semibold text-slate-700">
              Return Qty *
              <input
                required
                type="number"
                min="1"
                max={Math.max(0, returnTarget.pairs - activeCutterEntries
                  .filter(entry => entry.type === 'RETURN' && entry.returnReferenceId === returnTarget.id)
                  .reduce((sum, entry) => sum + Math.abs(entry.pairs), 0))}
                step="1"
                value={returnForm.quantity}
                onChange={event => setReturnForm(form => ({ ...form, quantity: event.target.value }))}
                className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"
              />
            </label>
            <label className="block text-sm font-semibold text-slate-700">
              Reason *
              <select required value={returnForm.reason} onChange={event => setReturnForm(form => ({ ...form, reason: event.target.value as typeof form.reason }))} className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2">
                <option value="Damaged">Damaged</option>
                <option value="Wrong Size">Wrong Size</option>
                <option value="Quality">Quality</option>
              </select>
            </label>
            <label className="block text-sm font-semibold text-slate-700">
              Return Date *
              <input required type="date" value={returnForm.date} onChange={event => setReturnForm(form => ({ ...form, date: event.target.value }))} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2" />
            </label>
            <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
              <button
                type="button"
                onClick={() => setReturnTarget(null)}
                disabled={isSavingReturn}
                className="rounded-xl px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-100 border border-slate-200 transition cursor-pointer flex items-center gap-1.5"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Cancel / Back</span>
              </button>
              <button
                type="submit"
                disabled={isSavingReturn}
                className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-bold text-white hover:bg-rose-700 disabled:opacity-60 transition cursor-pointer"
              >
                {isSavingReturn ? 'Saving...' : 'Confirm Return'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* NEW CONTRACTOR RETURN CUTTING ENTRY MODAL (Requirement: NAEM Ledger button click) */}
      {isReturnCuttingModalOpen && activeCutter && (
        <div
          className="fixed inset-0 z-[85] flex items-center justify-center bg-slate-900/60 p-3 sm:p-4 backdrop-blur-xs overflow-y-auto"
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsReturnCuttingModalOpen(false);
          }}
        >
          <form
            onSubmit={handleSubmitReturnCutting}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg space-y-4 rounded-2xl bg-white p-5 sm:p-6 shadow-2xl my-auto max-h-[92vh] overflow-y-auto animate-in fade-in zoom-in-95 duration-150"
          >
            <div className="flex items-start justify-between gap-4 border-b border-rose-100 pb-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="rounded-md bg-rose-100 p-1 text-rose-700">
                    <RotateCcw className="h-4 w-4" />
                  </span>
                  <h3 className="text-lg font-black text-rose-700">Return Cutting Entry</h3>
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  Deduct returned cutting pairs from {activeCutter.name} ledger and adjust stock.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsReturnCuttingModalOpen(false)}
                disabled={isSavingReturn}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition cursor-pointer"
                aria-label="Close / Back"
                title="Close / Back (Esc)"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* 1. Cutting Contractor (Auto NAEM / NAIM) */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-600">
                Cutting Contractor
              </label>
              <input
                readOnly
                value={`${activeCutter.name} (${activeCutter.cutterType === 'cutting_maker' ? 'Cutter Maker' : 'Cutting Man'})`}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-100 px-3 py-2 text-sm font-bold text-slate-800"
              />
            </div>

            {/* 2. Select Article Dropdown (REQUIRED) */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                Select Article *
              </label>
              <select
                required
                value={returnCuttingArticle}
                onChange={e => {
                  const art = e.target.value;
                  setReturnCuttingArticle(art);
                  const matching = cuttingEntries.filter(
                    entry => entry.cutterId === activeCutter.id &&
                             entry.type === 'RECEIVE' &&
                             (entry.articleTitle || entry.article).trim().toLowerCase() === art.trim().toLowerCase()
                  );
                  if (matching[0]?.date) {
                    setReturnCuttingDate(matching[0].date);
                  }
                }}
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-900 focus:border-rose-500 focus:ring-1 focus:ring-rose-500 outline-none"
              >
                <option value="" disabled>-- Select Article (P600, P601, etc.) --</option>
                {contractorArticles.map(art => (
                  <option key={art} value={art}>{art}</option>
                ))}
              </select>
            </div>

            {/* 3. Select Date (Date picker) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                  Select Cutting Date *
                </label>
                <input
                  required
                  type="date"
                  value={returnCuttingDate}
                  onChange={e => setReturnCuttingDate(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-rose-500 focus:ring-1 focus:ring-rose-500 outline-none"
                />
              </div>

              {/* 4. Quantity / Pairs */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                  Quantity / Pairs *
                </label>
                <input
                  required
                  type="number"
                  min="1"
                  max={returnMaxPairs}
                  step="1"
                  placeholder="e.g. 50"
                  value={returnCuttingPairs}
                  onChange={e => setReturnCuttingPairs(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm font-mono font-bold text-slate-900 focus:border-rose-500 focus:ring-1 focus:ring-rose-500 outline-none"
                />
              </div>
            </div>

            {/* Info Badge on Available / Eligible Pairs & Rate */}
            <div className="rounded-xl bg-slate-50 border border-slate-200 p-3 text-xs space-y-1">
              <div className="flex justify-between text-slate-600">
                <span>Original Cutting on {returnCuttingDate ? formatDate(returnCuttingDate) : 'selected date'}:</span>
                <span className="font-bold text-slate-900">
                  {matchedReturnEntry ? `${matchedReturnEntry.pairs} pairs (${returnMaxPairs} available)` : 'Direct / Manual entry'}
                </span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Contractor Cutting Rate:</span>
                <span className="font-bold text-slate-900">Rs. {returnRate} / pair</span>
              </div>
            </div>

            {/* 5. Return Amount Auto-Calculate: Qty * Rate */}
            <div className="rounded-xl border border-rose-200 bg-rose-50/70 p-3.5">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-[11px] font-bold uppercase tracking-wider text-rose-800 block">
                    Auto-Calculated Return Amount (Qty × Rate)
                  </span>
                  <p className="text-[11px] text-rose-700/80">Will be deducted from Total Cutting & Pending Balance</p>
                </div>
                <div className="text-xl font-mono font-black text-rose-700">
                  Rs. {returnAutoAmount.toLocaleString()}
                </div>
              </div>
            </div>

            {/* 6. Reason / Note (Optional) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                  Reason
                </label>
                <select
                  value={returnCuttingReason}
                  onChange={e => setReturnCuttingReason(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:border-rose-500 focus:ring-1 focus:ring-rose-500 outline-none"
                >
                  <option value="Damaged">Damaged</option>
                  <option value="Wrong Size">Wrong Size</option>
                  <option value="Quality">Quality Defect</option>
                  <option value="Excess Leather Returned">Excess Returned</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                  Note / Remarks (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Returned 50 pairs due to cut defect"
                  value={returnCuttingNotes}
                  onChange={e => setReturnCuttingNotes(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-rose-500 focus:ring-1 focus:ring-rose-500 outline-none"
                />
              </div>
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-2.5 border-t border-slate-100 pt-4">
              <button
                type="button"
                onClick={() => setIsReturnCuttingModalOpen(false)}
                disabled={isSavingReturn}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-100 transition cursor-pointer flex items-center gap-1.5"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Cancel / Back</span>
              </button>
              <button
                type="submit"
                disabled={isSavingReturn || !returnCuttingArticle || !returnCuttingPairs || Number(returnCuttingPairs) <= 0}
                className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-orange-600 to-rose-600 hover:from-orange-700 hover:to-rose-700 px-5 py-2 text-sm font-bold text-white shadow-md shadow-rose-600/25 transition disabled:opacity-50"
              >
                {isSavingReturn && <Loader2 className="h-4 w-4 animate-spin" />}
                <span>{isSavingReturn ? 'Saving Return...' : 'Submit Return Cutting'}</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {paymentModalType && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/60 p-3 sm:p-4 backdrop-blur-xs overflow-y-auto"
          onClick={(e) => {
            if (e.target === e.currentTarget) setPaymentModalType(null);
          }}
        >
          <form
            onSubmit={handleSavePayment}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg space-y-4 rounded-2xl bg-white p-5 sm:p-6 shadow-2xl my-auto max-h-[92vh] overflow-y-auto animate-in fade-in zoom-in-95 duration-150"
          >
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-3">
              <div>
                <h3 className={`text-lg font-black flex items-center gap-2 ${paymentModalType === 'cash_in' ? 'text-emerald-700' : 'text-rose-700'}`}>
                  {paymentModalType === 'cash_out' ? <Minus className="w-5 h-5 stroke-[3]" /> : <Plus className="w-5 h-5 stroke-[3]" />}
                  {paymentModalType === 'cash_in' ? 'Record Cash In' : 'Record Cash Out / Payment'}
                </h3>
                <p className="mt-1 text-xs text-slate-500">
                  {paymentModalType === 'cash_out' 
                    ? `Cash payment to ${activeCutter?.name || 'contractor'} (reduces pending balance)` 
                    : `Cash received back or advance credit from ${activeCutter?.name || 'contractor'}`}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPaymentModalType(null)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition cursor-pointer"
                aria-label="Close / Back"
                title="Close / Back (Esc)"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Payment Date
              </label>
              <input required type="date" value={paymentForm.date} onChange={event => setPaymentForm(form => ({ ...form, date: event.target.value }))} className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-rose-500/20" />
            </div>
            {/* Lot Allocation Section */}
            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 space-y-3">
              <label className="block text-xs font-bold text-slate-800">
                Payment Allocation / Select Lot
              </label>

              {/* 3 Allocation Mode Buttons */}
              <div className="grid grid-cols-3 gap-1 p-1 bg-slate-200/70 rounded-xl text-xs font-bold text-slate-600">
                <button
                  type="button"
                  onClick={() => setPaymentForm(form => ({ ...form, allocationMode: 'single' }))}
                  className={`py-1.5 rounded-lg text-center transition cursor-pointer ${paymentForm.allocationMode === 'single' ? 'bg-white text-slate-900 shadow-2xs' : 'hover:text-slate-900'}`}
                >
                  Specific Lot
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPaymentForm(form => ({
                      ...form,
                      allocationMode: 'split',
                      splitRows: form.splitRows.length > 0 ? form.splitRows : [{ lotId: '', amount: '' }]
                    }));
                  }}
                  className={`py-1.5 rounded-lg text-center transition cursor-pointer ${paymentForm.allocationMode === 'split' ? 'bg-white text-slate-900 shadow-2xs' : 'hover:text-slate-900'}`}
                >
                  Split Payment
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentForm(form => ({ ...form, allocationMode: 'unallocated', lotId: '' }))}
                  className={`py-1.5 rounded-lg text-center transition cursor-pointer ${paymentForm.allocationMode === 'unallocated' ? 'bg-white text-slate-900 shadow-2xs' : 'hover:text-slate-900'}`}
                >
                  Unallocated
                </button>
              </div>

              {/* Mode: Single Lot */}
              {paymentForm.allocationMode === 'single' && (
                <div className="space-y-2">
                  <label className="block text-xs font-bold text-slate-700">
                    Select Lot for this payment
                  </label>
                  <select
                    value={paymentForm.lotId}
                    onChange={e => {
                      const selectedId = e.target.value;
                      const lot = activeCutterEntries.find(ent => ent.id === selectedId);
                      const lotTotal = lot ? Math.abs(lot.pairs) * (Number(lot.rate) || 0) : 0;
                      const paid = lot ? (lotPaidMap[lot.id] || 0) : 0;
                      const rem = Math.max(0, lotTotal - paid);
                      setPaymentForm(form => ({
                        ...form,
                        lotId: selectedId,
                        amount: !form.amount && rem > 0 ? String(rem) : form.amount,
                        billNo: form.billNo || lot?.billNo || ''
                      }));
                    }}
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-rose-500/20"
                  >
                    <option value="">-- Choose Cutting Lot --</option>
                    {activeCutterEntries
                      .filter(entry => entry.type !== 'RETURN')
                      .map(entry => {
                        const total = Math.abs(entry.pairs) * (Number(entry.rate) || 0);
                        const paid = lotPaidMap[entry.id] || 0;
                        const rem = Math.max(0, total - paid);
                        return (
                          <option key={entry.id} value={entry.id}>
                            Lot #{entry.billNo || entry.id.slice(-4)} &bull; {entry.articleTitle || entry.article} ({entry.pairs} pairs) - Rem: Rs. {rem.toLocaleString()} {rem === 0 ? '(PAID)' : ''}
                          </option>
                        );
                      })}
                  </select>

                  {/* Active lot info badge */}
                  {(() => {
                    const lot = activeCutterEntries.find(ent => ent.id === paymentForm.lotId);
                    if (!lot) return null;
                    const lotTotal = Math.abs(lot.pairs) * (Number(lot.rate) || 0);
                    const paid = lotPaidMap[lot.id] || 0;
                    const rem = Math.max(0, lotTotal - paid);
                    const isOver = paymentModalType === 'cash_out' && Number(paymentForm.amount) > rem;
                    return (
                      <div className={`p-2.5 rounded-xl border text-xs ${isOver ? 'bg-rose-50 border-rose-300 text-rose-800' : 'bg-blue-50 border-blue-200 text-blue-900'}`}>
                        <div className="flex justify-between font-bold">
                          <span>Lot Total: Rs. {lotTotal.toLocaleString()}</span>
                          <span>Paid: Rs. {paid.toLocaleString()}</span>
                          <span className="text-rose-700">Remaining: Rs. {rem.toLocaleString()}</span>
                        </div>
                        {isOver && (
                          <p className="mt-1 font-bold text-rose-600">
                            Payment exceeds remaining balance for this Lot by Rs. {(Number(paymentForm.amount) - rem).toLocaleString()}.
                          </p>
                        )}
                      </div>
                    );
                  })()}
                </div>
              )}

              {/* Mode: Split Payment */}
              {paymentForm.allocationMode === 'split' && (
                <div className="space-y-2">
                  <div className="flex justify-between items-center text-xs font-bold text-slate-700">
                    <span>Divide Amount Across Lots</span>
                    <button
                      type="button"
                      onClick={() => setPaymentForm(form => ({
                        ...form,
                        splitRows: [...form.splitRows, { lotId: '', amount: '' }]
                      }))}
                      className="text-blue-600 hover:text-blue-700 cursor-pointer"
                    >
                      + Add Lot
                    </button>
                  </div>
                  {paymentForm.splitRows.map((row, idx) => {
                    const lot = activeCutterEntries.find(ent => ent.id === row.lotId);
                    const lotTotal = lot ? Math.abs(lot.pairs) * (Number(lot.rate) || 0) : 0;
                    const paid = lot ? (lotPaidMap[lot.id] || 0) : 0;
                    const rem = Math.max(0, lotTotal - paid);
                    return (
                      <div key={idx} className="flex items-center gap-2">
                        <select
                          value={row.lotId}
                          onChange={e => {
                            const val = e.target.value;
                            setPaymentForm(form => {
                              const next = [...form.splitRows];
                              next[idx] = { ...next[idx], lotId: val };
                              return { ...form, splitRows: next };
                            });
                          }}
                          className="flex-1 rounded-xl border border-slate-300 bg-white p-2 text-xs"
                        >
                          <option value="">-- Choose Lot --</option>
                          {activeCutterEntries.filter(e => e.type !== 'RETURN').map(e => (
                            <option key={e.id} value={e.id}>
                              Lot #{e.billNo || e.id.slice(-4)} - {e.articleTitle || e.article} (Rem: Rs. {Math.max(0, (e.pairs * (Number(e.rate) || 0)) - (lotPaidMap[e.id] || 0)).toLocaleString()})
                            </option>
                          ))}
                        </select>
                        <input
                          type="number"
                          placeholder="Amount"
                          value={row.amount}
                          onChange={e => {
                            const val = e.target.value;
                            setPaymentForm(form => {
                              const next = [...form.splitRows];
                              next[idx] = { ...next[idx], amount: val };
                              return { ...form, splitRows: next };
                            });
                          }}
                          className="w-28 rounded-xl border border-slate-300 p-2 text-xs font-mono font-bold"
                        />
                        <button
                          type="button"
                          onClick={() => setPaymentForm(form => ({
                            ...form,
                            splitRows: form.splitRows.filter((_, i) => i !== idx)
                          }))}
                          className="p-1.5 text-slate-400 hover:text-rose-600 cursor-pointer"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    );
                  })}
                  <div className="flex justify-between items-center text-xs text-slate-600 font-bold pt-1">
                    <span>Allocated: Rs. {paymentForm.splitRows.reduce((sum, r) => sum + (Number(r.amount) || 0), 0).toLocaleString()}</span>
                    <span>Total Payment: Rs. {(Number(paymentForm.amount) || 0).toLocaleString()}</span>
                  </div>
                </div>
              )}

              {/* Mode: Unallocated */}
              {paymentForm.allocationMode === 'unallocated' && (
                <p className="text-xs text-slate-500 italic">
                  This payment will be recorded as a general payment without linking to a specific cutting lot.
                </p>
              )}
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Amount (Rs.) <span className="text-rose-500">*</span>
              </label>
              <input required min="1" step="any" type="number" placeholder="e.g. 10000" value={paymentForm.amount} onChange={event => setPaymentForm(form => ({ ...form, amount: event.target.value }))} className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm font-mono font-bold bg-white focus:outline-none focus:ring-2 focus:ring-rose-500/20" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Payment Method
              </label>
              <select required value={paymentForm.paymentMethod} onChange={event => setPaymentForm(form => ({ ...form, paymentMethod: event.target.value as LedgerPaymentMethod }))} className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-500/20">
                {(['Cash', 'Easypaisa', 'JazzCash', 'Bank Transfer'] as const).map(method => <option key={method} value={method}>{method}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Bill No / Voucher No <span className="text-slate-400 font-normal">(Optional)</span>
              </label>
              <input type="text" placeholder="e.g. BILL-001 or VCH-002" value={paymentForm.billNo} onChange={event => setPaymentForm(form => ({ ...form, billNo: event.target.value }))} className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-rose-500/20" />
            </div>
            <div className="flex justify-end gap-2.5 border-t border-slate-100 pt-4">
              <button
                type="button"
                onClick={() => setPaymentModalType(null)}
                disabled={isSavingPayment}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-100 transition cursor-pointer flex items-center gap-1.5"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Cancel / Back</span>
              </button>
              <button type="submit" disabled={isSavingPayment} className={`rounded-xl px-5 py-2 text-sm font-bold text-white shadow-md transition cursor-pointer disabled:opacity-60 ${paymentModalType === 'cash_in' ? 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/25' : 'bg-rose-600 hover:bg-rose-700 shadow-rose-600/25'}`}>
                {isSavingPayment ? 'Saving…' : (paymentModalType === 'cash_out' ? 'Save Cash Out (- Payment)' : 'Save Cash In')}
              </button>
            </div>
          </form>
        </div>
      )}

      {editingEntry && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto"
          onClick={(e) => {
            if (e.target === e.currentTarget) setEditingEntry(null);
          }}
        >
          <div
            className="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl my-auto animate-in fade-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between bg-blue-600 px-5 py-4 text-white">
              <div>
                <h3 className="font-bold text-base">Edit Cutting Entry - #{editingEntry.id ? editingEntry.id.slice(-6) : ''}</h3>
                <p className="text-xs text-blue-100">Update saved values directly. Totals and pending balance update automatically.</p>
              </div>
              <button
                type="button"
                onClick={() => setEditingEntry(null)}
                className="rounded-lg p-1 hover:bg-white/20 transition cursor-pointer"
                aria-label="Close / Back"
                title="Close / Back (Esc)"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleUpdateEntry} className="max-h-[85vh] space-y-3.5 overflow-y-auto p-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="block text-xs font-bold text-slate-700">
                  Date *
                  <input
                    required
                    type="date"
                    value={editForm.date}
                    onChange={e => setEditForm(current => ({ ...current, date: e.target.value }))}
                    className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm font-normal"
                  />
                </label>
                <label className="block text-xs font-bold text-slate-700">
                  Customer Name *
                  <input
                    required
                    type="text"
                    placeholder="e.g. Bestway"
                    value={editForm.customerName}
                    onChange={e => setEditForm(current => ({ ...current, customerName: e.target.value }))}
                    className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm font-normal"
                  />
                </label>
              </div>

              {/* SEPARATE Article Box and Size Box */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="block text-xs font-bold text-slate-700">
                  Article * (Separate Box)
                  <input
                    required
                    type="text"
                    list="cuttings-article-list"
                    placeholder="e.g. pride, ce, 1202"
                    value={editForm.article}
                    onChange={e => setEditForm(current => ({ ...current, article: e.target.value }))}
                    className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-900 bg-white"
                  />
                  <datalist id="cuttings-article-list">
                    {allArticleOptions.map(opt => (
                      <option key={opt.id} value={opt.articleName} />
                    ))}
                  </datalist>
                </label>

                <label className="block text-xs font-bold text-slate-700">
                  Size (Separate Box)
                  <input
                    type="text"
                    placeholder="e.g. 10, L, M, XL"
                    value={editForm.size}
                    onChange={e => setEditForm(current => ({ ...current, size: e.target.value }))}
                    className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-900 bg-white"
                  />
                </label>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="block text-xs font-bold text-slate-700">
                  Pairs *
                  <input
                    required
                    type="number"
                    min="1"
                    placeholder="Pairs quantity"
                    value={editForm.pairs}
                    onChange={e => setEditForm(current => ({ ...current, pairs: e.target.value }))}
                    className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm font-mono font-bold text-slate-900"
                  />
                </label>
                <label className="block text-xs font-bold text-slate-700">
                  Rate (Rs.) *
                  <input
                    required
                    type="number"
                    min="0"
                    step="any"
                    placeholder="Rate per pair"
                    value={editForm.rate}
                    onChange={e => setEditForm(current => ({ ...current, rate: e.target.value }))}
                    className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm font-mono font-bold text-slate-900"
                  />
                </label>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <label className="block text-xs font-bold text-slate-700">
                  Average
                  <input
                    type="text"
                    placeholder="e.g. -"
                    value={editForm.average}
                    onChange={e => setEditForm(current => ({ ...current, average: e.target.value }))}
                    className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm font-normal"
                  />
                </label>
                <label className="block text-xs font-bold text-slate-700">
                  Bill No
                  <input
                    type="text"
                    placeholder="e.g. 105"
                    value={editForm.billNo}
                    onChange={e => setEditForm(current => ({ ...current, billNo: e.target.value }))}
                    className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm font-normal"
                  />
                </label>
                <label className="block text-xs font-bold text-slate-700">
                  Remarks / Lot
                  <input
                    type="text"
                    placeholder="Remarks"
                    value={editForm.remarks}
                    onChange={e => setEditForm(current => ({ ...current, remarks: e.target.value }))}
                    className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm font-normal"
                  />
                </label>
              </div>

              <div className="rounded-xl bg-blue-50 border border-blue-200 p-3.5 text-right text-sm font-bold text-blue-900 flex items-center justify-between">
                <span className="text-xs text-blue-700 font-medium">Recalculated Amount:</span>
                <span className="font-mono text-base font-black">
                  Rs. {((Number(editForm.pairs) || 0) * (Number(editForm.rate) || 0)).toLocaleString()}
                </span>
              </div>
              <div className="flex justify-end gap-2 pt-1 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingEntry(null)}
                  disabled={isSavingEdit}
                  className="rounded-xl px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-100 border border-slate-200 transition cursor-pointer flex items-center gap-1.5"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>Cancel / Back</span>
                </button>
                <button
                  type="submit"
                  disabled={isSavingEdit}
                  className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-60 transition cursor-pointer"
                >
                  {isSavingEdit && <Loader2 className="h-4 w-4 animate-spin" />}
                  {isSavingEdit ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {deletingEntry && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto"
          onClick={(e) => {
            if (e.target === e.currentTarget) setDeletingEntry(null);
          }}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl my-auto animate-in fade-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <h3 className="text-lg font-bold text-slate-900">Delete Cutting Entry?</h3>
              <button
                type="button"
                onClick={() => setDeletingEntry(null)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 transition cursor-pointer"
                aria-label="Close / Back"
                title="Close / Back (Esc)"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="mt-3 text-sm text-slate-600">
              Delete this entry permanently? Date: {formatConfirmationDate(deletingEntry.date)}, Customer: {deletingEntry.customerName || '-'}, Pairs: {deletingEntry.pairs}, Total: Rs.{deletingEntry.pairs * deletingEntry.rate}. This action cannot be undone.
            </p>
            <div className="mt-5 flex justify-end gap-2 border-t border-slate-100 pt-3">
              <button
                type="button"
                onClick={() => setDeletingEntry(null)}
                disabled={isDeletingEntry}
                className="rounded-xl px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-100 border border-slate-200 transition cursor-pointer flex items-center gap-1.5"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Cancel / Back</span>
              </button>
              <button
                type="button"
                onClick={handleDeleteEntry}
                disabled={isDeletingEntry}
                className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-bold text-white hover:bg-rose-700 disabled:opacity-60 transition cursor-pointer"
              >
                {isDeletingEntry ? 'Deleting...' : 'Delete Entry'}
              </button>
            </div>
          </div>
        </div>
      )}

      {paymentToDelete && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto"
          onClick={(e) => {
            if (e.target === e.currentTarget && !isDeletingPayment) setPaymentToDelete(null);
          }}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white p-5 sm:p-6 shadow-2xl my-auto animate-in fade-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5 text-rose-600">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-rose-100">
                  <Trash2 className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900">
                    Delete Payment Entry?
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    {paymentToDelete.type === 'cash_out' ? 'Cash Out (Payment)' : 'Cash In'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPaymentToDelete(null)}
                disabled={isDeletingPayment}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 cursor-pointer"
                title="Close (Esc)"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="mt-4 space-y-2 text-xs text-slate-600">
              <p>
                Are you sure you want to delete this payment of{' '}
                <span className="font-bold text-slate-900 font-mono">Rs. {paymentToDelete.amount.toLocaleString()}</span> dated{' '}
                <span className="font-bold text-slate-900 font-mono">{formatDate(paymentToDelete.date)}</span>?
              </p>
              {paymentToDelete.billNo && (
                <p className="text-slate-500">
                  Bill No: <span className="font-mono font-semibold text-slate-700">{paymentToDelete.billNo}</span>
                </p>
              )}
              <p className="text-amber-800 bg-amber-50 rounded-lg p-2.5 border border-amber-200 text-[11px]">
                The running ledger balance will automatically recalculate.
              </p>
            </div>
            <div className="mt-5 flex justify-end gap-2 border-t border-slate-100 pt-3">
              <button
                type="button"
                onClick={() => setPaymentToDelete(null)}
                disabled={isDeletingPayment}
                className="rounded-xl px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 border border-slate-200 transition cursor-pointer flex items-center gap-1.5"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Cancel / Back</span>
              </button>
              <button
                type="button"
                disabled={isDeletingPayment}
                onClick={async () => {
                  if (!db || !paymentToDelete) return;
                  setIsDeletingPayment(true);
                  try {
                    await deleteDoc(doc(db, 'nasim_ledger_payments', paymentToDelete.id));
                    setLedgerPayments(prev => prev.filter(p => p.id !== paymentToDelete.id));
                    showToast('Payment deleted successfully.');
                    setPaymentToDelete(null);
                  } catch (err) {
                    console.error('Error deleting payment:', err);
                    showToast('Could not delete payment. Please try again.', 'error');
                  } finally {
                    setIsDeletingPayment(false);
                  }
                }}
                className="rounded-xl bg-rose-600 px-4 py-2 text-xs font-bold text-white hover:bg-rose-700 disabled:opacity-60 transition cursor-pointer"
              >
                {isDeletingPayment ? 'Deleting...' : 'Delete Payment'}
              </button>
            </div>
          </div>
        </div>
      )}

      {editingPayment && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto"
          onClick={(e) => {
            if (e.target === e.currentTarget) setEditingPayment(null);
          }}
        >
          <div
            className="w-full max-w-lg rounded-2xl bg-white p-5 sm:p-6 shadow-2xl my-auto animate-in fade-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-lg font-black text-slate-900">
                  Edit Payment &bull; {editingPayment.type === 'cash_out' ? 'Cash Out (Payment)' : 'Cash In'}
                </h3>
                <p className="text-xs text-slate-500">
                  Update payment details. Balance will recalculate automatically.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingPayment(null)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition cursor-pointer"
                aria-label="Close / Back"
                title="Close / Back (Esc)"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleUpdatePayment} className="space-y-4 pt-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Payment Date *
                </label>
                <input
                  type="date"
                  required
                  value={editPaymentForm.date}
                  onChange={e => setEditPaymentForm(f => ({ ...f, date: e.target.value }))}
                  className="w-full rounded-xl border border-slate-300 p-2.5 text-xs font-semibold text-slate-800 focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Amount (Rs.) *
                </label>
                <input
                  type="number"
                  required
                  min="1"
                  step="any"
                  value={editPaymentForm.amount}
                  onChange={e => setEditPaymentForm(f => ({ ...f, amount: e.target.value }))}
                  className="w-full rounded-xl border border-slate-300 p-2.5 text-xs font-mono font-bold text-slate-900 focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Payment Method
                  </label>
                  <select
                    value={editPaymentForm.paymentMethod}
                    onChange={e => setEditPaymentForm(f => ({ ...f, paymentMethod: e.target.value as any }))}
                    className="w-full rounded-xl border border-slate-300 p-2.5 text-xs bg-white text-slate-800 focus:border-blue-500 focus:outline-none"
                  >
                    <option value="Cash">Cash</option>
                    <option value="Easypaisa">Easypaisa</option>
                    <option value="JazzCash">JazzCash</option>
                    <option value="Bank Transfer">Bank Transfer</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Bill / Voucher No
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. BILL-001"
                    value={editPaymentForm.billNo}
                    onChange={e => setEditPaymentForm(f => ({ ...f, billNo: e.target.value }))}
                    className="w-full rounded-xl border border-slate-300 p-2.5 text-xs text-slate-800 focus:border-blue-500 focus:outline-none font-mono"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2.5 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingPayment(null)}
                  disabled={isSavingEditPayment}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 transition cursor-pointer flex items-center gap-1.5"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Cancel / Back</span>
                </button>
                <button
                  type="submit"
                  disabled={isSavingEditPayment}
                  className="rounded-xl bg-blue-600 hover:bg-blue-700 px-5 py-2 text-xs font-bold text-white shadow-md shadow-blue-600/20 transition cursor-pointer disabled:opacity-60 flex items-center gap-1.5"
                >
                  {isSavingEditPayment ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Saving...</span>
                    </>
                  ) : (
                    <span>Save Changes</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {cutterDeleteTarget && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto"
          onClick={(e) => {
            if (e.target === e.currentTarget) setCutterDeleteTarget(null);
          }}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl my-auto animate-in fade-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <h3 className="text-lg font-bold text-slate-900">Delete Cutter?</h3>
              <button
                type="button"
                onClick={() => setCutterDeleteTarget(null)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 transition cursor-pointer"
                aria-label="Close / Back"
                title="Close / Back (Esc)"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="mt-3 text-sm text-slate-600">
              Delete the ledger for {getCutterLedgerName(cutterDeleteTarget)}?
            </p>
            <div className="mt-4 space-y-2 rounded-xl bg-slate-50 p-3 text-sm">
              <label className="flex items-center gap-2">
                <input type="radio" checked={!deleteKhataData} onChange={() => setDeleteKhataData(false)} />
                Delete the cutter only and retain ledger entries
              </label>
              <label className="flex items-center gap-2 text-rose-700">
                <input type="radio" checked={deleteKhataData} onChange={() => setDeleteKhataData(true)} />
                Also delete this cutter's cutting entries and transaction records
              </label>
            </div>
            <p className="mt-3 text-xs text-rose-600">Deleted data cannot be recovered.</p>
            <div className="mt-5 flex justify-end gap-2 border-t border-slate-100 pt-3">
              <button
                type="button"
                disabled={isSavingCutter}
                onClick={() => setCutterDeleteTarget(null)}
                className="rounded-xl px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-100 border border-slate-200 transition cursor-pointer flex items-center gap-1.5"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Cancel / Back</span>
              </button>
              <button
                type="button"
                disabled={isSavingCutter}
                onClick={handleDeleteCutter}
                className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-60 transition cursor-pointer"
              >
                {isSavingCutter ? 'Deleting...' : 'Delete Cutter'}
              </button>
            </div>
          </div>
        </div>
      )}

      {cutterStatusTarget && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto"
          onClick={(e) => {
            if (e.target === e.currentTarget) setCutterStatusTarget(null);
          }}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl my-auto animate-in fade-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <h3 className="text-lg font-bold text-slate-900">{cutterStatusTarget.isActive === false ? 'Activate Cutter?' : 'Deactivate Cutter?'}</h3>
              <button
                type="button"
                onClick={() => setCutterStatusTarget(null)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 transition cursor-pointer"
                aria-label="Close / Back"
                title="Close / Back (Esc)"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="mt-3 text-sm text-slate-600">
              {cutterStatusTarget.isActive === false
                ? `Activate ${cutterStatusTarget.name} again?`
                : `Deactivate ${cutterStatusTarget.name}? New cutting entries will be disabled.`}
            </p>
            {cutterStatusTarget.isActive !== false && (() => {
              const pendingAmount = cuttingEntries
                .filter(entry => entry.cutterId === cutterStatusTarget.id)
                .reduce((sum, entry) => sum + (entry.totalBalance ?? entry.lotTotal), 0) ||
                cuttingTransactions
                  .filter(tx => tx.cutterId === cutterStatusTarget.id)
                  .reduce((sum, tx) => sum + (tx.totalBalance ?? tx.lotTotal ?? tx.qty * (tx.rate || 0)), 0);
              return pendingAmount > 0 ? (
                <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm font-bold text-amber-800">
                  This cutter has an outstanding balance of Rs. {pendingAmount}. Deactivate anyway?
                </p>
              ) : null;
            })()}
            <div className="mt-5 flex justify-end gap-2 border-t border-slate-100 pt-3">
              <button
                type="button"
                onClick={() => setCutterStatusTarget(null)}
                className="rounded-xl px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-100 border border-slate-200 transition cursor-pointer flex items-center gap-1.5"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Cancel / Back</span>
              </button>
              <button
                type="button"
                onClick={handleCutterStatusChange}
                className={`rounded-xl px-4 py-2 text-sm font-bold text-white transition cursor-pointer ${cutterStatusTarget.isActive === false ? 'bg-emerald-600' : 'bg-rose-600'}`}
              >
                {cutterStatusTarget.isActive === false ? 'Activate Cutter' : 'Deactivate Cutter'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

class CuttingLedgerErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError(): { hasError: boolean } {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div role="alert" className="mx-auto max-w-xl rounded-2xl border border-rose-200 bg-white p-8 text-center shadow-sm">
          <h2 className="text-lg font-black text-slate-900">Cutting ledger could not be displayed</h2>
          <p className="mt-2 text-sm text-slate-600">Return to the cutting roster or reload the page to try again.</p>
          <button type="button" onClick={() => window.location.reload()} className="mt-4 rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white">
            Reload page
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export const CuttingsPage: React.FC<CuttingsPageProps> = props => (
  <CuttingLedgerErrorBoundary>
    <React.Suspense fallback={<div className="p-8 text-center text-sm font-semibold text-slate-500">Loading cutting ledger…</div>}>
      <CuttingsPageContent {...props} />
    </React.Suspense>
  </CuttingLedgerErrorBoundary>
);

