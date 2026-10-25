import React from 'react';
import { 
  FileText, 
  Scissors, 
  Boxes, 
  ArrowDownLeft, 
  ArrowUpRight, 
  TrendingUp, 
  AlertTriangle, 
  Plus, 
  ChevronRight, 
  CheckCircle2, 
  Clock, 
  ShoppingBag,
  Receipt,
  Users,
  PackageCheck
} from 'lucide-react';
import { useFactory } from '../context/FactoryContext';
import { formatCurrency, formatDate, getOrderStatusBadge } from '../utils/factoryFormatters';

interface DashboardPageProps {
  onOpenNewOrder: () => void;
  onOpenNewCutting: () => void;
  onOpenSaleModal: () => void;
}

export const DashboardPage: React.FC<DashboardPageProps> = ({
  onOpenNewOrder,
  onOpenNewCutting,
  onOpenSaleModal
}) => {
  const { 
    orders, 
    cuttings, 
    products, 
    parties, 
    invoices, 
    purchases, 
    expenses, 
    staffLedger, 
    settings, 
    setActiveModule, 
    setSelectedOrderId,
    receiveCutting 
  } = useFactory();

  const todayStr = new Date().toISOString().split('T')[0];

  // 1. Today Orders
  const todayOrders = orders.filter(o => o.orderDate === todayStr);
  const activeOrders = orders.filter(o => o.status !== 'Completed');

  // 2. Pending Cutting (status == 'Given')
  const pendingCuttings = cuttings.filter(c => c.status === 'Given');
  const pendingCuttingPairs = pendingCuttings.reduce((sum, c) => sum + c.qty, 0);

  // 3. Low Stock: filter products where currentStock < lowStockLimit
  const lowStockProducts = products.filter(p => p.currentStock < p.lowStockLimit);

  // 4. Total Receivable (customers owe us)
  const totalReceivable = parties
    .filter(p => p.currentBalance > 0)
    .reduce((sum, p) => sum + p.currentBalance, 0);

  // 5. Total Payable (we owe leather suppliers & cutter makers)
  const totalPayable = parties
    .filter(p => p.currentBalance < 0)
    .reduce((sum, p) => sum + Math.abs(p.currentBalance), 0);

  // 6. Today Profit = sales - purchase - expenses - cutting payments
  const todaySales = invoices
    .filter(i => i.date === todayStr)
    .reduce((sum, i) => sum + i.grandTotal, 0);

  const todayPurchases = purchases
    .filter(p => p.date === todayStr)
    .reduce((sum, p) => sum + p.total, 0);

  const todayExpenses = expenses
    .filter(e => e.date === todayStr)
    .reduce((sum, e) => sum + e.amount, 0);

  const todayCuttingWages = staffLedger
    .filter(s => s.date === todayStr)
    .reduce((sum, s) => sum + s.amount, 0);

  const todayProfit = todaySales - todayPurchases - todayExpenses - todayCuttingWages;

  // Total ready stock pairs
  const totalReadyStockPairs = products.reduce((sum, p) => sum + p.currentStock, 0);

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Top Banner */}
      <div className="bg-gradient-to-r from-blue-700 via-blue-800 to-indigo-900 rounded-2xl p-6 text-white shadow-md relative overflow-hidden">
        <div className="absolute right-0 top-0 translate-x-12 -translate-y-12 w-64 h-64 bg-white/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="px-3 py-0.5 rounded-full bg-white/15 text-blue-200 text-xs font-bold uppercase tracking-wider">
                Industrial Safety & Leather Gloves ERP
              </span>
              <span className="text-xs bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 px-2 py-0.5 rounded-full font-semibold">
                Auto Stock Sync
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight">
              {settings.factoryName}
            </h1>
            <p className="text-blue-100 text-xs sm:text-sm mt-1 max-w-2xl">
              Automated cutting records, live order production tracking, and integrated financial ledgers.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={onOpenNewOrder}
              className="px-4 py-2.5 rounded-xl font-bold text-xs sm:text-sm bg-white text-blue-800 hover:bg-blue-50 shadow-md transition active:scale-95 flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              <span>+ New Order</span>
            </button>
            <button
              onClick={onOpenNewCutting}
              className="px-4 py-2.5 rounded-xl font-bold text-xs sm:text-sm bg-amber-500 hover:bg-amber-600 text-white shadow-md transition active:scale-95 flex items-center gap-1.5"
            >
              <Scissors className="w-4 h-4" />
              <span>+ Give Cutting</span>
            </button>
          </div>
        </div>
      </div>

      {/* Real-Time Cards (as specified by user) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3.5">
        {/* 1. Today Orders */}
        <div 
          onClick={() => setActiveModule('orders')}
          className="bg-white rounded-2xl p-4 border border-blue-100 shadow-xs hover:shadow-md transition cursor-pointer group"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-blue-700">
              Today Orders
            </span>
            <div className="w-7 h-7 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center group-hover:scale-110 transition">
              <FileText className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2">
            <div className="text-2xl font-black text-slate-900 group-hover:text-blue-700 transition">
              {todayOrders.length}
            </div>
            <p className="text-[11px] text-slate-500 mt-0.5 truncate">
              {activeOrders.length} active in production
            </p>
          </div>
        </div>

        {/* 2. Pending Cutting */}
        <div 
          onClick={() => setActiveModule('cuttings')}
          className="bg-white rounded-2xl p-4 border border-amber-200 shadow-xs hover:shadow-md transition cursor-pointer group"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-amber-700">
              Pending Cutting
            </span>
            <div className="w-7 h-7 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center group-hover:scale-110 transition">
              <Scissors className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2">
            <div className="text-2xl font-black text-amber-600 group-hover:text-amber-700 transition">
              {pendingCuttingPairs} <span className="text-xs font-normal text-slate-500">pairs</span>
            </div>
            <p className="text-[11px] text-slate-500 mt-0.5 truncate">
              {pendingCuttings.length} batches given out
            </p>
          </div>
        </div>

        {/* 3. Low Stock */}
        <div 
          onClick={() => setActiveModule('stock')}
          className="bg-white rounded-2xl p-4 border border-rose-200 shadow-xs hover:shadow-md transition cursor-pointer group"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-rose-700">
              Low Stock Alert
            </span>
            <div className="w-7 h-7 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center group-hover:scale-110 transition">
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2">
            <div className="text-2xl font-black text-rose-600">
              {lowStockProducts.length}
            </div>
            <p className="text-[11px] text-slate-500 mt-0.5 truncate">
              {totalReadyStockPairs} pairs ready in stock
            </p>
          </div>
        </div>

        {/* 4. Total Receivable */}
        <div 
          onClick={() => setActiveModule('khata')}
          className="bg-white rounded-2xl p-4 border border-emerald-100 shadow-xs hover:shadow-md transition cursor-pointer group"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-700">
              Total Receivable
            </span>
            <div className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center group-hover:scale-110 transition">
              <ArrowDownLeft className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2">
            <div className="text-lg font-black text-emerald-700 truncate">
              {formatCurrency(totalReceivable, settings.currency)}
            </div>
            <p className="text-[11px] text-slate-500 mt-0.5 truncate">
              Receivable from Customers
            </p>
          </div>
        </div>

        {/* 5. Total Payable */}
        <div 
          onClick={() => setActiveModule('khata')}
          className="bg-white rounded-2xl p-4 border border-purple-100 shadow-xs hover:shadow-md transition cursor-pointer group"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-purple-700">
              Total Payable
            </span>
            <div className="w-7 h-7 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center group-hover:scale-110 transition">
              <ArrowUpRight className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2">
            <div className="text-lg font-black text-purple-700 truncate">
              {formatCurrency(totalPayable, settings.currency)}
            </div>
            <p className="text-[11px] text-slate-500 mt-0.5 truncate">
              Payable to Suppliers & Cutters
            </p>
          </div>
        </div>

        {/* 6. Today Profit */}
        <div className={`rounded-2xl p-4 border shadow-xs transition ${
          todayProfit >= 0 ? 'bg-emerald-50/50 border-emerald-200' : 'bg-rose-50/50 border-rose-200'
        }`}>
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-700">
              Today Profit
            </span>
            <div className="w-7 h-7 rounded-lg bg-white flex items-center justify-center shadow-xs">
              <TrendingUp className="w-4 h-4 text-emerald-600" />
            </div>
          </div>
          <div className="mt-2">
            <div className={`text-lg font-black truncate ${
              todayProfit >= 0 ? 'text-emerald-700' : 'text-rose-700'
            }`}>
              {formatCurrency(todayProfit, settings.currency)}
            </div>
            <p className="text-[10px] text-slate-500 mt-0.5 truncate">
              Sales - Purchases - Wages
            </p>
          </div>
        </div>
      </div>

      {/* Main Two Columns: Active Production Orders & Pending Cuttings */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Active Customer Orders with Progress */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
                  <FileText className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">Active Customer Orders</h3>
                  <p className="text-xs text-slate-500">Live production stages & delivery schedule</p>
                </div>
              </div>
              <button
                onClick={() => setActiveModule('orders')}
                className="text-xs font-bold text-blue-600 hover:text-blue-700 flex items-center gap-0.5"
              >
                <span>View All ({orders.length})</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="divide-y divide-slate-100 mt-2">
              {activeOrders.length === 0 ? (
                <div className="py-12 text-center text-slate-400 text-xs">
                  <PackageCheck className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                  <p>No active customer orders currently.</p>
                  <button
                    onClick={onOpenNewOrder}
                    className="mt-2 font-bold text-blue-600 hover:underline"
                  >
                    + Create First Customer Order
                  </button>
                </div>
              ) : (
                activeOrders.slice(0, 4).map(ord => {
                  const badge = getOrderStatusBadge(ord.status);
                  const totalGiven = ord.items.reduce((s, i) => s + i.cuttingGivenQty, 0);
                  const totalRcvd = ord.items.reduce((s, i) => s + i.stockReceivedQty, 0);
                  const totalBilled = ord.items.reduce((s, i) => s + i.billedQty, 0);
                  const cuttingPct = ord.totalQty > 0 ? Math.min(100, Math.round((totalGiven / ord.totalQty) * 100)) : 0;
                  const stockPct = ord.totalQty > 0 ? Math.min(100, Math.round((totalRcvd / ord.totalQty) * 100)) : 0;

                  return (
                    <div 
                      key={ord.id} 
                      onClick={() => {
                        setSelectedOrderId(ord.id);
                        setActiveModule('order_detail');
                      }}
                      className="py-3.5 hover:bg-slate-50/70 p-2 rounded-xl transition cursor-pointer"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <span className="font-mono font-bold text-blue-700 text-xs mr-2">
                            #{ord.orderNo}
                          </span>
                          <span className="font-bold text-slate-900 text-sm">
                            {ord.customerName}
                          </span>
                        </div>
                        <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${badge.bg}`}>
                          {badge.label}
                        </span>
                      </div>

                      {/* Item Details */}
                      <div className="text-xs text-slate-500 mt-1 flex items-center justify-between">
                        <span>{(ord.totalPairs || ord.totalQty || 0)} Pairs Total &bull; Due: {formatDate(ord.deliveryDate)}</span>
                        <span className="font-bold text-blue-700 font-mono">{ord.items?.length || 1} Models</span>
                      </div>

                      {/* Dual Progress Bars */}
                      <div className="mt-2.5 space-y-1.5">
                        <div className="flex items-center justify-between text-[10px] text-slate-500 font-medium">
                          <span>Cutting Given: {totalGiven} / {ord.totalQty} ({cuttingPct}%)</span>
                          <span>Stock Ready: {totalRcvd} / {ord.totalQty} ({stockPct}%)</span>
                        </div>
                        <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden flex">
                          <div 
                            style={{ width: `${cuttingPct}%` }}
                            className="bg-amber-400 h-full transition-all"
                            title={`Cutting: ${cuttingPct}%`}
                          />
                          <div 
                            style={{ width: `${stockPct}%` }}
                            className="bg-emerald-500 h-full -ml-[1px] transition-all"
                            title={`Stock Ready: ${stockPct}%`}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
            <span className="text-slate-500">Auto workflow active</span>
            <button
              onClick={() => setActiveModule('orders')}
              className="text-blue-600 font-bold hover:underline"
            >
              Open Orders Hub &rarr;
            </button>
          </div>
        </div>

        {/* Pending Cuttings List with 1-Click "Receive Finished Stock" */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center font-bold">
                  <Scissors className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">Cuttings Awaiting Receipt</h3>
                  <p className="text-xs text-slate-500">1-Click mark received to auto increase finished stock</p>
                </div>
              </div>
              <button
                onClick={() => setActiveModule('cuttings')}
                className="text-xs font-bold text-blue-600 hover:text-blue-700 flex items-center gap-0.5"
              >
                <span>View All ({cuttings.length})</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="divide-y divide-slate-100 mt-2">
              {pendingCuttings.length === 0 ? (
                <div className="py-12 text-center text-slate-400 text-xs">
                  <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto mb-2" />
                  <p>All given cuttings have been completed and received into stock!</p>
                  <button
                    onClick={onOpenNewCutting}
                    className="mt-2 font-bold text-amber-600 hover:underline"
                  >
                    + Assign New Cutting Batch
                  </button>
                </div>
              ) : (
                pendingCuttings.slice(0, 4).map(cut => (
                  <div key={cut.id} className="py-3 flex items-center justify-between gap-3">
                    <div className="truncate flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-blue-700">#{cut.orderNo}</span>
                        <span className="font-bold text-slate-900 text-sm truncate">{cut.gloveType}</span>
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5 truncate">
                        Assigned to: <strong className="text-slate-800">{cut.personName}</strong> &bull; Size: {cut.size} / {cut.color}
                      </p>
                    </div>

                    <div className="text-right shrink-0">
                      <span className="font-black text-amber-600 text-sm block">
                        {cut.qty} pairs
                      </span>
                      <span className="text-[10px] text-slate-400">
                        {formatCurrency(cut.totalAmount, settings.currency)}
                      </span>
                    </div>

                    <button
                      onClick={() => receiveCutting(cut.id)}
                      className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition shadow-sm active:scale-95 flex items-center gap-1 shrink-0"
                      title="Receive goods into finished stock"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Receive</span>
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
            <span className="text-slate-500">Cutter Maker & Cutting Man wages auto-synced</span>
            <button
              onClick={() => setActiveModule('cuttings')}
              className="text-blue-600 font-bold hover:underline"
            >
              Cutting Management &rarr;
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
