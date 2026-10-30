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
  const normalized = normalize(value);
  const labels: Record<string, string> = {
    small: 'S',
    medium: 'M',
    large: 'L',
    xl: 'XL',
    xxl: '2XL',
    '2xl': '2XL'
  };
  return labels[normalized] || value.trim() || '-';
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

    return [...groups.values()].sort((a, b) =>
      a.article.localeCompare(b.article) || a.size.localeCompare(b.size, undefined, { numeric: true })
    );
  }, [articleName, cuttingEntries, cuttingTransactions, cuttings, deliveryHistory, invoices, order, orderDispatchHistory, orderId, totalOrder]);

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
        <p className="mt-1 text-xs text-slate-500">Read-only summary, updated automatically from cutting receipts and stock deliveries.</p>
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
              <th className="border border-slate-300 px-3 py-2">ART No / Size</th>
              <th className="border border-slate-300 px-3 py-2 text-right">Total Order</th>
              <th className="border border-slate-300 px-3 py-2 text-right">Delivered</th>
              <th className="border border-slate-300 px-3 py-2 text-right">Remaining</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map(row => {
              const cuttingRemaining = row.totalOrder - row.cutting;
              const orderRemaining = row.totalOrder - row.delivered;
              return (
                <tr key={row.key} className="text-slate-700 even:bg-slate-50/60">
                  <td className="border border-slate-200 px-3 py-2 text-right font-mono tabular-nums">{row.cutting.toLocaleString()}</td>
                  <td className={`border border-slate-200 px-3 py-2 text-right font-bold font-mono tabular-nums ${cuttingRemaining < 0 ? 'text-red-600' : ''}`}>{cuttingRemaining.toLocaleString()}</td>
                  <td className="border border-slate-200 px-3 py-2 font-bold">{row.article} / {row.size}</td>
                  <td className="border border-slate-200 px-3 py-2 text-right font-mono tabular-nums">{row.totalOrder.toLocaleString()}</td>
                  <td className="border border-slate-200 px-3 py-2 text-right font-mono tabular-nums">{row.delivered.toLocaleString()}</td>
                  <td className="border border-slate-200 px-3 py-2 text-right font-bold font-mono tabular-nums">{orderRemaining.toLocaleString()}</td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-500">No order summary details are available yet.</td></tr>
            )}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr className="bg-slate-100 font-black text-slate-800">
                <td className="border border-slate-300 px-3 py-2 text-right font-mono">{totals.cutting.toLocaleString()}</td>
                <td className={`border border-slate-300 px-3 py-2 text-right font-mono ${totals.totalOrder - totals.cutting < 0 ? 'text-red-600' : ''}`}>{(totals.totalOrder - totals.cutting).toLocaleString()}</td>
                <td className="border border-slate-300 px-3 py-2">Total</td>
                <td className="border border-slate-300 px-3 py-2 text-right font-mono">{totals.totalOrder.toLocaleString()}</td>
                <td className="border border-slate-300 px-3 py-2 text-right font-mono">{totals.delivered.toLocaleString()}</td>
                <td className="border border-slate-300 px-3 py-2 text-right font-mono">{(totals.totalOrder - totals.delivered).toLocaleString()}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </section>
  );
};
