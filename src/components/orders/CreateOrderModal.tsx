import React, { useState, useEffect } from 'react';
import { X, Plus, Trash2, FileText, CheckCircle2, User, Calendar } from 'lucide-react';
import { useFactory } from '../../context/FactoryContext';
import { CustomerOrder, SizeMatrix } from '../../types/factory';

interface CreateOrderModalProps {
  isOpen: boolean;
  onClose: () => void;
  orderToEdit?: CustomerOrder | null;
  onOpenAddParty?: () => void;
}

interface GloveFormRow {
  id?: string;
  title: string; // 100% BLANK by default
  color: string; // BLANK by default
  sizes: {
    small: number | string;
    medium: number | string;
    large: number | string;
    xl: number | string;
    xxl: number | string;
  };
}

const createEmptyRow = (): GloveFormRow => ({
  title: '',
  color: '',
  sizes: {
    small: 0,
    medium: 0,
    large: 0,
    xl: 0,
    xxl: 0
  }
});

export const CreateOrderModal: React.FC<CreateOrderModalProps> = ({
  isOpen,
  onClose,
  orderToEdit
}) => {
  const { parties, articleStock, createCustomerOrder, updateCustomerOrder } = useFactory();

  const customers = parties.filter(p => p.type === 'customer' || p.type === 'buyer');

  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [orderDate, setOrderDate] = useState(new Date().toISOString().split('T')[0]);
  const [deliveryDate, setDeliveryDate] = useState('');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Dynamic glove item rows with size matrix
  const [rows, setRows] = useState<GloveFormRow[]>([createEmptyRow()]);

  // Sync state when opening or when orderToEdit changes
  useEffect(() => {
    if (isOpen) {
      if (orderToEdit) {
        // Pre-fill existing order for EDIT
        setCustomerName(orderToEdit.customerName || '');
        setCustomerPhone(orderToEdit.customerPhone || '');
        setOrderDate(orderToEdit.orderDate || new Date().toISOString().split('T')[0]);
        setDeliveryDate(orderToEdit.deliveryDate || '');
        setNotes(orderToEdit.notes || '');

        if (orderToEdit.items && orderToEdit.items.length > 0) {
          const prefilledRows = orderToEdit.items.map(item => ({
            id: item.id,
            title: item.title || item.gloveType || '',
            color: item.color || '',
            sizes: {
              small: item.sizes?.small ?? 0,
              medium: item.sizes?.medium ?? 0,
              large: item.sizes?.large ?? item.qty ?? 0,
              xl: item.sizes?.xl ?? 0,
              xxl: item.sizes?.xxl ?? 0
            }
          }));
          setRows(prefilledRows);
        } else {
          setRows([createEmptyRow()]);
        }
      } else {
        // Brand new order: 100% BLANK state
        setCustomerName('');
        setCustomerPhone('');
        setOrderDate(new Date().toISOString().split('T')[0]);

        const d = new Date();
        d.setDate(d.getDate() + 14);
        setDeliveryDate(d.toISOString().split('T')[0]);
        setNotes('');
        setRows([createEmptyRow()]);
      }
    }
  }, [isOpen, orderToEdit]);

  if (!isOpen) return null;

  // Add Another Glove Type button
  const handleAddRow = () => {
    setRows(prev => [...prev, createEmptyRow()]);
  };

  const handleRemoveRow = (index: number) => {
    if (rows.length <= 1) return;
    setRows(prev => prev.filter((_, idx) => idx !== index));
  };

  const handleUpdateRow = (index: number, updates: Partial<GloveFormRow>) => {
    setRows(prev => prev.map((r, idx) => (idx === index ? { ...r, ...updates } : r)));
  };

  const handleUpdateSize = (index: number, sizeKey: keyof GloveFormRow['sizes'], rawVal: string) => {
    const val = rawVal === '' ? 0 : Math.max(0, parseInt(rawVal, 10) || 0);
    setRows(prev =>
      prev.map((r, idx) => {
        if (idx === index) {
          return {
            ...r,
            sizes: {
              ...r.sizes,
              [sizeKey]: val
            }
          };
        }
        return r;
      })
    );
  };

  // Calculate pairs for each row
  const getRowPairs = (row: GloveFormRow): number => {
    const s = Number(row.sizes.small) || 0;
    const m = Number(row.sizes.medium) || 0;
    const l = Number(row.sizes.large) || 0;
    const xl = Number(row.sizes.xl) || 0;
    const xxl = Number(row.sizes.xxl) || 0;
    return s + m + l + xl + xxl;
  };

  // Overall order Total Pairs = sum of all glove items total pairs
  const overallTotalPairs = rows.reduce((sum, r) => sum + getRowPairs(r), 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerName.trim() || rows.length === 0) return;

    // Validate that at least one row has a title
    const validRows = rows.filter(r => r.title.trim().length > 0);
    if (validRows.length === 0) {
      alert('Please enter at least one Glove Name.');
      return;
    }

    setIsSubmitting(true);
    try {
      const itemsPayload = validRows.map(r => {
        const sizesObj: SizeMatrix = {
          small: Number(r.sizes.small) || 0,
          medium: Number(r.sizes.medium) || 0,
          large: Number(r.sizes.large) || 0,
          xl: Number(r.sizes.xl) || 0,
          xxl: Number(r.sizes.xxl) || 0
        };
        const total = sizesObj.small + sizesObj.medium + sizesObj.large + sizesObj.xl + sizesObj.xxl;
        return {
          id: r.id,
          title: r.title.trim(),
          color: r.color.trim(),
          sizes: sizesObj,
          totalPairs: total
        };
      });

      if (orderToEdit) {
        // UPDATE existing order
        await updateCustomerOrder(orderToEdit.id, {
          customerName: customerName.trim(),
          customerPhone: customerPhone.trim(),
          orderDate,
          deliveryDate,
          items: itemsPayload,
          notes: notes.trim()
        });
      } else {
        // SAVE & START new order
        await createCustomerOrder({
          customerName: customerName.trim(),
          customerPhone: customerPhone.trim(),
          orderDate,
          deliveryDate,
          items: itemsPayload,
          notes: notes.trim(),
          createdBy: 'Factory Manager'
        });
        // Clear form to all blank/0 state for next entry
        setCustomerName('');
        setCustomerPhone('');
        setNotes('');
        setRows([createEmptyRow()]);
      }

      onClose();
    } catch (err) {
      console.error('Error saving order:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl overflow-hidden flex flex-col max-h-[95vh] animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-5 sm:px-6 py-4 bg-blue-600 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center">
              <FileText className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="font-bold text-base sm:text-lg leading-tight">
                {orderToEdit ? `Edit Customer Order #${orderToEdit.orderNo}` : 'Create Customer Order'}
              </h3>
              <p className="text-xs text-blue-100">
                {orderToEdit ? 'Modify glove items and size quantities' : 'Live real-time sync with cloud database'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-white/20 text-white transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Form */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
          {/* Order Details Header */}
          <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
            <span className="text-[11px] font-black uppercase tracking-wider text-slate-500 block">
              Customer & Schedule Details
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Customer Name <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type="text"
                    required
                    list="registered-customers"
                    placeholder="Enter Customer Name"
                    value={customerName}
                    onChange={e => setCustomerName(e.target.value)}
                    className="w-full px-3 py-2 text-xs sm:text-sm font-semibold rounded-xl border border-slate-300 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 bg-white"
                  />
                  <datalist id="registered-customers">
                    {customers.map(c => (
                      <option key={c.id} value={c.name} />
                    ))}
                  </datalist>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Order Date
                </label>
                <input
                  type="date"
                  required
                  value={orderDate}
                  onChange={e => setOrderDate(e.target.value)}
                  className="w-full px-3 py-2 text-xs sm:text-sm rounded-xl border border-slate-300 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Delivery Due Date
                </label>
                <input
                  type="date"
                  required
                  value={deliveryDate}
                  onChange={e => setDeliveryDate(e.target.value)}
                  className="w-full px-3 py-2 text-xs sm:text-sm font-bold text-blue-700 rounded-xl border border-slate-300 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 bg-white"
                />
              </div>
            </div>
          </div>

          {/* Glove Items Section with Size Matrix */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-bold text-slate-900 text-sm sm:text-base">Glove Items & Size Matrix</h4>
                <p className="text-xs text-slate-500">Enter custom glove name, color, and pairs per size</p>
              </div>
              <button
                type="button"
                onClick={handleAddRow}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-blue-50 text-blue-700 hover:bg-blue-100 transition border border-blue-200 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>+ Add Another Glove Type</span>
              </button>
            </div>

            {rows.map((row, idx) => {
              const itemTotal = getRowPairs(row);

              return (
                <div
                  key={idx}
                  className="p-4 sm:p-5 rounded-2xl border border-slate-200 bg-white shadow-xs space-y-4 relative transition hover:border-slate-300"
                >
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                    <div className="flex items-center gap-2">
                      <span className="w-6 h-6 rounded-lg bg-blue-600 text-white text-xs font-bold flex items-center justify-center">
                        {idx + 1}
                      </span>
                      <span className="text-xs font-bold text-slate-800">
                        {row.title.trim() ? row.title : `Glove Model #${idx + 1}`}
                      </span>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700 text-xs font-black">
                        {itemTotal} Pairs
                      </div>
                      {rows.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveRow(idx)}
                          className="p-1 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer"
                          title="Remove this glove item"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Title & Color Boxes */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {/* A. Glove Item / Title Box: 100% BLANK by default */}
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Glove Item / Title <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="Enter Glove Name"
                        value={row.title}
                        onChange={e => handleUpdateRow(idx, { title: e.target.value })}
                        className="w-full px-3 py-2 text-xs sm:text-sm font-semibold rounded-xl border border-slate-300 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 bg-white"
                      />
                      {row.title.trim() && (() => {
                        const stock = articleStock.find(item =>
                          item.articleName.trim().toLocaleLowerCase() === row.title.trim().toLocaleLowerCase()
                        );
                        return stock ? (
                          <p className="mt-1 text-xs font-semibold text-emerald-700">
                            Available in stock: {stock.totalAvailable.toLocaleString()} pairs
                          </p>
                        ) : null;
                      })()}
                    </div>

                    {/* B. Color Box: BLANK by default, optional */}
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Color <span className="text-slate-400 font-normal">(Optional)</span>
                      </label>
                      <input
                        type="text"
                        placeholder="Enter Color (Optional)"
                        value={row.color}
                        onChange={e => handleUpdateRow(idx, { color: e.target.value })}
                        className="w-full px-3 py-2 text-xs sm:text-sm rounded-xl border border-slate-300 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 bg-white"
                      />
                    </div>
                  </div>

                  {/* E. SIZING SYSTEM: Size Matrix with 5 labels on TOP */}
                  <div className="p-3.5 bg-slate-50/80 rounded-xl border border-slate-200/80 space-y-2">
                    <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wider block">
                      Size Matrix & Pairs Quantity
                    </span>

                    <div className="grid grid-cols-5 gap-2 sm:gap-3">
                      {/* Small */}
                      <div>
                        <label className="block text-[11px] font-bold text-slate-700 text-center mb-1">
                          Small
                        </label>
                        <input
                          type="number"
                          min="0"
                          placeholder="0"
                          value={row.sizes.small === 0 ? '' : row.sizes.small}
                          onChange={e => handleUpdateSize(idx, 'small', e.target.value)}
                          className="w-full text-center py-2 px-1 text-xs sm:text-sm font-bold rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 bg-white shadow-2xs"
                        />
                      </div>

                      {/* Medium */}
                      <div>
                        <label className="block text-[11px] font-bold text-slate-700 text-center mb-1">
                          Medium
                        </label>
                        <input
                          type="number"
                          min="0"
                          placeholder="0"
                          value={row.sizes.medium === 0 ? '' : row.sizes.medium}
                          onChange={e => handleUpdateSize(idx, 'medium', e.target.value)}
                          className="w-full text-center py-2 px-1 text-xs sm:text-sm font-bold rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 bg-white shadow-2xs"
                        />
                      </div>

                      {/* Large */}
                      <div>
                        <label className="block text-[11px] font-bold text-slate-700 text-center mb-1">
                          Large
                        </label>
                        <input
                          type="number"
                          min="0"
                          placeholder="0"
                          value={row.sizes.large === 0 ? '' : row.sizes.large}
                          onChange={e => handleUpdateSize(idx, 'large', e.target.value)}
                          className="w-full text-center py-2 px-1 text-xs sm:text-sm font-bold rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 bg-white shadow-2xs"
                        />
                      </div>

                      {/* XL */}
                      <div>
                        <label className="block text-[11px] font-bold text-slate-700 text-center mb-1">
                          XL
                        </label>
                        <input
                          type="number"
                          min="0"
                          placeholder="0"
                          value={row.sizes.xl === 0 ? '' : row.sizes.xl}
                          onChange={e => handleUpdateSize(idx, 'xl', e.target.value)}
                          className="w-full text-center py-2 px-1 text-xs sm:text-sm font-bold rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 bg-white shadow-2xs"
                        />
                      </div>

                      {/* 2XL */}
                      <div>
                        <label className="block text-[11px] font-bold text-slate-700 text-center mb-1">
                          2XL
                        </label>
                        <input
                          type="number"
                          min="0"
                          placeholder="0"
                          value={row.sizes.xxl === 0 ? '' : row.sizes.xxl}
                          onChange={e => handleUpdateSize(idx, 'xxl', e.target.value)}
                          className="w-full text-center py-2 px-1 text-xs sm:text-sm font-bold rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 bg-white shadow-2xs"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}

            <button
              type="button"
              onClick={handleAddRow}
              className="w-full py-2.5 rounded-xl border-2 border-dashed border-blue-200 text-blue-600 hover:bg-blue-50/50 hover:border-blue-300 transition text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>+ Add Another Glove Type</span>
            </button>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Instructions & Carton Notes <span className="text-slate-400 font-normal">(Optional)</span>
            </label>
            <input
              type="text"
              placeholder="Packing marks, leather quality details, carton markings..."
              value={notes}
              onChange={e => setNotes(e.target.value)}
              className="w-full px-3 py-2 text-xs sm:text-sm rounded-xl border border-slate-300 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 bg-white"
            />
          </div>

          {/* Bottom Summary Bar: Total Pairs (No Rate, No Amount) */}
          <div className="p-4 bg-blue-50 rounded-2xl border border-blue-100 flex items-center justify-between">
            <div>
              <span className="text-xs font-bold text-blue-900 block uppercase tracking-wider">
                Total Ordered Pairs
              </span>
              <span className="text-xs text-blue-600 font-medium">
                Sum of all glove models and sizes
              </span>
            </div>
            <div className="text-xl sm:text-2xl font-black text-blue-700 font-mono">
              {overallTotalPairs} Pairs
            </div>
          </div>

          {/* Actions */}
          <div className="pt-2 border-t border-slate-200 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold text-slate-600 hover:bg-slate-100 transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !customerName.trim()}
              className="px-6 py-2.5 rounded-xl text-xs sm:text-sm font-bold bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white shadow-md shadow-blue-500/25 transition active:scale-95 flex items-center gap-2 cursor-pointer"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>
                {isSubmitting
                  ? 'Saving...'
                  : orderToEdit
                  ? 'Update Order'
                  : 'Save & Start Order'}
              </span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
