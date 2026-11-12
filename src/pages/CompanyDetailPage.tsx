import React, { useMemo } from 'react';
import { 
  Building2, 
  ArrowLeft, 
  Plus, 
  Calendar, 
  Package, 
  CheckCircle2, 
  Clock, 
  Eye, 
  Scissors, 
  Receipt, 
  Truck, 
  Layers, 
  Phone, 
  MapPin, 
  User, 
  AlertCircle,
  ExternalLink,
  ChevronDown
} from 'lucide-react';
import { useFactory } from '../context/FactoryContext';
import { CustomerOrder, CompanyOrderStats } from '../types/factory';
import { formatDate, getOrderStatusBadge } from '../utils/factoryFormatters';

interface CompanyDetailPageProps {
  companyName: string;
  onBack: () => void;
  onSelectOrder: (orderId: string) => void;
  onOpenCreateOrder: (companyName: string) => void;
  onOpenCuttingForOrder?: (orderId: string) => void;
  onOpenInvoiceForOrder?: (orderId: string) => void;
}

export const CompanyDetailPage: React.FC<CompanyDetailPageProps> = ({
  companyName,
  onBack,
  onSelectOrder,
  onOpenCreateOrder,
  onOpenCuttingForOrder,
  onOpenInvoiceForOrder
}) => {
  const { getCompanyStats, deliveryHistory } = useFactory();

  // Find this company's aggregated stats
  const companyStats = useMemo(() => {
    const allStats = getCompanyStats();
    const norm = companyName.trim().toLowerCase();
    const found = allStats.find((s: CompanyOrderStats) => s.normalizedName === norm);
    if (found) return found;

    // Fallback if brand new
    return {
      company: {
        id: `comp-${norm}`,
        name: companyName,
        normalizedName: norm,
        createdAt: new Date().toISOString()
      },
      name: companyName,
      normalizedName: norm,
      totalOrdersCount: 0,
      activeOrdersCount: 0,
      completedOrdersCount: 0,
      totalPairsLifetime: 0,
      totalDeliveredPairs: 0,
      totalRemainingPairs: 0,
      lastOrderDate: '',
      isCompleted: false,
      activeOrders: [],
      completedOrders: [],
      allOrders: []
    };
  }, [getCompanyStats, companyName]);

  // Helper to get delivery count per article & size for an order
  const getDeliveryInfoForOrder = (order: CustomerOrder) => {
    const orderDeliveries = (deliveryHistory || []).filter(d => 
      (d.orderId === order.id || d.customerOrderId === order.id) &&
      (!order.orderNo || !d.orderNo || d.orderNo === order.orderNo) &&
      (!d.article || !d.article.includes(','))
    );

    const totalDelivered = orderDeliveries.reduce((sum, d) => sum + (Number(d.quantity) || 0), 0);
    const totalOrdered = Number(order.originalTotalPairs) || Number(order.totalPairs) || Number(order.totalQty) || 0;
    const remaining = Math.max(0, totalOrdered - totalDelivered);

    return {
      orderDeliveries,
      totalDelivered,
      totalOrdered,
      remaining
    };
  };

  // Render a detailed Order Card
  const renderOrderCard = (order: CustomerOrder, isCompletedSection: boolean) => {
    const { totalDelivered, totalOrdered, remaining, orderDeliveries } = getDeliveryInfoForOrder(order);
    const badge = getOrderStatusBadge(order.status);
    const completionPct = totalOrdered > 0 ? Math.min(100, Math.round((totalDelivered / totalOrdered) * 100)) : 0;

    // Extract articles and sizes
    const items = order.items || [];
    const articleNames = Array.from(new Set(items.map(i => i.title || i.gloveType || i.article || 'Article'))).join(' / ');

    return (
      <div
        key={order.id}
        className={`rounded-2xl border transition-all duration-200 overflow-hidden shadow-xs hover:shadow-md ${
          isCompletedSection
            ? 'bg-white border-slate-200/90 hover:border-slate-300'
            : 'bg-white border-slate-200 hover:border-blue-400'
        }`}
      >
        {/* Card Header */}
        <div
          className={`p-4 sm:p-5 border-b flex flex-col md:flex-row md:items-center justify-between gap-3 ${
            isCompletedSection ? 'bg-slate-50/80 border-slate-200' : 'bg-slate-50 border-slate-200'
          }`}
        >
          <div className="flex items-center gap-3">
            <span className="w-10 h-10 rounded-xl bg-blue-100 text-blue-800 flex items-center justify-center font-black font-mono text-sm shrink-0 shadow-2xs">
              #{order.orderNo ? order.orderNo.replace(/^ORD-/, '') : 'ORD'}
            </span>

            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono font-black text-base text-slate-900">
                  #{order.orderNo || order.id}
                </span>

                <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${badge.bg}`}>
                  {badge.label}
                </span>

                {isCompletedSection ? (
                  <span className="px-2 py-0.5 rounded-md text-[10px] font-black bg-slate-200 text-slate-700 uppercase tracking-wider">
                    Completed &bull; 100% Fulfilled
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-md text-[10px] font-black bg-emerald-100 text-emerald-800 border border-emerald-300 uppercase tracking-wider">
                    Active Order
                  </span>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 mt-1">
                <span className="flex items-center gap-1 font-medium">
                  <Calendar className="w-3.5 h-3.5 text-slate-400" />
                  <span>Ordered: {formatDate(order.orderDate)}</span>
                </span>
                {order.deliveryDate && (
                  <>
                    <span>&bull;</span>
                    <span className="flex items-center gap-1 font-medium text-blue-700">
                      <Clock className="w-3.5 h-3.5 text-blue-500" />
                      <span>Target Delivery: {formatDate(order.deliveryDate)}</span>
                    </span>
                  </>
                )}
                {articleNames && (
                  <>
                    <span>&bull;</span>
                    <span className="font-bold text-slate-700">Articles: {articleNames}</span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Quick Metrics & Actions on Header Right */}
          <div className="flex items-center gap-3 self-end md:self-auto">
            <div className="text-right">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                Total Ordered
              </span>
              <span className="font-mono font-black text-base text-blue-800">
                {totalOrdered.toLocaleString()} Pairs
              </span>
            </div>

            <button
              type="button"
              onClick={() => onSelectOrder(order.id)}
              className="px-3.5 py-2 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-xs transition active:scale-95 flex items-center gap-1.5 cursor-pointer shrink-0"
            >
              <Eye className="w-4 h-4" />
              <span>View Full Details</span>
            </button>
          </div>
        </div>

        {/* Card Body: Articles & Sizes Breakdown */}
        <div className="p-4 sm:p-5 space-y-4">
          {items.map((item, iIdx) => {
            const artName = item.title || item.gloveType || item.article || 'Article';
            let sizeRows: { size: string; quantity: number }[] = [];

            if (item.customSizes && item.customSizes.length > 0) {
              sizeRows = item.customSizes
                .filter(cs => Number(cs.quantity) > 0 || (cs.size && cs.size.trim().length > 0))
                .map(cs => ({ size: cs.size || 'Standard', quantity: Number(cs.quantity || 0) }));
            }
            if (sizeRows.length === 0 && item.size) {
              const rawSize = item.size;
              const cleanSize = (rawSize === '10000' || rawSize === '10,000' || rawSize === String(item.totalPairs)) ? '10' : rawSize;
              sizeRows = [{ size: cleanSize, quantity: Number(item.totalPairs) || Number(item.originalQty) || 0 }];
            } else if (sizeRows.length === 0 && item.sizes) {
              const sz = Object.entries(item.sizes).filter(([, q]) => Number(q) > 0);
              sizeRows = sz.length
                ? sz.map(([s, q]) => ({ size: s.toUpperCase(), quantity: Number(q || 0) }))
                : [{ size: 'Standard', quantity: Number(item.totalPairs) || 0 }];
            }

            // Ascending sort (7, 8, 9, 10)
            sizeRows.sort((a, b) => {
              const numA = parseFloat(a.size);
              const numB = parseFloat(b.size);
              if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
              return a.size.localeCompare(b.size, undefined, { numeric: true });
            });

            const artDelivered = orderDeliveries
              .filter(d => (d.article || '').trim().toLowerCase() === artName.trim().toLowerCase())
              .reduce((sum, d) => sum + (Number(d.quantity) || 0), 0);
            const artOrdered = sizeRows.reduce((sum, s) => sum + s.quantity, 0) || Number(item.totalPairs) || 0;
            const artRemaining = Math.max(0, artOrdered - artDelivered);

            return (
              <div key={item.id || iIdx} className="rounded-xl border border-slate-200 overflow-hidden bg-white shadow-2xs">
                {/* Article Bar */}
                <div className="bg-slate-50/90 border-b border-slate-200 px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="font-black text-slate-800 uppercase tracking-wide">
                      Article: {artName}
                    </span>
                    {item.color && (
                      <span className="px-2 py-0.5 rounded bg-white border border-slate-200 text-slate-600 font-medium text-[11px]">
                        Color: {item.color}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 font-mono text-[11px] font-bold">
                    <span className="text-slate-800">Ordered: {artOrdered.toLocaleString()}</span>
                    <span className="text-emerald-700">Delivered: {artDelivered.toLocaleString()}</span>
                    <span className="text-blue-700">Remaining: {artRemaining.toLocaleString()}</span>
                  </div>
                </div>

                {/* Per-size Breakdown Table */}
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-100/60 text-slate-600 font-bold border-b border-slate-200 text-[10px] uppercase tracking-wider">
                    <tr>
                      <th className="py-2 px-3.5">Size</th>
                      <th className="py-2 px-3.5 text-right font-black text-slate-800">Ordered Quantity</th>
                      <th className="py-2 px-3.5 text-right font-black text-emerald-700">Delivered</th>
                      <th className="py-2 px-3.5 text-right font-black text-blue-700">Remaining Balance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium">
                    {sizeRows.map((sr, sIdx) => {
                      const cleanSz = (sr.size || '').trim().toLowerCase().replace(/^size\s*/i, '');
                      const sizeDelivered = orderDeliveries
                        .filter(d => 
                          (d.article || '').trim().toLowerCase() === artName.trim().toLowerCase() &&
                          (d.size || '').trim().toLowerCase().replace(/^size\s*/i, '') === cleanSz
                        )
                        .reduce((sum, d) => sum + (Number(d.quantity) || 0), 0);
                      const sizeRemaining = Math.max(0, sr.quantity - sizeDelivered);

                      return (
                        <tr key={sIdx} className="hover:bg-slate-50/50 transition">
                          <td className="py-2 px-3.5 font-mono font-bold text-slate-700">
                            Size {sr.size}
                          </td>
                          <td className="py-2 px-3.5 text-right font-mono font-bold text-slate-900">
                            {sr.quantity.toLocaleString()} Pairs
                          </td>
                          <td className="py-2 px-3.5 text-right font-mono font-bold text-emerald-700">
                            {sizeDelivered.toLocaleString()} Pairs
                          </td>
                          <td className="py-2 px-3.5 text-right font-mono font-black text-blue-700">
                            {sizeRemaining.toLocaleString()} Pairs
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            );
          })}

          {/* Fulfillment Progress & Action Bar */}
          <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-t border-slate-100">
            <div className="flex-1 max-w-md">
              <div className="flex items-center justify-between text-[11px] font-bold text-slate-600 mb-1">
                <span>Fulfillment Progress</span>
                <span className="font-mono text-emerald-700">
                  {totalDelivered.toLocaleString()} / {totalOrdered.toLocaleString()} Pairs ({completionPct}%)
                </span>
              </div>
              <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                <div
                  style={{ width: `${completionPct}%` }}
                  className={`h-full transition-all duration-300 rounded-full ${
                    isCompletedSection ? 'bg-slate-500' : 'bg-emerald-500'
                  }`}
                />
              </div>
            </div>

            {/* Quick Actions */}
            <div className="flex items-center gap-2">
              {!isCompletedSection && onOpenCuttingForOrder && (
                <button
                  type="button"
                  onClick={() => onOpenCuttingForOrder(order.id)}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold bg-amber-500 hover:bg-amber-600 text-white shadow-2xs transition active:scale-95 flex items-center gap-1 cursor-pointer"
                  title="Assign cutting for this order"
                >
                  <Scissors className="w-3.5 h-3.5" />
                  <span>+ Cutting</span>
                </button>
              )}

              {!isCompletedSection && onOpenInvoiceForOrder && (
                <button
                  type="button"
                  onClick={() => onOpenInvoiceForOrder(order.id)}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-2xs transition active:scale-95 flex items-center gap-1 cursor-pointer"
                  title="Create bill and record delivery"
                >
                  <Truck className="w-3.5 h-3.5" />
                  <span>+ Deliver / Bill</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => onSelectOrder(order.id)}
                className="px-3 py-1.5 rounded-lg text-xs font-bold border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 shadow-2xs transition active:scale-95 flex items-center gap-1 cursor-pointer"
              >
                <span>Order Hub</span>
                <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16">
      {/* Top Breadcrumb & Company Header */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-4 sm:p-6 transition-all">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              onClick={onBack}
              className="p-2.5 rounded-xl text-slate-600 hover:text-blue-700 hover:bg-slate-100 transition shrink-0 cursor-pointer"
              title="Back to Order Companies"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <div className="flex items-center gap-2">
                <span className="p-1 rounded-lg bg-blue-100 text-blue-800">
                  <Building2 className="w-4 h-4" />
                </span>
                <span className="text-xs font-bold text-blue-700 uppercase tracking-wider">
                  Company Order History
                </span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-black text-slate-900 mt-0.5">
                {companyStats.name} &bull; All Orders
              </h1>
              <p className="text-xs text-slate-500">
                Complete timeline from very first order till today &bull; Auto-separated into Active & Completed
              </p>
            </div>
          </div>

          {/* Quick Action: Add New Order for THIS Company */}
          <div className="flex items-center gap-2.5">
            <button
              onClick={() => onOpenCreateOrder(companyStats.name)}
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-xs sm:text-sm font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-500/25 transition active:scale-95 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Add New Order for {companyStats.name}</span>
            </button>
          </div>
        </div>

        {/* Company Contact & Metadata Bar */}
        {(companyStats.company.contactPerson || companyStats.company.phone || companyStats.company.address) && (
          <div className="mt-4 pt-3 border-t border-slate-100 flex flex-wrap items-center gap-4 text-xs text-slate-600">
            {companyStats.company.contactPerson && (
              <span className="flex items-center gap-1.5 font-medium">
                <User className="w-3.5 h-3.5 text-slate-400" />
                <span>Contact: {companyStats.company.contactPerson}</span>
              </span>
            )}
            {companyStats.company.phone && (
              <span className="flex items-center gap-1.5 font-medium font-mono">
                <Phone className="w-3.5 h-3.5 text-slate-400" />
                <span>{companyStats.company.phone}</span>
              </span>
            )}
            {companyStats.company.address && (
              <span className="flex items-center gap-1.5 font-medium">
                <MapPin className="w-3.5 h-3.5 text-slate-400" />
                <span>{companyStats.company.address}</span>
              </span>
            )}
          </div>
        )}

        {/* Company Summary Stats Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mt-6 pt-5 border-t border-slate-100">
          <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
              Total Company Orders
            </span>
            <div className="text-xl sm:text-2xl font-black text-slate-900 mt-1">
              {companyStats.totalOrdersCount} Orders
            </div>
            <p className="text-[11px] text-slate-500 mt-0.5">Lifetime purchase contracts</p>
          </div>

          <div className="bg-blue-50/70 border border-blue-200/80 rounded-xl p-3.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-blue-700 block">
              Total Ordered Pairs
            </span>
            <div className="text-xl sm:text-2xl font-black text-blue-700 font-mono mt-1">
              {companyStats.totalPairsLifetime.toLocaleString()}{' '}
              <span className="text-xs font-bold text-blue-600">Pairs</span>
            </div>
            <p className="text-[11px] text-blue-600 mt-0.5">Gross lifetime glove volume</p>
          </div>

          <div className="bg-emerald-50/70 border border-emerald-200/80 rounded-xl p-3.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 block">
              Active Orders
            </span>
            <div className="text-xl sm:text-2xl font-black text-emerald-800 mt-1 flex items-center gap-2">
              <span>{companyStats.activeOrdersCount} In-Work</span>
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            </div>
            <p className="text-[11px] text-emerald-700 mt-0.5">Pending fulfillment & delivery</p>
          </div>

          <div className="bg-slate-100/80 border border-slate-200 rounded-xl p-3.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-600 block">
              Completed Orders
            </span>
            <div className="text-xl sm:text-2xl font-black text-slate-700 mt-1">
              {companyStats.completedOrdersCount} Fulfilled
            </div>
            <p className="text-[11px] text-slate-500 mt-0.5">100% delivered to customer</p>
          </div>
        </div>
      </div>

      {/* =========================================================================
          SECTION 1: ACTIVE ORDERS (ALWAYS STAY ON TOP)
          ========================================================================= */}
      <section className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-1 border-b border-slate-200">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold">
              <Clock className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-black text-slate-900">
                  Active Orders ({companyStats.activeOrders.length})
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 uppercase tracking-wider">
                  Always on Top
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Pending production, cutting, and deliveries &bull; Newest order on top, oldest at bottom
              </p>
            </div>
          </div>

          <button
            onClick={() => onOpenCreateOrder(companyStats.name)}
            className="self-start sm:self-auto px-3.5 py-1.5 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-2xs transition active:scale-95 flex items-center gap-1 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>+ Create Active Order</span>
          </button>
        </div>

        {companyStats.activeOrders.length === 0 ? (
          <div className="bg-white rounded-2xl border border-dashed border-emerald-300 p-8 text-center">
            <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 mx-auto flex items-center justify-center mb-2">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <h4 className="font-bold text-slate-800 text-sm">No Active Orders for {companyStats.name}</h4>
            <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
              All previous orders for this company have been fully delivered and completed! Click below to create a new order.
            </p>
            <button
              onClick={() => onOpenCreateOrder(companyStats.name)}
              className="mt-3.5 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs transition active:scale-95 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Create New Order for {companyStats.name}</span>
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {companyStats.activeOrders.map((order: CustomerOrder) => renderOrderCard(order, false))}
          </div>
        )}
      </section>

      {/* =========================================================================
          SECTION 2: COMPLETED ORDERS (AUTOMATICALLY MOVED TO BOTTOM)
          ========================================================================= */}
      <section className="space-y-4 pt-4">
        <div className="p-4 sm:p-5 rounded-2xl bg-slate-100/80 border border-slate-200">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-200">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-slate-300 text-slate-700 flex items-center justify-center font-bold">
                <CheckCircle2 className="w-4 h-4" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base sm:text-lg font-black text-slate-800">
                    Completed Orders ({companyStats.completedOrders.length})
                  </h2>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-200 text-slate-700 border border-slate-300 uppercase tracking-wider">
                    Bottom Section &bull; 100% Delivered
                  </span>
                </div>
                <p className="text-xs text-slate-500">
                  When an order completes (Delivered = Ordered, Remaining = 0), it automatically moves down here.
                </p>
              </div>
            </div>
          </div>

          <div className="mt-4">
            {companyStats.completedOrders.length === 0 ? (
              <div className="p-6 text-center text-slate-500 text-xs">
                <Clock className="w-5 h-5 text-slate-400 mx-auto mb-1.5" />
                <p className="font-semibold text-slate-700">No completed orders yet</p>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  When any active order for {companyStats.name} reaches 100% delivered, it will automatically move down here.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {companyStats.completedOrders.map((order: CustomerOrder) => renderOrderCard(order, true))}
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
};
