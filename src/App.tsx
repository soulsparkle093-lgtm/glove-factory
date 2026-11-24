/**
 * Gloves Factory ERP - Auto System
 * Integrated Leather Gloves Manufacturing ERP
 * React + Vite + Firebase Firestore + Tailwind CSS
 */
import React, { useState } from 'react';
import { FactoryProvider, useFactory } from './context/FactoryContext';
import { FactorySidebar } from './components/layout/FactorySidebar';
import { FactoryHeader } from './components/layout/FactoryHeader';
import { MobileBottomNav } from './components/layout/MobileBottomNav';
import { ToastContainer } from './components/common/ToastContainer';

// Pages
import { DashboardPage } from './pages/DashboardPage';
import { OrdersPage } from './pages/OrdersPage';
import { CuttingsPage } from './pages/CuttingsPage';
import { StitchingPage } from './pages/StitchingPage';
import { StockPage } from './pages/StockPage';
import { StockManagementPage } from './pages/StockManagementPage';
import { SalesPage } from './pages/SalesPage';
import { PurchasePage } from './pages/PurchasePage';
import { KhataPage } from './pages/KhataPage';
import { StaffPage } from './pages/StaffPage';
import { ExpensePage } from './pages/ExpensePage';
import { CashbookPage } from './pages/CashbookPage';
import { ReportsPage } from './pages/ReportsPage';
import { SettingsPage } from './pages/SettingsPage';

// Modals
import { CreateOrderModal } from './components/orders/CreateOrderModal';
import { CreateCuttingModal } from './components/cuttings/CreateCuttingModal';
import { CreateSaleInvoiceModal } from './components/sales/CreateSaleInvoiceModal';
import { PrintInvoiceModal } from './components/sales/PrintInvoiceModal';

const FactoryAppContent: React.FC = () => {
  const { 
    activeModule, 
    setActiveModule, 
    selectedInvoiceId,
    setSelectedInvoiceId,
    selectedCompanyName,
    invoices
  } = useFactory();

  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isOrderModalOpen, setIsOrderModalOpen] = useState(false);
  const [orderToEdit, setOrderToEdit] = useState<any>(null);
  const [orderModalInitialCustomer, setOrderModalInitialCustomer] = useState<string | undefined>(undefined);
  
  // Cutting modal state
  const [isCuttingModalOpen, setIsCuttingModalOpen] = useState(false);
  const [cuttingOrderId, setCuttingOrderId] = useState<string | null>(null);
  const [cuttingOrderItemId, setCuttingOrderItemId] = useState<string | null>(null);

  // Invoice modal state
  const [isInvoiceModalOpen, setIsInvoiceModalOpen] = useState(false);
  const [invoiceOrderId, setInvoiceOrderId] = useState<string | null>(null);

  // Active print invoice
  const invoiceForPrint = invoices.find(i => i.id === selectedInvoiceId);

  const handleOpenNewOrder = (initialCustomer?: string) => {
    setOrderToEdit(null);
    setOrderModalInitialCustomer(typeof initialCustomer === 'string' ? initialCustomer : undefined);
    setIsOrderModalOpen(true);
  };

  const handleEditOrder = (order: any) => {
    setOrderToEdit(order);
    setIsOrderModalOpen(true);
  };

  const handleOpenCutting = (orderId?: string, orderItemId?: string) => {
    setCuttingOrderId(orderId || null);
    setCuttingOrderItemId(orderItemId || null);
    setIsCuttingModalOpen(true);
  };

  const handleOpenSaleInvoice = (orderId?: string) => {
    setInvoiceOrderId(orderId || null);
    setIsInvoiceModalOpen(true);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans text-slate-800 antialiased selection:bg-blue-100 selection:text-blue-900">
      {/* Sidebar Navigation */}
      <FactorySidebar 
        isOpen={isSidebarOpen} 
        onClose={() => setIsSidebarOpen(false)} 
      />

      {/* Main Content Area */}
      <div className="lg:pl-72 flex flex-col flex-1 pb-16 lg:pb-0">
        <FactoryHeader
          onOpenMobileMenu={() => setIsSidebarOpen(true)}
          onOpenNewOrder={handleOpenNewOrder}
          onOpenNewCutting={() => handleOpenCutting()}
          onOpenNewStitching={() => window.dispatchEvent(new Event('factory:open-stitching-order'))}
        />

        <main className="flex-1 p-4 sm:p-6 lg:p-8">
          {activeModule === 'dashboard' && (
            <DashboardPage
              onOpenNewOrder={handleOpenNewOrder}
              onOpenNewCutting={() => handleOpenCutting()}
              onOpenSaleModal={() => handleOpenSaleInvoice()}
            />
          )}

          {(activeModule === 'orders' || activeModule === 'order_companies' || activeModule === 'company_detail' || activeModule === 'order_detail') && (
            <OrdersPage
              initialCompanyName={activeModule === 'company_detail' ? (selectedCompanyName || undefined) : undefined}
              onOpenCreateOrder={handleOpenNewOrder}
              onEditOrder={handleEditOrder}
              onOpenCuttingForOrder={(orderId, itemId) => handleOpenCutting(orderId, itemId)}
              onOpenInvoiceForOrder={(orderId) => handleOpenSaleInvoice(orderId)}
            />
          )}

          {activeModule === 'cuttings' && (
            <CuttingsPage
              onOpenCreateCutting={() => handleOpenCutting()}
            />
          )}

          {activeModule === 'stitching' && <StitchingPage />}

          {activeModule === 'stock' && <StockPage />}

          {activeModule === 'stock_management' && <StockManagementPage />}
          
          {activeModule === 'sales' && (
            <SalesPage
              onOpenCreateInvoice={() => handleOpenSaleInvoice()}
            />
          )}

          {activeModule === 'purchase' && <PurchasePage />}
          {activeModule === 'khata' && <KhataPage />}
          {activeModule === 'staff' && <StaffPage />}
          {activeModule === 'expense' && <ExpensePage />}
          {activeModule === 'cashbook' && <CashbookPage />}
          {activeModule === 'reports' && <ReportsPage />}
          {activeModule === 'settings' && <SettingsPage />}
        </main>
      </div>

      {/* Mobile Bottom Navigation */}
      <MobileBottomNav onOpenMobileMenu={() => setIsSidebarOpen(true)} />

      {/* Global Modals */}
      <CreateOrderModal
        isOpen={isOrderModalOpen}
        orderToEdit={orderToEdit}
        initialCustomerName={orderModalInitialCustomer}
        onClose={() => {
          setIsOrderModalOpen(false);
          setOrderToEdit(null);
          setOrderModalInitialCustomer(undefined);
        }}
        onOpenAddParty={() => {
          setIsOrderModalOpen(false);
          setOrderToEdit(null);
          setActiveModule('khata');
        }}
      />

      <CreateCuttingModal
        isOpen={isCuttingModalOpen}
        onClose={() => {
          setIsCuttingModalOpen(false);
          setCuttingOrderId(null);
          setCuttingOrderItemId(null);
        }}
        preselectedOrderId={cuttingOrderId}
        preselectedOrderItemId={cuttingOrderItemId}
      />

      <CreateSaleInvoiceModal
        isOpen={isInvoiceModalOpen}
        onClose={() => {
          setIsInvoiceModalOpen(false);
          setInvoiceOrderId(null);
        }}
        preselectedOrderId={invoiceOrderId}
      />

      {/* Printable Invoice Modal */}
      {invoiceForPrint && (
        <PrintInvoiceModal
          invoice={invoiceForPrint}
          onClose={() => setSelectedInvoiceId(null)}
        />
      )}

      {/* Real-time Notifications */}
      <ToastContainer />
    </div>
  );
};

export default function App() {
  return (
    <FactoryProvider>
      <FactoryAppContent />
    </FactoryProvider>
  );
}
