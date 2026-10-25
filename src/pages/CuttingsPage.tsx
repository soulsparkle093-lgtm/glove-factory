import React, { useState, useMemo } from 'react';
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

export const CuttingsPage: React.FC<CuttingsPageProps> = () => {
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
    cuttingEntries,
    updateCuttingEntry,
    deleteCuttingEntry,
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
  const [formAddToStock, setFormAddToStock] = useState(false);

  const [isSubmittingTx, setIsSubmittingTx] = useState(false);
  const [editingEntry, setEditingEntry] = useState<CuttingEntry | null>(null);
  const [editForm, setEditForm] = useState({ date: '', customerName: '', article: '', size: '', average: '', remarks: '', pairs: '', rate: '', billNo: '' });
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [deletingEntry, setDeletingEntry] = useState<CuttingEntry | null>(null);
  const [isDeletingEntry, setIsDeletingEntry] = useState(false);
  const [inlineEdit, setInlineEdit] = useState<{ entry: CuttingEntry; field: 'pairs' | 'rate'; value: string } | null>(null);
  const [ledgerSearch, setLedgerSearch] = useState('');
  const [pdfExportMode, setPdfExportMode] = useState<'date' | 'customer' | null>(null);
  const [pdfFromDate, setPdfFromDate] = useState('');
  const [pdfToDate, setPdfToDate] = useState('');
  const [pdfCustomer, setPdfCustomer] = useState('');
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

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
  const visibleLedgerEntries = useMemo(() => {
    const query = ledgerSearch.trim().toLowerCase();
    return query
      ? activeCutterEntries.filter(entry => (entry.customerName || '').toLowerCase().includes(query))
      : activeCutterEntries;
  }, [activeCutterEntries, ledgerSearch]);

  // Dynamically filter customer orders that contain the selected Article
  const filteredOrdersForArticle = useMemo(() => {
    if (!formArticle) return [];
    return orders.filter(o => 
      o.items.some(i => 
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
    setFormAddToStock(false);
  };

  // Close transaction modal
  const handleCloseTxModal = () => {
    setTxModalType(null);
  };

  // Handle transaction submission (Dual Entry Batched Write)
  const handleSubmitTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeCutter || !txModalType) return;

    const parsedQty = Number(formQty);
    const parsedRate = Number(formRate);
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

    setIsSubmittingTx(true);
    try {
      // Find selected order
      const targetOrder = orders.find(o => o.id === formOrderId);
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
        orderId: formOrderId || undefined,
        orderNo: targetOrder?.orderNo || undefined,
        customerName: targetOrder?.customerName || formCustomerName.trim() || 'PRO4',
        size: formSize.trim(),
        sizeName: formSize.trim(),
        average: formAverage.trim(),
        totalBalance,
        customerOrder: targetOrder?.customerName || formCustomerName.trim() || 'PRO4',
        billNo: formBillNo.trim() || undefined,
        factoryName: formFactoryNotes.trim() || undefined,
        addToStock: txModalType === 'RECEIVE' ? formAddToStock : false,
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
      showToast('The cutting entry could not be saved. Please try again.', 'error');
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
      pairs: String(entry.pairs),
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
      await updateCuttingEntry(editingEntry.id, {
        date: editForm.date,
        customerName: editForm.customerName.trim(),
        article: editForm.article.trim(),
        size: editForm.size.trim(),
        average: editForm.average.trim(),
        remarks: editForm.remarks.trim(),
        pairs,
        rate,
        billNo: editForm.billNo.trim()
      });
      setEditingEntry(null);
      showToast('Cutting entry updated successfully.');
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
      await deleteCuttingEntry(deletingEntry.id);
      setDeletingEntry(null);
      showToast('Cutting entry deleted successfully.');
    } catch (err) {
      console.error('Error deleting cutting entry:', err);
      showToast('The cutting entry could not be deleted. Please try again.', 'error');
    } finally {
      setIsDeletingEntry(false);
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

  const exportLedgerPdf = (entries: CuttingEntry[], title: string, fileName: string, rangeLabel: string) => {
    const chronologicalEntries = [...entries].sort((a, b) =>
      (a.date || '').localeCompare(b.date || '') ||
      (a.createdAt || '').localeCompare(b.createdAt || '') ||
      a.id.localeCompare(b.id)
    );
    let runningBalance = 0;
    const totalPairs = chronologicalEntries.reduce((sum, entry) => sum + (Number(entry.pairs ?? entry.totalQty) || 0), 0);
    const totalAmount = chronologicalEntries.reduce((sum, entry) => {
      const pairs = Number(entry.pairs ?? entry.totalQty) || 0;
      const rate = Number(entry.rate) || 0;
      return sum + (Number(entry.totalBalance) || Number(entry.lotTotal) || pairs * rate);
    }, 0);
    const rows = chronologicalEntries.map(entry => {
      const pairs = Number(entry.pairs ?? entry.totalQty) || 0;
      const rate = Number(entry.rate) || 0;
      const total = Number(entry.totalBalance) || Number(entry.lotTotal) || pairs * rate;
      runningBalance += total;
      return [
        formatConfirmationDate(entry.date),
        entry.customerName || entry.customerOrder || 'Direct',
        entry.articleTitle || entry.article || '-',
        entry.sizeName || entry.size || '-',
        String(pairs),
        entry.average || '-',
        `Rs. ${rate}`,
        `Rs. ${total}`,
        `Rs. ${runningBalance}`
      ];
    });
    const doc = new jsPDF({ orientation: 'landscape' });
    doc.setFontSize(14);
    doc.text(title, 14, 15);
    doc.setFontSize(9);
    doc.text(`${rangeLabel} | Total Entries: ${chronologicalEntries.length}`, 14, 22);
    autoTable(doc, {
      head: [['Date', 'Customer Name', 'Article', 'Size', 'Pairs', 'Average', 'Rate', 'Total Balance', 'Balance']],
      body: rows,
      foot: [['TOTAL', '', '', '', String(totalPairs), '', '', `Rs. ${totalAmount}`, `Rs. ${runningBalance}`]],
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
    setPdfCustomer('');
    setPdfExportMode('date');
  };

  const handleCustomerWisePdf = () => {
    setPdfFromDate('');
    setPdfToDate('');
    setPdfCustomer('');
    setPdfExportMode('customer');
  };

  const handleFullLedgerPdf = () => {
    const cutterName = activeCutter?.name || '';
    exportLedgerPdf(
      activeCutterEntries,
      `Gloves Factory - Cutting Ledger - ${cutterName}`,
      `Cutting-Ledger-${cutterName.replace(/[^a-z0-9]+/gi, '-')}-Full-Ledger.pdf`,
      'Full Ledger'
    );
  };

  const handleFilteredPdfDownload = (event: React.FormEvent) => {
    event.preventDefault();
    if (!pdfFromDate || !pdfToDate || pdfFromDate > pdfToDate) {
      showToast('Enter a valid start and end date.', 'error');
      return;
    }
    if (pdfExportMode === 'customer' && !pdfCustomer) {
      showToast('Select a customer.', 'error');
      return;
    }
    setIsGeneratingPdf(true);
    try {
      const entries = activeCutterEntries.filter(entry =>
        entry.date >= pdfFromDate &&
        entry.date <= pdfToDate &&
        (pdfExportMode !== 'customer' || (entry.customerName || 'Direct') === pdfCustomer)
      );
      if (entries.length === 0) {
        showToast('No entries were found in this date range.', 'error');
        return;
      }
      const cutterName = activeCutter?.name || '';
      const isCustomerPdf = pdfExportMode === 'customer';
      const subject = isCustomerPdf ? `Customer: ${pdfCustomer}` : 'Date Wise';
      const range = `${formatConfirmationDate(pdfFromDate)} to ${formatConfirmationDate(pdfToDate)}`;
      exportLedgerPdf(
        entries,
        `Gloves Factory - Cutting Ledger - ${cutterName}`,
        `Cutting-Ledger-${cutterName.replace(/[^a-z0-9]+/gi, '-')}-${pdfFromDate}-to-${pdfToDate}.pdf`,
        `${subject} | Date: ${range}`
      );
      setPdfExportMode(null);
    } catch (error) {
      console.error('Error generating cutting ledger PDF:', error);
      showToast('The PDF could not be generated. Please try again.', 'error');
    } finally {
      setIsGeneratingPdf(false);
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

            {/* 3 Summary Cards: Total Given | Total Received | Pending Balance */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 mt-6 pt-5 border-t border-slate-100">
              {/* Card 1: Total Cutting Di / Given (Orange) */}
              <div className="p-4 rounded-xl bg-amber-50/80 border border-amber-200">
                <span className="text-[11px] font-bold uppercase tracking-wider text-amber-800 block">
                  Total Cutting Issued
                </span>
                <div className="text-2xl font-black text-amber-700 font-mono mt-1">
                  {activeCutter.totalGiven || 0} <span className="text-xs font-normal text-slate-500">Pairs</span>
                </div>
                <p className="text-[11px] text-amber-900/70 mt-1">All batches given to {activeCutter.name}</p>
              </div>

              {/* Card 2: Total Cutting Received (Green) */}
              <div className="p-4 rounded-xl bg-emerald-50/80 border border-emerald-200">
                <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-800 block">
                  Total Cutting Received
                </span>
                <div className="text-2xl font-black text-emerald-700 font-mono mt-1">
                  {activeCutter.totalReceived || 0} <span className="text-xs font-normal text-slate-500">Pairs</span>
                </div>
                <p className="text-[11px] text-emerald-900/70 mt-1">Finished pairs returned to factory</p>
              </div>

              {/* Card 3: Pending Balance */}
              <div className="p-4 rounded-xl bg-blue-50/80 border border-blue-200">
                <span className="text-[11px] font-bold uppercase tracking-wider text-blue-800 block">
                  Pending Balance
                </span>
                <div className="text-2xl font-black text-blue-700 font-mono mt-1">
                  {Math.max(0, (activeCutter.totalGiven || 0) - (activeCutter.totalReceived || 0))} <span className="text-xs font-normal text-slate-500">Pairs</span>
                </div>
                <p className="text-[11px] text-blue-900/70 mt-1">Remaining with cutter right now</p>
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
                <button onClick={handleCustomerWisePdf} className="rounded-lg bg-sky-100 px-3 py-2 text-xs font-bold text-sky-800 hover:bg-sky-200">Customer Ledger PDF</button>
                <button onClick={handleFullLedgerPdf} className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-bold text-white hover:bg-blue-700">Full Ledger PDF</button>
              </div>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <input
                  type="search"
                  value={ledgerSearch}
                  onChange={e => setLedgerSearch(e.target.value)}
                  placeholder="Search by customer name"
                  className="w-full max-w-sm rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
                <span className="text-xs font-bold text-slate-600 bg-slate-100 px-3 py-1 rounded-full">
                  {visibleLedgerEntries.length} Entries
                </span>
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
                        <tr key={entry.id} className="hover:bg-slate-50/70 transition">
                          <td className="py-3.5 px-4 font-mono">{formatDate(entry.date)}</td>
                          <td className="py-3.5 px-4">{entry.customerName || 'PRO4'}</td>
                          <td className="py-3.5 px-4 font-bold text-slate-900">{entry.articleTitle || entry.article}</td>
                          <td className="py-3.5 px-4">{entry.sizeName || entry.size || '-'}</td>
                          {(['pairs'] as const).map(field => (
                            <td
                              key={field}
                              className="py-3.5 px-4 text-right font-mono"
                              title="Double-click to quick edit"
                              onDoubleClick={() => setInlineEdit({
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
                                <span className="cursor-text">{entry[field]}</span>
                              )}
                            </td>
                          ))}
                          <td className="py-3.5 px-4">{entry.average || '-'}</td>
                          <td
                            className="py-3.5 px-4 text-right font-mono"
                            title="Double-click to quick edit"
                            onDoubleClick={() => setInlineEdit({ entry, field: 'rate', value: String(entry.rate) })}
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
                          <td className="py-3.5 px-4 text-right font-mono font-bold text-emerald-700">
                            Rs. {Number(entry.totalBalance) || Number(entry.lotTotal) || entry.pairs * entry.rate}
                          </td>
                          <td className="py-3.5 px-4 text-right font-mono font-bold text-blue-800 bg-blue-50">
                            Rs. {entry.runningBalance}
                          </td>
                          <td className="py-3.5 px-4 text-center">
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
                        Rs. {visibleLedgerEntries.reduce((sum, entry) => sum + (Number(entry.totalBalance) || Number(entry.lotTotal) || entry.pairs * entry.rate), 0)}
                      </td>
                      <td colSpan={2}></td>
                    </tr>
                  </tfoot>
                </table>
              )}
            </div>
          </div>
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

              {/* Field 2: Article (free text) */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  2. Article / Glove Title *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Average, PUJA, Foam"
                  value={formArticle}
                  onChange={e => {
                    setFormArticle(e.target.value);
                  }}
                  className="w-full px-3 py-2 text-xs sm:text-sm rounded-xl border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                />
              </div>

              {/* Field 3: Order (Dropdown, filtered dynamically to show ONLY Customer Orders containing selected Article)
                  Format: "Customer Name - Order Date - Order ID" */}
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
                    <input
                      id="sizeName"
                      type="text"
                      required
                      placeholder=""
                      value={formSize}
                      onChange={e => setFormSize(e.target.value)}
                      className="h-[45px] w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"
                    />
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

              {/* Field 8: Checkbox "Add to Stock Ledger?" (Receive only) */}
              {txModalType === 'RECEIVE' && (
                <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200">
                  <label className="flex items-center gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formAddToStock}
                      onChange={e => setFormAddToStock(e.target.checked)}
                      className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500"
                    />
                    <div>
                      <span className="text-xs font-bold text-emerald-900 block">
                        Add to Stock Widget? (Automatically increments finished ready stock)
                      </span>
                      <span className="text-[11px] text-emerald-700">
                        When checked, ready stock for "{formArticle || 'Glove'}" will auto-increment in Warehouse Ledger.
                      </span>
                    </div>
                  </label>
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
                <h3 className="text-lg font-bold text-slate-900">
                  {pdfExportMode === 'date' ? 'Generate Date-Range PDF' : 'Generate Customer Ledger PDF'}
                </h3>
                <p className="mt-1 text-sm text-slate-500">The PDF will download directly to your device.</p>
              </div>
              <button type="button" onClick={() => setPdfExportMode(null)} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100" aria-label="Close PDF options">
                <X className="h-5 w-5" />
              </button>
            </div>
            {pdfExportMode === 'customer' && (
              <label className="mt-4 block text-sm font-semibold text-slate-700">
                Customer
                <select
                  required
                  value={pdfCustomer}
                  onChange={event => setPdfCustomer(event.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2"
                >
                  <option value="">Select a customer</option>
                  {[...new Set(activeCutterEntries.map(entry => entry.customerName || 'Direct'))]
                    .sort((a, b) => a.localeCompare(b))
                    .map(customer => <option key={customer} value={customer}>{customer}</option>)}
                </select>
              </label>
            )}
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
