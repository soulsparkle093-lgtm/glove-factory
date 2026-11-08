import React, { useState, useEffect } from 'react';
import { X, Plus, Trash2, FileText, CheckCircle2, User, Calendar, ArrowLeft } from 'lucide-react';
import { useFactory } from '../../context/FactoryContext';
import { CustomerOrder, SizeMatrix } from '../../types/factory';

interface CreateOrderModalProps {
  isOpen: boolean;
  onClose: () => void;
  orderToEdit?: CustomerOrder | null;
  onOpenAddParty?: () => void;
}

interface SizeQtyRow {
  id: string;
  size: string;
  quantity: number | string;
}

interface GloveFormRow {
  id?: string;
  title: string; // 100% BLANK by default
  color: string; // BLANK by default
  sizesList: SizeQtyRow[];
}

const createEmptySizeRow = (): SizeQtyRow => ({
  id: 'sz-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
  size: '',
  quantity: ''
});

const createEmptyRow = (): GloveFormRow => ({
  title: '',
  color: '',
  sizesList: [createEmptySizeRow()]
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

  // Dynamic glove item rows with dynamic Size + Quantity pairs
  const [rows, setRows] = useState<GloveFormRow[]>([createEmptyRow()]);

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

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
          const prefilledRows = orderToEdit.items.map(item => {
            let sizesList: SizeQtyRow[] = [];
            if (item.customSizes && item.customSizes.length > 0) {
              sizesList = item.customSizes.map(cs => ({
                id: cs.id || 'sz-' + Math.random().toString(36).slice(2, 6),
                size: cs.size || '',
                quantity: cs.quantity === 0 ? '' : cs.quantity
              }));
            } else if (item.size && item.size.trim().length > 0) {
              // Direct saved raw size string (e.g. "10", "8", "Ladies Large")
              sizesList = [{
                id: 'sz-' + Math.random().toString(36).slice(2, 6),
                size: item.size,
                quantity: item.totalPairs || item.qty || ''
              }];
            } else if (item.sizes) {
              // Legacy size matrix: only extract sizes with actual values > 0
              const list: SizeQtyRow[] = [];
              const entries = [
                { key: 'Small', val: item.sizes.small },
                { key: 'Medium', val: item.sizes.medium },
                { key: 'Large', val: item.sizes.large },
                { key: 'XL', val: item.sizes.xl },
                { key: '2XL', val: item.sizes.xxl }
              ];
              entries.forEach(e => {
                const num = Number(e.val);
                if (num > 0) {
                  list.push({
                    id: 'sz-' + Math.random().toString(36).slice(2, 6),
                    size: e.key,
                    quantity: num
                  });
                }
              });
              sizesList = list.length > 0 ? list : [createEmptySizeRow()];
            } else {
              sizesList = [createEmptySizeRow()];
            }
            return {
              id: item.id,
              title: item.title || item.gloveType || '',
              color: item.color || '',
              sizesList
            };
          });
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

  const handleAddSizeRow = (gloveIndex: number) => {
    setRows(prev => prev.map((r, idx) => {
      if (idx === gloveIndex) {
        return {
          ...r,
          sizesList: [...r.sizesList, createEmptySizeRow()]
        };
      }
      return r;
    }));
  };

  const handleRemoveSizeRow = (gloveIndex: number, sizeIndex: number) => {
    setRows(prev => prev.map((r, idx) => {
      if (idx === gloveIndex) {
        if (r.sizesList.length <= 1) return r;
        return {
          ...r,
          sizesList: r.sizesList.filter((_, sIdx) => sIdx !== sizeIndex)
        };
      }
      return r;
    }));
  };

  const handleUpdateSizeRow = (gloveIndex: number, sizeIndex: number, field: 'size' | 'quantity', val: string) => {
    setRows(prev => prev.map((r, idx) => {
      if (idx === gloveIndex) {
        return {
          ...r,
          sizesList: r.sizesList.map((s, sIdx) => {
            if (sIdx === sizeIndex) {
              return {
                ...s,
                [field]: field === 'quantity' ? (val === '' ? '' : Math.max(0, parseInt(val, 10) || 0)) : val
              };
            }
            return s;
          })
        };
      }
      return r;
    }));
  };

  // Calculate pairs for each glove row (Sum of all size quantity boxes)
  const getRowPairs = (row: GloveFormRow): number => {
    return row.sizesList.reduce((sum, s) => {
      const q = s.quantity === '' ? 0 : Number(s.quantity) || 0;
      return sum + q;
    }, 0);
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
        const customSizesList = r.sizesList
          .filter(s => (s.size && s.size.length > 0) || Number(s.quantity) > 0)
          .map(s => ({
            id: s.id,
            size: s.size || 'Standard',
            quantity: s.quantity === '' ? 0 : Math.max(0, parseInt(String(s.quantity), 10) || 0)
          }));

        const total = customSizesList.reduce((sum, s) => sum + s.quantity, 0);

        // Backward compatibility for legacy modules only when explicitly matching
        const legacySizes: SizeMatrix = { small: 0, medium: 0, large: 0, xl: 0, xxl: 0 };
        customSizesList.forEach(cs => {
          const norm = (cs.size || '').trim().toLowerCase();
          if (norm === 'small' || norm === 's') legacySizes.small += cs.quantity;
          else if (norm === 'medium' || norm === 'm') legacySizes.medium += cs.quantity;
          else if (norm === 'large' || norm === 'l') legacySizes.large += cs.quantity;
          else if (norm === 'xl' || norm === 'extra large') legacySizes.xl += cs.quantity;
          else if (norm === '2xl' || norm === 'xxl') legacySizes.xxl += cs.quantity;
        });

        return {
          id: r.id,
          title: r.title.trim(),
          gloveType: r.title.trim(),
          article: r.title.trim(),
          color: r.color.trim(),
          sizes: legacySizes,
          size: customSizesList[0]?.size || '',
          customSizes: customSizesList,
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
    <div 
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto"
    >
      <div 
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl overflow-hidden flex flex-col max-h-[95vh] my-auto animate-in fade-in zoom-in-95 duration-150"
      >
        {/* Header */}
        <div className="px-5 sm:px-6 py-4 bg-blue-600 text-white flex items-center justify-between shrink-0">
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
            title="Close / Back (Esc)"
            aria-label="Close / Back"
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

                  {/* E. SIZING SYSTEM: Only 2 Boxes - Size + Quantity / Pairs with Add More */}
                  <div className="p-4 bg-slate-50/90 rounded-2xl border border-slate-200 space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-[11px] font-black text-slate-700 uppercase tracking-wider block">
                          Size &amp; Quantity
                        </span>
                        <p className="text-[11px] text-slate-500">
                          Free-text Size box and Quantity box per size
                        </p>
                      </div>
                      <span className="text-xs font-bold text-blue-700 bg-blue-100/70 px-2.5 py-0.5 rounded-full">
                        {itemTotal} Pairs
                      </span>
                    </div>

                    <div className="space-y-3">
                      {row.sizesList.map((sRow, sIdx) => (
                        <div
                          key={sRow.id || sIdx}
                          className="p-3.5 bg-white rounded-xl border border-slate-200/90 shadow-2xs space-y-2.5 relative"
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] font-bold text-slate-500">
                              Size Entry #{sIdx + 1}
                            </span>
                            {row.sizesList.length > 1 && (
                              <button
                                type="button"
                                onClick={() => handleRemoveSizeRow(idx, sIdx)}
                                className="p-1 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer"
                                title="Remove this size"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>

                          {/* Box 1 - Size: Free text input */}
                          <div>
                            <label className="block text-xs font-bold text-slate-700 mb-1">
                              Size
                            </label>
                            <input
                              type="text"
                              placeholder="e.g. Large, Medium, Small, 8, 10, Ladies Large, Gents XL"
                              value={sRow.size}
                              onChange={e => handleUpdateSizeRow(idx, sIdx, 'size', e.target.value)}
                              className="w-full px-3 py-2 text-xs sm:text-sm font-semibold rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 bg-white"
                            />
                          </div>

                          {/* Box 2 - Quantity / Pairs */}
                          <div>
                            <label className="block text-xs font-bold text-slate-700 mb-1">
                              Quantity / Pairs
                            </label>
                            <input
                              type="number"
                              min="0"
                              placeholder="e.g. 3000"
                              value={sRow.quantity}
                              onChange={e => handleUpdateSizeRow(idx, sIdx, 'quantity', e.target.value)}
                              className="w-full px-3 py-2 text-xs sm:text-sm font-bold font-mono rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 bg-white placeholder-shown:border-dashed placeholder-shown:border-slate-300 placeholder-shown:bg-slate-50/50"
                            />
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Add More Button */}
                    <button
                      type="button"
                      onClick={() => handleAddSizeRow(idx)}
                      className="w-full py-2.5 rounded-xl border-2 border-dashed border-blue-200 hover:border-blue-300 bg-blue-50/50 hover:bg-blue-50 text-blue-700 text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>+ Add Another Size</span>
                    </button>
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
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold text-slate-600 hover:bg-slate-100 transition cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Cancel / Back</span>
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
