import React, { useState, useMemo } from 'react';
import { 
  ArrowLeft, 
  Phone, 
  Scissors, 
  BookOpen, 
  FileText, 
  Plus, 
  Search, 
  Pencil, 
  Trash2,
  RotateCcw 
} from 'lucide-react';
import { Cutter, CuttingEntry } from '../../types/factory';
import { formatDate, safeStringCompare } from '../../utils/factoryFormatters';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

interface CuttingLedgerProps {
  cutter: Cutter | null | undefined;
  ledgerData: CuttingEntry[] | null | undefined;
  onBack: () => void;
  onOpenIssueCutting?: () => void;
  onOpenReturnCutting?: () => void;
  onOpenReceiveCutting?: () => void;
  onEditEntry?: (entry: CuttingEntry) => void;
  onDeleteEntry?: (entry: CuttingEntry) => void;
  onReturnCutting?: (entry: CuttingEntry) => void;
  onOpenPaymentModal?: (type: 'cash_in' | 'cash_out') => void;
}

type LedgerDateFilter = 'All Time' | 'Today' | 'Last 7 Days' | 'Last 30 Days' | 'This Month' | 'Last Month' | 'Others';

export const CuttingLedger: React.FC<CuttingLedgerProps> = ({
  cutter,
  ledgerData,
  onBack,
  onOpenIssueCutting,
  onOpenReturnCutting,
  onOpenReceiveCutting,
  onEditEntry,
  onDeleteEntry,
  onReturnCutting,
  onOpenPaymentModal
}) => {
  // CRITICAL REQUIREMENT 1: Null checks at the top with fallback UI
  if (!cutter || !ledgerData) {
    console.log('Cutting ledger fallback triggered - cutter or ledgerData is missing:', { cutter, ledgerData });
    return (
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
            onClick={onBack}
            className="rounded-xl border border-slate-200 bg-slate-100 px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-200 transition"
          >
            &larr; Back to Cutters List
          </button>
          {onOpenIssueCutting && (
            <button
              type="button"
              onClick={onOpenIssueCutting}
              className="rounded-xl bg-amber-600 px-4 py-2 text-xs font-bold text-white hover:bg-amber-700 transition"
            >
              + Issue Cutting
            </button>
          )}
        </div>
      </div>
    );
  }

  // Debugging log for ledger data
  console.log('Rendering CuttingLedger for cutter:', cutter.name, 'with entries count:', ledgerData.length, ledgerData);

  const [searchQuery, setSearchQuery] = useState('');
  const [dateFilter, setDateFilter] = useState<LedgerDateFilter>('All Time');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  // Calculate totals
  const totalGivenPairs = useMemo(() => {
    return ledgerData
      .filter(entry => entry.type === 'GIVE')
      .reduce((sum, entry) => sum + (Number(entry.pairs ?? entry.totalQty) || 0), 0) || (cutter.totalGiven || 0);
  }, [ledgerData, cutter]);

  const totalReceivedPairs = useMemo(() => {
    return ledgerData
      .filter(entry => entry.type === 'RECEIVE' || entry.type === 'RETURN')
      .reduce((sum, entry) => sum + (Number(entry.pairs ?? entry.totalQty) || 0), 0) || (cutter.totalReceived || 0);
  }, [ledgerData, cutter]);

  const pendingPairs = Math.max(0, totalGivenPairs - totalReceivedPairs);

  const totalCuttingAmount = useMemo(() => {
    return ledgerData.reduce((sum, entry) => {
      const p = Number(entry.pairs ?? entry.totalQty) || 0;
      const r = Number(entry.rate) || 0;
      return sum + (Number(entry.totalBalance) || Number(entry.lotTotal) || p * r);
    }, 0);
  }, [ledgerData]);

  // Filter entries
  const visibleEntries = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return ledgerData.filter(entry => {
      const matchSearch = !q || 
        (entry.customerName && entry.customerName.toLowerCase().includes(q)) ||
        (entry.article && entry.article.toLowerCase().includes(q)) ||
        (entry.billNo && entry.billNo.toLowerCase().includes(q));

      if (!matchSearch) return false;

      if (dateFilter === 'All Time') return true;
      const entryDate = entry.date || '';
      const today = new Date().toISOString().slice(0, 10);
      if (dateFilter === 'Today') return entryDate === today;
      if (dateFilter === 'Others') {
        if (fromDate && entryDate < fromDate) return false;
        if (toDate && entryDate > toDate) return false;
        return true;
      }
      return true;
    });
  }, [ledgerData, searchQuery, dateFilter, fromDate, toDate]);

  const handleExportPdf = () => {
    try {
      const doc = new jsPDF({ orientation: 'landscape' });
      doc.setFontSize(14);
      doc.text(`Cutting Ledger - All`, 14, 15);
      doc.setFontSize(9);
      doc.text(`Filter: ${dateFilter} | Total Entries: ${visibleEntries.length} | Pending: ${pendingPairs} Pairs`, 14, 22);

      let runningBal = 0;
      let totalPairsCount = 0;
      let totalAmountCount = 0;

      const tableRows = visibleEntries.map(entry => {
        const isReturn = entry.type === 'RETURN';
        const pairs = Number(entry.pairs ?? entry.totalQty) || 0;
        const rate = Number(entry.rate) || 0;
        const amount = isReturn ? -Math.abs(pairs * rate) : (Number(entry.lotTotal) || Math.abs(pairs * rate));
        runningBal += amount;
        totalPairsCount += isReturn ? -Math.abs(pairs) : Math.abs(pairs);
        totalAmountCount += amount;

        return [
          formatDate(entry.date),
          entry.article || '-',
          entry.size || '-',
          isReturn ? `-${Math.abs(pairs)}` : String(pairs),
          entry.average || '-',
          rate ? `Rs. ${rate}` : 'Rs. 0',
          isReturn ? `-Rs. ${Math.abs(amount).toLocaleString()}` : `Rs. ${amount.toLocaleString()}`,
          `Rs. ${(entry.runningBalance !== undefined ? entry.runningBalance : runningBal).toLocaleString()}`
        ];
      });

      autoTable(doc, {
        head: [['DATE', 'ARTICLE', 'SIZE', 'PAIRS', 'AVERAGE', 'RATE', 'AMOUNT', 'BALANCE']],
        body: tableRows,
        foot: [[
          'TOTAL',
          '',
          '',
          `${totalPairsCount.toLocaleString()} Pairs`,
          '',
          '',
          `Rs. ${totalAmountCount.toLocaleString()}`,
          `Pending: ${pendingPairs.toLocaleString()} Pairs`
        ]],
        startY: 27,
        styles: { fontSize: 8 },
        headStyles: { fillColor: [30, 64, 175] },
        footStyles: { fillColor: [241, 245, 249], textColor: [15, 23, 42], fontStyle: 'bold' }
      });

      doc.save(`Cutting_Ledger_${cutter.name.replace(/\s+/g, '_')}.pdf`);
    } catch (err) {
      console.error('Error generating PDF:', err);
    }
  };

  return (
    <div className="space-y-6">
      {/* Cutter Ledger Header Card */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onBack}
              className="rounded-xl border border-slate-200 p-2.5 text-slate-700 hover:bg-slate-100 transition"
              title="Back to Cutters List"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div>
              <div className="flex items-center gap-2">
                <span className="rounded-md bg-amber-100 px-2 py-0.5 text-xs font-bold uppercase text-amber-800">
                  {cutter.cutterType === 'cutting_maker' ? 'Cutting Maker' : 'Cutting Master'}
                </span>
                <span className="font-mono text-xs text-slate-500">
                  ID: #{cutter.id ? cutter.id.slice(-6) : '0000'}
                </span>
              </div>
              <h1 className="mt-0.5 text-xl font-black text-slate-900 sm:text-2xl">
                {cutter.khataName || `${cutter.name} Ledger`}
              </h1>
              {cutter.isActive === false && (
                <span className="mt-1 inline-flex rounded-full bg-rose-100 px-2.5 py-0.5 text-xs font-bold text-rose-700">
                  Inactive Cutter
                </span>
              )}
              {cutter.phone && (
                <p className="mt-0.5 flex items-center gap-1 text-xs text-slate-500">
                  <Phone className="h-3.5 w-3.5" />
                  <span>{cutter.phone}</span>
                </p>
              )}
            </div>
          </div>

          {/* Action Buttons: [New Cutting (orange)] [Return Cutting (orange/red)] [Receive Cutting (blue)] */}
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            {onOpenIssueCutting && (
              <button
                type="button"
                onClick={onOpenIssueCutting}
                className="flex items-center gap-2 rounded-xl bg-amber-500 hover:bg-amber-600 px-4 py-2.5 text-xs font-bold text-white shadow-sm transition active:scale-95"
              >
                <Scissors className="h-4 w-4" />
                New Cutting
              </button>
            )}
            {onOpenReturnCutting && (
              <button
                type="button"
                onClick={onOpenReturnCutting}
                className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-orange-500 to-rose-600 hover:from-orange-600 hover:to-rose-700 px-4 py-2.5 text-xs font-bold text-white shadow-sm transition active:scale-95"
              >
                <RotateCcw className="h-4 w-4" />
                Return Cutting
              </button>
            )}
            {onOpenReceiveCutting && (
              <button
                type="button"
                onClick={onOpenReceiveCutting}
                className="flex items-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-700 px-4 py-2.5 text-xs font-bold text-white shadow-sm transition active:scale-95"
              >
                <Plus className="h-4 w-4" />
                Receive Cutting
              </button>
            )}
            {onOpenPaymentModal && (
              <>
                <button
                  type="button"
                  onClick={() => onOpenPaymentModal('cash_in')}
                  className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-800 hover:bg-emerald-100 transition"
                >
                  Cash In
                </button>
                <button
                  type="button"
                  onClick={() => onOpenPaymentModal('cash_out')}
                  className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-800 hover:bg-rose-100 transition"
                >
                  Cash Out
                </button>
              </>
            )}
          </div>
        </div>

        {/* Metric Cards */}
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
          <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Total Given</span>
            <div className="mt-1 font-mono text-xl font-black text-slate-900 sm:text-2xl">
              {totalGivenPairs.toLocaleString()} <span className="text-xs font-normal text-slate-500">Pairs</span>
            </div>
          </div>
          <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 p-4">
            <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-700">Total Received</span>
            <div className="mt-1 font-mono text-xl font-black text-emerald-700 sm:text-2xl">
              {totalReceivedPairs.toLocaleString()} <span className="text-xs font-normal text-emerald-600">Pairs</span>
            </div>
          </div>
          <div className="rounded-xl border border-amber-100 bg-amber-50/60 p-4">
            <span className="text-[11px] font-bold uppercase tracking-wider text-amber-700">Pending Balance</span>
            <div className="mt-1 font-mono text-xl font-black text-amber-700 sm:text-2xl">
              {pendingPairs.toLocaleString()} <span className="text-xs font-normal text-amber-600">Pairs</span>
            </div>
          </div>
          <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-4">
            <span className="text-[11px] font-bold uppercase tracking-wider text-blue-700">Cutting Total</span>
            <div className="mt-1 font-mono text-xl font-black text-blue-700 sm:text-2xl">
              Rs. {totalCuttingAmount.toLocaleString()}
            </div>
          </div>
        </div>
      </div>

      {/* Ledger Table Section */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-xs overflow-hidden">
        <div className="border-b border-slate-200 p-4 sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-base font-bold text-slate-900">Notebook Ledger &bull; {cutter.name}</h3>
              <p className="text-xs text-slate-500">Chronological cutting register with lot totals and running balances.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleExportPdf}
                className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 transition"
              >
                <FileText className="h-3.5 w-3.5" />
                Export PDF
              </button>
            </div>
          </div>

          {/* Filters & Search */}
          <div className="mt-4 flex flex-wrap items-center gap-2 sm:gap-3">
            <div className="relative min-w-[200px] flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search by customer name, article, bill..."
                className="w-full rounded-lg border border-slate-300 py-1.5 pl-9 pr-3 text-xs focus:border-blue-500 focus:outline-none"
              />
            </div>
            <select
              value={dateFilter}
              onChange={e => setDateFilter(e.target.value as LedgerDateFilter)}
              className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-700"
            >
              <option value="All Time">All Time</option>
              <option value="Today">Today</option>
              <option value="Last 7 Days">Last 7 Days</option>
              <option value="Last 30 Days">Last 30 Days</option>
              <option value="This Month">This Month</option>
              <option value="Last Month">Last Month</option>
              <option value="Others">Custom Range</option>
            </select>
            {dateFilter === 'Others' && (
              <div className="flex items-center gap-2 text-xs">
                <input
                  type="date"
                  value={fromDate}
                  onChange={e => setFromDate(e.target.value)}
                  className="rounded-lg border border-slate-300 px-2 py-1 text-xs"
                />
                <span>to</span>
                <input
                  type="date"
                  value={toDate}
                  onChange={e => setToDate(e.target.value)}
                  className="rounded-lg border border-slate-300 px-2 py-1 text-xs"
                />
              </div>
            )}
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">
              {visibleEntries.length} Entries
            </span>
          </div>
        </div>

        {/* Table Content */}
        <div className="overflow-x-auto">
          {visibleEntries.length === 0 ? (
            <div className="p-12 text-center text-slate-400">
              <BookOpen className="mx-auto mb-2 h-8 w-8 opacity-40" />
              <p className="text-xs font-medium">
                {searchQuery ? 'No matching cutting records.' : `No entries in ${cutter.name}'s notebook yet.`}
              </p>
              <p className="mt-1 text-xs text-slate-400">
                Select "Issue Cutting" or "Receive Cutting" above to record the first lot.
              </p>
            </div>
          ) : (
            <table className="w-full min-w-[900px] text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-600">
                <tr>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Customer</th>
                  <th className="px-4 py-3">Article</th>
                  <th className="px-4 py-3">Size</th>
                  <th className="px-4 py-3 text-right">Pairs</th>
                  <th className="px-4 py-3 text-right">Rate</th>
                  <th className="px-4 py-3 text-right">Lot Total</th>
                  <th className="px-4 py-3 text-right">Running Balance</th>
                  {(onEditEntry || onDeleteEntry || onReturnCutting) && (
                    <th className="px-4 py-3 text-center">Actions</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                {visibleEntries.map(entry => {
                  const isReceive = entry.type === 'RECEIVE';
                  const isReturn = entry.type === 'RETURN';
                  return (
                    <tr key={entry.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="px-4 py-3 font-mono text-slate-600">
                        {formatDate(entry.date)}
                        {entry.billNo && (
                          <span className="ml-1 text-[10px] text-slate-400">#{entry.billNo}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 font-semibold text-slate-900">
                        {entry.customerName || 'Direct'}
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-semibold text-slate-800">{entry.article || '-'}</span>
                      </td>
                      <td className="px-4 py-3 text-slate-500">{entry.size || '-'}</td>
                      <td className="px-4 py-3 text-right font-mono font-bold">
                        <span className={isReturn ? 'text-rose-600' : isReceive ? 'text-emerald-700' : 'text-slate-900'}>
                          {isReturn ? `-${Math.abs(entry.pairs)}` : entry.pairs}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-slate-600">
                        Rs. {entry.rate || 0}
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-bold text-slate-900">
                        Rs. {(entry.lotTotal || (entry.pairs * (entry.rate || 0))).toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-bold text-blue-700">
                        Rs. {(entry.runningBalance || 0).toLocaleString()}
                      </td>
                      {(onEditEntry || onDeleteEntry) && (
                        <td className="px-4 py-3 text-center">
                          <div className="flex items-center justify-center gap-1">
                            {onEditEntry && (
                              <button
                                type="button"
                                onClick={() => onEditEntry(entry)}
                                className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                                title="Edit"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                            )}
                            {onDeleteEntry && (
                              <button
                                type="button"
                                onClick={() => onDeleteEntry(entry)}
                                className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                                title="Delete"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};
