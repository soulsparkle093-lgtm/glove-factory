import React, { useState } from 'react';
import { Users, Search, Plus, DollarSign, Calendar, CheckCircle2, Trash2, Edit, X, Wallet } from 'lucide-react';
import { useFactory } from '../context/FactoryContext';
import { formatCurrency, formatDate } from '../utils/factoryFormatters';
import { Staff } from '../types/factory';

export const StaffPage: React.FC = () => {
  const { 
    staff, 
    staffLedger, 
    attendance, 
    addStaff, 
    updateStaff, 
    deleteStaff, 
    payStaffWage, 
    markAttendance, 
    settings 
  } = useFactory();

  const [search, setSearch] = useState('');
  const [isAddStaffOpen, setIsAddStaffOpen] = useState(false);
  const [isPayWageOpen, setIsPayWageOpen] = useState(false);
  const [selectedStaffForPay, setSelectedStaffForPay] = useState<Staff | null>(null);

  // Form states for staff
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<'cutter' | 'stitcher' | 'finisher'>('cutter');
  const [perPairRate, setPerPairRate] = useState('25');

  // Form states for paying wage
  const [payAmount, setPayAmount] = useState('');
  const [paymentMode, setPaymentMode] = useState<'cash' | 'bank'>('cash');
  const [payNote, setPayNote] = useState('');

  const totalUnpaidWages = staff.reduce((s, st) => s + st.currentBalance, 0);

  const filteredStaff = staff.filter(s => {
    if (search.trim()) {
      const q = search.toLowerCase();
      return s.name.toLowerCase().includes(q) || s.role.toLowerCase().includes(q);
    }
    return true;
  });

  const handleOpenAdd = () => {
    setName('');
    setPhone('');
    setRole('cutter');
    setPerPairRate('25');
    setIsAddStaffOpen(true);
  };

  const handleOpenPay = (st: Staff) => {
    setSelectedStaffForPay(st);
    setPayAmount(st.currentBalance.toString());
    setPaymentMode('cash');
    setPayNote(`Weekly cutting wage payment to ${st.name}`);
    setIsPayWageOpen(true);
  };

  const handleSaveStaff = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    addStaff({
      name,
      phone: phone || undefined,
      role,
      perPairRate: parseFloat(perPairRate) || 25
    });

    setIsAddStaffOpen(false);
  };

  const handleConfirmPay = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStaffForPay) return;
    const amount = parseFloat(payAmount) || 0;
    if (amount <= 0) return;

    payStaffWage(selectedStaffForPay.id, amount, paymentMode, payNote);
    setIsPayWageOpen(false);
  };

  const todayStr = new Date().toISOString().split('T')[0];

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Top Metrics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl p-5 border border-blue-100 shadow-xs">
          <span className="text-xs font-bold uppercase tracking-wider text-blue-700">Total Factory Staff</span>
          <div className="text-2xl font-black text-slate-900 mt-1">{staff.length} Workers</div>
          <p className="text-xs text-slate-500 mt-1">Cutters, stitchers & finishers</p>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-amber-200 shadow-xs">
          <span className="text-xs font-bold uppercase tracking-wider text-amber-700">Unpaid Accumulated Wages</span>
          <div className="text-2xl font-black text-amber-700 mt-1">{formatCurrency(totalUnpaidWages, settings.currency)}</div>
          <p className="text-xs text-slate-500 mt-1">Earned from cutting batches</p>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-emerald-100 shadow-xs">
          <span className="text-xs font-bold uppercase tracking-wider text-emerald-700">Today's Attendance</span>
          <div className="text-2xl font-black text-emerald-600 mt-1">
            {attendance.filter(a => a.date === todayStr && a.status === 'present').length} Present
          </div>
          <p className="text-xs text-slate-500 mt-1">Factory workforce status</p>
        </div>
      </div>

      {/* Main Staff Card */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="font-bold text-slate-900 text-lg">Factory Staff & Cutters</h3>
            <p className="text-xs text-slate-500">Manage piece-rate cutters, track accumulated wages, and disburse cash payroll</p>
          </div>

          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Search staff..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-9 pr-3 py-1.5 text-xs sm:text-sm rounded-xl border border-slate-300"
              />
            </div>

            <button
              onClick={handleOpenAdd}
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-sm transition active:scale-95"
            >
              <Plus className="w-4 h-4" />
              <span>+ Register Staff</span>
            </button>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          {filteredStaff.length === 0 ? (
            <div className="py-16 text-center text-slate-400 text-sm">
              <Users className="w-10 h-10 text-slate-300 mx-auto mb-2" />
              <p>No factory staff members added yet.</p>
              <button onClick={handleOpenAdd} className="mt-3 text-xs font-bold text-blue-600 hover:underline">
                + Register your first cutting man or worker
              </button>
            </div>
          ) : (
            <table className="w-full text-left text-xs sm:text-sm">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                <tr>
                  <th className="py-3 px-4">Staff Member</th>
                  <th className="py-3 px-4">Role / Department</th>
                  <th className="py-3 px-4 text-center">Piece Rate / Pair</th>
                  <th className="py-3 px-4 text-right">Earned Unpaid Wages</th>
                  <th className="py-3 px-4 text-center">Quick Attendance</th>
                  <th className="py-3 px-4 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredStaff.map(st => {
                  const todayAtt = attendance.find(a => a.staffId === st.id && a.date === todayStr);

                  return (
                    <tr key={st.id} className="hover:bg-slate-50/70 transition">
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-slate-900">{st.name}</div>
                        {st.phone && <div className="text-[11px] text-slate-400">{st.phone}</div>}
                      </td>

                      <td className="py-3.5 px-4">
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase bg-blue-50 text-blue-800 border border-blue-200">
                          {st.role}
                        </span>
                      </td>

                      <td className="py-3.5 px-4 text-center font-bold text-slate-800">
                        {settings.currency} {st.perPairRate} / pair
                      </td>

                      <td className="py-3.5 px-4 text-right font-black text-amber-700 text-base">
                        {formatCurrency(st.currentBalance, settings.currency)}
                      </td>

                      <td className="py-3.5 px-4 text-center">
                        {todayAtt ? (
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                            todayAtt.status === 'present' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                          }`}>
                            {todayAtt.status}
                          </span>
                        ) : (
                          <div className="flex items-center justify-center gap-1">
                            <button
                              onClick={() => markAttendance({ staffId: st.id, staffName: st.name, date: todayStr, status: 'present' })}
                              className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-bold hover:bg-emerald-100"
                            >
                              Present
                            </button>
                            <button
                              onClick={() => markAttendance({ staffId: st.id, staffName: st.name, date: todayStr, status: 'absent' })}
                              className="px-2 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-200 text-[10px] font-bold hover:bg-rose-100"
                            >
                              Absent
                            </button>
                          </div>
                        )}
                      </td>

                      <td className="py-3.5 px-4 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            onClick={() => handleOpenPay(st)}
                            disabled={st.currentBalance <= 0}
                            className={`px-3 py-1 rounded-xl text-xs font-bold transition flex items-center gap-1 ${
                              st.currentBalance > 0
                                ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs'
                                : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                            }`}
                          >
                            <Wallet className="w-3.5 h-3.5" />
                            <span>Pay Wages</span>
                          </button>
                          <button onClick={() => deleteStaff(st.id)} className="p-1 rounded text-slate-400 hover:text-rose-600">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Register Staff Modal */}
      {isAddStaffOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-6 py-4 bg-blue-600 text-white flex items-center justify-between">
              <h3 className="font-bold text-lg">Register Factory Staff</h3>
              <button onClick={() => setIsAddStaffOpen(false)} className="p-1 text-white hover:bg-white/20 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveStaff} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Staff / Worker Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Asif Cutter, Imran Stitcher"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Phone Number (Optional)</label>
                <input
                  type="text"
                  placeholder="0300-1234567"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Role / Department</label>
                  <select
                    value={role}
                    onChange={e => setRole(e.target.value as any)}
                    className="w-full px-3 py-2 text-xs font-bold rounded-xl border border-slate-300 bg-white"
                  >
                    <option value="cutter">Cutting Man</option>
                    <option value="stitcher">Stitcher</option>
                    <option value="finisher">Finisher / Packing</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Rate per Pair ({settings.currency})</label>
                  <input
                    type="number"
                    required
                    min="1"
                    value={perPairRate}
                    onChange={e => setPerPairRate(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-black text-center rounded-xl border border-slate-300"
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsAddStaffOpen(false)}
                  className="px-4 py-2 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl text-sm font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-sm"
                >
                  Save Worker
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Pay Wage Modal */}
      {isPayWageOpen && selectedStaffForPay && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-6 py-4 bg-emerald-600 text-white flex items-center justify-between">
              <div>
                <h3 className="font-bold text-lg">Pay Cutting Wages</h3>
                <p className="text-xs text-emerald-100">{selectedStaffForPay.name} ({selectedStaffForPay.role})</p>
              </div>
              <button onClick={() => setIsPayWageOpen(false)} className="p-1 text-white hover:bg-white/20 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleConfirmPay} className="p-6 space-y-4">
              <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 flex items-center justify-between text-xs">
                <span className="font-bold text-emerald-900">Total Unpaid Accumulated:</span>
                <span className="text-base font-black text-emerald-700">
                  {formatCurrency(selectedStaffForPay.currentBalance, settings.currency)}
                </span>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Disburse Amount ({settings.currency}) *
                </label>
                <input
                  type="number"
                  required
                  min="1"
                  max={selectedStaffForPay.currentBalance}
                  value={payAmount}
                  onChange={e => setPayAmount(e.target.value)}
                  className="w-full px-3 py-2 text-base font-black text-center rounded-xl border border-slate-300"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Payment Method</label>
                <select
                  value={paymentMode}
                  onChange={e => setPaymentMode(e.target.value as any)}
                  className="w-full px-3 py-2 text-xs font-bold rounded-xl border border-slate-300 bg-white"
                >
                  <option value="cash">Cash in Hand (Petty Cash)</option>
                  <option value="bank">Bank / Digital Transfer</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Payment Note</label>
                <input
                  type="text"
                  value={payNote}
                  onChange={e => setPayNote(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300"
                />
              </div>

              <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsPayWageOpen(false)}
                  className="px-4 py-2 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl text-sm font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm"
                >
                  Confirm & Deduct Cashbook
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
