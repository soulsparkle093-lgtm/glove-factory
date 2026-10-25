import React from 'react';
import { 
  Menu, 
  Plus, 
  Scissors, 
  Boxes, 
  Receipt 
} from 'lucide-react';
import { useFactory } from '../../context/FactoryContext';

interface FactoryHeaderProps {
  onOpenMobileMenu: () => void;
  onOpenNewOrder: () => void;
  onOpenNewCutting: () => void;
  onOpenNewStitching: () => void;
}

export const FactoryHeader: React.FC<FactoryHeaderProps> = ({
  onOpenMobileMenu,
  onOpenNewOrder,
  onOpenNewCutting,
  onOpenNewStitching
}) => {
  const { activeModule, setActiveModule, settings } = useFactory();

  const getModuleTitle = () => {
    switch (activeModule) {
      case 'dashboard':
        return { en: 'Factory Dashboard', sub: 'Overview & Production Metrics' };
      case 'orders':
        return { en: 'Customer Orders', sub: 'Orders & Production Workflow' };
      case 'order_detail':
        return { en: 'Order Detail', sub: 'Live Stage Progress & History' };
      case 'cuttings':
        return { en: 'Cutting Management', sub: 'Factory Workers & Outside Contractors' };
      case 'stitching':
        return { en: 'Stitching Management', sub: 'Stitching Orders & Stitcher Khata' };
      case 'stock':
        return { en: 'Ready Stock', sub: 'Finished Gloves Inventory (Auto Log)' };
      case 'sales':
        return { en: 'Sale Invoices & Billing', sub: 'Customer Invoices & Dispatch' };
      case 'purchase':
        return { en: 'Leather & Material Purchases', sub: 'Raw Hides & Supplies' };
      case 'khata':
        return { en: 'Ledger Book', sub: 'Receivables & Payables' };
      case 'staff':
        return { en: 'Factory Staff & Cutters', sub: 'Piece-rate Wages & Attendance' };
      case 'expense':
        return { en: 'Factory Expenses', sub: 'Operational Overheads' };
      case 'cashbook':
        return { en: 'Cashbook Register', sub: 'Daily Cash In & Out' };
      case 'reports':
        return { en: 'Reports & Analytics', sub: 'P&L, Production & Stock Valuation' };
      case 'settings':
        return { en: 'System Settings', sub: 'Factory Profile & Preferences' };
      default:
        return { en: 'Gloves Factory ERP', sub: 'Industrial System' };
    }
  };

  const title = getModuleTitle();

  return (
    <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-200">
      <div className="px-4 sm:px-6 lg:px-8 h-18 flex items-center justify-between gap-4">
        {/* Left: Mobile Toggle & Page Title */}
        <div className="flex items-center gap-3">
          <button
            onClick={onOpenMobileMenu}
            className="lg:hidden p-2 rounded-xl text-slate-600 hover:text-slate-900 hover:bg-slate-100"
            aria-label="Toggle Navigation"
          >
            <Menu className="w-5 h-5" />
          </button>

          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base sm:text-lg font-black text-slate-900 tracking-tight">
                {title.en}
              </h2>
              <span className="text-xs font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-100 hidden sm:inline-block">
                {title.sub}
              </span>
            </div>
            <p className="text-[11px] text-slate-500 font-medium">
              Leather Gloves Manufacturing ERP System
            </p>
          </div>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-2 sm:gap-3">

          {/* Quick assign work to the selected production module. */}
          <button
            onClick={activeModule === 'stitching' ? onOpenNewStitching : onOpenNewCutting}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-600 text-white shadow-sm transition active:scale-95"
            title={activeModule === 'stitching' ? 'Give Stitching to a Stitcher' : 'Give Cutting to Worker or Outside Maker'}
          >
            <Scissors className="w-3.5 h-3.5" />
            <span>{activeModule === 'stitching' ? '+ Give Stitching' : '+ Give Cutting'}</span>
          </button>

          {/* Primary Quick New Order */}
          <button
            onClick={onOpenNewOrder}
            className="inline-flex items-center gap-1.5 px-3.5 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-500/25 transition active:scale-95"
            title="Create Customer Order"
          >
            <Plus className="w-4 h-4" />
            <span>+ New Order</span>
          </button>
        </div>
      </div>
    </header>
  );
};
