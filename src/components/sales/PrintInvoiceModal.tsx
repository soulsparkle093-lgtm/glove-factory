import React from 'react';
import { X, Printer, ShieldCheck, CheckCircle2 } from 'lucide-react';
import { useFactory } from '../../context/FactoryContext';
import { SaleInvoice } from '../../types/factory';
import { formatCurrency, formatDate } from '../../utils/factoryFormatters';

interface PrintInvoiceModalProps {
  invoice: SaleInvoice;
  onClose: () => void;
}

export const PrintInvoiceModal: React.FC<PrintInvoiceModalProps> = ({ invoice, onClose }) => {
  const { settings, parties } = useFactory();

  const customerParty = parties.find(p => p.id === invoice.customerId);

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl overflow-hidden flex flex-col max-h-[96vh] animate-in fade-in zoom-in-95 duration-150">
        {/* Top bar (hidden in print) */}
        <div className="px-6 py-3.5 bg-slate-900 text-white flex items-center justify-between print:hidden">
          <div className="flex items-center gap-2">
            <span className="font-bold text-sm">Invoice #{invoice.invoiceNo}</span>
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
              invoice.paymentStatus === 'paid' ? 'bg-emerald-500 text-white' : 'bg-rose-500 text-white'
            }`}>
              {invoice.paymentStatus}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm transition"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print Invoice</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-white/20 text-white transition ml-2"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Printable Invoice Page */}
        <div className="flex-1 overflow-y-auto p-6 sm:p-10 bg-white text-slate-800" id="printable-factory-invoice">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-start justify-between border-b-2 border-blue-600 pb-5 gap-4">
            <div>
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-blue-700 text-white font-bold flex items-center justify-center shadow-xs">
                  <ShieldCheck className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h2 className="text-xl sm:text-2xl font-black text-blue-900 tracking-tight leading-tight">
                    {settings.factoryName}
                  </h2>
                  <span className="text-xs font-semibold text-blue-700 block">
                    Leather & Safety Gloves Manufacturing Unit
                  </span>
                </div>
              </div>
              <p className="text-xs text-slate-500 mt-1">{settings.tagline}</p>
              <p className="text-xs text-slate-600 mt-2">{settings.address}, {settings.city}</p>
              <p className="text-xs text-slate-600">Contact: <strong>{settings.phone}</strong> &bull; {settings.email}</p>
            </div>

            <div className="text-left sm:text-right">
              <span className="text-[11px] font-black uppercase tracking-widest text-blue-700">
                TAX INVOICE & DELIVERY BILL
              </span>
              <div className="text-2xl font-black text-slate-900 font-mono mt-0.5">
                #{invoice.invoiceNo}
              </div>
              <p className="text-xs text-slate-500 mt-1">Date: <strong>{formatDate(invoice.date)}</strong></p>
              <p className="text-xs text-slate-500">Order Ref: <strong>#{invoice.orderNo}</strong></p>
              <div className="mt-2">
                <span className={`inline-block px-3 py-0.5 rounded-md text-xs font-black uppercase tracking-wider ${
                  invoice.paymentStatus === 'paid'
                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                    : 'bg-rose-100 text-rose-800 border border-rose-300'
                }`}>
                  {invoice.paymentStatus === 'paid' ? 'PAID IN FULL' : 'PAYABLE ON CREDIT'}
                </span>
              </div>
            </div>
          </div>

          {/* Customer Info */}
          <div className="my-6 p-4 rounded-xl bg-slate-50 border border-slate-200 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                Billed To (Customer)
              </span>
              <h4 className="text-sm font-bold text-slate-900 mt-0.5">{invoice.customerName}</h4>
              {customerParty?.phone && (
                <p className="text-xs text-slate-600 mt-0.5">Phone: {customerParty.phone}</p>
              )}
              {customerParty?.address && (
                <p className="text-xs text-slate-600 mt-0.5">{customerParty.address}</p>
              )}
            </div>

            <div className="sm:text-right">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                Ledger Settlement Status
              </span>
              <p className="text-xs text-slate-700 mt-0.5">
                Current Due on Bill: <strong className="text-rose-600 font-black">{formatCurrency(invoice.remaining, settings.currency)}</strong>
              </p>
              {customerParty && (
                <p className="text-xs text-slate-600 mt-0.5">
                  Total Customer Ledger Balance: <strong>{formatCurrency(customerParty.currentBalance, settings.currency)}</strong>
                </p>
              )}
            </div>
          </div>

          {/* Items Table */}
          <table className="w-full text-left text-xs sm:text-sm border-collapse">
            <thead>
              <tr className="border-b-2 border-slate-300 text-slate-700 font-bold bg-slate-50">
                <th className="py-2.5 px-3 w-10 text-center">#</th>
                <th className="py-2.5 px-3">Glove Model / Description</th>
                <th className="py-2.5 px-3 text-center">Size</th>
                <th className="py-2.5 px-3 text-center">Color</th>
                <th className="py-2.5 px-3 text-center">Pairs</th>
                <th className="py-2.5 px-3 text-right">Rate ({settings.currency})</th>
                <th className="py-2.5 px-3 text-right">Amount ({settings.currency})</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {invoice.items.map((item, idx) => (
                <tr key={idx}>
                  <td className="py-2.5 px-3 text-center text-slate-400">{idx + 1}</td>
                  <td className="py-2.5 px-3 font-bold text-slate-900">{item.gloveType}</td>
                  <td className="py-2.5 px-3 text-center">{item.size}</td>
                  <td className="py-2.5 px-3 text-center">{item.color}</td>
                  <td className="py-2.5 px-3 text-center font-bold">{item.qty}</td>
                  <td className="py-2.5 px-3 text-right text-slate-700">{formatCurrency(item.rate, '')}</td>
                  <td className="py-2.5 px-3 text-right font-bold text-slate-900">{formatCurrency(item.amount, '')}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Summary */}
          <div className="mt-6 flex flex-col sm:flex-row justify-between items-start gap-6 border-t border-slate-200 pt-4">
            <div className="text-xs text-slate-500 max-w-sm">
              <span className="font-bold text-slate-700 block mb-1">Delivery Notes:</span>
              <p>{invoice.notes || 'Export standard carton packing. Verified by factory QC.'}</p>
            </div>

            <div className="w-full sm:w-64 space-y-1.5 text-xs">
              <div className="flex justify-between text-slate-600">
                <span>Subtotal:</span>
                <span className="font-semibold">{formatCurrency(invoice.subtotal, settings.currency)}</span>
              </div>

              {invoice.discount > 0 && (
                <div className="flex justify-between text-emerald-600 font-semibold">
                  <span>Discount:</span>
                  <span>-{formatCurrency(invoice.discount, settings.currency)}</span>
                </div>
              )}

              <div className="border-t border-slate-300 pt-2 flex justify-between font-black text-sm text-slate-900">
                <span>Grand Total:</span>
                <span className="text-blue-700 text-base">{formatCurrency(invoice.grandTotal, settings.currency)}</span>
              </div>

              <div className="flex justify-between text-slate-700">
                <span>Paid Amount:</span>
                <span className="font-bold text-emerald-600">{formatCurrency(invoice.paidAmount, settings.currency)}</span>
              </div>

              <div className="flex justify-between font-black text-sm border-t border-dashed border-slate-300 pt-1.5 text-rose-700">
                <span>Balance Due:</span>
                <span>{formatCurrency(invoice.remaining, settings.currency)}</span>
              </div>
            </div>
          </div>

          {/* Signatures */}
          <div className="mt-14 pt-6 border-t border-slate-200 flex justify-between items-end text-xs text-slate-400">
            <div>
              <p>Generated via Gloves Factory ERP - Auto System</p>
              <p className="text-[10px]">Industrial Leather Goods Sialkot</p>
            </div>
            <div className="text-center">
              <div className="w-48 border-b border-slate-400 pb-1 mb-1 font-semibold text-slate-700">
                Authorized Factory Signatory
              </div>
              <p className="text-[10px]">For {settings.factoryName}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
