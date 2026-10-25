import React, { useState, useEffect } from 'react';
import { X, Scissors, User, Building, AlertCircle, CheckCircle2 } from 'lucide-react';
import { useFactory } from '../../context/FactoryContext';
import { CuttingType } from '../../types/factory';
import { formatCurrency } from '../../utils/factoryFormatters';

interface CreateCuttingModalProps {
  isOpen: boolean;
  onClose: () => void;
  preselectedOrderId?: string | null;
  preselectedOrderItemId?: string | null;
}

export const CreateCuttingModal: React.FC<CreateCuttingModalProps> = ({
  isOpen,
  onClose,
  preselectedOrderId,
  preselectedOrderItemId
}) => {
  const { orders, staff, parties, createCutting, settings } = useFactory();

  const [orderId, setOrderId] = useState('');
  const [orderItemId, setOrderItemId] = useState('');
  // Radio button as required by user:
  const [cuttingType, setCuttingType] = useState<CuttingType>('cutting_man');
  const [personId, setPersonId] = useState('');
  const [qty, setQty] = useState<string>('100');
  const [rate, setRate] = useState<string>('25');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');

  // Cutters list
  const factoryCutters = staff.filter(s => s.role === 'cutter' || s.role === 'stitcher');
  const outsideCutterMakers = parties.filter(p => p.type === 'cutter_maker' || p.type === 'supplier');

  // Sync when modal opens
  useEffect(() => {
    if (isOpen) {
      setDate(new Date().toISOString().split('T')[0]);
      setNotes('');

      // Choose order
      const initialOrd = preselectedOrderId 
        ? orders.find(o => o.id === preselectedOrderId) 
        : orders[0];

      if (initialOrd) {
        setOrderId(initialOrd.id);
        const itm = preselectedOrderItemId
          ? initialOrd.items.find(i => i.id === preselectedOrderItemId)
          : initialOrd.items[0];

        if (itm) {
          setOrderItemId(itm.id);
          const remainingToCut = Math.max(0, itm.qty - itm.cuttingGivenQty);
          setQty(remainingToCut > 0 ? remainingToCut.toString() : itm.qty.toString());
        }
      }

      // Default person
      if (cuttingType === 'cutting_man') {
        if (factoryCutters.length > 0) {
          setPersonId(factoryCutters[0].id);
          setRate(factoryCutters[0].perPairRate?.toString() || '25');
        } else {
          setPersonId('');
        }
      } else {
        if (outsideCutterMakers.length > 0) {
          setPersonId(outsideCutterMakers[0].id);
          setRate('30');
        } else {
          setPersonId('');
        }
      }
    }
  }, [isOpen, preselectedOrderId, preselectedOrderItemId, orders.length]);

  // When cuttingType changes (radio button toggle), update person dropdown options
  const handleCuttingTypeChange = (type: CuttingType) => {
    setCuttingType(type);
    if (type === 'cutting_man') {
      if (factoryCutters.length > 0) {
        setPersonId(factoryCutters[0].id);
        setRate(factoryCutters[0].perPairRate?.toString() || '25');
      } else {
        setPersonId('');
      }
    } else {
      if (outsideCutterMakers.length > 0) {
        setPersonId(outsideCutterMakers[0].id);
        setRate('30');
      } else {
        setPersonId('');
      }
    }
  };

  const handlePersonChange = (id: string) => {
    setPersonId(id);
    if (cuttingType === 'cutting_man') {
      const worker = factoryCutters.find(s => s.id === id);
      if (worker && worker.perPairRate) {
        setRate(worker.perPairRate.toString());
      }
    }
  };

  const selectedOrder = orders.find(o => o.id === orderId);
  const selectedItem = selectedOrder?.items.find(i => i.id === orderItemId);

  if (!isOpen) return null;

  const numQty = parseFloat(qty) || 0;
  const numRate = parseFloat(rate) || 0;
  const totalAmount = numQty * numRate;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!orderId || !orderItemId || !personId || numQty <= 0) return;

    createCutting({
      orderId,
      orderItemId,
      cuttingType,
      personId,
      qty: numQty,
      rate: numRate,
      date,
      notes
    });

    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-6 py-4 bg-amber-500 text-white flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Scissors className="w-5 h-5" />
            <div>
              <h3 className="font-bold text-lg leading-tight">Assign Cutting Job</h3>
              <p className="text-xs text-amber-100">Auto wage calculation and order progress sync</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-white/20 text-white transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[85vh] overflow-y-auto">
          {/* Order Selection */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Select Customer Order *
            </label>
            <select
              value={orderId}
              onChange={e => {
                const nextOrdId = e.target.value;
                setOrderId(nextOrdId);
                const ord = orders.find(o => o.id === nextOrdId);
                if (ord && ord.items.length > 0) {
                  setOrderItemId(ord.items[0].id);
                  setQty(ord.items[0].qty.toString());
                }
              }}
              className="w-full px-3 py-2 text-xs font-bold rounded-xl border border-slate-300 bg-white"
            >
              {orders.length === 0 ? (
                <option value="">No customer orders found</option>
              ) : (
                orders.map(o => (
                  <option key={o.id} value={o.id}>
                    #{o.orderNo} - {o.customerName} ({o.totalQty} pairs &bull; {o.status})
                  </option>
                ))
              )}
            </select>
          </div>

          {/* Glove Item within order */}
          {selectedOrder && (
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Select Glove Item to Cut *
              </label>
              <select
                value={orderItemId}
                onChange={e => {
                  setOrderItemId(e.target.value);
                  const itm = selectedOrder.items.find(i => i.id === e.target.value);
                  if (itm) {
                    const rem = Math.max(0, itm.qty - itm.cuttingGivenQty);
                    setQty(rem > 0 ? rem.toString() : itm.qty.toString());
                  }
                }}
                className="w-full px-3 py-2 text-xs font-semibold rounded-xl border border-slate-300 bg-white"
              >
                {selectedOrder.items.map(i => (
                  <option key={i.id} value={i.id}>
                    {i.title || i.gloveType}{i.color ? ` (${i.color})` : ''} &bull; Ordered: {i.totalPairs || i.qty} pairs (Given: {i.cuttingGivenQty})
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* REQUIREMENT: Radio Button: Cutting Man (Factory) vs Cutter Maker (Outside) */}
          <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
            <label className="block text-xs font-black text-slate-800 uppercase tracking-wider">
              Cutter Assignment Type *
            </label>

            <div className="grid grid-cols-2 gap-3">
              {/* Radio 1: Cutting Man (Factory Worker) */}
              <label className={`flex items-start gap-2.5 p-3 rounded-xl border cursor-pointer transition ${
                cuttingType === 'cutting_man'
                  ? 'bg-blue-50 border-blue-500 shadow-xs'
                  : 'bg-white border-slate-200 hover:bg-slate-100'
              }`}>
                <input
                  type="radio"
                  name="cuttingType"
                  value="cutting_man"
                  checked={cuttingType === 'cutting_man'}
                  onChange={() => handleCuttingTypeChange('cutting_man')}
                  className="mt-0.5 text-blue-600 focus:ring-blue-500"
                />
                <div>
                  <span className="text-xs font-bold text-slate-900 block">
                    Cutting Man
                  </span>
                  <span className="text-[10px] text-blue-700 font-semibold block">
                    Internal Factory Worker
                  </span>
                </div>
              </label>

              {/* Radio 2: Cutter Maker (Outside Contractor) */}
              <label className={`flex items-start gap-2.5 p-3 rounded-xl border cursor-pointer transition ${
                cuttingType === 'cutter_maker'
                  ? 'bg-purple-50 border-purple-500 shadow-xs'
                  : 'bg-white border-slate-200 hover:bg-slate-100'
              }`}>
                <input
                  type="radio"
                  name="cuttingType"
                  value="cutter_maker"
                  checked={cuttingType === 'cutter_maker'}
                  onChange={() => handleCuttingTypeChange('cutter_maker')}
                  className="mt-0.5 text-purple-600 focus:ring-purple-500"
                />
                <div>
                  <span className="text-xs font-bold text-slate-900 block">
                    Cutter Maker
                  </span>
                  <span className="text-[10px] text-purple-700 font-semibold block">
                    External Contractor
                  </span>
                </div>
              </label>
            </div>
          </div>

          {/* Dynamic Dropdown List based on Radio Selection */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              {cuttingType === 'cutting_man' 
                ? 'Select Factory Cutting Worker *' 
                : 'Select Outside Cutter Maker Party *'}
            </label>

            {cuttingType === 'cutting_man' ? (
              factoryCutters.length > 0 ? (
                <select
                  value={personId}
                  onChange={e => handlePersonChange(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-semibold rounded-xl border border-slate-300 bg-white"
                >
                  {factoryCutters.map(worker => (
                    <option key={worker.id} value={worker.id}>
                      {worker.name} (Role: {worker.role} &bull; Rate: {settings.currency} {worker.perPairRate}/pair)
                    </option>
                  ))}
                </select>
              ) : (
                <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-xs text-amber-800 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>No factory staff registered yet. Add staff under Factory Staff module.</span>
                </div>
              )
            ) : (
              outsideCutterMakers.length > 0 ? (
                <select
                  value={personId}
                  onChange={e => handlePersonChange(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-semibold rounded-xl border border-slate-300 bg-white"
                >
                  {outsideCutterMakers.map(party => (
                    <option key={party.id} value={party.id}>
                      {party.name} ({party.phone} &bull; Balance: {settings.currency} {party.currentBalance})
                    </option>
                  ))}
                </select>
              ) : (
                <div className="p-3 bg-purple-50 rounded-xl border border-purple-200 text-xs text-purple-800 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>No contract cutters found. Add a party with the type "Cutter Maker".</span>
                </div>
              )
            )}
          </div>

          {/* Qty & Wage Rate */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Cutting Quantity (Pairs) *
              </label>
              <input
                type="number"
                required
                min="1"
                value={qty}
                onChange={e => setQty(e.target.value)}
                className="w-full px-3 py-2 text-sm font-black text-center rounded-xl border border-slate-300 bg-amber-50/50"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Wage Rate / Pair ({settings.currency}) *
              </label>
              <input
                type="number"
                required
                min="0"
                step="any"
                value={rate}
                onChange={e => setRate(e.target.value)}
                className="w-full px-3 py-2 text-sm font-bold text-right rounded-xl border border-slate-300"
              />
            </div>
          </div>

          {/* Date */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Assignment Date
            </label>
            <input
              type="date"
              required
              value={date}
              onChange={e => setDate(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300"
            />
          </div>

          {/* Auto Wage Calculation Preview */}
          <div className="p-3 bg-amber-50/70 rounded-xl border border-amber-200 flex items-center justify-between text-xs">
            <div>
              <span className="font-bold text-amber-900 block">Total Wages Calculated:</span>
              <span className="text-[11px] text-amber-700">
                {cuttingType === 'cutting_man' ? 'Added to staff_ledger (Worker wages)' : 'Added to party_transactions (Payable to Cutter Maker)'}
              </span>
            </div>
            <span className="text-base font-black text-amber-900">
              {formatCurrency(totalAmount, settings.currency)}
            </span>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Instructions / Notes
            </label>
            <input
              type="text"
              placeholder="Pattern details, thread color, leather thickness..."
              value={notes}
              onChange={e => setNotes(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300"
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
              disabled={!personId || numQty <= 0}
              className="px-5 py-2 rounded-xl text-sm font-bold bg-amber-500 hover:bg-amber-600 text-white shadow-sm transition active:scale-95 flex items-center gap-1.5"
            >
              <Scissors className="w-4 h-4" />
              <span>Confirm & Assign Cutting</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
