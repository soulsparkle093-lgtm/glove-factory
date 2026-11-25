import React, { useMemo } from 'react';
import { useFactory } from '../../context/FactoryContext';

interface OrderSummaryRow {
  key: string;
  article: string;
  size: string;
  cutting: number;
  totalOrder: number;
  delivered: number;
}

interface OrderHistoryDetailReportProps {
  orderId: string;
  articleName: string;
  totalOrder: number;
}

const normalize = (value: string): string => value.trim().toLocaleLowerCase();

const formatSize = (value: string): string => {
  return value.trim() || '-';
};

export const OrderHistoryDetailReport: React.FC<OrderHistoryDetailReportProps> = ({
  orderId,
  articleName,
  totalOrder
}) => {
  const { orders, cuttingTransactions, cuttingEntries, cuttings, deliveryHistory, orderDispatchHistory } = useFactory();
  const order = orders.find(item => item.id === orderId);

  const rows = useMemo(() => {
    const groups = new Map<string, OrderSummaryRow>();
    const getGroup = (articleValue: string, sizeValue: string): OrderSummaryRow => {
      const rawArt = (articleValue || '').trim();
      const article = (rawArt && !rawArt.includes(',')) ? rawArt : (articleName && !articleName.includes(',') ? articleName : 'Article');
      const size = formatSize(sizeValue);
      const key = `${normalize(article)}___${normalize(size)}`;
      const existing = groups.get(key);
      if (existing) return existing;
      const created: OrderSummaryRow = { key, article, size, cutting: 0, totalOrder: 0, delivered: 0 };
      groups.set(key, created);
      return created;
    };

    // 1. Seed strictly from customer order items and their custom sizes
    (order?.items || []).forEach(item => {
      const art = item.title || item.gloveType || item.article || 'Article';
      if (item.customSizes && item.customSizes.length > 0) {
        item.customSizes
          .filter(cs => Number(cs.quantity) > 0 || (cs.size && cs.size.trim().length > 0))
          .forEach(cs => {
            getGroup(art, cs.size || '-').totalOrder += Number(cs.quantity) || 0;
          });
      } else {
        const sizes = Object.entries(item.sizes || {}).filter(([, quantity]) => Number(quantity) > 0);
        if (sizes.length) {
          sizes.forEach(([size, quantity]) => {
            getGroup(art, size).totalOrder += Number(quantity) || 0;
          });
        } else {
          const quantity = Number(item.originalQty) || Number(item.totalPairs) || Number(item.qty) || 0;
          getGroup(art, item.size || '-').totalOrder += quantity;
        }
      }
    });

    (order?.cuttingArticleSizes || []).forEach(item => getGroup(item.article, item.size));

    // =========================================================================
    // 2. DEDUPLICATED CUTTING RECEIVED (NO DOUBLE COUNTING)
    // Single Source of Truth:
    // - Collect unique cutting entries for this orderId ONCE by id
    //   (cuttingEntries -> fallback cuttingTransactions not in cuttingEntries -> legacy cuttings only if empty).
    // - Total Cutting Received = Sum of RECEIVE entries minus RETURN entries.
    // - Remaining = Total Order Qty - Total Cutting Received (NEGATIVE if Cutting > Order).
    // =========================================================================
    const deletedEntryIds = new Set<string>(
      cuttingEntries.filter(e => e.isDeleted).map(e => e.id)
    );
    const dedupedCuttingById = new Map<string, {
      id: string;
      type: 'GIVE' | 'RECEIVE' | 'RETURN';
      article: string;
      size: string;
      qty: number;
    }>();

    cuttingEntries.forEach(entry => {
      if (entry.isDeleted) return;
      const matchesOrder = entry.orderId === orderId || Boolean(order?.orderNo && entry.orderNo === order.orderNo);
      if (!matchesOrder) return;
      if (entry.type !== 'RECEIVE' && entry.type !== 'RETURN') return;
      const art = (entry.articleTitle || entry.article || '').trim();
      if (!art || art.includes(',')) return;
      const qtyVal = Math.abs(Number(entry.pairs ?? entry.totalQty ?? entry.quantity ?? 0));
      if (qtyVal <= 0) return;
      if (!dedupedCuttingById.has(entry.id)) {
        dedupedCuttingById.set(entry.id, {
          id: entry.id,
          type: entry.type,
          article: art,
          size: entry.sizeName || entry.size || '-',
          qty: qtyVal
        });
      }
    });

    cuttingTransactions.forEach(tx => {
      if (tx.isDeleted || deletedEntryIds.has(tx.id) || dedupedCuttingById.has(tx.id)) return;
      const matchesOrder = tx.orderId === orderId || Boolean(order?.orderNo && tx.orderNo === order.orderNo);
      if (!matchesOrder) return;
      if (tx.type !== 'RECEIVE') return;
      const art = (tx.articleTitle || tx.article || '').trim();
      if (!art || art.includes(',')) return;
      const qtyVal = Math.abs(Number(tx.totalQty ?? tx.qty ?? 0));
      if (qtyVal <= 0) return;
      dedupedCuttingById.set(tx.id, {
        id: tx.id,
        type: 'RECEIVE',
        article: art,
        size: tx.sizeName || tx.size || '-',
        qty: qtyVal
      });
    });

    // Legacy fallback ONLY when no cuttingEntries / cuttingTransactions exist for this order
    if (dedupedCuttingById.size === 0) {
      cuttings
        .filter(cutting =>
          (cutting.orderId === orderId || Boolean(order?.orderNo && cutting.orderNo === order.orderNo)) &&
          cutting.status === 'Received' &&
          !deletedEntryIds.has(cutting.id)
        )
        .forEach(cutting => {
          const art = (cutting.gloveType || (cutting as any).article || '').trim();
          if (!art || art.includes(',')) return;
          const qtyVal = Math.abs(Number(cutting.qty) || 0);
          if (qtyVal <= 0 || dedupedCuttingById.has(cutting.id)) return;
          dedupedCuttingById.set(cutting.id, {
            id: cutting.id,
            type: 'RECEIVE',
            article: art,
            size: cutting.size || '-',
            qty: qtyVal
          });
        });
    }

    // Sum each unique cutting entry ONCE
    dedupedCuttingById.forEach(entry => {
      const group = getGroup(entry.article, entry.size);
      if (entry.type === 'RECEIVE') {
        group.cutting += entry.qty;
      } else if (entry.type === 'RETURN') {
        group.cutting -= entry.qty;
      }
    });

    // 3. Deliveries: Authoritative deliveryHistory for this order (never double-add or cross-pollute)
    const orderDeliveries = (deliveryHistory || []).filter(delivery =>
      (delivery.orderId === orderId || delivery.customerOrderId === orderId) &&
      (!order?.orderNo || !delivery.orderNo || delivery.orderNo === order.orderNo)
    );

    if (orderDeliveries.length > 0) {
      orderDeliveries.forEach(delivery => {
        const art = delivery.article;
        if (!art || art.includes(',')) return;
        const sz = delivery.size || '-';
        getGroup(art, sz).delivered += Number(delivery.quantity) || 0;
      });
    } else {
      orderDispatchHistory
        .filter(entry => entry.orderId === orderId && entry.actionType === 'dispatched_to_customer')
        .forEach(entry => {
          const art = entry.article;
          if (!art || art.includes(',')) return;
          const sz = (entry as any).size || '-';
          getGroup(art, sz).delivered += Number(entry.quantity) || 0;
        });
    }

    if (groups.size === 0 && totalOrder) {
      getGroup(articleName || 'Article', '-').totalOrder = totalOrder;
    }

    const allRows = [...groups.values()];

    // Filter out phantom rows (e.g. '-' or 'matrix' or 'unspecified') when concrete sizes exist
    const filteredRows = allRows.filter(row => {
      const cleanSize = row.size.trim().toLowerCase();
      const isPhantom = cleanSize === '-' || cleanSize === 'matrix' || cleanSize === 'unspecified';
      if (!isPhantom) return true;
      const siblingsWithRealSizes = allRows.filter(r =>
        normalize(r.article) === normalize(row.article) &&
        r.size.trim().toLowerCase() !== '-' &&
        r.size.trim().toLowerCase() !== 'matrix' &&
        r.size.trim().toLowerCase() !== 'unspecified'
      );
      if (siblingsWithRealSizes.length > 0) {
        if (row.totalOrder === 0 && row.delivered === 0 && row.cutting === 0) return false;
      }
      return true;
    });

    return filteredRows.sort((a, b) => {
      const artCmp = a.article.localeCompare(b.article);
      if (artCmp !== 0) return artCmp;
      const numA = parseFloat(a.size);
      const numB = parseFloat(b.size);
      if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
      return a.size.localeCompare(b.size, undefined, { numeric: true });
    });
  }, [articleName, cuttingEntries, cuttingTransactions, cuttings, deliveryHistory, order, orderDispatchHistory, orderId, totalOrder]);

  // Group by Article with sizes below it
  const groupedArticles = useMemo(() => {
    const articleMap = new Map<string, OrderSummaryRow[]>();
    rows.forEach(r => {
      const art = r.article || 'Article';
      if (!articleMap.has(art)) articleMap.set(art, []);
      articleMap.get(art)!.push(r);
    });
    return Array.from(articleMap.entries()).map(([artName, sizeRows]) => {
      const sortedSizes = [...sizeRows].sort((a, b) => {
        const numA = parseFloat(a.size);
        const numB = parseFloat(b.size);
        if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
        return a.size.localeCompare(b.size, undefined, { numeric: true });
      });
      const artTotalOrder = sortedSizes.reduce((sum, r) => sum + r.totalOrder, 0);
      const artCutting = sortedSizes.reduce((sum, r) => sum + r.cutting, 0);
      const artDelivered = sortedSizes.reduce((sum, r) => sum + r.delivered, 0);
      const artBalance = Math.max(0, artTotalOrder - artDelivered);
      return {
        article: artName,
        sizeRows: sortedSizes,
        totalOrder: artTotalOrder,
        cutting: artCutting,
        delivered: artDelivered,
        balance: artBalance
      };
    });
  }, [rows]);

  // Grand Total = Sum of Article Totals (counted ONCE, never Cutting + Stock + Article)
  const totals = groupedArticles.reduce((summary, group) => ({
    cutting: summary.cutting + group.cutting,
    totalOrder: summary.totalOrder + group.totalOrder,
    delivered: summary.delivered + group.delivered
  }), { cutting: 0, totalOrder: 0, delivered: 0 });

  const grandCuttingBalance = Math.max(0, totals.totalOrder - totals.cutting);
  const grandExtraCutting = Math.max(0, totals.cutting - totals.totalOrder);
  const grandDeliveryBalance = Math.max(0, totals.totalOrder - totals.delivered);
  const isOrderCompleted =
    order?.status === 'Completed' ||
    (totals.totalOrder > 0 && totals.cutting >= totals.totalOrder && grandCuttingBalance === 0);

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <header className="border-b border-slate-200 px-4 py-4 sm:px-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-black text-slate-900">
                Customer Order: {order?.orderNo || orderId}{' '}
                <span className="font-medium text-slate-500">
                  {articleName ? `· Article: ${articleName}` : ''}
                </span>
              </h2>
              <span
                className={`rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${
                  isOrderCompleted
                    ? 'border-emerald-300 bg-emerald-100 text-emerald-800'
                    : 'border-amber-300 bg-amber-100 text-amber-800'
                }`}
              >
                {isOrderCompleted ? 'Completed' : 'In Progress'}
              </span>
              {grandExtraCutting > 0 && (
                <span className="rounded-md border border-rose-300 bg-rose-100 px-2.5 py-0.5 font-mono text-[11px] font-black text-rose-700">
                  Extra Cutting: {grandExtraCutting.toLocaleString()} Pairs
                </span>
              )}
            </div>
            <p className="mt-1 text-xs text-slate-500">
              Article-wise &amp; size-wise cutting and delivery summary. Counted Cutting caps at Total Order Quantity; over-cut pairs are shown as Extra Cutting.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-2 text-xs">
            <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-right">
              <span className="block text-[10px] font-bold uppercase text-blue-700">Total Original Pairs</span>
              <span className="font-mono font-black text-blue-900">{totals.totalOrder.toLocaleString()} Pairs</span>
            </div>
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-right">
              <span className="block text-[10px] font-bold uppercase text-amber-700">Total Cutting Received</span>
              <span className="font-mono font-black text-amber-900">{totals.cutting.toLocaleString()} Pairs</span>
            </div>
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-right">
              <span className="block text-[10px] font-bold uppercase text-emerald-700">Dispatched to Customer</span>
              <span className="font-mono font-black text-emerald-900">{totals.delivered.toLocaleString()} Pairs</span>
            </div>
          </div>
        </div>
      </header>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] border-collapse text-left text-sm">
          <thead>
            <tr className="bg-slate-100 text-center text-xs font-black uppercase tracking-wide text-slate-700">
              <th colSpan={2} className="border border-slate-300 px-3 py-2">Cutting Detail</th>
              <th className="border border-slate-300 px-3 py-2">Article &amp; Size</th>
              <th colSpan={3} className="border border-slate-300 px-3 py-2">Delivery Report</th>
            </tr>
            <tr className="bg-slate-50 text-xs font-bold text-slate-700">
              <th className="border border-slate-300 px-3 py-2 text-right">Cutting Received</th>
              <th className="border border-slate-300 px-3 py-2 text-right">Balance</th>
              <th className="border border-slate-300 px-3 py-2">Size</th>
              <th className="border border-slate-300 px-3 py-2 text-right">Total Order</th>
              <th className="border border-slate-300 px-3 py-2 text-right">Delivered</th>
              <th className="border border-slate-300 px-3 py-2 text-right">Balance</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {groupedArticles.map((group) => {
              const groupCuttingBalance = Math.max(0, group.totalOrder - group.cutting);
              const groupExtraCutting = Math.max(0, group.cutting - group.totalOrder);
              const groupOrderRem = Math.max(0, group.totalOrder - group.delivered);
              return (
                <React.Fragment key={group.article}>
                  {/* Article Header Row (Article on top) */}
                  <tr className="bg-blue-50/80 font-black text-slate-900 border-t-2 border-b border-blue-200">
                    <td className="border border-blue-200 px-3 py-2.5 text-right font-mono text-xs text-blue-900">
                      {group.cutting.toLocaleString()}
                    </td>
                    <td className={`border border-blue-200 px-3 py-2.5 text-right font-mono text-xs ${groupExtraCutting > 0 ? 'text-rose-700 font-black' : 'text-blue-900'}`}>
                      <span>{groupCuttingBalance.toLocaleString()}</span>
                      {groupExtraCutting > 0 && (
                        <span className="mt-0.5 block text-[10px] font-black text-rose-700">
                          Extra Cutting: {groupExtraCutting.toLocaleString()} Pairs
                        </span>
                      )}
                    </td>
                    <td className="border border-blue-200 px-3 py-2.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-black text-sm text-blue-950 uppercase tracking-wide">
                          Article: {group.article}
                        </span>
                        <span className="rounded-md bg-white border border-blue-300 px-2 py-0.5 font-mono text-[11px] font-bold text-blue-700">
                          Total: {group.totalOrder.toLocaleString()} Pairs
                        </span>
                        <span className="rounded-md bg-emerald-100 border border-emerald-300 px-2 py-0.5 font-mono text-[11px] font-bold text-emerald-800">
                          Balance: {groupCuttingBalance.toLocaleString()} Pairs
                        </span>
                        {groupExtraCutting > 0 && (
                          <span className="inline-flex items-center gap-1 rounded-md bg-rose-100 border border-rose-300 px-2 py-0.5 font-mono text-[11px] font-black text-rose-700">
                            Extra Cutting: {groupExtraCutting.toLocaleString()} Pairs
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="border border-blue-200 px-3 py-2.5 text-right font-mono text-xs text-blue-900">
                      {group.totalOrder.toLocaleString()}
                    </td>
                    <td className="border border-blue-200 px-3 py-2.5 text-right font-mono text-xs text-blue-900">
                      {group.delivered.toLocaleString()}
                    </td>
                    <td className="border border-blue-200 px-3 py-2.5 text-right font-mono text-xs font-black text-blue-900">
                      {groupOrderRem.toLocaleString()}
                    </td>
                  </tr>

                  {/* Sub-rows for each size */}
                  {group.sizeRows.map((row) => {
                    const cuttingBalance = Math.max(0, row.totalOrder - row.cutting);
                    const extraCutting = Math.max(0, row.cutting - row.totalOrder);
                    const orderRemaining = Math.max(0, row.totalOrder - row.delivered);
                    const isOverCut = extraCutting > 0;
                    return (
                      <tr key={row.key} className={isOverCut ? 'bg-rose-50/70 text-rose-900 hover:bg-rose-50 transition' : 'text-slate-700 hover:bg-slate-50 transition'}>
                        <td className="border border-slate-200 px-3 py-2 text-right font-mono tabular-nums text-xs">
                          {row.cutting.toLocaleString()}
                        </td>
                        <td className={`border border-slate-200 px-3 py-2 text-right font-bold font-mono tabular-nums text-xs ${isOverCut ? 'text-rose-700 font-black' : ''}`}>
                          <span>{cuttingBalance.toLocaleString()}</span>
                          {isOverCut && (
                            <span className="mt-0.5 block text-[10px] font-black text-rose-700">
                              Extra Cutting: {extraCutting.toLocaleString()} Pairs
                            </span>
                          )}
                        </td>
                        <td className="border border-slate-200 px-3 py-2 font-mono font-bold text-xs pl-6 text-slate-800">
                          <span>Size: {row.size}</span>
                          {isOverCut && (
                            <span className="ml-2 inline-block rounded border border-rose-300 bg-rose-100 px-1.5 py-0.5 text-[10px] font-black text-rose-700">
                              Total: {row.totalOrder.toLocaleString()} Pairs · Balance: 0 Pairs · Extra Cutting: {extraCutting.toLocaleString()} Pairs
                            </span>
                          )}
                        </td>
                        <td className="border border-slate-200 px-3 py-2 text-right font-mono tabular-nums text-xs">
                          {row.totalOrder.toLocaleString()}
                        </td>
                        <td className="border border-slate-200 px-3 py-2 text-right font-mono tabular-nums text-xs">
                          {row.delivered.toLocaleString()}
                        </td>
                        <td className="border border-slate-200 px-3 py-2 text-right font-bold font-mono tabular-nums text-xs">
                          {orderRemaining.toLocaleString()}
                        </td>
                      </tr>
                    );
                  })}
                </React.Fragment>
              );
            })}
            {groupedArticles.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-500">No order summary details are available yet.</td></tr>
            )}
          </tbody>
          {groupedArticles.length > 0 && (
            <tfoot>
              <tr className="bg-slate-100 font-black text-slate-800 border-t-2 border-slate-300">
                <td className="border border-slate-300 px-3 py-2.5 text-right font-mono">
                  {totals.cutting.toLocaleString()}
                </td>
                <td className={`border border-slate-300 px-3 py-2.5 text-right font-mono ${grandExtraCutting > 0 ? 'text-rose-700 font-black' : ''}`}>
                  <span>{grandCuttingBalance.toLocaleString()}</span>
                  {grandExtraCutting > 0 && (
                    <span className="mt-0.5 block text-[10px] font-black text-rose-700">
                      Extra Cutting: {grandExtraCutting.toLocaleString()} Pairs
                    </span>
                  )}
                </td>
                <td className="border border-slate-300 px-3 py-2.5 font-bold uppercase tracking-wide">Grand Total</td>
                <td className="border border-slate-300 px-3 py-2.5 text-right font-mono">{totals.totalOrder.toLocaleString()}</td>
                <td className="border border-slate-300 px-3 py-2.5 text-right font-mono">{totals.delivered.toLocaleString()}</td>
                <td className="border border-slate-300 px-3 py-2.5 text-right font-mono">{grandDeliveryBalance.toLocaleString()}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </section>
  );
};
