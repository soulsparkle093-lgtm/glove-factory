import React, { useState, useEffect } from 'react';
import { X, Receipt, CheckCircle2, AlertTriangle, User, DollarSign } from 'lucide-react';
import { useFactory } from '../../context/FactoryContext';
import { formatCurrency } from '../../utils/factoryFormatters';

interface CreateSaleInvoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  preselectedOrderId?: string | null;
}

interface BillingItemRow {
  productId: string;
  gloveType: string;
  size: string;
  color: string;
  availableStock: number;
  pendingOrderQty: number;
  qtyToBill: number;
  rate: number;
  amount: number;
}

export const CreateSaleInvoiceModal: React.FC<CreateSaleInvoiceModalProps> = ({
  isOpen,
  onClose,
  preselectedOrderId
}) => {
  const { 
    orders, 
    products, 
    parties, 
    createSaleInvoice, 
    setSelectedInvoiceId,
    settings 
  } = useFactory();

  const [orderId, setOrderId] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [discount, setDiscount] = useState<string>('0');
  const [paidAmount, setPaidAmount] = useState<string>('0');
  const [paymentMode, setPaymentMode] = useState<'cash' | 'bank' | 'credit'>('credit');
  const [notes, setNotes] = useState('Safety & Leather Gloves Delivery');

  const [billingRows, setBillingRows] = useState<BillingItemRow[]>([]);

  useEffect(() => {
    if (isOpen) {
      setDate(new Date().toISOString().split('T')[0]);
      setDiscount('0');
      setPaymentMode('credit');
      setNotes('Leather gloves delivered in export standard cartons.');

      const targetOrd = preselectedOrderId 
        ? orders.find(o => o.id === preselectedOrderId) 
        : orders[0];

      if (targetOrd) {
        setOrderId(targetOrd.id);
        setupRowsForOrder(targetOrd);
      }
    }
  }, [isOpen, preselectedOrderId, orders.length]);

  const setupRowsForOrder = (ord: typeof orders[0]) => {
    const rows: BillingItemRow[] = ord.items.map(item => {
      const title = item.title || item.gloveType || 'Leather Glove';
      const prod = products.find(p => p.id === item.productId || p.gloveName === title);
      const stock = prod?.currentStock || 0;
      const pairs = Number(item.totalPairs) || Number(item.qty) || 0;
      const pending = Math.max(0, pairs - (item.billedQty || 0));
      const initialBillQty = Math.min(stock, pending);
      const saleRate = item.rate || prod?.salePrice || 450;

      return {
        productId: item.productId || `prod-${item.id}`,
        gloveType: title,
        size: item.size || 'Size Matrix',
        color: item.color || '',
        availableStock: stock,
        pendingOrderQty: pending,
        qtyToBill: initialBillQty > 0 ? initialBillQty : pending,
        rate: saleRate,
        amount: (initialBillQty > 0 ? initialBillQty : pending) * saleRate
      };
    });
    setBillingRows(rows);
    const initialSubtotal = rows.reduce((s, r) => s + r.amount, 0);
    setPaidAmount('0'); // default credit
  };

  const handleOrderChange = (id: string) => {
    setOrderId(id);
    const ord = orders.find(o => o.id === id);
    if (ord) setupRowsForOrder(ord);
  };

  const handleUpdateQty = (index: number, newQty: number) => {
    const updated = billingRows.map((r, idx) => {
      if (idx === index) {
        const qtyToBill = Math.max(0, newQty);
        return {
          ...r,
          qtyToBill,
          amount: qtyToBill * r.rate
        };
      }
      return r;
    });
    setBillingRows(updated);
  };

  const handleUpdateRate = (index: number, newRate: number) => {
    const updated = billingRows.map((r, idx) => {
      if (idx === index) {
        return {
          ...r,
          rate: newRate,
          amount: r.qtyToBill * newRate
        };
      }
      return r;
    });
    setBillingRows(updated);
  };

  if (!isOpen) return null;

  const currentOrder = orders.find(o => o.id === orderId);
  const subtotal = billingRows.reduce((s, r) => s + r.amount, 0);
  const discountNum = parseFloat(discount) || 0;
  const grandTotal = Math.max(0, subtotal - discountNum);
  const paidNum = parseFloat(paidAmount) || 0;
  const remainingDue = Math.max(0, grandTotal - paidNum);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentOrder || billingRows.length === 0) return;

    // Filter items with qtyToBill > 0
    const itemsToBill = billingRows
      .filter(r => r.qtyToBill > 0)
      .map(r => ({
        productId: r.productId,
        gloveType: r.gloveType,
        size: r.size,
        color: r.color,
        qty: r.qtyToBill,
        rate: r.rate
      }));

    if (itemsToBill.length === 0) return;

    const created = createSaleInvoice({
      orderId: currentOrder.id,
      customerId: currentOrder.customerId || 'walk-in',
      customerName: currentOrder.customerName,
      date,
      items: itemsToBill,
      discount: discountNum,
      paidAmount: paidNum,
      paymentMode,
      notes
    });

    onClose();
    setSelectedInvoiceId(created.id);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl overflow-hidden flex flex-col max-h-[95vh] animate-in fade-in zoom-in-95 duration-150">
        <div className="px-6 py-4 bg-blue-600 text-white flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Receipt className="w-5 h-5" />
            <div>
              <h3 className="font-bold text-lg leading-tight">Create Sale Invoice</h3>
              <p className="text-xs text-blue-100">Automatically deducts inventory and updates the customer ledger</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-white/20 text-white transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
          {/* Order selection */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-4 bg-slate-50 rounded-xl border border-slate-200">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Linked Customer Order *
              </label>
              <select
                value={orderId}
                onChange={e => handleOrderChange(e.target.value)}
                className="w-full px-3 py-2 text-xs font-bold rounded-lg border border-slate-300 bg-white"
              >
                {orders.map(o => (
                  <option key={o.id} value={o.id}>
                    #{o.orderNo} - {o.customerName} ({o.totalQty} pairs)
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Invoice Date
              </label>
              <input
                type="date"
                required
                value={date}
                onChange={e => setDate(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 bg-white"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Payment Channel
              </label>
              <select
                value={paymentMode}
                onChange={e => {
                  const m = e.target.value as any;
                  setPaymentMode(m);
                  if (m === 'cash' || m === 'bank') {
                    setPaidAmount(grandTotal.toString());
                  } else {
                    setPaidAmount('0');
                  }
                }}
                className="w-full px-3 py-2 text-xs font-bold rounded-lg border border-slate-300 bg-white"
              >
                <option value="credit">On Credit (Ledger Balance)</option>
                <option value="cash">Cash Paid</option>
                <option value="bank">Bank Transfer</option>
              </select>
            </div>
          </div>

          {/* Line items table */}
          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-4 py-2.5 bg-slate-100 flex items-center justify-between border-b border-slate-200">
              <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                Glove Items in Order #{currentOrder?.orderNo}
              </span>
              <span className="text-xs text-blue-700 font-semibold">
                Customer: {currentOrder?.customerName}
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                  <tr>
                    <th className="py-2.5 px-3">Glove Model</th>
                    <th className="py-2.5 px-3 text-center">In Ready Stock</th>
                    <th className="py-2.5 px-3 text-center">Unbilled in Order</th>
                    <th className="py-2.5 px-3 text-center w-28">Qty to Bill (Pairs)</th>
                    <th className="py-2.5 px-3 text-right w-24">Rate</th>
                    <th className="py-2.5 px-3 text-right w-28">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {billingRows.map((row, idx) => (
                    <tr key={idx} className="hover:bg-slate-50/70">
                      <td className="py-2.5 px-3">
                        <span className="font-bold text-slate-900 block">{row.gloveType}</span>
                        <span className="text-[10px] text-slate-400">{row.size} / {row.color}</span>
                      </td>

                      <td className="py-2.5 px-3 text-center">
                        <span className={`px-2 py-0.5 rounded-full font-bold text-[11px] ${
                          row.availableStock <= 0 
                            ? 'bg-rose-100 text-rose-700' 
                            : 'bg-emerald-100 text-emerald-800'
                        }`}>
                          {row.availableStock} pairs
                        </span>
                      </td>

                      <td className="py-2.5 px-3 text-center text-slate-700 font-semibold">
                        {row.pendingOrderQty} pairs
                      </td>

                      <td className="py-2.5 px-3 text-center">
                        <input
                          type="number"
                          min="0"
                          value={row.qtyToBill}
                          onChange={e => handleUpdateQty(idx, parseFloat(e.target.value) || 0)}
                          className="w-20 text-center font-black py-1 px-2 rounded-lg border border-slate-300 bg-blue-50/50"
                        />
                      </td>

                      <td className="py-2.5 px-3 text-right">
                        <input
                          type="number"
                          min="0"
                          step="any"
                          value={row.rate}
                          onChange={e => handleUpdateRate(idx, parseFloat(e.target.value) || 0)}
                          className="w-20 text-right font-bold py-1 px-2 rounded-lg border border-slate-300"
                        />
                      </td>

                      <td className="py-2.5 px-3 text-right font-black text-slate-900">
                        {formatCurrency(row.amount, settings.currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Payment & Summary */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
              <span className="text-xs font-bold text-slate-700 uppercase tracking-wider block">
                Payment Collection
              </span>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Amount Paid Now ({settings.currency})
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={paidAmount}
                    onChange={e => setPaidAmount(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs font-bold rounded-lg border border-slate-300 bg-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Outstanding Balance
                  </label>
                  <div className={`px-3 py-1.5 text-xs font-black rounded-lg border ${
                    remainingDue > 0 
                      ? 'bg-rose-50 border-rose-200 text-rose-700' 
                      : 'bg-emerald-50 border-emerald-200 text-emerald-700'
                  }`}>
                    {formatCurrency(remainingDue, settings.currency)}
                  </div>
                </div>
              </div>

              {remainingDue > 0 && (
                <p className="text-[11px] text-rose-600 font-semibold flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  <span>{formatCurrency(remainingDue, settings.currency)} will be added to {currentOrder?.customerName}'s ledger automatically.</span>
                </p>
              )}
            </div>

            <div className="p-4 bg-blue-50/50 rounded-xl border border-blue-100 space-y-2 text-xs">
              <div className="flex justify-between text-slate-600">
                <span>Subtotal:</span>
                <span className="font-bold text-slate-900">{formatCurrency(subtotal, settings.currency)}</span>
              </div>

              <div className="flex items-center justify-between">
                <span>Special Discount ({settings.currency}):</span>
                <input
                  type="number"
                  min="0"
                  value={discount}
                  onChange={e => setDiscount(e.target.value)}
                  className="w-24 text-right px-2 py-0.5 rounded border border-slate-300 bg-white font-bold"
                />
              </div>

              <div className="border-t border-blue-200 pt-2 flex justify-between font-black text-sm text-slate-900">
                <span>Grand Total:</span>
                <span className="text-blue-700 text-base">{formatCurrency(grandTotal, settings.currency)}</span>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Delivery Notes / Carton Details
            </label>
            <input
              type="text"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-300"
            />
          </div>

          <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-100 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={subtotal <= 0}
              className="px-6 py-2 rounded-xl text-sm font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-500/25 transition active:scale-95 flex items-center gap-1.5"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Generate Invoice & Deduct Stock</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
