import React from 'react';
import { 
  LayoutDashboard, 
  FileText, 
  Scissors, 
  Boxes, 
  Receipt, 
  ShoppingBag, 
  BookOpen, 
  Users, 
  TrendingDown, 
  Wallet, 
  BarChart3, 
  Settings, 
  X,
  ShieldCheck,
  PackageCheck,
  AlertTriangle,
  Shirt
} from 'lucide-react';
import { useFactory } from '../../context/FactoryContext';
import { FactoryModule } from '../../types/factory';

interface FactorySidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export const FactorySidebar: React.FC<FactorySidebarProps> = ({ isOpen, onClose }) => {
  const { activeModule, setActiveModule, orders, cuttings, products, settings } = useFactory();

  const activeOrdersCount = orders.filter(o => o.status !== 'Completed').length;
  const pendingCuttingsCount = cuttings.filter(c => c.status === 'Given').length;
  const lowStockCount = products.filter(p => p.currentStock <= p.lowStockLimit).length;

  const navItems: {
    id: FactoryModule;
    labelEn: string;
    description: string;
    icon: React.FC<{ className?: string }>;
    badge?: number;
    badgeColor?: string;
  }[] = [
    { id: 'dashboard', labelEn: 'Dashboard', description: 'Overview & Analytics', icon: LayoutDashboard },
    { id: 'orders', labelEn: 'Customer Orders', description: 'Orders & Production', icon: FileText, badge: activeOrdersCount > 0 ? activeOrdersCount : undefined, badgeColor: 'bg-blue-600' },
    { id: 'cuttings', labelEn: 'Cutting Management', description: 'Worker & Contractor Cutting', icon: Scissors, badge: pendingCuttingsCount > 0 ? pendingCuttingsCount : undefined, badgeColor: 'bg-amber-500' },
    { id: 'stitching', labelEn: 'Stitching Management', description: 'Stitching Orders & Stitcher Khata', icon: Shirt, badge: undefined },
    { id: 'stock', labelEn: 'Finished Goods Stock', description: 'Auto Stock Calculation', icon: Boxes, badge: lowStockCount > 0 ? lowStockCount : undefined, badgeColor: 'bg-rose-500' },
    { id: 'sales', labelEn: 'Sale Invoices', description: 'Customer Bills & Dispatch', icon: Receipt },
    { id: 'purchase', labelEn: 'Leather Purchase', description: 'Raw Leather & Materials', icon: ShoppingBag },
    { id: 'khata', labelEn: 'Ledger Book', description: 'Accounts & Statements', icon: BookOpen },
    { id: 'staff', labelEn: 'Factory Staff', description: 'Cutters, Wages & Attendance', icon: Users },
    { id: 'expense', labelEn: 'Factory Expenses', description: 'Daily Factory Overheads', icon: TrendingDown },
    { id: 'cashbook', labelEn: 'Cashbook Register', description: 'Cash In / Cash Out', icon: Wallet },
    { id: 'reports', labelEn: 'Reports & Analytics', description: 'P&L, Costs & Stock Valuation', icon: BarChart3 },
    { id: 'settings', labelEn: 'System Settings', description: 'Company Profile & Preferences', icon: Settings }
  ];

  const handleNav = (mod: FactoryModule) => {
    setActiveModule(mod);
    onClose();
  };

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpen && (
        <div 
          onClick={onClose} 
          className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-40 lg:hidden transition-opacity"
        />
      )}

      {/* Sidebar container */}
      <aside 
        className={`fixed top-0 bottom-0 left-0 z-50 w-72 bg-white border-r border-slate-200 flex flex-col transition-transform duration-300 ease-in-out lg:translate-x-0 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Brand Header */}
        <div className="h-18 px-5 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-blue-700 via-blue-800 to-indigo-900 text-white">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center font-bold text-white shadow-inner backdrop-blur-xs">
              <ShieldCheck className="w-6 h-6 text-blue-200" />
            </div>
            <div>
              <h1 className="font-bold text-sm tracking-tight text-white leading-tight">
                Glove Factory ERP - Updated
              </h1>
              <p className="text-[11px] font-medium text-blue-200 tracking-wide">
                Auto Manufacturing System
              </p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="lg:hidden p-1.5 rounded-lg text-blue-200 hover:bg-white/10"
            aria-label="Close Sidebar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Factory Quick Header Bar */}
        <div className="px-4 py-2.5 bg-blue-50/70 border-b border-blue-100 flex items-center justify-between text-xs">
          <span className="font-bold text-blue-950 truncate">{settings.factoryName}</span>
          <span className="text-[10px] bg-blue-200/80 text-blue-900 px-2 py-0.5 rounded-full font-bold">
            Sialkot
          </span>
        </div>

        {/* Navigation items */}
        <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-1">
          {navItems.map(item => {
            const Icon = item.icon;
            const isActive = activeModule === item.id;
            return (
              <button
                key={item.id}
                onClick={() => handleNav(item.id)}
                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl font-medium text-xs sm:text-sm transition-all duration-150 ${
                  isActive
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-500/25 font-bold'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <div className="flex items-center gap-3 truncate">
                  <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-white' : 'text-slate-500'}`} />
                  <div className="text-left truncate">
                    <span className="block leading-tight">{item.labelEn}</span>
                    <span className={`text-[10px] block ${isActive ? 'text-blue-100 font-normal' : 'text-slate-400'}`}>
                      {item.description}
                    </span>
                  </div>
                </div>

                {item.badge !== undefined && (
                  <span
                    className={`text-[11px] px-2 py-0.5 rounded-full font-bold shrink-0 ${
                      isActive 
                        ? 'bg-white text-blue-700' 
                        : item.badgeColor ? `${item.badgeColor} text-white` : 'bg-slate-200 text-slate-800'
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Quick System Status Card at Footer */}
        <div className="p-3 border-t border-slate-200 bg-slate-50/90 text-xs space-y-2">
          <div className="flex items-center justify-between text-[11px] text-slate-500">
            <span>Auto System Status</span>
            <span className="text-emerald-700 font-bold flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              Real-time Active
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2 text-center">
            <div className="p-2 rounded-lg bg-amber-50 border border-amber-200">
              <span className="text-[10px] text-amber-800 font-semibold block">Pending Cutting</span>
              <span className="text-xs font-black text-amber-900">{pendingCuttingsCount} Batches</span>
            </div>
            <div className="p-2 rounded-lg bg-blue-50 border border-blue-200">
              <span className="text-[10px] text-blue-800 font-semibold block">Active Orders</span>
              <span className="text-xs font-black text-blue-900">{activeOrdersCount} Orders</span>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
};
