import React, { useState } from 'react';
import { 
  FileText, 
  Search, 
  Plus, 
  Filter, 
  ChevronDown,
  Eye,
  Scissors, 
  Pencil, 
  Trash2, 
  AlertCircle,
  Package,
  Layers,
  CheckCircle2,
  X
} from 'lucide-react';
import { useFactory } from '../context/FactoryContext';
import { formatDate, getOrderStatusBadge } from '../utils/factoryFormatters';
import { CustomerOrder } from '../types/factory';

interface OrdersPageProps {
  onOpenCreateOrder: () => void;
  onEditOrder?: (order: CustomerOrder) => void;
  onOpenCuttingForOrder: (orderId: string) => void;
}

export const OrdersPage: React.FC<OrdersPageProps> = ({
  onOpenCreateOrder,
  onEditOrder,
  onOpenCuttingForOrder
}) => {
  const { orders, setSelectedOrderId, setActiveModule, deleteCustomerOrder } = useFactory();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [orderToDelete, setOrderToDelete] = useState<CustomerOrder | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);

  const filteredOrders = orders.filter(ord => {
    if (statusFilter !== 'all' && ord.status !== statusFilter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      const matchNo = ord.orderNo?.toLowerCase().includes(q);
      const matchCustomer = ord.customerName?.toLowerCase().includes(q);
      const matchItems = ord.items?.some(i => i.title?.toLowerCase().includes(q) || i.gloveType?.toLowerCase().includes(q));
      return matchNo || matchCustomer || matchItems;
    }
    return true;
  });

  const totalPairsAll = orders.reduce((sum, o) => sum + (Number(o.totalPairs) || Number(o.totalQty) || 0), 0);
  const activeOrdersCount = orders.filter(o => o.status !== 'Completed').length;
  const inProductionCount = orders.filter(o => o.status === 'In-Production' || o.status === 'Cutting-Given').length;

  const handleConfirmDelete = async () => {
    if (!orderToDelete) return;
    setIsDeleting(true);
    try {
      await deleteCustomerOrder(orderToDelete.id);
      setOrderToDelete(null);
    } catch (err) {
      console.error('Delete error:', err);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Top Banner & Stats: Pairs Counting (No Rates / No Rs. Amounts) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl p-5 border border-blue-100 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-blue-700">Total Customer Orders</span>
            <FileText className="w-5 h-5 text-blue-500" />
          </div>
          <div className="text-2xl font-black text-slate-900 mt-2">{orders.length} Orders</div>
          <p className="text-xs text-slate-500 mt-1">{activeOrdersCount} orders currently in factory pipeline</p>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-600">Total Ordered Pairs</span>
            <Package className="w-5 h-5 text-amber-500" />
          </div>
          <div className="text-2xl font-black text-slate-900 mt-2 font-mono">{totalPairsAll} Pairs</div>
          <p className="text-xs text-slate-500 mt-1">Sum of all glove models across orders</p>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-indigo-100 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-indigo-700">Active Production</span>
            <Layers className="w-5 h-5 text-indigo-500" />
          </div>
          <div className="text-2xl font-black text-indigo-600 mt-2">{inProductionCount} In-Work</div>
          <p className="text-xs text-slate-500 mt-1">Orders in cutting & stitching stages</p>
        </div>
      </div>

      {/* Main Orders Table Card */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        {/* Header Controls */}
        <div className="p-4 sm:p-5 border-b border-slate-200 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="font-bold text-slate-900 text-lg">Customer Orders Hub</h3>
              <p className="text-xs text-slate-500">Real-time synchronized across mobile and desktop devices</p>
            </div>

            <button
              onClick={onOpenCreateOrder}
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-500/25 transition active:scale-95 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>+ Create Customer Order</span>
            </button>
          </div>

          {/* Search & Stage Filter */}
          <div className="flex flex-col sm:flex-row items-center gap-3">
            <div className="relative flex-1 w-full">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Search by order #, customer, or glove name..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-xs sm:text-sm rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500/20 bg-white"
              />
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <Filter className="w-4 h-4 text-slate-400 shrink-0" />
              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
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

        {/* Delete Confirmation Modal / Banner */}
        {orderToDelete && (
          <div className="p-4 bg-rose-50 border-b border-rose-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs text-rose-900 animate-in fade-in duration-150">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
              <div>
                <span className="font-bold">Are you sure to delete this order?</span>
                <p className="text-[11px] text-rose-700">
                  Order #{orderToDelete.orderNo} ({orderToDelete.customerName} - {orderToDelete.totalPairs || orderToDelete.totalQty} pairs) will be permanently deleted from the system.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 self-end sm:self-center">
              <button
                onClick={() => setOrderToDelete(null)}
                disabled={isDeleting}
                className="px-3 py-1.5 rounded-lg bg-white border border-slate-300 text-slate-700 font-semibold hover:bg-slate-50 transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDelete}
                disabled={isDeleting}
                className="px-4 py-1.5 rounded-lg bg-rose-600 text-white font-bold hover:bg-rose-700 transition cursor-pointer disabled:opacity-50"
              >
                {isDeleting ? 'Deleting...' : 'Yes, Delete Order'}
              </button>
            </div>
          </div>
        )}

        {/* Orders Table */}
        <div className="overflow-x-auto">
          {filteredOrders.length === 0 ? (
            <div className="py-16 text-center text-slate-400 text-sm">
              <FileText className="w-10 h-10 text-slate-300 mx-auto mb-2" />
              <p>No customer orders found matching your search.</p>
              <button
                onClick={onOpenCreateOrder}
                className="mt-3 text-xs font-bold text-blue-600 hover:underline cursor-pointer"
              >
                + Create new customer order with size matrix
              </button>
            </div>
          ) : (
            <table className="w-full min-w-[900px] table-fixed text-left text-xs sm:text-sm">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                <tr>
                  <th className="w-[12%] py-3 px-4">Order #</th>
                  <th className="w-[18%] py-3 px-4">Customer</th>
                  <th className="w-[20%] py-3 px-4">Dates</th>
                  <th className="w-[14%] py-3 px-4 text-center">Total Pairs</th>
                  <th className="w-[14%] py-3 px-4 text-center">Total Articles</th>
                  <th className="w-[12%] py-3 px-4 text-center">Status</th>
                  <th className="w-[10%] py-3 px-4 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredOrders.map(ord => {
                  const badge = getOrderStatusBadge(ord.status);
                  const pairsCount = Number(ord.totalPairs) || Number(ord.totalQty) || 0;
                  const articleCount = ord.items?.length || 0;
                  const isExpanded = expandedOrderId === ord.id;

                  const totalGiven = ord.items?.reduce((s, i) => s + (i.cuttingGivenQty || 0), 0) || 0;
                  const totalRcvd = ord.items?.reduce((s, i) => s + (i.stockReceivedQty || 0), 0) || 0;
                  const totalBilled = ord.items?.reduce((s, i) => s + (i.billedQty || 0), 0) || 0;

                  const cuttingPct = pairsCount > 0 ? Math.min(100, Math.round((totalGiven / pairsCount) * 100)) : 0;
                  const stockPct = pairsCount > 0 ? Math.min(100, Math.round((totalRcvd / pairsCount) * 100)) : 0;
                  const billedPct = pairsCount > 0 ? Math.min(100, Math.round((totalBilled / pairsCount) * 100)) : 0;

                  return (
                    <React.Fragment key={ord.id}>
                      <tr
                        className="h-[55px] cursor-pointer transition hover:bg-slate-50"
                        onClick={() => setExpandedOrderId(isExpanded ? null : ord.id)}
                        aria-expanded={isExpanded}
                      >
                        <td className="overflow-hidden text-ellipsis whitespace-nowrap px-4 py-3 font-mono font-bold text-blue-700">#{ord.orderNo}</td>
                        <td className="overflow-hidden text-ellipsis whitespace-nowrap px-4 py-3 font-bold text-slate-900" title={ord.customerName}>{ord.customerName}</td>
                        <td className="overflow-hidden text-ellipsis whitespace-nowrap px-4 py-3 text-xs text-slate-600" title={`Order: ${formatDate(ord.orderDate)} | Due: ${formatDate(ord.deliveryDate)}`}>
                          {formatDate(ord.orderDate)} <span className="text-slate-400">→</span> {formatDate(ord.deliveryDate)}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-center font-mono font-black text-blue-800">{pairsCount.toLocaleString()} Pairs</td>
                        <td className="whitespace-nowrap px-4 py-3 text-center font-semibold text-slate-700">{articleCount} {articleCount === 1 ? 'Article' : 'Articles'}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-center">
                          <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${badge.bg}`}>{badge.label}</span>
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-center" onClick={event => event.stopPropagation()}>
                          <div className="flex items-center justify-center gap-1">
                            <button
                              type="button"
                              onClick={() => onEditOrder?.(ord)}
                              className="rounded-lg p-1.5 text-blue-700 hover:bg-blue-50"
                              title="Edit Order"
                              aria-label={`Edit order ${ord.orderNo}`}
                            >
                              <Pencil className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setOrderToDelete(ord)}
                              className="rounded-lg p-1.5 text-rose-600 hover:bg-rose-50"
                              title="Delete Order"
                              aria-label={`Delete order ${ord.orderNo}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => onOpenCuttingForOrder(ord.id)}
                              className="rounded-lg p-1.5 text-amber-800 hover:bg-amber-50"
                              title="Assign Cutting"
                              aria-label={`Assign cutting for ${ord.orderNo}`}
                            >
                              <Scissors className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setExpandedOrderId(isExpanded ? null : ord.id)}
                              className={`rounded-lg p-1.5 transition ${isExpanded ? 'bg-blue-100 text-blue-700' : 'text-slate-500 hover:bg-blue-50 hover:text-blue-700'}`}
                              title={isExpanded ? 'Hide Order Details' : 'View Order Details'}
                              aria-label={`${isExpanded ? 'Hide' : 'View'} order details for ${ord.orderNo}`}
                              aria-expanded={isExpanded}
                            >
                              {isExpanded ? <ChevronDown className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </button>
                          </div>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr className="bg-slate-50/80">
                          <td colSpan={7} className="p-4 sm:p-5">
                            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                              <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
                                <div>
                                  <h4 className="font-bold text-slate-900">Order #{ord.orderNo} — {ord.customerName}</h4>
                                  <p className="mt-1 text-xs text-slate-500">
                                    Order date: {formatDate(ord.orderDate)} · Delivery date: {formatDate(ord.deliveryDate)}
                                    {ord.customerPhone ? ` · ${ord.customerPhone}` : ''}
                                  </p>
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="rounded-lg bg-blue-50 px-3 py-2 text-xs font-black text-blue-800">{pairsCount.toLocaleString()} Pairs</span>
                                  <span className={`rounded-full border px-2.5 py-1 text-[11px] font-bold ${badge.bg}`}>{badge.label}</span>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setSelectedOrderId(ord.id);
                                      setActiveModule('order_detail');
                                    }}
                                    className="rounded-lg border border-blue-200 px-3 py-2 text-xs font-bold text-blue-700 hover:bg-blue-50"
                                  >
                                    Open Full Order
                                  </button>
                                </div>
                              </div>

                              <section>
                                <h5 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-600">Glove Items & Sizes</h5>
                                <div className="overflow-x-auto rounded-lg border border-slate-200">
                                  <table className="w-full min-w-[420px] text-left text-xs">
                                    <thead className="bg-slate-50 text-slate-600">
                                      <tr>
                                        <th className="px-3 py-2">Article</th>
                                        <th className="px-3 py-2">Size</th>
                                        <th className="px-3 py-2 text-right">Pairs</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                      {ord.items?.length ? ord.items.flatMap((item, itemIndex) => {
                                        const sizeRows = Object.entries(item.sizes || {}).filter(([, quantity]) => Number(quantity) > 0);
                                        const rows = sizeRows.length
                                          ? sizeRows.map(([size, quantity]) => [size.toUpperCase(), Number(quantity)] as [string, number])
                                          : [['—', Number(item.totalPairs) || 0] as [string, number]];
                                        return rows.map(([size, quantity], rowIndex) => (
                                          <tr key={`${itemIndex}-${rowIndex}`}>
                                            <td className="px-3 py-2 font-semibold text-slate-800">{rowIndex === 0 ? (item.title || item.gloveType || 'Glove') : ''}</td>
                                            <td className="px-3 py-2">{size}</td>
                                            <td className="px-3 py-2 text-right font-mono">{quantity.toLocaleString()}</td>
                                          </tr>
                                        ));
                                      }) : (
                                        <tr><td colSpan={3} className="px-3 py-4 text-center text-slate-400">No glove details found.</td></tr>
                                      )}
                                    </tbody>
                                  </table>
                                </div>
                              </section>

                              <section className="mt-5">
                                <h5 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-600">Production Progress</h5>
                                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                                  {[
                                    ['Cutting Given', cuttingPct, totalGiven],
                                    ['Stock Ready', stockPct, totalRcvd],
                                    ['Billed', billedPct, totalBilled]
                                  ].map(([label, percent, quantity]) => (
                                    <div key={label} className="rounded-lg bg-slate-50 p-3">
                                      <div className="mb-2 flex justify-between text-xs">
                                        <span className="font-semibold text-slate-700">{label}</span>
                                        <span className="font-bold text-slate-600">{quantity.toLocaleString()} / {pairsCount.toLocaleString()} ({percent}%)</span>
                                      </div>
                                      <div className="h-2 overflow-hidden rounded-full bg-slate-200">
                                        <div style={{ width: `${percent}%` }} className="h-full rounded-full bg-blue-600" />
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </section>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
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
