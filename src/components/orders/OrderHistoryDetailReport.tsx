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
  const { orders, cuttingTransactions, cuttingEntries, cuttings, deliveryHistory, orderDispatchHistory, invoices } = useFactory();
  const order = orders.find(item => item.id === orderId);

  const rows = useMemo(() => {
    const groups = new Map<string, OrderSummaryRow>();
    const getGroup = (articleValue: string, sizeValue: string): OrderSummaryRow => {
      const article = articleValue.trim() || articleName || 'Unspecified Article';
      const size = formatSize(sizeValue);
      const key = `${normalize(article)}___${normalize(size)}`;
      const existing = groups.get(key);
      if (existing) return existing;
      const created: OrderSummaryRow = { key, article, size, cutting: 0, totalOrder: 0, delivered: 0 };
      groups.set(key, created);
      return created;
    };

    (order?.items || []).forEach(item => {
      const article = item.article || item.title || item.gloveType || articleName;
      if (item.customSizes && item.customSizes.length > 0) {
        item.customSizes.filter(cs => Number(cs.quantity) > 0 || (cs.size && cs.size.trim().length > 0)).forEach(cs => {
          getGroup(article, cs.size || '-').totalOrder += Number(cs.quantity) || 0;
        });
      } else {
        const sizes = Object.entries(item.sizes || {})
          .filter(([, quantity]) => Number(quantity) > 0);
        if (sizes.length) {
          sizes.forEach(([size, quantity]) => {
            getGroup(article, size).totalOrder += Number(quantity) || 0;
          });
        } else {
          const quantity = Number(item.originalQty) || Number(item.totalPairs) || Number(item.qty) || 0;
          getGroup(article, item.size || '-').totalOrder += quantity;
        }
      }
    });

    (order?.cuttingArticleSizes || []).forEach(item => getGroup(item.article, item.size));
    const transactions = cuttingTransactions.filter(transaction => transaction.orderId === orderId);
    const transactionsById = new Map(transactions.map(transaction => [transaction.id, transaction]));
    const savedEntriesById = new Map(cuttingEntries.map(entry => [entry.id, entry]));

    transactions.forEach(transaction => {
      if (transaction.type !== 'RECEIVE') return;
      const savedEntry = savedEntriesById.get(transaction.id);
      const group = getGroup(
        savedEntry?.articleTitle || savedEntry?.article || transaction.articleTitle || transaction.article,
        savedEntry?.sizeName || savedEntry?.size || transaction.sizeName || transaction.size || '-'
      );
      group.cutting += Number(savedEntry?.pairs ?? transaction.totalQty ?? transaction.qty) || 0;
    });

    cuttingEntries.forEach(entry => {
      const originalTransaction = entry.returnReferenceId
        ? transactionsById.get(entry.returnReferenceId)
        : transactionsById.get(entry.id);
      const linkedOrderId = entry.orderId || originalTransaction?.orderId;
      if (linkedOrderId !== orderId) return;
      if (entry.type === 'RETURN') {
        getGroup(entry.articleTitle || entry.article, entry.sizeName || entry.size || '-').cutting += Number(entry.pairs) || 0;
      } else if (entry.type === 'RECEIVE' && !transactionsById.has(entry.id)) {
        getGroup(entry.articleTitle || entry.article, entry.sizeName || entry.size || '-').cutting += Number(entry.pairs) || 0;
      }
    });

    cuttings
      .filter(cutting => cutting.orderId === orderId && cutting.status === 'Received' &&
        !transactionsById.has(cutting.id) && !savedEntriesById.has(cutting.id))
      .forEach(cutting => {
        getGroup(cutting.gloveType || articleName, cutting.size || '-').cutting += Number(cutting.qty) || 0;
      });

    deliveryHistory
      .filter(delivery => (delivery.orderId || delivery.customerOrderId) === orderId)
      .forEach(delivery => {
        getGroup(delivery.article, delivery.size || '-').delivered += Number(delivery.quantity) || 0;
      });

    const orderDeliveries = deliveryHistory.filter(delivery =>
      (delivery.orderId || delivery.customerOrderId) === orderId
    );
    const matchedDeliveryIndexes = new Set<number>();
    orderDispatchHistory
      .filter(entry => entry.orderId === orderId && entry.actionType === 'dispatched_to_customer')
      .forEach(entry => {
        const hasInvoiceBreakdown = invoices.some(invoice =>
          invoice.orderId === orderId &&
          invoice.items.some(item => normalize(item.gloveType) === normalize(entry.article || articleName))
        );
        if (hasInvoiceBreakdown) return;
        const duplicateIndex = orderDeliveries.findIndex((delivery, index) =>
          !matchedDeliveryIndexes.has(index) &&
          normalize(delivery.article) === normalize(entry.article || articleName) &&
          delivery.date === entry.date &&
          Number(delivery.quantity) === Number(entry.quantity)
        );
        if (duplicateIndex >= 0) {
          matchedDeliveryIndexes.add(duplicateIndex);
          return;
        }
        const sizes = Object.entries(entry.sizes || {})
          .filter(([, quantity]) => Number(quantity) > 0);
        if (sizes.length) {
          sizes.forEach(([size, quantity]) => {
            getGroup(entry.article || articleName, size).delivered += Number(quantity) || 0;
          });
        } else {
          getGroup(entry.article || articleName, '-').delivered += Number(entry.quantity) || 0;
        }
      });

    const invoiceTotals = new Map<string, { row: OrderSummaryRow; quantity: number }>();
    invoices
      .filter(invoice => invoice.orderId === orderId)
      .forEach(invoice => invoice.items.forEach(item => {
        const row = getGroup(item.gloveType || articleName, item.size || '-');
        const current = invoiceTotals.get(row.key);
        invoiceTotals.set(row.key, {
          row,
          quantity: (current?.quantity || 0) + (Number(item.qty) || 0)
        });
      }));
    invoiceTotals.forEach(({ row, quantity }) => {
      row.delivered = Math.max(row.delivered, quantity);
    });

    if (groups.size === 0) {
      getGroup(articleName, '-').totalOrder = totalOrder;
    }

    const allRows = [...groups.values()];

    // Filter out duplicate phantom rows (e.g. 'pride / -' or 'pride / Matrix') when concrete sizes exist
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
        // If real sizes exist for this article, suppress phantom rows with 0 totalOrder
        if (row.totalOrder === 0) return false;
      }
      return true;
    });

    return filteredRows.sort((a, b) =>
      a.article.localeCompare(b.article) || a.size.localeCompare(b.size, undefined, { numeric: true })
    );
  }, [articleName, cuttingEntries, cuttingTransactions, cuttings, deliveryHistory, invoices, order, orderDispatchHistory, orderId, totalOrder]);

  // Group by Article with sizes below it
  const groupedArticles = useMemo(() => {
    const articleMap = new Map<string, OrderSummaryRow[]>();
    rows.forEach(r => {
      const art = r.article || articleName || 'Article';
      if (!articleMap.has(art)) articleMap.set(art, []);
      articleMap.get(art)!.push(r);
    });
    return Array.from(articleMap.entries()).map(([artName, sizeRows]) => {
      const artTotalOrder = sizeRows.reduce((sum, r) => sum + r.totalOrder, 0);
      const artCutting = sizeRows.reduce((sum, r) => sum + r.cutting, 0);
      const artDelivered = sizeRows.reduce((sum, r) => sum + r.delivered, 0);
      const artBalance = artTotalOrder - artDelivered;
      return {
        article: artName,
        sizeRows,
        totalOrder: artTotalOrder,
        cutting: artCutting,
        delivered: artDelivered,
        balance: artBalance
      };
    });
  }, [rows, articleName]);

  const totals = rows.reduce((summary, row) => ({
    cutting: summary.cutting + row.cutting,
    totalOrder: summary.totalOrder + row.totalOrder,
    delivered: summary.delivered + row.delivered
  }), { cutting: 0, totalOrder: 0, delivered: 0 });

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <header className="border-b border-slate-200 px-4 py-4 sm:px-5">
        <h2 className="font-black text-slate-900">
          Customer Order : {order?.orderNo || orderId} <span className="font-medium text-slate-500">+ Article : {articleName || 'Unspecified Article'}</span>
        </h2>
        <p className="mt-1 text-xs text-slate-500">Read-only summary grouped by article, updated automatically from cutting receipts and stock deliveries.</p>
      </header>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] border-collapse text-left text-sm">
          <thead>
            <tr className="bg-slate-100 text-center text-xs font-black uppercase tracking-wide text-slate-700">
              <th colSpan={2} className="border border-slate-300 px-3 py-2">Cutting Detail</th>
              <th className="border border-slate-300 px-3 py-2">ART (Size)</th>
              <th colSpan={3} className="border border-slate-300 px-3 py-2">Delivery Report</th>
            </tr>
            <tr className="bg-slate-50 text-xs font-bold text-slate-700">
              <th className="border border-slate-300 px-3 py-2 text-right">T Cutting</th>
              <th className="border border-slate-300 px-3 py-2 text-right">T.REM</th>
              <th className="border border-slate-300 px-3 py-2">Size</th>
              <th className="border border-slate-300 px-3 py-2 text-right">Total Order</th>
              <th className="border border-slate-300 px-3 py-2 text-right">Delivered</th>
              <th className="border border-slate-300 px-3 py-2 text-right">Remaining</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {groupedArticles.map((group) => {
              const groupCuttingRem = group.totalOrder - group.cutting;
              const groupOrderRem = group.totalOrder - group.delivered;
              return (
                <React.Fragment key={group.article}>
                  {/* Article Header Row (Article on top) */}
                  <tr className="bg-blue-50/80 font-black text-slate-900 border-t-2 border-b border-blue-200">
                    <td className="border border-blue-200 px-3 py-2.5 text-right font-mono text-xs text-blue-900">
                      {group.cutting.toLocaleString()}
                    </td>
                    <td className={`border border-blue-200 px-3 py-2.5 text-right font-mono text-xs ${groupCuttingRem < 0 ? 'text-red-600' : 'text-blue-900'}`}>
                      {groupCuttingRem.toLocaleString()}
                    </td>
                    <td className="border border-blue-200 px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <span className="font-black text-sm text-blue-950 uppercase tracking-wide">
                          Article: {group.article}
                        </span>
                        <span className="rounded-md bg-white border border-blue-300 px-2 py-0.5 font-mono text-[11px] font-bold text-blue-700">
                          Total: {group.totalOrder.toLocaleString()} Pairs
                        </span>
                        <span className="rounded-md bg-emerald-100 border border-emerald-300 px-2 py-0.5 font-mono text-[11px] font-bold text-emerald-800">
                          Balance: {groupOrderRem.toLocaleString()} Pairs
                        </span>
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
                    const cuttingRemaining = row.totalOrder - row.cutting;
                    const orderRemaining = row.totalOrder - row.delivered;
                    return (
                      <tr key={row.key} className="text-slate-700 hover:bg-slate-50 transition">
                        <td className="border border-slate-200 px-3 py-2 text-right font-mono tabular-nums text-xs">
                          {row.cutting.toLocaleString()}
                        </td>
                        <td className={`border border-slate-200 px-3 py-2 text-right font-bold font-mono tabular-nums text-xs ${cuttingRemaining < 0 ? 'text-red-600' : ''}`}>
                          {cuttingRemaining.toLocaleString()}
                        </td>
                        <td className="border border-slate-200 px-3 py-2 font-mono font-bold text-xs pl-6 text-slate-800">
                          Size: {row.size}
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
                <td className="border border-slate-300 px-3 py-2.5 text-right font-mono">{totals.cutting.toLocaleString()}</td>
                <td className={`border border-slate-300 px-3 py-2.5 text-right font-mono ${totals.totalOrder - totals.cutting < 0 ? 'text-red-600' : ''}`}>{(totals.totalOrder - totals.cutting).toLocaleString()}</td>
                <td className="border border-slate-300 px-3 py-2.5 font-bold uppercase tracking-wide">Grand Total</td>
                <td className="border border-slate-300 px-3 py-2.5 text-right font-mono">{totals.totalOrder.toLocaleString()}</td>
                <td className="border border-slate-300 px-3 py-2.5 text-right font-mono">{totals.delivered.toLocaleString()}</td>
                <td className="border border-slate-300 px-3 py-2.5 text-right font-mono">{(totals.totalOrder - totals.delivered).toLocaleString()}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </section>
  );
};
