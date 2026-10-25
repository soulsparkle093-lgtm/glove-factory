import React, { useState } from 'react';
import { BarChart3, Printer, Download, TrendingUp, TrendingDown, FileText, Boxes, Users } from 'lucide-react';
import { useFactory } from '../context/FactoryContext';
import { formatCurrency, formatDate } from '../utils/factoryFormatters';

export const ReportsPage: React.FC = () => {
  const { 
    orders, 
    cuttings, 
    products, 
    invoices, 
    purchases, 
    expenses, 
    staffLedger, 
    settings 
  } = useFactory();

  const [activeTab, setActiveTab] = useState<'pnl' | 'production' | 'stock' | 'labor'>('pnl');

  // P&L Calculations
  const totalSalesRevenue = invoices.reduce((s, i) => s + i.grandTotal, 0);
  const totalRawLeatherPurchases = purchases.reduce((s, p) => s + p.total, 0);
  const totalCuttingWages = staffLedger.reduce((s, sl) => s + sl.amount, 0);
  const grossProfit = totalSalesRevenue - (totalRawLeatherPurchases + totalCuttingWages);
  const totalOperatingExpenses = expenses.reduce((s, e) => s + e.amount, 0);
  const netProfit = grossProfit - totalOperatingExpenses;

  // Production Metrics
  const totalOrderedPairs = orders.reduce((s, o) => s + o.totalQty, 0);
  const totalGivenPairs = cuttings.reduce((s, c) => s + c.qty, 0);
  const totalReceivedPairs = cuttings.filter(c => c.status === 'Received').reduce((s, c) => s + c.qty, 0);
  const totalBilledPairs = invoices.reduce((s, inv) => s + inv.items.reduce((sum, itm) => sum + itm.qty, 0), 0);

  // Stock
  const totalReadyStock = products.reduce((s, p) => s + p.currentStock, 0);
  const stockCostVal = products.reduce((s, p) => s + (p.currentStock * p.purchasePrice), 0);
  const stockSaleVal = products.reduce((s, p) => s + (p.currentStock * p.salePrice), 0);

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Top Banner and Navigation */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl overflow-x-auto">
          <button
            onClick={() => setActiveTab('pnl')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition whitespace-nowrap ${
              activeTab === 'pnl' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600'
            }`}
          >
            Factory Profit & Loss
          </button>
          <button
            onClick={() => setActiveTab('production')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition whitespace-nowrap ${
              activeTab === 'production' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600'
            }`}
          >
            Production Tracker
          </button>
          <button
            onClick={() => setActiveTab('stock')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition whitespace-nowrap ${
              activeTab === 'stock' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600'
            }`}
          >
            Finished Stock Valuation
          </button>
          <button
            onClick={() => setActiveTab('labor')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition whitespace-nowrap ${
              activeTab === 'labor' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600'
            }`}
          >
            Cutting Labor & Wages
          </button>
        </div>

        <button
          onClick={handlePrint}
          className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm transition active:scale-95 w-fit"
        >
          <Printer className="w-4 h-4" />
          <span>Print Financial Report</span>
        </button>
      </div>

      {/* TAB 1: P&L */}
      {activeTab === 'pnl' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div className="bg-white p-5 rounded-2xl border border-blue-100 shadow-xs">
              <span className="text-xs font-bold uppercase tracking-wider text-blue-700">Gross Sales Turnover</span>
              <div className="text-2xl font-black text-slate-900 mt-1">{formatCurrency(totalSalesRevenue, settings.currency)}</div>
              <p className="text-xs text-slate-500 mt-1">{invoices.length} invoices delivered</p>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-600">Direct Materials & Leather</span>
              <div className="text-2xl font-black text-rose-700 mt-1">{formatCurrency(totalRawLeatherPurchases, settings.currency)}</div>
              <p className="text-xs text-slate-500 mt-1">Tannery shipments</p>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-amber-200 shadow-xs">
              <span className="text-xs font-bold uppercase tracking-wider text-amber-700">Direct Cutting Wages</span>
              <div className="text-2xl font-black text-amber-700 mt-1">{formatCurrency(totalCuttingWages, settings.currency)}</div>
              <p className="text-xs text-slate-500 mt-1">Piece-rate labor cost</p>
            </div>

            <div className={`p-5 rounded-2xl border shadow-xs ${
              netProfit >= 0 ? 'bg-emerald-50/50 border-emerald-200' : 'bg-rose-50/50 border-rose-200'
            }`}>
              <span className="text-xs font-bold uppercase tracking-wider text-slate-700">Net Factory Profit</span>
              <div className={`text-2xl font-black mt-1 ${netProfit >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                {formatCurrency(netProfit, settings.currency)}
              </div>
              <p className="text-xs text-slate-600 mt-1">After factory overheads</p>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6 space-y-4">
            <h3 className="font-bold text-slate-900 text-lg border-b border-slate-200 pb-3">
              Leather Gloves Factory Income Statement (P&L Breakdown)
            </h3>

            <div className="divide-y divide-slate-100 text-sm">
              <div className="py-2.5 flex items-center justify-between font-bold text-slate-900">
                <span>1. Operating Revenue (Sales Invoices Turnover)</span>
                <span>{formatCurrency(totalSalesRevenue, settings.currency)}</span>
              </div>
              <div className="py-2.5 flex items-center justify-between text-slate-600 pl-4">
                <span>Less: Raw Leather & Materials Purchases</span>
                <span className="text-rose-600">-{formatCurrency(totalRawLeatherPurchases, settings.currency)}</span>
              </div>
              <div className="py-2.5 flex items-center justify-between text-slate-600 pl-4">
                <span>Less: Cutting & Stitching Direct Labor Wages</span>
                <span className="text-rose-600">-{formatCurrency(totalCuttingWages, settings.currency)}</span>
              </div>
              <div className="py-2.5 flex items-center justify-between font-bold text-emerald-800 bg-emerald-50/50 px-2 rounded-lg">
                <span>Gross Factory Manufacturing Margin</span>
                <span>{formatCurrency(grossProfit, settings.currency)}</span>
              </div>
              <div className="py-2.5 flex items-center justify-between text-slate-600 pl-4">
                <span>Less: Operating Factory Overheads (Rent, Power, Chai, Blades, Transport)</span>
                <span className="text-rose-600">-{formatCurrency(totalOperatingExpenses, settings.currency)}</span>
              </div>
              <div className="py-3 flex items-center justify-between font-black text-lg text-blue-900 bg-blue-50/70 px-3 rounded-xl border border-blue-200">
                <span>Net Factory Profit</span>
                <span>{formatCurrency(netProfit, settings.currency)}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: PRODUCTION TRACKER */}
      {activeTab === 'production' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6 space-y-6">
          <h3 className="font-bold text-slate-900 text-lg border-b border-slate-200 pb-3">
            Overall Factory Production Funnel
          </h3>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
              <span className="text-xs font-bold text-slate-500 uppercase">1. Ordered by Customers</span>
              <div className="text-2xl font-black text-slate-900 mt-1">{totalOrderedPairs} Pairs</div>
            </div>

            <div className="p-4 rounded-xl bg-amber-50 border border-amber-200">
              <span className="text-xs font-bold text-amber-700 uppercase">2. Given for Cutting</span>
              <div className="text-2xl font-black text-amber-800 mt-1">{totalGivenPairs} Pairs</div>
              <span className="text-[10px] text-amber-700">
                {totalOrderedPairs > 0 ? Math.round((totalGivenPairs / totalOrderedPairs) * 100) : 0}% of demand
              </span>
            </div>

            <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200">
              <span className="text-xs font-bold text-emerald-700 uppercase">3. Finished Goods Received</span>
              <div className="text-2xl font-black text-emerald-800 mt-1">{totalReceivedPairs} Pairs</div>
              <span className="text-[10px] text-emerald-700">Ready in factory</span>
            </div>

            <div className="p-4 rounded-xl bg-blue-50 border border-blue-200">
              <span className="text-xs font-bold text-blue-700 uppercase">4. Billed & Dispatched</span>
              <div className="text-2xl font-black text-blue-800 mt-1">{totalBilledPairs} Pairs</div>
              <span className="text-[10px] text-blue-700">Delivered to buyers</span>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: STOCK VALUATION */}
      {activeTab === 'stock' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Ready Stock Quantity</span>
              <div className="text-2xl font-black text-slate-900 mt-1">{totalReadyStock} pairs</div>
            </div>
            <div className="bg-white p-5 rounded-2xl border border-blue-100 shadow-xs">
              <span className="text-xs font-bold uppercase tracking-wider text-blue-700">Cost Value</span>
              <div className="text-2xl font-black text-blue-700 mt-1">{formatCurrency(stockCostVal, settings.currency)}</div>
            </div>
            <div className="bg-white p-5 rounded-2xl border border-emerald-100 shadow-xs">
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-700">Wholesale Value</span>
              <div className="text-2xl font-black text-emerald-600 mt-1">{formatCurrency(stockSaleVal, settings.currency)}</div>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <table className="w-full text-left text-xs sm:text-sm">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                <tr>
                  <th className="py-3 px-4">Glove Type</th>
                  <th className="py-3 px-4">Specs</th>
                  <th className="py-3 px-4 text-center">Stock</th>
                  <th className="py-3 px-4 text-right">Cost Rate</th>
                  <th className="py-3 px-4 text-right">Sale Rate</th>
                  <th className="py-3 px-4 text-right">Cost Total</th>
                  <th className="py-3 px-4 text-right">Sale Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {products.map(p => (
                  <tr key={p.id}>
                    <td className="py-3 px-4 font-bold text-slate-900">{p.gloveName}</td>
                    <td className="py-3 px-4 text-slate-500">{p.size} &bull; {p.color} &bull; {p.leatherType}</td>
                    <td className="py-3 px-4 text-center font-black text-blue-700">{p.currentStock} pairs</td>
                    <td className="py-3 px-4 text-right text-slate-600">{formatCurrency(p.purchasePrice, settings.currency)}</td>
                    <td className="py-3 px-4 text-right text-emerald-600 font-bold">{formatCurrency(p.salePrice, settings.currency)}</td>
                    <td className="py-3 px-4 text-right font-medium text-slate-800">{formatCurrency(p.currentStock * p.purchasePrice, settings.currency)}</td>
                    <td className="py-3 px-4 text-right font-black text-slate-900">{formatCurrency(p.currentStock * p.salePrice, settings.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 4: LABOR & WAGES */}
      {activeTab === 'labor' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="p-4 sm:p-5 border-b border-slate-200">
            <h4 className="font-bold text-slate-900 text-base">Cutting & Piece-Rate Work Log</h4>
          </div>

          <table className="w-full text-left text-xs sm:text-sm">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
              <tr>
                <th className="py-3 px-4">Date</th>
                <th className="py-3 px-4">Worker</th>
                <th className="py-3 px-4">Description</th>
                <th className="py-3 px-4 text-center">Pairs</th>
                <th className="py-3 px-4 text-right">Earned Wage</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {staffLedger.map(sl => (
                <tr key={sl.id}>
                  <td className="py-3 px-4 text-slate-600">{formatDate(sl.date)}</td>
                  <td className="py-3 px-4 font-bold text-slate-900">{sl.staffName}</td>
                  <td className="py-3 px-4 text-slate-700">{sl.description}</td>
                  <td className="py-3 px-4 text-center font-bold text-blue-700">{sl.qty ? `${sl.qty} pairs` : '-'}</td>
                  <td className="py-3 px-4 text-right font-black text-amber-700">{formatCurrency(sl.amount, settings.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
