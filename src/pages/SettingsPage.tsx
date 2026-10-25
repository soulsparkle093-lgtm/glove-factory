import React, { useState } from 'react';
import { Building2, Save, CheckCircle2, RotateCcw, ShieldCheck } from 'lucide-react';
import { useFactory } from '../context/FactoryContext';

export const SettingsPage: React.FC = () => {
  const { settings, updateSettings, clearAllFactoryData, showToast } = useFactory();

  const [factoryName, setFactoryName] = useState(settings.factoryName);
  const [tagline, setTagline] = useState(settings.tagline);
  const [ownerName, setOwnerName] = useState(settings.ownerName);
  const [phone, setPhone] = useState(settings.phone);
  const [email, setEmail] = useState(settings.email);
  const [address, setAddress] = useState(settings.address);
  const [city, setCity] = useState(settings.city);
  const [currency, setCurrency] = useState(settings.currency);
  const [orderPrefix, setOrderPrefix] = useState(settings.orderPrefix);
  const [invoicePrefix, setInvoicePrefix] = useState(settings.invoicePrefix);

  const [showClearConfirm, setShowClearConfirm] = useState(false);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    updateSettings({
      factoryName,
      tagline,
      ownerName,
      phone,
      email,
      address,
      city,
      currency,
      orderPrefix,
      invoicePrefix
    });
    showToast('Factory profile saved successfully');
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Factory Profile & System Settings</h2>
          <p className="text-xs text-slate-500 mt-1">
            Configure Gloves Factory legal details, invoice prefixes, and currency preferences.
          </p>
        </div>
        <button
          onClick={handleSave}
          className="px-5 py-2.5 rounded-xl text-sm font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-sm transition active:scale-95 flex items-center justify-center gap-1.5 cursor-pointer"
        >
          <Save className="w-4 h-4" />
          <span>Save Changes</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Form */}
        <div className="lg:col-span-2 space-y-6">
          <form onSubmit={handleSave} className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6 space-y-4">
            <h3 className="font-bold text-slate-900 text-sm uppercase tracking-wider text-blue-700 flex items-center gap-2">
              <Building2 className="w-4 h-4" /> Factory Details & Location
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Factory Name *</label>
                <input
                  type="text"
                  required
                  value={factoryName}
                  onChange={e => setFactoryName(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Industry / Specialty</label>
                <input
                  type="text"
                  placeholder="e.g. Leather Gloves & Safety Wear"
                  value={tagline}
                  onChange={e => setTagline(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Tagline / Business Line</label>
                <input
                  type="text"
                  value={tagline}
                  onChange={e => setTagline(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Factory Owner / CEO Name</label>
                <input
                  type="text"
                  value={ownerName}
                  onChange={e => setOwnerName(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Phone / WhatsApp *</label>
                <input
                  type="text"
                  required
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Official Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">City & Hub</label>
                <input
                  type="text"
                  value={city}
                  onChange={e => setCity(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Currency Symbol *</label>
                <select
                  value={currency}
                  onChange={e => setCurrency(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-bold rounded-xl border border-slate-300 bg-white"
                >
                  <option value="Rs.">Rs. (Pakistani Rupee)</option>
                  <option value="$">$ (US Dollar - Export)</option>
                  <option value="€">€ (Euro - Export)</option>
                  <option value="£">£ (British Pound)</option>
                  <option value="AED">AED (UAE Dirham)</option>
                  <option value="SAR">SAR (Saudi Riyal)</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Industrial Address / Plot #</label>
              <input
                type="text"
                value={address}
                onChange={e => setAddress(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300"
              />
            </div>

            <div className="grid grid-cols-2 gap-4 pt-3 border-t border-slate-100">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Order No Prefix</label>
                <input
                  type="text"
                  value={orderPrefix}
                  onChange={e => setOrderPrefix(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono rounded-xl border border-slate-300"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Invoice No Prefix</label>
                <input
                  type="text"
                  value={invoicePrefix}
                  onChange={e => setInvoicePrefix(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono rounded-xl border border-slate-300"
                />
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="submit"
                className="px-6 py-2 rounded-xl text-sm font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-sm"
              >
                Save Factory Profile
              </button>
            </div>
          </form>
        </div>

        {/* Right Column: Database & Clear Data */}
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6 space-y-4">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-blue-600" />
              <h3 className="font-bold text-slate-900 text-base">System & Database Status</h3>
            </div>

            <div className="p-3.5 rounded-xl border text-xs bg-emerald-50 border-emerald-200 text-emerald-900 space-y-1.5">
              <div className="font-bold flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>Real-time Sync Active</span>
              </div>
              <p className="text-[11px] text-slate-600 leading-relaxed">
                Factory orders, cutting logs, stock ledger, and customer accounts synchronize automatically across all your devices in real-time.
              </p>
            </div>
          </div>

          {/* Delete All Data / Clean Reset */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6 space-y-3">
            <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
              <RotateCcw className="w-4 h-4 text-slate-500" />
              <span>Clear / Reset Factory Records</span>
            </h3>
            <p className="text-xs text-slate-500">
              Clear all orders, cuttings, stock ledger, bills, and start fresh with empty database.
            </p>

            {showClearConfirm ? (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl space-y-2 text-xs text-rose-900">
                <p className="font-bold">Are you sure you want to delete all factory records?</p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowClearConfirm(false)}
                    className="px-3 py-1 rounded bg-white border border-slate-300 font-semibold"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => {
                      clearAllFactoryData();
                      setShowClearConfirm(false);
                    }}
                    className="px-3 py-1 rounded bg-rose-600 text-white font-bold hover:bg-rose-700"
                  >
                    Yes, Delete All
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowClearConfirm(true)}
                className="w-full py-2 rounded-xl text-xs font-bold border border-rose-200 text-rose-700 hover:bg-rose-50 transition"
              >
                Clear All Factory Data
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
