import React from 'react';
import { LayoutDashboard, FileText, Scissors, Boxes, BookOpen, Menu } from 'lucide-react';
import { useFactory } from '../../context/FactoryContext';
import { FactoryModule } from '../../types/factory';

interface MobileBottomNavProps {
  onOpenMobileMenu: () => void;
}

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({ onOpenMobileMenu }) => {
  const { activeModule, setActiveModule, cuttings, orders } = useFactory();

  const pendingCuttingsCount = cuttings.filter(c => c.status === 'Given').length;
  const activeOrdersCount = orders.filter(o => o.status !== 'Completed').length;

  const items: {
    id: FactoryModule | 'menu';
    labelEn: string;
    icon: React.FC<{ className?: string }>;
    badge?: number;
  }[] = [
    { id: 'dashboard', labelEn: 'Dashboard', icon: LayoutDashboard },
    { id: 'orders', labelEn: 'Orders', icon: FileText, badge: activeOrdersCount > 0 ? activeOrdersCount : undefined },
    { id: 'cuttings', labelEn: 'Cutting', icon: Scissors, badge: pendingCuttingsCount > 0 ? pendingCuttingsCount : undefined },
    { id: 'stock', labelEn: 'Stock', icon: Boxes },
    { id: 'khata', labelEn: 'Ledger', icon: BookOpen },
    { id: 'menu', labelEn: 'Menu', icon: Menu }
  ];

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200 px-2 py-1.5 flex items-center justify-around lg:hidden shadow-xl">
      {items.map(item => {
        const Icon = item.icon;
        const isActive = activeModule === item.id;

        return (
          <button
            key={item.id}
            onClick={() => {
              if (item.id === 'menu') {
                onOpenMobileMenu();
              } else {
                setActiveModule(item.id);
              }
            }}
            className={`relative flex flex-col items-center justify-center py-1 px-2.5 rounded-xl transition ${
              isActive 
                ? 'text-blue-600 font-bold' 
                : 'text-slate-500 font-medium hover:text-slate-800'
            }`}
          >
            <div className="relative">
              <Icon className={`w-5 h-5 transition-transform ${isActive ? 'text-blue-600 scale-110' : 'text-slate-400'}`} />
              {item.badge !== undefined && (
                <span className="absolute -top-1.5 -right-2 bg-rose-500 text-white text-[9px] font-black w-4 h-4 rounded-full flex items-center justify-center ring-2 ring-white">
                  {item.badge > 9 ? '9+' : item.badge}
                </span>
              )}
            </div>
            <span className="text-[10px] mt-0.5 tracking-tight">{item.labelEn}</span>
          </button>
        );
      })}
    </div>
  );
};
