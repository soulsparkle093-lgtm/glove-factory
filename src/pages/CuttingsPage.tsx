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
  Loader2
} from 'lucide-react';
import { useFactory } from '../context/FactoryContext';
import { formatDate } from '../utils/factoryFormatters';
import { Cutter, CutterCategory, CuttingEntry, CuttingTransaction } from '../types/factory';
import { collection, db, deleteDoc, doc, onSnapshot, runTransaction, serverTimestamp } from '../firebase';

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

interface NasimLedgerPayment {
  id: string;
  cutterId: string;
  cutterName: string;
  date: string;
  amount: number;
  paymentMethod: LedgerPaymentMethod;
  billNo: string;
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
    updateCuttingEntry,
    deleteCuttingEntry,
    updateCuttingReturn,
    deleteCuttingReturn,
    returnCutting,
    showToast 
  } = useFactory();

  // Selected Option at top level: Cutting Man | Cutting Maker | Product
  const [selectedCategory, setSelectedCategory] = useState<CutterCategory>('cutting_man');

  // Active cutter selected for ledger view (Step B)
  const [activeCutterId, setActiveCutterId] = useState<string | null>(null);

  // Search filter
  const [searchQuery, setSearchQuery] = useState('');

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
  // 8. Checkbox "Add to Stock Ledger?" (Receive only)
  const [deliveryChoice, setDeliveryChoice] = useState<'customer' | 'stock'>('customer');
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
    billNo: ''
  });
  const [isSavingPayment, setIsSavingPayment] = useState(false);
  const savingPaymentRef = useRef(false);
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
    const entries = cuttingEntries.filter(entry => entry.cutterId === activeCutterId);
    const savedIds = new Set(entries.map(entry => entry.id));
    const legacyEntries = activeCutterTransactions
      .filter(tx => !savedIds.has(tx.id))
      .map(tx => ({
        id: tx.id,
        cutterId: tx.cutterId,
        cutterName: tx.cutterName,
        type: tx.type,
        date: tx.date,
        customerName: tx.customerName || '',
        article: tx.article,
        articleTitle: tx.articleTitle || tx.article,
        size: tx.size || '',
        sizeName: tx.sizeName || tx.size || '',
        average: tx.average || '',
        remarks: tx.remarks || tx.notes || '',
        pairs: tx.qty,
        totalQty: tx.totalQty || tx.qty,
        rate: tx.rate || 0,
        lotTotal: tx.totalBalance || tx.lotTotal || tx.qty * (tx.rate || 0),
        totalBalance: tx.totalBalance || tx.lotTotal || tx.qty * (tx.rate || 0),
        runningBalance: 0,
        billNo: tx.billNo || '',
        createdAt: tx.createdAt
      }));
    const chronological = [...entries, ...legacyEntries]
      .sort((a, b) => (a.date || '').localeCompare(b.date || '') || (a.createdAt || '').localeCompare(b.createdAt || '') || a.id.localeCompare(b.id));
    let runningBalance = 0;
    return chronological.map(entry => {
      const pairs = Number(entry.pairs ?? entry.totalQty) || 0;
      const rate = Number(entry.rate) || 0;
      const lotTotal = Number(entry.totalBalance) || Number(entry.lotTotal) || pairs * rate;
      runningBalance += lotTotal;
      return { ...entry, pairs, rate, lotTotal, totalBalance: lotTotal, runningBalance };
    });
  }, [activeCutterTransactions, cuttingEntries, activeCutterId]);

  useEffect(() => {
    if (!db || !activeCutterId) {
      setLedgerPayments([]);
      return;
    }
    return onSnapshot(collection(db, 'nasim_ledger_payments'), snapshot => {
      const entries = snapshot.docs.flatMap(document => {
        const data = document.data();
        if (data.cutterId !== activeCutterId) return [];
        const method = ['Cash', 'Easypaisa', 'JazzCash', 'Bank Transfer'].includes(data.paymentMethod)
          ? data.paymentMethod as LedgerPaymentMethod
          : 'Cash';
        const createdAt = data.createdAt as { toDate?: () => Date; toMillis?: () => number } | string | undefined;
        return [{
          id: document.id,
          cutterId: String(data.cutterId),
          cutterName: String(data.cutterName || ''),
          date: String(data.date || ''),
          amount: Number(data.amount) || 0,
          paymentMethod: method,
          billNo: String(data.billNo || ''),
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
      distinctEntries.sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
      setLedgerPayments(distinctEntries);
      duplicateIds.forEach(id => {
        void deleteDoc(doc(db, 'nasim_ledger_payments', id)).catch(error => {
          console.error(`Unable to remove duplicate ledger payment ${id}:`, error);
        });
      });
    }, error => console.error('Unable to load Nasim ledger payments:', error));
  }, [activeCutterId]);

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

  const totalCuttingAmount = dateFilteredEntries.reduce((sum, entry) =>
    sum + (Number(entry.pairs) || 0) * (Number(entry.rate) || 0), 0);
  const totalPaid = dateFilteredPayments
    .filter(payment => payment.type === 'cash_in')
    .reduce((sum, payment) => sum + payment.amount, 0);
  const remainingBalance = totalCuttingAmount - totalPaid;
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
    setFormRate('');
    setFormArticle('');
    setFormOrderId('');
    setFormCustomerName('');
    setFormBillNo('');
    setFormFactoryNotes(activeCutter?.name ? `${activeCutter.name} Unit` : '');
    setDeliveryChoice('customer');
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
    if (!formArticle.trim()) {
      showToast('Enter an article.', 'error');
      return;
    }
    if (!formSize.trim()) {
      showToast('Enter a size.', 'error');
      return;
    }
    if (!formAverage.trim()) {
      showToast('Enter an average.', 'error');
      return;
    }
    if (!formRate || !Number.isFinite(parsedRate) || parsedRate <= 0) {
      showToast('Enter a valid rate.', 'error');
      return;
    }
    if (txModalType === 'RECEIVE' && deliveryChoice === 'customer' && !formOrderId) {
      showToast('Select a customer order for direct delivery.', 'error');
      return;
    }

    setIsSubmittingTx(true);
    try {
      // Find selected order
      const targetOrder = deliveryChoice === 'customer' ? orders.find(o => o.id === formOrderId) : undefined;
      const totalBalance = parsedQty * parsedRate;

      await saveCuttingTransaction({
        cutterId: activeCutter.id,
        cutterName: activeCutter.name,
        cutterType: activeCutter.cutterType,
        type: txModalType,
        date: formDate,
        qty: parsedQty,
        totalQty: parsedQty,
        rate: parsedRate,
        article: formArticle.trim(),
        articleTitle: formArticle.trim(),
        orderId: deliveryChoice === 'customer' ? formOrderId || undefined : undefined,
        orderNo: targetOrder?.orderNo || undefined,
        customerName: targetOrder?.customerName || formCustomerName.trim() || 'PRO4',
        size: formSize.trim(),
        sizeName: formSize.trim(),
        average: parsedAverage > 0 ? String(parsedAverage) : formAverage.trim(),
        totalBalance,
        customerOrder: targetOrder?.customerName || formCustomerName.trim() || 'PRO4',
        billNo: formBillNo.trim() || undefined,
        factoryName: formFactoryNotes.trim() || undefined,
        addToStock: txModalType === 'RECEIVE' ? deliveryChoice === 'stock' : false,
        notes: formFactoryNotes.trim() || undefined
      });
      setFormQty('');
      setFormArticle('');
      setFormSize('');
      setFormAverage('');
      setFormRate('');
      setFormCustomerName('');
      setFormOrderId('');
      setFormBillNo('');
      setFormFactoryNotes('');
      handleCloseTxModal();
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
      date: entry.date,
      customerName: entry.customerName || '',
      article: entry.article || '',
      size: entry.size || '',
      average: entry.average || '',
      remarks: entry.remarks || '',
      pairs: String(Math.abs(entry.pairs)),
      rate: String(entry.rate),
      billNo: entry.billNo || ''
    });
  };

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
      showToast('Cutting entry updated successfully.');
    } catch (err) {
      console.error('Error updating cutting entry:', err);
      showToast('The cutting entry could not be updated. Please try again.', 'error');
    } finally {
      setIsSavingEdit(false);
    }
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
    entries: CuttingEntry[],
    payments: NasimLedgerPayment[],
    title: string,
    fileName: string,
    rangeLabel: string
  ) => {
    const chronologicalEntries = [...entries].sort((a, b) =>
      (a.date || '').localeCompare(b.date || '') ||
      (a.createdAt || '').localeCompare(b.createdAt || '') ||
      a.id.localeCompare(b.id)
    );
    const totalCutting = chronologicalEntries.reduce((sum, entry) => {
      const pairs = Number(entry.pairs ?? entry.totalQty) || 0;
      const rate = Number(entry.rate) || 0;
      return sum + pairs * rate;
    }, 0);
    const paid = payments.filter(payment => payment.type === 'cash_in').reduce((sum, payment) => sum + payment.amount, 0);
    const rows = chronologicalEntries.map(entry => {
      const pairs = Number(entry.pairs ?? entry.totalQty) || 0;
      const rate = Number(entry.rate) || 0;
      const total = pairs * rate;
      return [
        formatConfirmationDate(entry.date),
        entry.articleTitle || entry.article || '-',
        entry.sizeName || entry.size || '-',
        String(pairs),
        `Rs. ${rate}`,
        `Rs. ${total}`
      ];
    });
    const doc = new jsPDF({ orientation: 'landscape' });
    doc.setFontSize(14);
    doc.text(title, 14, 15);
    doc.setFontSize(9);
    doc.text(`${rangeLabel} | Total Entries: ${chronologicalEntries.length}`, 14, 22);
    autoTable(doc, {
      head: [['DATE', 'ARTICLE', 'SIZE', 'PAIRS', 'RATE', 'TOTAL AMOUNT']],
      body: rows,
      startY: 27,
      styles: { fontSize: 8 },
      headStyles: { fillColor: [30, 64, 175] },
    });
    const tableEnd = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY || 30;
    let summaryY = tableEnd + 20;
    if (summaryY + 36 > doc.internal.pageSize.getHeight() - 12) {
      doc.addPage();
      summaryY = 18;
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    const remaining = totalCutting - paid;
    const extra = Math.max(0, -remaining);
    doc.text(`Total Bill: Rs. ${totalCutting.toLocaleString()}`, 14, summaryY);
    doc.text(`Total Paid: Rs. ${paid.toLocaleString()}`, 14, summaryY + 6);
    doc.text(`Baqaya / Remaining: Rs. ${remaining.toLocaleString()}`, 14, summaryY + 12);
    if (extra > 0) doc.text(`Extra Paid: Rs. ${extra.toLocaleString()}`, 14, summaryY + 18);
    autoTable(doc, {
      head: [['Date', 'Type', 'Amount', 'Method', 'Bill No']],
      body: payments.map(payment => [
        formatConfirmationDate(payment.date),
        payment.type === 'cash_in' ? 'Cash In' : 'Cash Out',
        `Rs. ${payment.amount}`,
        payment.paymentMethod,
        payment.billNo || '-'
      ]),
      startY: summaryY + (extra > 0 ? 27 : 21),
      styles: { fontSize: 8 },
      headStyles: { fillColor: [30, 64, 175] },
      didDrawPage: () => undefined
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
    const customerName = activeCutter?.name || 'Cutting';
    const safeCustomerName = customerName.replace(/[<>:"/\\|?*]+/g, '_');
    exportLedgerPdf(
      dateFilteredEntries,
      dateFilteredPayments,
      `${customerName} Cutting Ledger - ${formatLedgerTitleFilter(ledgerDateFilter, filterFromDate, filterToDate)}`,
      `${safeCustomerName}_FullLedger_${filterName}_${dateSuffix}.pdf`,
      formatLedgerRange(ledgerDateFilter, filterFromDate, filterToDate)
    );
  };

  const handleCashbookPdf = () => {
    const filterName = ledgerDateFilter === 'Others'
      ? `${filterFromDate || 'start'}-to-${filterToDate || 'end'}`
      : ledgerDateFilter.replace(/\s+/g, '_');
    const dateSuffix = new Date().toISOString().slice(0, 10);
    const customerName = activeCutter?.name || 'Cutting';
    const safeCustomerName = customerName.replace(/[<>:"/\\|?*]+/g, '_');
    exportLedgerPdf(
      dateFilteredEntries,
      dateFilteredPayments,
      `${customerName} Cutting Cashbook - ${formatLedgerTitleFilter(ledgerDateFilter, filterFromDate, filterToDate)}`,
      `${safeCustomerName}_Cashbook_${filterName}_${dateSuffix}.pdf`,
      `Cashbook | ${formatLedgerRange(ledgerDateFilter, filterFromDate, filterToDate)}`
    );
  };

  const handleFilteredPdfDownload = (event: React.FormEvent) => {
    event.preventDefault();
    if (!pdfFromDate || !pdfToDate || pdfFromDate > pdfToDate) {
      showToast('Enter a valid start and end date.', 'error');
      return;
    }
    setIsGeneratingPdf(true);
    try {
      const entries = activeCutterEntries.filter(entry =>
        entry.date >= pdfFromDate &&
        entry.date <= pdfToDate
      );
      const payments = ledgerPayments.filter(payment => payment.date >= pdfFromDate && payment.date <= pdfToDate);
      if (entries.length === 0 && payments.length === 0) {
        showToast('No entries were found in this date range.', 'error');
        return;
      }
      const range = `${formatConfirmationDate(pdfFromDate)} to ${formatConfirmationDate(pdfToDate)}`;
      const customerName = activeCutter?.name || 'Cutting';
      const safeCustomerName = customerName.replace(/[<>:"/\\|?*]+/g, '_');
      exportLedgerPdf(
        entries,
        payments,
        `${customerName} Cutting Ledger - ${range}`,
        `${safeCustomerName}_FullLedger_${pdfFromDate}-to-${pdfToDate}.pdf`,
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

  const openPaymentModal = (type: 'cash_in' | 'cash_out') => {
    setPaymentForm({
      date: new Date().toISOString().slice(0, 10),
      amount: '',
      paymentMethod: 'Cash',
      billNo: ''
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
          amount
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

        transaction.set(paymentRef, {
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
        });
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
        type: paymentModalType,
        createdAt: new Date(createdAtMillis).toISOString()
      }, ...previous.filter(payment => payment.id !== result.id)]);
      setPaymentModalType(null);
      showToast(paymentModalType === 'cash_in' ? 'Cash-in recorded.' : 'Cash-out recorded.');
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
      showToast('Payment deleted.');
    } catch (error) {
      console.error('Unable to delete Nasim ledger payment:', error);
      showToast(error instanceof Error ? error.message : 'The payment could not be deleted.', 'error');
    }
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
                    onClick={() => setActiveCutterId(cutter.id)}
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
      {activeCutterId && activeCutter && (
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

              {/* Two Main Action Buttons as strictly required:
                  1. "Issue Cutting" (Orange)
                  2. "Receive Cutting" (Green) */}
              <div className="flex items-center gap-3">
                <button
                  onClick={() => handleOpenTxModal('GIVE')}
                  disabled={activeCutter.isActive === false}
                  className="flex-1 sm:flex-none px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold bg-amber-500 hover:bg-amber-600 text-white shadow-md shadow-amber-500/25 transition active:scale-95 flex items-center justify-center gap-2 cursor-pointer"
                >
                  <ArrowUpRight className="w-4 h-4" />
                  <span>Issue Cutting</span>
                </button>

                <button
                  onClick={() => handleOpenTxModal('RECEIVE')}
                  disabled={activeCutter.isActive === false}
                  className="flex-1 sm:flex-none px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-md shadow-emerald-600/25 transition active:scale-95 flex items-center justify-center gap-2 cursor-pointer"
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
                <p className="text-[11px] text-emerald-900/70 mt-1">Cash-in payments in this date range</p>
              </div>

              <div className="p-4 rounded-xl bg-blue-50/80 border border-blue-200">
                <span className="text-[11px] font-bold uppercase tracking-wider text-blue-800 block">
                  Pending Balance
                </span>
                <div className={`text-2xl font-black font-mono mt-1 ${remainingBalance < 0 ? 'text-emerald-700' : 'text-blue-700'}`}>
                  Rs. {remainingBalance.toLocaleString()}
                </div>
                <p className="text-[11px] text-blue-900/70 mt-1">Cutting amount minus total paid</p>
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
                <button onClick={handleDateWisePdf} className="rounded-lg bg-orange-500 px-3 py-2 text-xs font-bold text-white hover:bg-orange-600">Date-Range Ledger PDF</button>
                <button onClick={handleFullLedgerPdf} className="rounded-lg bg-rose-600 px-3 py-2 text-xs font-bold text-white hover:bg-rose-700">Full Ledger PDF</button>
                <button onClick={handleCashbookPdf} className="rounded-lg bg-slate-700 px-3 py-2 text-xs font-bold text-white hover:bg-slate-800">Cashbook PDF</button>
                <button onClick={() => openPaymentModal('cash_in')} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-700">Cash In</button>
                <button onClick={() => openPaymentModal('cash_out')} className="rounded-lg bg-rose-600 px-3 py-2 text-xs font-bold text-white hover:bg-rose-700">Cash Out</button>
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
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">{visibleLedgerEntries.length} Entries</span>
              </div>
            </div>

            <div className="overflow-x-auto">
              {visibleLedgerEntries.length === 0 ? (
                <div className="p-12 text-center text-slate-400">
                  <BookOpen className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  <p className="text-xs">{ledgerSearch ? 'No matching customer entries.' : `No entries in ${activeCutter.name}'s notebook yet.`}</p>
                  <p className="text-xs mt-1 text-slate-500">
                    Select "Issue Cutting" or "Receive Cutting" above to add the first record.
                  </p>
                </div>
              ) : (
                <table className="min-w-[1250px] w-full text-left text-xs">
                  <thead>
                    <tr className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200 uppercase text-[10px] tracking-wider">
                      <th className="py-3 px-4">1. Date (Wasool Date)</th>
                      <th className="py-3 px-4">2. Customer Name</th>
                      <th className="py-3 px-4">Article</th>
                      <th className="py-3 px-4">Size</th>
                      <th className="py-3 px-4 text-right">Pairs</th>
                      <th className="py-3 px-4">Average</th>
                      <th className="py-3 px-4 text-right">Rate (Rs.)</th>
                      <th className="py-3 px-4 text-right">Total Balance</th>
                      <th className="py-3 px-4 text-right">Balance</th>
                      <th className="py-3 px-4 text-center">10. Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium">
                    {visibleLedgerEntries.map(entry => {
                      return (
                        <tr key={entry.id} className={entry.type === 'RETURN' ? 'bg-[#ffe6e6] font-bold text-[#cc0000]' : 'hover:bg-slate-50/70 transition'}>
                          <td className="py-3.5 px-4 font-mono">{formatDate(entry.date)}</td>
                          <td className="py-3.5 px-4">{entry.customerName || 'PRO4'}</td>
                          <td className="py-3.5 px-4 font-bold text-slate-900">
                            {entry.articleTitle || entry.article}
                            {entry.type === 'RETURN' && <span className="mt-1 block text-[10px] font-semibold text-[#cc0000]">{entry.remarks}</span>}
                          </td>
                          <td className="py-3.5 px-4">{entry.sizeName || entry.size || '-'}</td>
                          {(['pairs'] as const).map(field => (
                            <td
                              key={field}
                              className="py-3.5 px-4 text-right font-mono"
                              title={entry.type === 'RETURN' ? undefined : 'Double-click to quick edit'}
                              onDoubleClick={entry.type === 'RETURN' ? undefined : () => setInlineEdit({
                                entry,
                                field,
                                value: String(entry[field])
                              })}
                            >
                              {inlineEdit?.entry.id === entry.id && inlineEdit.field === field ? (
                                <input
                                  autoFocus
                                  type="number"
                                  min={field === 'pairs' ? '1' : '0'}
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
                                <span className={entry.type === 'RETURN' ? 'font-black text-[#cc0000]' : 'cursor-text'}>
                                  {entry.type === 'RETURN' ? '-' : ''}{Math.abs(entry[field])}
                                </span>
                              )}
                            </td>
                          ))}
                          <td className="py-3.5 px-4">{entry.average || '-'}</td>
                          <td
                            className="py-3.5 px-4 text-right font-mono"
                            title={entry.type === 'RETURN' ? undefined : 'Double-click to quick edit'}
                            onDoubleClick={entry.type === 'RETURN' ? undefined : () => setInlineEdit({ entry, field: 'rate', value: String(entry.rate) })}
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
                              <span className={entry.rate ? 'cursor-text' : 'cursor-text text-rose-600'}>
                                {entry.rate ? `Rs. ${entry.rate}` : 'Rs. 0 - Old Entry'}
                              </span>
                            )}
                          </td>
                          <td className={`py-3.5 px-4 text-right font-mono font-bold ${entry.type === 'RETURN' ? 'text-[#cc0000]' : 'text-emerald-700'}`}>
                            Rs. {Number(entry.totalBalance) || Number(entry.lotTotal) || entry.pairs * entry.rate}
                          </td>
                          <td className={`py-3.5 px-4 text-right font-mono font-bold ${entry.type === 'RETURN' ? 'text-[#cc0000]' : 'text-blue-800 bg-blue-50'}`}>
                            Rs. {entry.runningBalance}
                          </td>
                          <td className="py-3.5 px-4 text-center">
                            <>
                                <button
                                  onClick={() => openEditEntry(entry)}
                                  className="p-1 rounded text-slate-400 hover:text-blue-600 transition cursor-pointer"
                                  title="Edit entry"
                                >
                                  <Pencil className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => setDeletingEntry(entry)}
                                  className="p-1 rounded text-slate-400 hover:text-rose-600 transition cursor-pointer"
                                  title="Delete entry"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                                {entry.type === 'RECEIVE' && (
                                  <button
                                    type="button"
                                    onClick={() => openReturnModal(entry)}
                                    className="ml-1 rounded-lg bg-rose-100 px-2 py-1 text-[10px] font-black text-rose-700 hover:bg-rose-200"
                                    title="Return cutting pairs"
                                  >
                                    ↩ Return
                                  </button>
                                )}
                            </>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-slate-300 bg-slate-50 font-black">
                      <td className="px-4 py-3" colSpan={4}>TOTAL</td>
                      <td className="px-4 py-3 text-right">{visibleLedgerEntries.reduce((sum, entry) => sum + entry.pairs, 0)}</td>
                      <td colSpan={2}></td>
                      <td className="px-4 py-3 text-right text-emerald-700">
                        Rs. {visibleLedgerEntries.reduce((sum, entry) => sum + entry.pairs * entry.rate, 0).toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-right text-blue-800" colSpan={2}>
                        Pending: Rs. {remainingBalance.toLocaleString()}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              )}
            </div>
          </div>

          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
            <div className="border-b border-slate-200 px-4 py-4 sm:px-5">
              <h3 className="font-bold text-slate-900">Payment History</h3>
              <p className="mt-1 text-xs text-slate-500">Cash in and cash out records for {activeCutter.name}, filtered by the selected date range.</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="bg-slate-100 text-[11px] uppercase tracking-wide text-slate-600">
                  <tr>
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3 text-right">Amount</th>
                    <th className="px-4 py-3">Method</th>
                    <th className="px-4 py-3">Bill No</th>
                    <th className="px-4 py-3">Type</th>
                    <th className="px-4 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {dateFilteredPayments.map(payment => (
                    <tr key={payment.id}>
                      <td className="px-4 py-3">{formatDate(payment.date)}</td>
                      <td className="px-4 py-3 text-right font-mono font-bold">Rs. {payment.amount.toLocaleString()}</td>
                      <td className="px-4 py-3">{payment.paymentMethod}</td>
                      <td className="px-4 py-3">{payment.billNo || '-'}</td>
                      <td className={`px-4 py-3 font-bold ${payment.type === 'cash_in' ? 'text-emerald-700' : 'text-rose-700'}`}>{payment.type === 'cash_in' ? 'Cash In' : 'Cash Out'}</td>
                      <td className="px-4 py-3 text-right">
                        <button type="button" onClick={() => void handleDeletePayment(payment.id)} className="rounded-lg p-2 text-rose-600 hover:bg-rose-50" aria-label="Delete payment">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {dateFilteredPayments.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-slate-500">No payments in this date range.</td></tr>}
                </tbody>
                <tfoot className="border-t-2 border-slate-300 bg-slate-50 text-sm font-black">
                  <tr>
                    <td className="px-4 py-3">Total Bill</td>
                    <td className="px-4 py-3 text-right font-mono text-amber-700">Rs. {totalCuttingAmount.toLocaleString()}</td>
                    <td className="px-4 py-3" colSpan={4}>Cutting entries in this date range</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3">Total Paid</td>
                    <td className="px-4 py-3 text-right font-mono text-emerald-700">Rs. {totalPaid.toLocaleString()}</td>
                    <td className="px-4 py-3" colSpan={4}>Cash In payments in this date range</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3">Baqaya</td>
                    <td className={`px-4 py-3 text-right font-mono ${remainingBalance < 0 ? 'text-emerald-700' : 'text-blue-800'}`}>Rs. {remainingBalance.toLocaleString()}</td>
                    <td className="px-4 py-3 text-emerald-700" colSpan={4}>
                      {extraPaid > 0 ? `Extra Paid: Rs. ${extraPaid.toLocaleString()}` : ' '}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </section>
        </div>
      )}

      {/* =========================================================================
          MODAL 1: ADD CUTTER (Cutting Man / Cutting Maker / Product Cutter)
          ========================================================================= */}
      {isAddCutterOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-5 py-4 bg-amber-500 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Scissors className="w-5 h-5 text-white" />
                <h3 className="font-bold text-base">{editingCutter ? 'Edit Cutter' : `Add New ${catMeta.singular}`}</h3>
              </div>
              <button
                onClick={() => setIsAddCutterOpen(false)}
                className="p-1 rounded-lg hover:bg-white/20 text-white transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateCutter} className="p-5 space-y-4">
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

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsAddCutterOpen(false)}
                  disabled={isSavingCutter}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition cursor-pointer"
                >
                  Cancel
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden my-auto animate-in fade-in zoom-in-95 duration-150">
            {/* Header */}
            <div className={`px-5 py-4 text-white flex items-center justify-between ${
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
                onClick={handleCloseTxModal}
                className="p-1 rounded-lg hover:bg-white/20 text-white transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Entry Form strictly following requested sequence */}
            <form onSubmit={handleSubmitTransaction} className="p-5 sm:p-6 space-y-4">
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
                        required
                        role="combobox"
                        aria-expanded={isArticlePickerOpen}
                        aria-controls="receive-article-options"
                        placeholder={formArticle || 'Search all articles by name or code'}
                        value={articleSearch || formArticle}
                        onFocus={() => {
                          setArticleSearch('');
                          setIsArticlePickerOpen(true);
                        }}
                        onChange={event => {
                          setArticleSearch(event.target.value);
                          setIsArticlePickerOpen(true);
                          if (formArticle && event.target.value !== formArticle) setFormArticle('');
                        }}
                        className="min-w-0 flex-1 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-amber-500/20 sm:text-sm"
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
                        {filteredArticleOptions.length === 0 && <p className="px-3 py-2 text-xs text-slate-500">No active articles found.</p>}
                        <button type="button" role="option" onClick={() => handleArticleSelection('__other__')} className="block w-full rounded-lg px-3 py-2 text-left text-xs font-bold text-blue-700 hover:bg-blue-50">Other — add article</button>
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
                      Article Number
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

              {txModalType === 'RECEIVE' && (
                <fieldset className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <legend className="px-1 text-xs font-bold text-slate-700">Delivery Choice *</legend>
                  <label className="flex items-center gap-2 text-xs font-semibold text-slate-700">
                    <input type="radio" name="receive-destination" checked={deliveryChoice === 'customer'} onChange={() => setDeliveryChoice('customer')} />
                    Direct Deliver to Customer Order
                  </label>
                  <label className="flex items-center gap-2 text-xs font-semibold text-slate-700">
                    <input type="radio" name="receive-destination" checked={deliveryChoice === 'stock'} onChange={() => setDeliveryChoice('stock')} />
                    Send to Stock Management
                  </label>
                </fieldset>
              )}

              {/* Field 3: Order (Dropdown, filtered dynamically to show ONLY Customer Orders containing selected Article)
                  Format: "Customer Name - Order Date - Order ID" */}
              {(txModalType !== 'RECEIVE' || deliveryChoice === 'customer') && <div>
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
              </div>}

              {/* Field 5: Independent size, average, quantity, rate, balance and remarks */}
              <div className="rounded-xl bg-[#f0f6ff] p-[15px]">
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-3">
                  5. SIZE / QTY / AVERAGE / RATE / TOTAL - 5 BOXES
                </label>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
                  <div className="min-w-0">
                    <label className="mb-1 block text-[10px] font-bold text-blue-700">QUANTITY</label>
                    <input
                      id="quantity"
                      type="number"
                      min="1"
                      required
                      placeholder=""
                      value={formQty}
                      onChange={e => setFormQty(e.target.value)}
                      className="h-[45px] w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"
                    />
                  </div>
                  <div className="min-w-0">
                    <label className="mb-1 block text-[10px] font-bold text-blue-700">SIZE</label>
                    {txModalType === 'RECEIVE' && articlesMaster.find(article => article.articleName === formArticle)?.sizes.length ? (
                      <select id="sizeName" required value={formSize} onChange={event => {
                        const selected = articlesMaster.find(article => article.articleName === formArticle)?.sizes.find(size => size.sizeName === event.target.value);
                        setFormSize(event.target.value);
                        if (selected) setFormQty(String(selected.pairs));
                      }} className="h-[45px] w-full rounded-lg border border-slate-300 bg-white px-3 text-sm">
                        <option value="">Select size</option>
                        {articlesMaster.find(article => article.articleName === formArticle)?.sizes.map(size => <option key={size.sizeName} value={size.sizeName}>{size.sizeName} ({size.pairs})</option>)}
                      </select>
                    ) : (
                      <input id="sizeName" type="text" required value={formSize} onChange={e => setFormSize(e.target.value)} className="h-[45px] w-full rounded-lg border border-slate-300 bg-white px-3 text-sm" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <label className="mb-1 block text-[10px] font-bold text-blue-700">AVERAGE</label>
                    <input
                      id="average"
                      type="text"
                      required
                      placeholder=""
                      value={formAverage}
                      onChange={e => setFormAverage(e.target.value)}
                      className="h-[45px] w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"
                    />
                  </div>
                  <div className="min-w-0">
                    <label className="mb-1 block text-[10px] font-bold text-blue-700">RATE</label>
                    <input
                      id="rate"
                      type="number"
                      min="0"
                      step="any"
                      required
                      placeholder=""
                      value={formRate}
                      onChange={e => setFormRate(e.target.value)}
                      className="h-[45px] w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"
                    />
                  </div>
                  <div className="min-w-0">
                    <label className="mb-1 block text-[10px] font-bold text-blue-700">TOTAL BALANCE</label>
                    <input
                      id="totalBalance"
                      type="text"
                      readOnly
                      value={Number(formQty) > 0 && Number(formRate) > 0 ? String(Number(formQty) * Number(formRate)) : ''}
                      className="h-[45px] w-full rounded-lg border border-slate-300 bg-slate-100 px-3 text-sm font-bold"
                    />
                  </div>
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

              {/* Actions: Save Button labeled "Save / Index" */}
              <div className="pt-2 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={handleCloseTxModal}
                  className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition cursor-pointer"
                >
                  Cancel
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
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/60 p-4">
          <form onSubmit={handleFilteredPdfDownload} className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Generate Date-Range PDF</h3>
                <p className="mt-1 text-sm text-slate-500">The PDF will download directly to your device.</p>
              </div>
              <button type="button" onClick={() => setPdfExportMode(null)} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100" aria-label="Close PDF options">
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
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setPdfExportMode(null)} disabled={isGeneratingPdf} className="rounded-xl px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-100">
                Cancel
              </button>
              <button type="submit" disabled={isGeneratingPdf} className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-60">
                {isGeneratingPdf && <Loader2 className="h-4 w-4 animate-spin" />}
                {isGeneratingPdf ? 'Generating PDF...' : 'Download PDF'}
              </button>
            </div>
          </form>
        </div>
      )}

      {returnTarget && (
        <div className="fixed inset-0 z-[85] flex items-center justify-center bg-slate-900/60 p-4">
          <form onSubmit={handleSaveReturn} className="w-full max-w-lg space-y-4 rounded-2xl bg-white p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-rose-100 pb-3">
              <div>
                <h3 className="text-lg font-bold text-rose-700">Return Cutting</h3>
                <p className="mt-1 text-sm text-slate-500">{returnTarget.articleTitle || returnTarget.article} · {returnTarget.sizeName || returnTarget.size || '—'}</p>
              </div>
              <button type="button" onClick={() => setReturnTarget(null)} disabled={isSavingReturn} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100" aria-label="Close return modal">
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
              <button type="button" onClick={() => setReturnTarget(null)} disabled={isSavingReturn} className="rounded-xl px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-100">Cancel</button>
              <button type="submit" disabled={isSavingReturn} className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-bold text-white hover:bg-rose-700 disabled:opacity-60">
                {isSavingReturn ? 'Saving...' : 'Confirm Return'}
              </button>
            </div>
          </form>
        </div>
      )}

      {paymentModalType && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/60 p-4">
          <form onSubmit={handleSavePayment} className="w-full max-w-lg space-y-4 rounded-2xl bg-white p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className={`text-lg font-bold ${paymentModalType === 'cash_in' ? 'text-emerald-700' : 'text-rose-700'}`}>
                  {paymentModalType === 'cash_in' ? 'Cash In' : 'Cash Out'}
                </h3>
                <p className="mt-1 text-sm text-slate-500">{activeCutter?.name || 'Selected'} ledger payment</p>
              </div>
              <button type="button" onClick={() => setPaymentModalType(null)} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100" aria-label="Close payment modal">
                <X className="h-5 w-5" />
              </button>
            </div>
            <label className="block text-sm font-semibold text-slate-700">
              Date
              <input required type="date" value={paymentForm.date} onChange={event => setPaymentForm(form => ({ ...form, date: event.target.value }))} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2" />
            </label>
            <label className="block text-sm font-semibold text-slate-700">
              Amount
              <input required min="0.01" step="any" type="number" value={paymentForm.amount} onChange={event => setPaymentForm(form => ({ ...form, amount: event.target.value }))} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2" />
            </label>
            <label className="block text-sm font-semibold text-slate-700">
              Payment Method
              <select required value={paymentForm.paymentMethod} onChange={event => setPaymentForm(form => ({ ...form, paymentMethod: event.target.value as LedgerPaymentMethod }))} className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2">
                {(['Cash', 'Easypaisa', 'JazzCash', 'Bank Transfer'] as const).map(method => <option key={method} value={method}>{method}</option>)}
              </select>
            </label>
            <label className="block text-sm font-semibold text-slate-700">
              Bill No / Transaction No
              <input type="text" value={paymentForm.billNo} onChange={event => setPaymentForm(form => ({ ...form, billNo: event.target.value }))} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2" />
            </label>
            <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
              <button type="button" onClick={() => setPaymentModalType(null)} disabled={isSavingPayment} className="rounded-xl px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-100">Cancel</button>
              <button type="submit" disabled={isSavingPayment} className={`rounded-xl px-4 py-2 text-sm font-bold text-white disabled:opacity-60 ${paymentModalType === 'cash_in' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-rose-600 hover:bg-rose-700'}`}>
                {isSavingPayment ? 'Saving…' : 'Save Payment'}
              </button>
            </div>
          </form>
        </div>
      )}

      {editingEntry && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/60">
          <div className="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between bg-blue-600 px-5 py-4 text-white">
              <h3 className="font-bold">Edit Cutting Entry</h3>
              <button onClick={() => setEditingEntry(null)} type="button" aria-label="Close edit form">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleUpdateEntry} className="max-h-[85vh] space-y-3 overflow-y-auto p-5">
              {([
                ['date', 'Date', 'date'],
                ['customerName', 'Customer Name', 'text'],
                ['article', 'Article', 'text'],
                ['size', 'Size', 'text'],
                ['average', 'Average', 'text'],
                ['remarks', 'Remarks / Lot', 'text'],
                ['pairs', 'Pairs', 'number'],
                ['rate', 'Rate (Rs.)', 'number'],
                ['billNo', 'Bill No', 'text']
              ] as const).map(([field, label, type]) => (
                <label key={field} className="block text-xs font-bold text-slate-700">
                  {label}{field !== 'size' && field !== 'billNo' ? ' *' : ''}
                  <input
                    required={field !== 'size' && field !== 'billNo'}
                    type={type}
                    min={field === 'pairs' ? '1' : field === 'rate' ? '0' : undefined}
                    step={field === 'rate' ? 'any' : undefined}
                    disabled={editingEntry.type === 'RETURN' && !(['date', 'remarks', 'pairs', 'rate'] as const).includes(field as 'date' | 'remarks' | 'pairs' | 'rate')}
                    value={editForm[field]}
                    onChange={e => setEditForm(current => ({ ...current, [field]: e.target.value }))}
                    className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm font-normal"
                  />
                </label>
              ))}
              <div className="rounded-lg bg-slate-50 p-3 text-right text-sm font-bold">
                Total: Rs. {(Number(editForm.pairs) || 0) * (Number(editForm.rate) || 0)}
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setEditingEntry(null)}
                  disabled={isSavingEdit}
                  className="rounded-xl px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingEdit}
                  className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
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
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/60">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl">
            <h3 className="text-lg font-bold text-slate-900">Delete Cutting Entry?</h3>
            <p className="mt-3 text-sm text-slate-600">
              Delete this entry permanently? Date: {formatConfirmationDate(deletingEntry.date)}, Customer: {deletingEntry.customerName || '-'}, Pairs: {deletingEntry.pairs}, Total: Rs.{deletingEntry.pairs * deletingEntry.rate}. This action cannot be undone.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeletingEntry(null)}
                disabled={isDeletingEntry}
                className="rounded-xl px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteEntry}
                disabled={isDeletingEntry}
                className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-bold text-white hover:bg-rose-700 disabled:opacity-60"
              >
                {isDeletingEntry ? 'Deleting...' : 'Delete Entry'}
              </button>
            </div>
          </div>
        </div>
      )}

      {cutterDeleteTarget && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/60 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl">
            <h3 className="text-lg font-bold text-slate-900">Delete Cutter?</h3>
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
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" disabled={isSavingCutter} onClick={() => setCutterDeleteTarget(null)} className="rounded-xl px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-100">Cancel</button>
              <button type="button" disabled={isSavingCutter} onClick={handleDeleteCutter} className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-60">
                {isSavingCutter ? 'Deleting...' : 'Delete Cutter'}
              </button>
            </div>
          </div>
        </div>
      )}

      {cutterStatusTarget && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/60 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl">
            <h3 className="text-lg font-bold text-slate-900">{cutterStatusTarget.isActive === false ? 'Activate Cutter?' : 'Deactivate Cutter?'}</h3>
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
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setCutterStatusTarget(null)} className="rounded-xl px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-100">Cancel</button>
              <button type="button" onClick={handleCutterStatusChange} className={`rounded-xl px-4 py-2 text-sm font-bold text-white ${cutterStatusTarget.isActive === false ? 'bg-emerald-600' : 'bg-rose-600'}`}>
                {cutterStatusTarget.isActive === false ? 'Activate Cutter' : 'Deactivate Cutter'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
