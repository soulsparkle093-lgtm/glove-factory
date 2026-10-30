import React, { createContext, useContext, useState, useEffect } from 'react';
import { 
  Party, 
  Staff, 
  Product, 
  CustomerOrder, 
  Cutting, 
  StockLedgerEntry, 
  SaleInvoice, 
  PartyTransaction, 
  StaffLedgerEntry, 
  Purchase, 
  RawMaterialStock, 
  Expense, 
  CashbookEntry, 
  StaffAttendance, 
  FactoryModule,
  OrderItem,
  CuttingType,
  Cutter,
  CuttingTransaction,
  CuttingEntry,
  OrderDispatchHistory,
  CutterCategory,
  SizeMatrix,
  Stitcher,
  StitchingOrder,
  StitcherKhataTransaction,
  StitchingOrderStatus,
  StitchingHistoryEntry,
  ArticleStockItem,
  DeliveryHistoryEntry,
  FactoryStockItem,
  FactoryArticleMaster
} from '../types/factory';
import { 
  defaultFactorySettings, 
  FactorySettings, 
  GLOVE_TEMPLATE_PRESETS 
} from '../data/initialFactoryData';
import { 
  db, 
  isFirebaseOnline, 
  collection, 
  doc, 
  getDocs, 
  setDoc, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  onSnapshot,
  writeBatch,
  serverTimestamp,
  runTransaction,
  increment,
  arrayUnion
} from '../firebase';

const STORAGE_KEYS = {
  PARTIES: 'gferp_parties_v2',
  STAFF: 'gferp_staff_v2',
  PRODUCTS: 'gferp_products_v2',
  ORDERS: 'gferp_orders_v2',
  CUTTINGS: 'gferp_cuttings_v2',
  STOCK_LEDGER: 'gferp_stock_ledger_v2',
  INVOICES: 'gferp_invoices_v2',
  PARTY_TXS: 'gferp_party_txs_v2',
  STAFF_LEDGER: 'gferp_staff_ledger_v2',
  PURCHASES: 'gferp_purchases_v2',
  RAW_MATERIALS: 'gferp_raw_materials_v2',
  EXPENSES: 'gferp_expenses_v2',
  CASHBOOK: 'gferp_cashbook_v2',
  ATTENDANCE: 'gferp_attendance_v2',
  SETTINGS: 'gferp_settings_v2',
  CUTTERS: 'gferp_cutters_v3',
  CUTTING_TXS: 'gferp_cutting_txs_v3',
  STITCHERS: 'gferp_stitchers_v1',
  STITCHING_ORDERS: 'gferp_stitching_orders_v1',
  STITCHER_KHATA: 'gferp_stitcher_khata_v1',
  STITCHING_HISTORY: 'gferp_stitching_history_v1',
  ORDER_HISTORY: 'gferp_order_dispatch_history_v3'
};

function loadLocal<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch (e) {
    console.error(`Error reading ${key}:`, e);
    return fallback;
  }
}

function saveLocal<T>(key: string, val: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(val));
  } catch (e) {
    console.error(`Error saving ${key}:`, e);
  }
}

const normalizeStockDocumentId = (value: string): string =>
  value.trim().toLocaleLowerCase().replace(/[\\/]/g, '-');

interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'info';
  message: string;
}

interface FactoryContextType {
  activeModule: FactoryModule;
  setActiveModule: (m: FactoryModule) => void;
  selectedOrderId: string | null;
  setSelectedOrderId: (id: string | null) => void;
  selectedInvoiceId: string | null;
  setSelectedInvoiceId: (id: string | null) => void;

  // Collections
  parties: Party[];
  staff: Staff[];
  products: Product[];
  orders: CustomerOrder[];
  cuttings: Cutting[];
  cutters: Cutter[];
  stitchers: Stitcher[];
  stitchingOrders: StitchingOrder[];
  stitcherKhataTransactions: StitcherKhataTransaction[];
  stitchingHistory: StitchingHistoryEntry[];
  cuttingTransactions: CuttingTransaction[];
  cuttingEntries: CuttingEntry[];
  orderDispatchHistory: OrderDispatchHistory[];
  stockLedger: StockLedgerEntry[];
  stockManagement: FactoryStockItem[];
  articleStock: ArticleStockItem[];
  deliveryHistory: DeliveryHistoryEntry[];
  articlesMaster: FactoryArticleMaster[];
  invoices: SaleInvoice[];
  partyTransactions: PartyTransaction[];
  staffLedger: StaffLedgerEntry[];
  purchases: Purchase[];
  rawMaterials: RawMaterialStock[];
  expenses: Expense[];
  cashbook: CashbookEntry[];
  attendance: StaffAttendance[];
  settings: FactorySettings;

  // Notification Toast
  toasts: ToastMessage[];
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
  removeToast: (id: string) => void;

  // Cutting Module & Dual-Entry Batched Operations
  addCutter: (data: { name: string; khataName?: string; phone?: string; perPairRate?: number; cutterType: CutterCategory }) => Promise<Cutter>;
  updateCutter: (id: string, updates: Pick<Cutter, 'name' | 'khataName' | 'phone' | 'perPairRate'>) => Promise<void>;
  setCutterActive: (id: string, isActive: boolean) => Promise<void>;
  deleteCutter: (id: string, deleteLedgerData?: boolean) => Promise<void>;
  saveCuttingTransaction: (data: {
    cutterId: string;
    cutterName: string;
    cutterType: CutterCategory;
    type: 'GIVE' | 'RECEIVE';
    date: string;
    qty: number;
    totalQty?: number;
    rate?: number;
    article: string;
    articleTitle?: string;
    orderId?: string;
    orderNo?: string;
    customerName?: string;
    size?: string;
    sizeName?: string;
    average?: string;
    remarks?: string;
    totalBalance?: number;
    customerOrder?: string;
    sizes?: SizeMatrix;
    billNo?: string;
    factoryName?: string;
    addToStock?: boolean;
    notes?: string;
  }) => Promise<CuttingTransaction>;
  deleteCuttingTransaction: (id: string) => Promise<void>;
  updateCuttingEntry: (id: string, updates: Pick<CuttingEntry, 'date' | 'customerName' | 'article' | 'size' | 'average' | 'remarks' | 'pairs' | 'rate' | 'billNo'>) => Promise<void>;
  deleteCuttingEntry: (id: string) => Promise<void>;
  updateCuttingReturn: (id: string, updates: Pick<CuttingEntry, 'date' | 'remarks' | 'pairs' | 'rate'>) => Promise<void>;
  deleteCuttingReturn: (id: string) => Promise<void>;
  clearCuttingData: () => Promise<void>;
  returnCutting: (data: {
    originalEntryId: string;
    quantity: number;
    reason: 'Damaged' | 'Wrong Size' | 'Quality';
    date: string;
  }) => Promise<CuttingEntry>;
  createArticleMaster: (data: Omit<FactoryArticleMaster, 'id' | 'createdAt'>) => Promise<FactoryArticleMaster>;
  deliverFromStock: (data: { stockId: string; orderId: string; customerName: string; quantity: number; date: string }) => Promise<void>;
  addStockReceipt: (data: { article: string; size: string; quantity: number; date: string; totalBalance?: number; source?: string }) => Promise<void>;
  deleteFactoryStock: (id: string) => Promise<void>;
  updateStockDelivery: (id: string, updates: Pick<DeliveryHistoryEntry, 'date' | 'quantity' | 'customerName'>) => Promise<void>;
  deleteStockDelivery: (id: string) => Promise<void>;

  // Stitching orders and stitcher khata
  addStitcher: (data: { name: string; phone?: string; city?: string; perPairRate?: number; stitcherType?: Stitcher['stitcherType']; isActive?: boolean }) => Promise<Stitcher>;
  updateStitcher: (id: string, updates: { name: string; phone?: string; city?: string; perPairRate?: number; stitcherType?: Stitcher['stitcherType']; isActive?: boolean }) => Promise<void>;
  deleteStitcher: (id: string) => Promise<void>;
  createStitchingOrder: (data: Omit<StitchingOrder, 'id' | 'createdAt' | 'updatedAt'>) => Promise<StitchingOrder>;
  updateStitchingOrderStatus: (id: string, status: StitchingOrderStatus) => Promise<void>;
  receiveStitchingOrder: (data: {
    stitchingOrderId: string;
    date: string;
    receivedQuantity: number;
    lossQuantity: number;
    remarks?: string;
  }) => Promise<void>;
  updateStitchingHistoryEntry: (id: string, updates: Pick<StitchingHistoryEntry, 'date' | 'quantity' | 'rate' | 'article' | 'remarks'>) => Promise<void>;
  deleteStitchingHistoryEntry: (id: string) => Promise<void>;
  addStitcherKhataPayment: (data: {
    stitcherId: string;
    stitchingOrderId?: string;
    type: 'ADVANCE' | 'PAYMENT_RETURN';
    date: string;
    amount: number;
    description: string;
  }) => Promise<StitcherKhataTransaction>;
  updateStitcherKhataPayment: (id: string, updates: Pick<StitcherKhataTransaction, 'type' | 'date' | 'amount' | 'description'>) => Promise<void>;
  deleteStitcherKhataPayment: (id: string) => Promise<void>;

  // Actions & Auto Logic
  addParty: (data: Omit<Party, 'id' | 'createdAt' | 'updatedAt' | 'currentBalance'>) => Party;
  updateParty: (id: string, updates: Partial<Party>) => void;
  deleteParty: (id: string) => void;

  addStaff: (data: Omit<Staff, 'id' | 'createdAt' | 'currentBalance'>) => Staff;
  updateStaff: (id: string, updates: Partial<Staff>) => void;
  deleteStaff: (id: string) => void;
  payStaffWage: (staffId: string, amount: number, paymentMode: 'cash' | 'bank', note?: string) => void;

  addProduct: (data: Omit<Product, 'id' | 'createdAt' | 'currentStock'>) => Product;
  updateProduct: (id: string, updates: Partial<Product>) => void;
  deleteProduct: (id: string) => void;
  loadFactoryPresets: () => void;

  // 1. MAIN: Customer Orders
  createCustomerOrder: (orderData: {
    customerId?: string;
    customerName: string;
    customerPhone?: string;
    orderDate: string;
    deliveryDate: string;
    items: Array<{
      id?: string;
      productId?: string;
      title: string;
      gloveType?: string;
      color?: string;
      leatherType?: string;
      sizes: { small: number; medium: number; large: number; xl: number; xxl: number };
      totalPairs: number;
      qty?: number;
      rate?: number;
    }>;
    notes?: string;
    createdBy?: string;
  }) => Promise<CustomerOrder>;
  updateCustomerOrder: (
    orderId: string,
    orderData: {
      customerName: string;
      customerPhone?: string;
      orderDate: string;
      deliveryDate: string;
      items: Array<{
        id?: string;
        title: string;
        color?: string;
        sizes: { small: number; medium: number; large: number; xl: number; xxl: number };
        totalPairs: number;
      }>;
      notes?: string;
      status?: CustomerOrder['status'];
    }
  ) => Promise<void>;
  updateOrderStatus: (orderId: string, status: CustomerOrder['status']) => void;
  deleteCustomerOrder: (orderId: string) => Promise<void>;

  // 2. CRITICAL AUTO LOGIC: Cuttings (Cutting Man vs Cutter Maker)
  createCutting: (data: {
    orderId: string;
    orderItemId: string;
    cuttingType: CuttingType;
    personId: string;
    qty: number;
    rate: number;
    date: string;
    notes?: string;
  }) => Cutting;
  receiveCutting: (cuttingId: string) => void; // AUTO: creates stock_ledger in, stockReceivedQty += qty, updates order status
  deleteCutting: (cuttingId: string) => void;

  // 3. Critical sales invoice logic: automatic stock deduction and customer ledger updates
  createSaleInvoice: (invoiceData: {
    orderId: string;
    customerId: string;
    customerName: string;
    date: string;
    items: Array<{
      productId: string;
      gloveType: string;
      size: string;
      color: string;
      qty: number;
      rate: number;
    }>;
    discount: number;
    paidAmount: number;
    paymentMode: 'cash' | 'bank' | 'credit';
    notes?: string;
  }) => SaleInvoice;
  deleteSaleInvoice: (invoiceId: string) => void;

  // 4. Raw Material Purchase (Leather Buying)
  createPurchase: (data: {
    supplierId: string;
    supplierName: string;
    date: string;
    material: string;
    qty: number;
    unit: string;
    rate: number;
    paid: number;
    paymentMode: 'cash' | 'bank' | 'credit';
    notes?: string;
  }) => Purchase;

  // 5. Expenses & Cashbook
  addExpense: (data: Omit<Expense, 'id' | 'createdAt'>) => Expense;
  deleteExpense: (id: string) => void;
  addCashbookEntry: (data: Omit<CashbookEntry, 'id' | 'createdAt'>) => CashbookEntry;
  deleteCashbookEntry: (id: string) => void;

  // 6. Staff Attendance
  markAttendance: (record: Omit<StaffAttendance, 'id'>) => void;

  // Settings
  updateSettings: (newSettings: Partial<FactorySettings>) => void;
  clearAllFactoryData: () => void;
}

const FactoryContext = createContext<FactoryContextType | undefined>(undefined);

export const FactoryProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [activeModule, setActiveModule] = useState<FactoryModule>(() =>
    typeof window !== 'undefined' && window.location.pathname.startsWith('/stitching')
      ? 'stitching'
      : 'dashboard'
  );
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);

  const [parties, setParties] = useState<Party[]>(() => loadLocal(STORAGE_KEYS.PARTIES, []));
  const [staff, setStaff] = useState<Staff[]>(() => loadLocal(STORAGE_KEYS.STAFF, []));
  const [products, setProducts] = useState<Product[]>(() => loadLocal(STORAGE_KEYS.PRODUCTS, []));
  const [orders, setOrders] = useState<CustomerOrder[]>(() => loadLocal(STORAGE_KEYS.ORDERS, []));
  const [cuttings, setCuttings] = useState<Cutting[]>(() => loadLocal(STORAGE_KEYS.CUTTINGS, []));
  const [cutters, setCutters] = useState<Cutter[]>(() => {
    const local = loadLocal<Cutter[]>(STORAGE_KEYS.CUTTERS, []);
    return local.filter(c => !['cutter-1', 'cutter-2', 'cutter-3', 'cutter-4', 'cutter-5', 'cutter-6', 'cutter-7'].includes(c.id));
  });
  const [cuttingTransactions, setCuttingTransactions] = useState<CuttingTransaction[]>(() => loadLocal(STORAGE_KEYS.CUTTING_TXS, []));
  const [cuttingEntries, setCuttingEntries] = useState<CuttingEntry[]>([]);
  const [stitchers, setStitchers] = useState<Stitcher[]>(() => loadLocal(STORAGE_KEYS.STITCHERS, []));
  const [stitchingOrders, setStitchingOrders] = useState<StitchingOrder[]>(() => loadLocal(STORAGE_KEYS.STITCHING_ORDERS, []));
  const [stitcherKhataTransactions, setStitcherKhataTransactions] = useState<StitcherKhataTransaction[]>(() => loadLocal(STORAGE_KEYS.STITCHER_KHATA, []));
  const [stitchingHistory, setStitchingHistory] = useState<StitchingHistoryEntry[]>(() => loadLocal(STORAGE_KEYS.STITCHING_HISTORY, []));
  const [orderDispatchHistory, setOrderDispatchHistory] = useState<OrderDispatchHistory[]>(() => loadLocal(STORAGE_KEYS.ORDER_HISTORY, []));
  const [stockLedger, setStockLedger] = useState<StockLedgerEntry[]>(() => loadLocal(STORAGE_KEYS.STOCK_LEDGER, []));
  const [stockManagement, setStockManagement] = useState<FactoryStockItem[]>([]);
  const [articleStock, setArticleStock] = useState<ArticleStockItem[]>([]);
  const [deliveryHistory, setDeliveryHistory] = useState<DeliveryHistoryEntry[]>([]);
  const [articlesMaster, setArticlesMaster] = useState<FactoryArticleMaster[]>([]);
  const [articleCatalog, setArticleCatalog] = useState<FactoryArticleMaster[]>([]);
  const [legacyArticleMaster, setLegacyArticleMaster] = useState<FactoryArticleMaster[]>([]);
  const [invoices, setInvoices] = useState<SaleInvoice[]>(() => loadLocal(STORAGE_KEYS.INVOICES, []));
  const [partyTransactions, setPartyTransactions] = useState<PartyTransaction[]>(() => loadLocal(STORAGE_KEYS.PARTY_TXS, []));
  const [staffLedger, setStaffLedger] = useState<StaffLedgerEntry[]>(() => loadLocal(STORAGE_KEYS.STAFF_LEDGER, []));
  const [purchases, setPurchases] = useState<Purchase[]>(() => loadLocal(STORAGE_KEYS.PURCHASES, []));
  const [rawMaterials, setRawMaterials] = useState<RawMaterialStock[]>(() => loadLocal(STORAGE_KEYS.RAW_MATERIALS, []));
  const [expenses, setExpenses] = useState<Expense[]>(() => loadLocal(STORAGE_KEYS.EXPENSES, []));
  const [cashbook, setCashbook] = useState<CashbookEntry[]>(() => loadLocal(STORAGE_KEYS.CASHBOOK, []));
  const [attendance, setAttendance] = useState<StaffAttendance[]>(() => loadLocal(STORAGE_KEYS.ATTENDANCE, []));
  const [settings, setSettings] = useState<FactorySettings>(() => loadLocal(STORAGE_KEYS.SETTINGS, defaultFactorySettings));

  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    const id = Date.now().toString() + Math.random().toString(36).substring(2, 5);
    setToasts(prev => [...prev, { id, type, message }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4500);
  };

  const removeToast = (id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  // Helper to sync to Firestore if online
  const syncFirestoreDoc = async (colName: string, id: string, data: any) => {
    if (!isFirebaseOnline || !db) return;
    try {
      await setDoc(doc(db, colName, id), data, { merge: true });
    } catch (e) {
      console.warn(`Firestore sync note (${colName}):`, e);
    }
  };

  // Real-time Firestore snapshot listeners for live multi-device sync
  useEffect(() => {
    if (!isFirebaseOnline || !db) return;

    const unsubs: (() => void)[] = [];
    try {
      // 1. customer_orders: Live sync across Mobile & Laptop
      unsubs.push(onSnapshot(collection(db, 'customer_orders'), snap => {
        const list = snap.docs.map(d => {
          const data = d.data();
          const items = (data.items || []).map((itm: any, idx: number) => {
            const sizes = itm.sizes || {
              small: 0,
              medium: 0,
              large: itm.qty || 0,
              xl: 0,
              xxl: 0
            };
            const totalPairs = Number(itm.totalPairs) || Number(itm.qty) || (
              (Number(sizes.small) || 0) + 
              (Number(sizes.medium) || 0) + 
              (Number(sizes.large) || 0) + 
              (Number(sizes.xl) || 0) + 
              (Number(sizes.xxl) || 0)
            );
            const originalQty = Number(itm.originalQty) || totalPairs;
            return {
              id: itm.id || `item-${idx + 1}`,
              title: itm.title || itm.gloveType || 'Custom Glove',
              gloveType: itm.gloveType || itm.title || 'Custom Glove',
              color: itm.color || '',
              sizes: {
                small: Number(sizes.small) || 0,
                medium: Number(sizes.medium) || 0,
                large: Number(sizes.large) || 0,
                xl: Number(sizes.xl) || 0,
                xxl: Number(sizes.xxl) || 0
              },
              totalPairs,
              originalQty, // IMMUTABLE: Never subtracted
              qty: totalPairs,
              cuttingGivenQty: Number(itm.cuttingGivenQty) || 0,
              stockReceivedQty: Number(itm.stockReceivedQty) || 0,
              billedQty: Number(itm.billedQty) || 0,
              pendingQty: itm.pendingQty ?? Math.max(0, totalPairs - (Number(itm.billedQty) || 0))
            };
          });

          const totalPairs = Number(data.totalPairs) || Number(data.totalQty) || items.reduce((s: number, i: any) => s + i.totalPairs, 0);
          const originalTotalPairs = Number(data.originalTotalPairs) || items.reduce((s: number, i: any) => s + (i.originalQty || i.totalPairs), 0) || totalPairs;

          return {
            ...data,
            id: d.id,
            orderNo: data.orderNo || `ORD-${d.id.slice(-4).toUpperCase()}`,
            customerName: data.customerName || 'Walk-in Customer',
            orderDate: data.orderDate || '',
            deliveryDate: data.deliveryDate || '',
            items,
            totalPairs,
            originalTotalPairs,
            totalQty: totalPairs,
            status: data.status || 'Pending',
            createdAt: data.createdAt || new Date().toISOString(),
            createdBy: data.createdBy || 'Factory Admin',
            notes: data.notes || ''
          } as CustomerOrder;
        });

        // Newest orders on top
        list.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
        setOrders(list);
        saveLocal(STORAGE_KEYS.ORDERS, list);
      }, err => {
        console.error('Firestore onSnapshot error (customer_orders):', err);
      }));

      // 2. parties
      unsubs.push(onSnapshot(collection(db, 'parties'), snap => {
        const list = snap.docs.map(d => ({ ...d.data(), id: d.id } as Party));
        setParties(list);
        saveLocal(STORAGE_KEYS.PARTIES, list);
      }, err => console.error('Firestore onSnapshot error (parties):', err)));

      // 3. products
      unsubs.push(onSnapshot(collection(db, 'products'), snap => {
        const list = snap.docs.map(d => ({ ...d.data(), id: d.id } as Product));
        setProducts(list);
        saveLocal(STORAGE_KEYS.PRODUCTS, list);
      }, err => console.error('Firestore onSnapshot error (products):', err)));

      // 4. cuttings
      unsubs.push(onSnapshot(collection(db, 'cuttings'), snap => {
        const list = snap.docs.map(d => ({ ...d.data(), id: d.id } as Cutting));
        setCuttings(list);
        saveLocal(STORAGE_KEYS.CUTTINGS, list);
      }, err => console.error('Firestore onSnapshot error (cuttings):', err)));

      // 5. cutters
      unsubs.push(onSnapshot(collection(db, 'cutters'), snap => {
        const list = snap.docs.map(d => {
          const data = d.data();
          return {
            ...data,
            id: d.id,
            isActive: data.isActive !== false,
            status: data.status || (data.isActive === false ? 'deactive' : 'active')
          } as Cutter;
        });
        const cleanList = list.filter(c => !['cutter-1', 'cutter-2', 'cutter-3', 'cutter-4', 'cutter-5', 'cutter-6', 'cutter-7'].includes(c.id));
        setCutters(cleanList);
        saveLocal(STORAGE_KEYS.CUTTERS, cleanList);
      }, err => console.error('Firestore onSnapshot error (cutters):', err)));

      unsubs.push(onSnapshot(collection(db, 'stitchers'), snap => {
        const list = snap.docs.map(d => ({ ...d.data(), id: d.id, isActive: d.data().isActive !== false } as Stitcher));
        setStitchers(list);
        saveLocal(STORAGE_KEYS.STITCHERS, list);
      }, err => console.error('Firestore onSnapshot error (stitchers):', err)));

      unsubs.push(onSnapshot(collection(db, 'stitching_orders'), snap => {
        const list = snap.docs.map(d => ({ ...d.data(), id: d.id } as StitchingOrder));
        list.sort((a, b) => (b.issueDate || b.createdAt || '').localeCompare(a.issueDate || a.createdAt || ''));
        setStitchingOrders(list);
        saveLocal(STORAGE_KEYS.STITCHING_ORDERS, list);
      }, err => console.error('Firestore onSnapshot error (stitching_orders):', err)));

      unsubs.push(onSnapshot(collection(db, 'stitching_history'), snap => {
        const list = snap.docs.flatMap(d => {
          const data = d.data();
          if (data.type !== 'ISSUE' && data.type !== 'RECEIVE' && data.type !== 'STATUS') return [];
          return [{ ...data, id: d.id } as StitchingHistoryEntry];
        });
        list.sort((a, b) => (b.date || b.createdAt || '').localeCompare(a.date || a.createdAt || ''));
        setStitchingHistory(list);
        saveLocal(STORAGE_KEYS.STITCHING_HISTORY, list);
      }, err => console.error('Firestore onSnapshot error (stitching_history):', err)));

      unsubs.push(onSnapshot(collection(db, 'stitcher_khata_transactions'), snap => {
        const list = snap.docs.map(d => ({ ...d.data(), id: d.id } as StitcherKhataTransaction));
        list.sort((a, b) => (b.date || b.createdAt || '').localeCompare(a.date || a.createdAt || ''));
        setStitcherKhataTransactions(list);
        saveLocal(STORAGE_KEYS.STITCHER_KHATA, list);
      }, err => console.error('Firestore onSnapshot error (stitcher_khata_transactions):', err)));

      // 6. cutting_transactions
      unsubs.push(onSnapshot(collection(db, 'cutting_transactions'), snap => {
        const list = snap.docs.map(d => ({ ...d.data(), id: d.id } as CuttingTransaction));
        list.sort((a, b) => (b.date || b.createdAt || '').localeCompare(a.date || a.createdAt || ''));
        setCuttingTransactions(list);
        saveLocal(STORAGE_KEYS.CUTTING_TXS, list);
      }, err => console.error('Firestore onSnapshot error (cutting_transactions):', err)));

      // 7. cuttingEntries: editable notebook ledger
      unsubs.push(onSnapshot(collection(db, 'cuttingEntries'), snap => {
        const list = snap.docs.map(d => {
          const data = d.data();
          const pairs = Number(data.pairs) || Number(data.quantity) || Number(data.totalQty) || Number(data.qty) || 0;
          const rate = Number(data.rate) || Number(data.boxRate) || 0;
          const totalBalance = Number(data.totalBalance) || Number(data.lotTotal) || pairs * rate;
          return {
            ...data,
            id: d.id,
            customerName: data.customerName || data.customerOrder || 'Direct',
            article: data.article || data.articleTitle || '',
            size: data.size || data.sizeName || '',
            pairs,
            quantity: pairs,
            totalQty: pairs,
            rate,
            boxRate: rate,
            lotTotal: totalBalance,
            totalBalance,
            average: data.average || '',
            runningBalance: Number(data.runningBalance) || 0
          } as CuttingEntry;
        });
        list.sort((a, b) => (b.date || b.createdAt || '').localeCompare(a.date || a.createdAt || ''));
        setCuttingEntries(list);
      }, err => console.error('Firestore onSnapshot error (cuttingEntries):', err)));

      // 8. order_dispatch_history
      unsubs.push(onSnapshot(collection(db, 'order_dispatch_history'), snap => {
        const list = snap.docs.map(d => ({ ...d.data(), id: d.id } as OrderDispatchHistory));
        list.sort((a, b) => (b.date || b.createdAt || '').localeCompare(a.date || a.createdAt || ''));
        setOrderDispatchHistory(list);
        saveLocal(STORAGE_KEYS.ORDER_HISTORY, list);
      }, err => console.error('Firestore onSnapshot error (order_dispatch_history):', err)));

      // 9. stock_ledger
      unsubs.push(onSnapshot(collection(db, 'stock_ledger'), snap => {
        const list = snap.docs.map(d => ({ ...d.data(), id: d.id } as StockLedgerEntry));
        setStockLedger(list);
        saveLocal(STORAGE_KEYS.STOCK_LEDGER, list);
      }, err => console.error('Firestore onSnapshot error (stock_ledger):', err)));

      unsubs.push(onSnapshot(collection(db, 'stock_management'), snap => {
        const list = snap.docs.map(d => {
          const data = d.data();
          return {
            ...data,
            id: d.id,
            article: String(data.article || data.articleName || ''),
            articleName: String(data.articleName || data.article || ''),
            size: String(data.size || ''),
            qty: Number(data.qty) || Number(data.totalCuttingReceived) || 0,
            totalStock: Number(data.totalStock) || Number(data.totalCuttingReceived) || 0,
            totalCuttingReceived: Number(data.totalCuttingReceived) || 0,
            totalDelivered: Number(data.totalDelivered) || 0,
            balance: Number(data.balance) || 0,
            rate: Number(data.rate) || 0,
            receiveIds: Array.isArray(data.receiveIds) ? data.receiveIds : [],
            deliveryIds: Array.isArray(data.deliveryIds) ? data.deliveryIds : []
          } as FactoryStockItem;
        });
        list.sort((a, b) => a.article.localeCompare(b.article) || a.size.localeCompare(b.size));
        setStockManagement(list);
      }, err => console.error('Firestore onSnapshot error (stock_management):', err)));

      unsubs.push(onSnapshot(collection(db, 'article_stock'), snap => {
        const list = snap.docs.map(d => {
          const data = d.data();
          return {
            ...data,
            id: d.id,
            articleName: String(data.articleName || ''),
            totalReceived: Number(data.totalReceived) || 0,
            totalAvailable: Number(data.totalAvailable) || 0,
            totalDelivered: Number(data.totalDelivered) || 0,
            cuttingHistory: Array.isArray(data.cuttingHistory) ? data.cuttingHistory : [],
            deliveryHistory: Array.isArray(data.deliveryHistory) ? data.deliveryHistory : []
          } as ArticleStockItem;
        });
        list.sort((a, b) => a.articleName.localeCompare(b.articleName));
        setArticleStock(list);
      }, err => console.error('Firestore onSnapshot error (article_stock):', err)));

      unsubs.push(onSnapshot(collection(db, 'stock_delivery_history'), snap => {
        const list = snap.docs.map(d => ({ ...d.data(), id: d.id } as DeliveryHistoryEntry));
        list.sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.createdAt || '').localeCompare(a.createdAt || ''));
        setDeliveryHistory(list);
      }, err => console.error('Firestore onSnapshot error (stock_delivery_history):', err)));

      unsubs.push(onSnapshot(collection(db, 'articles_master'), snap => {
        const list = snap.docs.flatMap(d => {
          const data = d.data();
          const articleName = String(data.articleName || data.name || data.title || '').trim();
          const status = String(data.status || '').toLocaleLowerCase();
          if (!articleName || data.isActive === false || (status && status !== 'active')) return [];
          return [{
            id: d.id,
            articleName,
            articleCode: String(data.articleCode || data.articleNumber || data.articleNo || data.code || data.sku || ''),
            sizes: Array.isArray(data.sizes) ? data.sizes : [],
            createdAt: String(data.createdAt || '')
          } satisfies FactoryArticleMaster];
        });
        list.sort((a, b) => a.articleName.localeCompare(b.articleName));
        setArticlesMaster(list);
      }, err => console.error('Firestore onSnapshot error (articles_master):', err)));

      unsubs.push(onSnapshot(collection(db, 'articles'), snap => {
        const list = snap.docs.flatMap(d => {
          const data = d.data();
          const articleName = String(data.articleName || data.name || data.title || '').trim();
          const status = String(data.status || '').toLocaleLowerCase();
          if (!articleName || data.isActive === false || (status && status !== 'active')) return [];
          return [{
            id: d.id,
            articleName,
            articleCode: String(data.articleCode || data.articleNumber || data.articleNo || data.code || data.sku || ''),
            sizes: Array.isArray(data.sizes) ? data.sizes : [],
            createdAt: String(data.createdAt || '')
          } satisfies FactoryArticleMaster];
        });
        setArticleCatalog(list);
      }, err => console.error('Firestore onSnapshot error (articles):', err)));

      unsubs.push(onSnapshot(collection(db, 'article_master'), snap => {
        const list = snap.docs.flatMap(d => {
          const data = d.data();
          const articleName = String(data.articleName || data.article_name || data.name || data.title || '').trim();
          const status = String(data.status || '').toLocaleLowerCase();
          if (!articleName || data.isActive === false || (status && status !== 'active')) return [];
          return [{
            id: d.id,
            articleName,
            articleCode: String(data.articleCode || data.articleNumber || data.articleNo || data.code || data.sku || ''),
            sizes: Array.isArray(data.sizes) ? data.sizes : [],
            createdAt: String(data.createdAt || '')
          } satisfies FactoryArticleMaster];
        });
        setLegacyArticleMaster(list);
      }, err => console.error('Firestore onSnapshot error (article_master):', err)));

      // 10. sales_invoices
      unsubs.push(onSnapshot(collection(db, 'sales_invoices'), snap => {
        const list = snap.docs.map(d => ({ ...d.data(), id: d.id } as SaleInvoice));
        setInvoices(list);
        saveLocal(STORAGE_KEYS.INVOICES, list);
      }, err => console.error('Firestore onSnapshot error (sales_invoices):', err)));
    } catch (e) {
      console.warn('Firestore onSnapshot setup notice:', e);
    }

    return () => {
      unsubs.forEach(unsub => unsub());
    };
  }, []);

  // --- Recalculate Product Stock from Stock Ledger (sum(in) - sum(out)) ---
  const recalculateStockForProduct = (prodId: string, currentLedger: StockLedgerEntry[]): number => {
    const entries = currentLedger.filter(e => e.productId === prodId);
    let stock = 0;
    entries.forEach(e => {
      if (e.type === 'in' || e.type === 'purchase' || e.type === 'cutting_received') {
        stock += e.qty;
      } else if (e.type === 'out' || e.type === 'sale') {
        stock -= e.qty;
      }
    });
    return Math.max(0, stock);
  };

  // --- Parties CRUD ---
  const addParty = (data: Omit<Party, 'id' | 'createdAt' | 'updatedAt' | 'currentBalance'>): Party => {
    const now = new Date().toISOString();
    const id = 'party-' + Date.now();
    const newParty: Party = {
      ...data,
      id,
      currentBalance: data.openingBalance || 0,
      createdAt: now,
      updatedAt: now
    };
    const next = [newParty, ...parties];
    setParties(next);
    saveLocal(STORAGE_KEYS.PARTIES, next);
    syncFirestoreDoc('parties', id, newParty);
    showToast(`Party "${data.name}" added successfully`);
    return newParty;
  };

  const updateParty = (id: string, updates: Partial<Party>) => {
    const now = new Date().toISOString();
    const next = parties.map(p => p.id === id ? { ...p, ...updates, updatedAt: now } : p);
    setParties(next);
    saveLocal(STORAGE_KEYS.PARTIES, next);
    const updatedDoc = next.find(p => p.id === id);
    if (updatedDoc) syncFirestoreDoc('parties', id, updatedDoc);
    showToast('Party details updated');
  };

  const deleteParty = (id: string) => {
    const next = parties.filter(p => p.id !== id);
    setParties(next);
    saveLocal(STORAGE_KEYS.PARTIES, next);
    showToast('Party deleted', 'info');
  };

  // --- Staff CRUD ---
  const addStaff = (data: Omit<Staff, 'id' | 'createdAt' | 'currentBalance'>): Staff => {
    const id = 'staff-' + Date.now();
    const newStaff: Staff = {
      ...data,
      id,
      currentBalance: 0,
      createdAt: new Date().toISOString()
    };
    const next = [newStaff, ...staff];
    setStaff(next);
    saveLocal(STORAGE_KEYS.STAFF, next);
    syncFirestoreDoc('staff', id, newStaff);
    showToast(`Staff member "${data.name}" registered successfully`);
    return newStaff;
  };

  const updateStaff = (id: string, updates: Partial<Staff>) => {
    const next = staff.map(s => s.id === id ? { ...s, ...updates, updatedAt: new Date().toISOString() } : s);
    setStaff(next);
    saveLocal(STORAGE_KEYS.STAFF, next);
    const updated = next.find(s => s.id === id);
    if (updated) syncFirestoreDoc('staff', id, updated);
    showToast('Staff details updated');
  };

  const deleteStaff = (id: string) => {
    const next = staff.filter(s => s.id !== id);
    setStaff(next);
    saveLocal(STORAGE_KEYS.STAFF, next);
    showToast('Staff member removed', 'info');
  };

  const payStaffWage = (staffId: string, amount: number, paymentMode: 'cash' | 'bank', note?: string) => {
    const st = staff.find(s => s.id === staffId);
    if (!st || amount <= 0) return;

    const now = new Date().toISOString();
    // Reduce worker balance
    const updatedStaff = staff.map(s => s.id === staffId ? { ...s, currentBalance: Math.max(0, s.currentBalance - amount) } : s);
    setStaff(updatedStaff);
    saveLocal(STORAGE_KEYS.STAFF, updatedStaff);

    // Ledger entry
    const ledgerEntry: StaffLedgerEntry = {
      id: 'sl-' + Date.now(),
      staffId,
      staffName: st.name,
      type: 'debit',
      amount,
      date: now.split('T')[0],
      description: note || `Wage payment to ${st.name}`,
      createdAt: now
    };
    const nextStaffLedger = [ledgerEntry, ...staffLedger];
    setStaffLedger(nextStaffLedger);
    saveLocal(STORAGE_KEYS.STAFF_LEDGER, nextStaffLedger);

    // Cashbook outflow
    const cbEntry: CashbookEntry = {
      id: 'cb-' + Date.now(),
      type: 'out',
      amount,
      date: now.split('T')[0],
      category: 'Staff Wages',
      paymentMode,
      description: `Wages paid to ${st.name} (${st.role})`,
      createdAt: now
    };
    const nextCb = [cbEntry, ...cashbook];
    setCashbook(nextCb);
    saveLocal(STORAGE_KEYS.CASHBOOK, nextCb);

    showToast(`Paid ${settings.currency} ${amount} to ${st.name}`);
  };

  // --- Products (Gloves Types) CRUD ---
  const addProduct = (data: Omit<Product, 'id' | 'createdAt' | 'currentStock'>): Product => {
    const id = 'prod-' + Date.now();
    const newProduct: Product = {
      ...data,
      id,
      currentStock: 0, // Starts at 0 until cutting received / stock ledger
      createdAt: new Date().toISOString()
    };
    const next = [newProduct, ...products];
    setProducts(next);
    saveLocal(STORAGE_KEYS.PRODUCTS, next);
    syncFirestoreDoc('products', id, newProduct);
    showToast(`Glove item "${data.gloveName}" created successfully`);
    return newProduct;
  };

  const updateProduct = (id: string, updates: Partial<Product>) => {
    const next = products.map(p => p.id === id ? { ...p, ...updates, updatedAt: new Date().toISOString() } : p);
    setProducts(next);
    saveLocal(STORAGE_KEYS.PRODUCTS, next);
    const updated = next.find(p => p.id === id);
    if (updated) syncFirestoreDoc('products', id, updated);
    showToast('Product updated successfully');
  };

  const deleteProduct = (id: string) => {
    const next = products.filter(p => p.id !== id);
    setProducts(next);
    saveLocal(STORAGE_KEYS.PRODUCTS, next);
    showToast('Product removed', 'info');
  };

  const loadFactoryPresets = () => {
    const now = new Date().toISOString();
    const created: Product[] = GLOVE_TEMPLATE_PRESETS.map((item, index) => ({
      ...item,
      id: `prod-preset-${index + 1}-${Date.now()}`,
      currentStock: 0,
      createdAt: now
    }));
    const next = [...created, ...products];
    setProducts(next);
    saveLocal(STORAGE_KEYS.PRODUCTS, next);
    showToast('Factory standard glove templates loaded');
  };

  // --- 1. Customer Orders (MAIN MODULE - Cloud Firestore Connected) ---
  const createCustomerOrder = async (orderData: {
    customerId?: string;
    customerName: string;
    customerPhone?: string;
    orderDate: string;
    deliveryDate: string;
    items: Array<{
      id?: string;
      productId?: string;
      title: string;
      gloveType?: string;
      color?: string;
      leatherType?: string;
      sizes: { small: number; medium: number; large: number; xl: number; xxl: number };
      totalPairs: number;
      qty?: number;
      rate?: number;
    }>;
    notes?: string;
    createdBy?: string;
  }): Promise<CustomerOrder> => {
    const now = new Date().toISOString();
    const id = 'ord-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6);
    const nextOrderNum = (orders.length + 1).toString().padStart(3, '0');
    const orderNo = `${settings.orderPrefix || 'ORD-'}${nextOrderNum}`;

    const orderItems: OrderItem[] = orderData.items.map((item, idx) => {
      const title = (item.title || item.gloveType || '').trim() || 'Custom Glove';
      const sizes = {
        small: Number(item.sizes?.small) || 0,
        medium: Number(item.sizes?.medium) || 0,
        large: Number(item.sizes?.large) || 0,
        xl: Number(item.sizes?.xl) || 0,
        xxl: Number(item.sizes?.xxl) || 0
      };
      const pairsSum = sizes.small + sizes.medium + sizes.large + sizes.xl + sizes.xxl;
      const totalPairs = pairsSum > 0 ? pairsSum : (Number(item.totalPairs) || Number(item.qty) || 0);

      return {
        id: item.id || `item-${idx + 1}-${Date.now()}`,
        productId: item.productId || `prod-${Date.now()}-${idx}`,
        title,
        gloveType: title,
        color: (item.color || '').trim(),
        leatherType: item.leatherType || '',
        sizes,
        totalPairs,
        originalQty: totalPairs, // IMMUTABLE: Never subtracted
        qty: totalPairs,
        rate: item.rate || 0,
        amount: (item.rate || 0) * totalPairs,
        cuttingGivenQty: 0,
        stockReceivedQty: 0,
        billedQty: 0,
        pendingQty: totalPairs
      };
    });

    const totalPairs = orderItems.reduce((sum, i) => sum + i.totalPairs, 0);

    const newOrder: CustomerOrder = {
      id,
      orderNo,
      customerId: orderData.customerId || '',
      customerName: orderData.customerName.trim(),
      customerPhone: orderData.customerPhone || '',
      orderDate: orderData.orderDate,
      deliveryDate: orderData.deliveryDate,
      totalPairs,
      originalTotalPairs: totalPairs, // IMMUTABLE
      totalQty: totalPairs,
      totalAmount: 0,
      status: 'Pending',
      items: orderItems,
      notes: orderData.notes || '',
      createdAt: now,
      createdBy: orderData.createdBy || 'Factory Admin',
      updatedAt: now
    };

    // Save permanently to Firestore collection "customer_orders"
    if (db) {
      try {
        await setDoc(doc(db, 'customer_orders', id), newOrder);
      } catch (e) {
        console.error('Error writing customer order to Firestore:', e);
      }
    }

    // Local optimistic update
    const nextOrders = [newOrder, ...orders.filter(o => o.id !== id)];
    setOrders(nextOrders);
    saveLocal(STORAGE_KEYS.ORDERS, nextOrders);

    showToast('Order Saved Successfully');
    return newOrder;
  };

  const updateCustomerOrder = async (
    orderId: string,
    orderData: {
      customerName: string;
      customerPhone?: string;
      orderDate: string;
      deliveryDate: string;
      items: Array<{
        id?: string;
        title: string;
        color?: string;
        sizes: { small: number; medium: number; large: number; xl: number; xxl: number };
        totalPairs: number;
      }>;
      notes?: string;
      status?: CustomerOrder['status'];
    }
  ): Promise<void> => {
    const existing = orders.find(o => o.id === orderId);
    const now = new Date().toISOString();

    const updatedItems: OrderItem[] = orderData.items.map((item, idx) => {
      const title = (item.title || '').trim() || 'Custom Glove';
      const sizes = {
        small: Number(item.sizes?.small) || 0,
        medium: Number(item.sizes?.medium) || 0,
        large: Number(item.sizes?.large) || 0,
        xl: Number(item.sizes?.xl) || 0,
        xxl: Number(item.sizes?.xxl) || 0
      };
      const pairsSum = sizes.small + sizes.medium + sizes.large + sizes.xl + sizes.xxl;
      const totalPairs = pairsSum > 0 ? pairsSum : (Number(item.totalPairs) || 0);

      const oldItem = existing?.items.find(i => i.id === item.id || i.title === title);
      const originalQty = oldItem?.originalQty ?? totalPairs;
      const cuttingGiven = oldItem?.cuttingGivenQty || 0;
      const stockReceived = oldItem?.stockReceivedQty || 0;
      const billed = oldItem?.billedQty || 0;

      return {
        id: item.id || oldItem?.id || `item-${idx + 1}-${Date.now()}`,
        productId: oldItem?.productId || `prod-${Date.now()}-${idx}`,
        title,
        gloveType: title,
        color: (item.color || '').trim(),
        sizes,
        totalPairs,
        originalQty, // IMMUTABLE
        qty: totalPairs,
        cuttingGivenQty: cuttingGiven,
        stockReceivedQty: stockReceived,
        billedQty: billed,
        pendingQty: Math.max(0, totalPairs - billed)
      };
    });

    const totalPairs = updatedItems.reduce((sum, i) => sum + i.totalPairs, 0);
    const originalTotalPairs = existing?.originalTotalPairs ?? totalPairs;

    const updates: any = {
      customerName: orderData.customerName.trim(),
      customerPhone: orderData.customerPhone || '',
      orderDate: orderData.orderDate,
      deliveryDate: orderData.deliveryDate,
      items: updatedItems,
      totalPairs,
      originalTotalPairs,
      totalQty: totalPairs,
      notes: orderData.notes || '',
      updatedAt: now
    };
    if (orderData.status) {
      updates.status = orderData.status;
    }

    if (db) {
      try {
        await updateDoc(doc(db, 'customer_orders', orderId), updates);
      } catch (e) {
        console.error('Error updating customer order in Firestore:', e);
      }
    }

    const nextOrders = orders.map(o => o.id === orderId ? { ...o, ...updates } : o);
    setOrders(nextOrders);
    saveLocal(STORAGE_KEYS.ORDERS, nextOrders);

    showToast('Order Updated Successfully');
  };

  const updateOrderStatus = (orderId: string, status: CustomerOrder['status']) => {
    const next = orders.map(o => o.id === orderId ? { ...o, status, updatedAt: new Date().toISOString() } : o);
    setOrders(next);
    saveLocal(STORAGE_KEYS.ORDERS, next);
    const updated = next.find(o => o.id === orderId);
    if (updated) syncFirestoreDoc('customer_orders', orderId, updated);
  };

  const deleteCustomerOrder = async (orderId: string): Promise<void> => {
    if (db) {
      try {
        await deleteDoc(doc(db, 'customer_orders', orderId));
      } catch (e) {
        console.error('Error deleting customer order from Firestore:', e);
      }
    }

    const next = orders.filter(o => o.id !== orderId);
    setOrders(next);
    saveLocal(STORAGE_KEYS.ORDERS, next);
    if (selectedOrderId === orderId) setSelectedOrderId(null);
    showToast('Order Deleted Successfully', 'info');
  };

  // --- CUTTERS & DUAL ENTRY BATCH TRANSACTIONS ---
  const addCutter = async (data: { name: string; khataName?: string; phone?: string; perPairRate?: number; cutterType: CutterCategory }): Promise<Cutter> => {
    const id = 'cutter-' + Date.now();
    const now = new Date().toISOString();
    const newCutter: Cutter = {
      id,
      name: data.name.trim(),
      khataName: data.khataName?.trim() || `${data.name.trim()} Ledger`,
      phone: data.phone?.trim() || '',
      perPairRate: Number(data.perPairRate) || 0,
      cutterType: data.cutterType,
      totalGiven: 0,
      totalReceived: 0,
      pendingBalance: 0,
      createdAt: now,
      updatedAt: now,
      isActive: true,
      status: 'active'
    };

    if (db) {
      try {
        await setDoc(doc(db, 'cutters', id), newCutter);
      } catch (e) {
        console.error('Error saving cutter:', e);
        throw e;
      }
    } else {
      throw new Error('Firestore is not available. The cutter was not saved.');
    }

    const next = [...cutters, newCutter];
    setCutters(next);
    saveLocal(STORAGE_KEYS.CUTTERS, next);
    showToast(`Cutter "${newCutter.name}" added successfully`);
    return newCutter;
  };

  const updateCutter = async (
    id: string,
    updates: Pick<Cutter, 'name' | 'khataName' | 'phone' | 'perPairRate'>
  ): Promise<void> => {
    if (!db) throw new Error('Firestore is not available. Cutter details were not updated.');
    const normalized = {
      ...updates,
      name: updates.name.trim(),
      khataName: updates.khataName?.trim() || `${updates.name.trim()} Ledger`,
      phone: updates.phone?.trim() || '',
      perPairRate: Number(updates.perPairRate) || 0,
      updatedAt: new Date().toISOString()
    };
    await updateDoc(doc(db, 'cutters', id), normalized);
    setCutters(previous => previous.map(cutter => cutter.id === id ? { ...cutter, ...normalized } : cutter));
    showToast('Ledger updated successfully.');
  };

  const setCutterActive = async (id: string, isActive: boolean): Promise<void> => {
    if (!db) throw new Error('Firestore is not available. Status was not updated.');
    const statusUpdates = isActive
      ? { isActive: true, status: 'active' as const, deactivatedAt: null, deactivatedReason: '' }
      : { isActive: false, status: 'deactive' as const, deactivatedAt: serverTimestamp() };
    await updateDoc(doc(db, 'cutters', id), statusUpdates);
    setCutters(previous => previous.map(cutter => cutter.id === id ? {
      ...cutter,
      ...statusUpdates,
      deactivatedAt: isActive ? undefined : new Date().toISOString()
    } : cutter));
  };

  const deleteCutter = async (id: string, deleteLedgerData = false): Promise<void> => {
    if (!db) throw new Error('Firestore is not available. The cutter was not deleted.');
    if (deleteLedgerData) {
      const [entrySnap, transactionSnap] = await Promise.all([
        getDocs(collection(db, 'cuttingEntries')),
        getDocs(collection(db, 'cutting_transactions'))
      ]);
      const entryIds = entrySnap.docs.filter(item => item.data().cutterId === id).map(item => item.id);
      const transactionIds = transactionSnap.docs.filter(item => item.data().cutterId === id).map(item => item.id);
      await Promise.all([
        ...entryIds.map(entryId => deleteDoc(doc(db, 'cuttingEntries', entryId))),
        ...transactionIds.map(transactionId => deleteDoc(doc(db, 'cutting_transactions', transactionId)))
      ]);
    }
    await deleteDoc(doc(db, 'cutters', id));
    const next = cutters.filter(c => c.id !== id);
    setCutters(next);
    saveLocal(STORAGE_KEYS.CUTTERS, next);
    if (deleteLedgerData) {
      setCuttingEntries(previous => previous.filter(entry => entry.cutterId !== id));
      setCuttingTransactions(previous => previous.filter(tx => tx.cutterId !== id));
    }
    showToast('Cutter ledger deleted successfully.', 'info');
  };

  const saveCuttingTransaction = async (data: {
    cutterId: string;
    cutterName: string;
    cutterType: CutterCategory;
    type: 'GIVE' | 'RECEIVE';
    date: string;
    qty: number;
    totalQty?: number;
    rate?: number;
    article: string;
    articleTitle?: string;
    orderId?: string;
    orderNo?: string;
    customerName?: string;
    size?: string;
    sizeName?: string;
    average?: string;
    remarks?: string;
    totalBalance?: number;
    customerOrder?: string;
    sizes?: SizeMatrix;
    billNo?: string;
    factoryName?: string;
    addToStock?: boolean;
    notes?: string;
  }): Promise<CuttingTransaction> => {
    const now = new Date().toISOString();
    const txId = 'ctx-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6);

    const txDoc: CuttingTransaction = {
      id: txId,
      cutterId: data.cutterId,
      cutterName: data.cutterName,
      cutterType: data.cutterType,
      type: data.type,
      date: data.date,
      qty: data.qty,
      totalQty: data.totalQty ?? data.qty,
      rate: Number(data.rate) || 0,
      lotTotal: data.qty * (Number(data.rate) || 0),
      article: data.article,
      articleTitle: data.articleTitle || data.article,
      size: data.size || '',
      sizeName: data.sizeName || data.size || '',
      average: data.average || '',
      remarks: data.remarks || '',
      totalBalance: data.totalBalance ?? data.qty * (Number(data.rate) || 0),
      customerOrder: data.customerOrder || (data.orderId ? data.orderNo || '' : 'Direct Cutting'),
      orderId: data.orderId || '',
      orderNo: data.orderNo || '',
      customerName: data.customerName || '',
      sizes: data.sizes || { small: 0, medium: 0, large: 0, xl: 0, xxl: 0 },
      billNo: data.billNo || '',
      factoryName: data.factoryName || '',
      addToStock: !!data.addToStock,
      notes: data.notes || '',
      createdAt: now
    };
    const entry: CuttingEntry = {
      id: txId,
      cutterId: data.cutterId,
      cutterName: data.cutterName,
      type: data.type,
      date: data.date,
      customerName: data.customerName || '',
      article: data.article,
      articleTitle: data.articleTitle || data.article,
      size: data.size || '',
      sizeName: data.sizeName || data.size || '',
      average: data.average || '',
      remarks: data.remarks || '',
      pairs: data.qty,
      totalQty: data.totalQty ?? data.qty,
      rate: Number(data.rate) || 0,
      lotTotal: data.qty * (Number(data.rate) || 0),
      totalBalance: data.totalBalance ?? data.qty * (Number(data.rate) || 0),
      customerOrder: data.customerOrder || (data.orderId ? data.orderNo || '' : 'Direct Cutting'),
      orderId: data.orderId || '',
      orderNo: data.orderNo || '',
      runningBalance: 0,
      billNo: data.billNo || '',
      createdAt: now
    };
    const legacyEntries = cuttingTransactions
      .filter(tx => tx.cutterId === data.cutterId && tx.id !== entry.id && !cuttingEntries.some(saved => saved.id === tx.id))
      .map(tx => ({
        id: tx.id,
        cutterId: tx.cutterId,
        cutterName: tx.cutterName,
        type: tx.type,
        date: tx.date,
        customerName: tx.customerName || '',
        article: tx.article,
        articleTitle: tx.articleTitle || tx.article,
        size: tx.size || '',
        sizeName: tx.sizeName || tx.size || '',
        average: tx.average || '',
        remarks: tx.remarks || tx.notes || '',
        pairs: tx.totalQty || tx.qty,
        totalQty: tx.totalQty || tx.qty,
        rate: tx.rate || 0,
        lotTotal: tx.lotTotal || tx.qty * (tx.rate || 0),
        totalBalance: tx.totalBalance || tx.lotTotal || tx.qty * (tx.rate || 0),
        customerOrder: tx.customerOrder || tx.orderNo || 'Direct Cutting',
        runningBalance: 0,
        billNo: tx.billNo || '',
        createdAt: tx.createdAt
      } satisfies CuttingEntry));
    const nextEntries = [...cuttingEntries.filter(item => item.id !== entry.id), ...legacyEntries, entry]
      .sort((a, b) => (a.date || '').localeCompare(b.date || '') || (a.createdAt || '').localeCompare(b.createdAt || '') || a.id.localeCompare(b.id));
    const cutterBalances = new Map<string, number>();
    const balancedEntries = nextEntries.map(item => {
      const balance = (cutterBalances.get(item.cutterId) || 0) + item.lotTotal;
      cutterBalances.set(item.cutterId, balance);
      return { ...item, runningBalance: balance };
    });

    const targetCutter = cutters.find(c => c.id === data.cutterId);
    const targetOrder = data.orderId ? orders.find(order => order.id === data.orderId) : undefined;
    const directDelivery = data.type === 'RECEIVE' && !!data.orderId && !data.addToStock;
    if (data.orderId && !targetOrder) throw new Error('The selected customer order no longer exists.');
    const currentGiven = targetCutter?.totalGiven || 0;
    const currentReceived = targetCutter?.totalReceived || 0;

    const newGiven = data.type === 'GIVE' ? currentGiven + data.qty : currentGiven;
    const newReceived = data.type === 'RECEIVE' ? currentReceived + data.qty : currentReceived;
    const newPending = Math.max(0, newGiven - newReceived);

    // Dual Entry Batched Write
    if (!db) throw new Error('Firestore is not available. The cutting entry was not saved.');
    const directDispatchHistoryRef = directDelivery ? doc(collection(db, 'order_dispatch_history')) : null;
    const directOrderHistoryRef = directDelivery && data.orderId
      ? doc(collection(db, 'customer_orders', data.orderId, 'order_history'))
      : null;
    {
      try {
        const batch = writeBatch(db);

        // 1. Write cutting_transactions doc
        const txRef = doc(db, 'cutting_transactions', txId);
        batch.set(txRef, txDoc);

        // 2. Write the editable notebook entry and refresh its running balances.
        const savedEntryIds = new Set(cuttingEntries.map(saved => saved.id));
        balancedEntries.forEach(item => {
          const entryRef = doc(db, 'cuttingEntries', item.id);
          if (item.id === txId) batch.set(entryRef, item);
          else if (savedEntryIds.has(item.id)) batch.update(entryRef, { runningBalance: item.runningBalance });
          else batch.set(entryRef, item);
        });

        // 3. Update the cutter ledger summary.
        const cutterRef = doc(db, 'cutters', data.cutterId);
        batch.update(cutterRef, {
          totalGiven: newGiven,
          totalReceived: newReceived,
          pendingBalance: newPending,
          lastTransactionDate: data.date,
          updatedAt: now
        });

        // 4. Customer order history & live progress tracking
        if (data.orderId) {
          // Sub-collection customer_orders/{orderId}/order_history
          const subHistoryRef = doc(collection(db, 'customer_orders', data.orderId, 'order_history'));
          batch.set(subHistoryRef, {
            date: data.date,
            actionType: data.type === 'GIVE' ? 'cutting_given' : 'stock_received',
            quantity: data.qty,
            personName: data.cutterName,
            article: data.article,
            notes: data.notes || (data.type === 'GIVE' ? 'Cutting Assigned' : 'Cutting Received'),
            createdAt: now
          });

          // Top-level order_dispatch_history
          const topHistoryRef = doc(collection(db, 'order_dispatch_history'));
          batch.set(topHistoryRef, {
            orderId: data.orderId,
            orderNo: data.orderNo || '',
            date: data.date,
            actionType: data.type === 'GIVE' ? 'cutting_given' : 'stock_received',
            quantity: data.qty,
            personName: data.cutterName,
            article: data.article,
            notes: data.notes || '',
            createdAt: now
          });
          if (directDispatchHistoryRef && directOrderHistoryRef) {
            batch.set(directDispatchHistoryRef, {
              orderId: data.orderId,
              orderNo: data.orderNo || targetOrder?.orderNo || '',
              date: data.date,
              actionType: 'dispatched_to_customer',
              quantity: data.qty,
              personName: data.cutterName,
              article: data.article,
              sizes: { small: 0, medium: 0, large: 0, xl: 0, xxl: 0 },
              notes: `Direct cutting delivery · ${data.sizeName || data.size || ''}`,
              createdAt: now
            });
            batch.set(directOrderHistoryRef, {
              date: data.date,
              actionType: 'dispatched_to_customer',
              quantity: data.qty,
              personName: data.cutterName,
              article: data.article,
              size: data.sizeName || data.size || '',
              notes: 'Directly delivered from cutting receive',
              createdAt: now
            });
          }

          // Mirror in cuttings collection
          const cuttingRef = doc(db, 'cuttings', txId);
          batch.set(cuttingRef, {
            id: txId,
            orderId: data.orderId,
            orderNo: data.orderNo || '',
            orderItemId: '',
            gloveType: data.article,
            size: 'Matrix',
            color: '',
            date: data.date,
            cuttingType: data.cutterType === 'cutting_man' ? 'cutting_man' : 'cutter_maker',
            personId: data.cutterId,
            personName: data.cutterName,
            qty: data.qty,
            rate: 0,
            totalAmount: 0,
            status: data.type === 'GIVE' ? 'Given' : 'Received',
            receivedDate: data.type === 'RECEIVE' ? data.date : '',
            notes: data.notes || '',
            createdAt: now
          });
        }

        if (data.type === 'RECEIVE') {
          const articleName = data.article.trim();
          const articleId = normalizeStockDocumentId(articleName);
          const sizeName = (data.sizeName || data.size || 'Unspecified').trim();
          const stockItemId = `${articleId}__${normalizeStockDocumentId(sizeName)}`;
          const deliveredQty = directDelivery ? data.qty : 0;
          const articleAvailable = articleStock.find(item =>
            item.articleName.trim().toLocaleLowerCase() === articleName.toLocaleLowerCase()
          )?.totalAvailable || 0;
          const deliveryHistoryRef = directDelivery ? doc(collection(db, 'stock_delivery_history')) : null;
          const deliveryRecord: DeliveryHistoryEntry | null = directDelivery && deliveryHistoryRef ? {
            id: deliveryHistoryRef.id,
            orderId: data.orderId,
            customerOrderId: data.orderId,
            orderNo: data.orderNo || targetOrder?.orderNo || '',
            linkedStockId: stockItemId,
            stockId: stockItemId,
            dispatchHistoryId: directDispatchHistoryRef?.id,
            orderHistoryId: directOrderHistoryRef?.id,
            date: data.date,
            deliveryDate: data.date,
            customerName: targetOrder?.customerName || data.customerName || '',
            partyName: targetOrder?.customerName || data.customerName || '',
            article: articleName,
            size: sizeName,
            quantity: deliveredQty,
            createdAt: now
          } : null;
          const receivedHistory = {
            date: data.date,
            pairs: data.qty,
            receiveId: txId,
            source: 'Nasim Cutting'
          };
          const stockRef = doc(db, 'stock_management', stockItemId);
          batch.set(stockRef, {
            article: articleName,
            articleName,
            size: sizeName,
            qty: increment(data.qty),
            totalStock: increment(data.qty),
            totalCuttingReceived: increment(data.qty),
            totalDelivered: increment(deliveredQty),
            balance: increment(data.qty - deliveredQty),
            rate: 0,
            receiveIds: arrayUnion(txId),
            ...(deliveryRecord ? { deliveryIds: arrayUnion(deliveryRecord.id) } : {}),
            updatedAt: now
          }, { merge: true });

          const articleRef = doc(db, 'article_stock', articleId);
          const articleDelivery = deliveryRecord ? {
            date: data.date,
            orderNo: deliveryRecord.orderNo || '',
            customerName: deliveryRecord.customerName,
            pairs: deliveredQty,
            remainingAfter: articleAvailable + data.qty - deliveredQty,
            deliveryId: deliveryRecord.id
          } : null;
          batch.set(articleRef, {
            articleName,
            totalReceived: increment(data.qty),
            totalAvailable: increment(data.qty - deliveredQty),
            totalDelivered: increment(deliveredQty),
            cuttingHistory: arrayUnion(receivedHistory),
            ...(articleDelivery ? { deliveryHistory: arrayUnion(articleDelivery) } : {})
          }, { merge: true });
          if (deliveryRecord && deliveryHistoryRef) batch.set(deliveryHistoryRef, deliveryRecord);
        }

        // Every cutting receive is tracked as incoming stock, including direct order deliveries.
        if (data.type === 'RECEIVE') {
          const stkId = 'stk-' + Date.now();
          const stkRef = doc(db, 'stock_ledger', stkId);
          batch.set(stkRef, {
            id: stkId,
            productId: 'prod-' + data.article.toLowerCase().replace(/\s+/g, '-'),
            productName: data.article,
            orderId: data.orderId || '',
            orderNo: data.orderNo || '',
            type: 'in',
            qty: data.qty,
            date: data.date,
            referenceId: txId,
            notes: `Cutting received from ${data.cutterName}${data.billNo ? ` (Bill #${data.billNo})` : ''}`,
            createdAt: now
          });
          if (directDelivery) {
            const deliveryStkId = `${stkId}-delivery`;
            batch.set(doc(db, 'stock_ledger', deliveryStkId), {
              id: deliveryStkId,
              productId: 'prod-' + data.article.toLowerCase().replace(/\s+/g, '-'),
              productName: data.article,
              orderId: data.orderId || '',
              orderNo: data.orderNo || '',
              type: 'out',
              qty: data.qty,
              date: data.date,
              referenceId: txId,
              notes: `Direct cutting delivery to ${targetOrder?.orderNo || data.orderNo || 'customer order'}`,
              createdAt: now
            });
          }
        }

        await batch.commit();
      } catch (e) {
        console.error('Error executing dual entry batched write:', e);
        throw e;
      }
    }

    // Local state updates
    const nextCutters = cutters.map(c => c.id === data.cutterId ? {
      ...c,
      totalGiven: newGiven,
      totalReceived: newReceived,
      pendingBalance: newPending,
      lastTransactionDate: data.date,
      updatedAt: now
    } : c);
    setCutters(nextCutters);
    saveLocal(STORAGE_KEYS.CUTTERS, nextCutters);

    const nextTxs = [txDoc, ...cuttingTransactions];
    setCuttingTransactions(nextTxs);
    saveLocal(STORAGE_KEYS.CUTTING_TXS, nextTxs);
    setCuttingEntries([...balancedEntries].sort((a, b) => (b.date || '').localeCompare(a.date || '')));

    // Update local order tracking WITHOUT reducing originalQty
    if (data.orderId) {
      const nextOrders = orders.map(ord => {
        if (ord.id === data.orderId) {
          const updatedItems = ord.items.map(itm => {
            if (itm.title.toLowerCase() === data.article.toLowerCase() || itm.gloveType.toLowerCase() === data.article.toLowerCase()) {
              return {
                ...itm,
                cuttingGivenQty: data.type === 'GIVE' ? itm.cuttingGivenQty + data.qty : itm.cuttingGivenQty,
                stockReceivedQty: data.type === 'RECEIVE' ? itm.stockReceivedQty + data.qty : itm.stockReceivedQty
              };
            }
            return itm;
          });
          return {
            ...ord,
            status: ord.status === 'Pending' ? 'Cutting-Given' : ord.status,
            items: updatedItems,
            updatedAt: now
          };
        }
        return ord;
      });
      setOrders(nextOrders);
      saveLocal(STORAGE_KEYS.ORDERS, nextOrders);
    }

    showToast('Cutting entry saved successfully.');
    return txDoc;
  };

  const updateCuttingReturn = async (
    id: string,
    updates: Pick<CuttingEntry, 'date' | 'remarks' | 'pairs' | 'rate'>
  ): Promise<void> => {
    if (!db) throw new Error('Firestore is not available. The return was not updated.');
    const current = cuttingEntries.find(entry => entry.id === id);
    if (!current || current.type !== 'RETURN' || !current.returnReferenceId) {
      throw new Error('The cutting return no longer exists.');
    }
    const original = cuttingEntries.find(entry => entry.id === current.returnReferenceId);
    if (!original) throw new Error('The original cutting entry no longer exists.');
    const quantity = Math.abs(Number(updates.pairs));
    const rate = Number(updates.rate);
    if (!updates.date || !Number.isInteger(quantity) || quantity <= 0 || !Number.isFinite(rate) || rate < 0) {
      throw new Error('Enter a valid return date, whole-number quantity, and rate.');
    }

    const articleName = (original.articleTitle || original.article).trim();
    const sizeName = (original.sizeName || original.size || 'Unspecified').trim();
    const [stockDocuments, articleDocuments] = await Promise.all([
      getDocs(collection(db, 'stock_management')),
      getDocs(collection(db, 'article_stock'))
    ]);
    const matchedStock = stockDocuments.docs.find(snapshot => {
      const stock = snapshot.data();
      return String(stock.article || stock.articleName || '').trim().toLocaleLowerCase() === articleName.toLocaleLowerCase() &&
        String(stock.size || '').trim().toLocaleLowerCase() === sizeName.toLocaleLowerCase();
    });
    const matchedArticle = articleDocuments.docs.find(snapshot =>
      String(snapshot.data().articleName || '').trim().toLocaleLowerCase() === articleName.toLocaleLowerCase()
    );
    const stockRef = matchedStock ? doc(db, 'stock_management', matchedStock.id) : null;
    const articleRef = matchedArticle ? doc(db, 'article_stock', matchedArticle.id) : null;
    const returnRef = doc(db, 'cuttingEntries', id);
    const totalsRef = doc(db, 'cutting_return_totals', current.returnReferenceId);
    const cutterRef = doc(db, 'cutters', current.cutterId);
    const oldQuantity = Math.abs(current.pairs);
    const updated: CuttingEntry = {
      ...current,
      date: updates.date,
      pairs: -quantity,
      quantity: -quantity,
      totalQty: -quantity,
      rate,
      lotTotal: -quantity * rate,
      totalBalance: -quantity * rate,
      remarks: updates.remarks,
      editedAt: new Date().toISOString(),
      editedBy: 'User'
    };
    const nextEntries = cuttingEntries.map(entry => entry.id === id ? updated : entry);
    const balanced = nextEntries
      .filter(entry => entry.cutterId === current.cutterId)
      .sort((a, b) => (a.date || '').localeCompare(b.date || '') ||
        (a.createdAt || '').localeCompare(b.createdAt || '') || a.id.localeCompare(b.id));
    let runningBalance = 0;
    const balancedEntries = balanced.map(entry => {
      runningBalance += entry.lotTotal;
      return { ...entry, runningBalance };
    });
    const totalGiven = balancedEntries.filter(entry => entry.type === 'GIVE').reduce((sum, entry) => sum + entry.pairs, 0);
    const totalReceived = balancedEntries
      .filter(entry => entry.type === 'RECEIVE' || entry.type === 'RETURN')
      .reduce((sum, entry) => sum + entry.pairs, 0);
    let updatedStockAdjustment = 0;
    let updatedArticleAdjustment = 0;

    await runTransaction(db, async transaction => {
      const [returnSnapshot, totalsSnapshot, stockSnapshot, articleSnapshot] = await Promise.all([
        transaction.get(returnRef),
        transaction.get(totalsRef),
        stockRef ? transaction.get(stockRef) : Promise.resolve(null),
        articleRef ? transaction.get(articleRef) : Promise.resolve(null)
      ]);
      if (!returnSnapshot.exists()) throw new Error('The cutting return no longer exists.');
      const trackedReturns = Number(totalsSnapshot.data()?.returnedPairs) || oldQuantity;
      if (trackedReturns - oldQuantity + quantity > original.pairs) {
        throw new Error(`Only ${Math.max(0, original.pairs - trackedReturns + oldQuantity)} pairs remain eligible for return.`);
      }

      const oldStockAdjustment = Number(returnSnapshot.data().stockAdjustedQty) || 0;
      const oldArticleAdjustment = Number(returnSnapshot.data().articleStockAdjustedQty) || 0;
      const currentStockBalance = stockSnapshot?.exists()
        ? Number(stockSnapshot.data().balance ?? stockSnapshot.data().qty ?? 0) || 0
        : 0;
      const currentArticleBalance = articleSnapshot?.exists()
        ? Number(articleSnapshot.data().totalAvailable) || 0
        : 0;
      const newStockAdjustment = stockSnapshot?.exists()
        ? Math.min(quantity, Math.max(0, currentStockBalance + oldStockAdjustment))
        : 0;
      const newArticleAdjustment = articleSnapshot?.exists()
        ? Math.min(quantity, Math.max(0, currentArticleBalance + oldArticleAdjustment))
        : 0;
      updatedStockAdjustment = newStockAdjustment;
      updatedArticleAdjustment = newArticleAdjustment;
      const updatedWithAdjustments: CuttingEntry = {
        ...updated,
        stockAdjustedQty: newStockAdjustment,
        articleStockAdjustedQty: newArticleAdjustment
      };
      transaction.update(returnRef, {
        ...updatedWithAdjustments,
        runningBalance: balancedEntries.find(entry => entry.id === id)?.runningBalance || 0,
        editedAt: serverTimestamp(),
        editedBy: 'User'
      });
      transaction.set(totalsRef, {
        returnedPairs: trackedReturns - oldQuantity + quantity,
        updatedAt: new Date().toISOString()
      });

      if (stockSnapshot?.exists() && stockRef) {
        const adjustmentDelta = newStockAdjustment - oldStockAdjustment;
        const stock = stockSnapshot.data();
        transaction.update(stockRef, {
          qty: Math.max(0, (Number(stock.qty) || 0) - adjustmentDelta),
          totalStock: Math.max(0, (Number(stock.totalStock) || 0) - adjustmentDelta),
          totalCuttingReceived: Math.max(0, (Number(stock.totalCuttingReceived) || 0) - adjustmentDelta),
          balance: Math.max(0, currentStockBalance - adjustmentDelta),
          updatedAt: new Date().toISOString()
        });
      }
      if (articleSnapshot?.exists() && articleRef) {
        const adjustmentDelta = newArticleAdjustment - oldArticleAdjustment;
        const article = articleSnapshot.data();
        const history = (Array.isArray(article.cuttingHistory) ? article.cuttingHistory : [])
          .filter((entry: { receiveId?: string }) => entry.receiveId !== id);
        history.push({
          date: updates.date,
          pairs: -quantity,
          receiveId: id,
          source: 'Nasim Cutting Return',
          reason: current.returnReason,
          returnReferenceId: current.returnReferenceId,
          totalBalance: -quantity * rate
        });
        transaction.update(articleRef, {
          totalReceived: Math.max(0, (Number(article.totalReceived) || 0) - adjustmentDelta),
          totalAvailable: Math.max(0, currentArticleBalance - adjustmentDelta),
          cuttingHistory: history,
          updatedAt: new Date().toISOString()
        });
      }
      transaction.update(cutterRef, {
        totalGiven,
        totalReceived,
        pendingBalance: Math.max(0, totalGiven - totalReceived),
        updatedAt: new Date().toISOString()
      });
      balancedEntries.forEach(entry => {
        if (entry.id !== id) {
          transaction.update(doc(db, 'cuttingEntries', entry.id), { runningBalance: entry.runningBalance });
        }
      });
    });

    const committedEntries = balancedEntries.map(entry => entry.id === id
      ? { ...entry, stockAdjustedQty: updatedStockAdjustment, articleStockAdjustedQty: updatedArticleAdjustment }
      : entry);
    setCuttingEntries(previous => [
      ...previous.filter(entry => entry.cutterId !== current.cutterId),
      ...committedEntries
    ].sort((a, b) => (b.date || '').localeCompare(a.date || '')));
    setCutters(previous => previous.map(cutter => cutter.id === current.cutterId ? {
      ...cutter,
      totalGiven,
      totalReceived,
      pendingBalance: Math.max(0, totalGiven - totalReceived)
    } : cutter));
  };

  const deleteCuttingReturn = async (id: string): Promise<void> => {
    if (!db) throw new Error('Firestore is not available. The return was not deleted.');
    const current = cuttingEntries.find(entry => entry.id === id);
    if (!current || current.type !== 'RETURN' || !current.returnReferenceId) {
      throw new Error('The cutting return no longer exists.');
    }
    const articleName = (current.articleTitle || current.article).trim();
    const sizeName = (current.sizeName || current.size || 'Unspecified').trim();
    const [stockDocuments, articleDocuments] = await Promise.all([
      getDocs(collection(db, 'stock_management')),
      getDocs(collection(db, 'article_stock'))
    ]);
    const matchedStock = stockDocuments.docs.find(snapshot => {
      const stock = snapshot.data();
      return String(stock.article || stock.articleName || '').trim().toLocaleLowerCase() === articleName.toLocaleLowerCase() &&
        String(stock.size || '').trim().toLocaleLowerCase() === sizeName.toLocaleLowerCase();
    });
    const matchedArticle = articleDocuments.docs.find(snapshot =>
      String(snapshot.data().articleName || '').trim().toLocaleLowerCase() === articleName.toLocaleLowerCase()
    );
    const stockRef = matchedStock ? doc(db, 'stock_management', matchedStock.id) : null;
    const articleRef = matchedArticle ? doc(db, 'article_stock', matchedArticle.id) : null;
    const returnRef = doc(db, 'cuttingEntries', id);
    const totalsRef = doc(db, 'cutting_return_totals', current.returnReferenceId);
    const quantity = Math.abs(current.pairs);
    const nextEntries = cuttingEntries.filter(entry => entry.id !== id);
    const balanced = nextEntries
      .filter(entry => entry.cutterId === current.cutterId)
      .sort((a, b) => (a.date || '').localeCompare(b.date || '') ||
        (a.createdAt || '').localeCompare(b.createdAt || '') || a.id.localeCompare(b.id));
    let runningBalance = 0;
    const balancedEntries = balanced.map(entry => {
      runningBalance += entry.lotTotal;
      return { ...entry, runningBalance };
    });
    const totalGiven = balancedEntries.filter(entry => entry.type === 'GIVE').reduce((sum, entry) => sum + entry.pairs, 0);
    const totalReceived = balancedEntries
      .filter(entry => entry.type === 'RECEIVE' || entry.type === 'RETURN')
      .reduce((sum, entry) => sum + entry.pairs, 0);

    await runTransaction(db, async transaction => {
      const [returnSnapshot, totalsSnapshot, stockSnapshot, articleSnapshot] = await Promise.all([
        transaction.get(returnRef),
        transaction.get(totalsRef),
        stockRef ? transaction.get(stockRef) : Promise.resolve(null),
        articleRef ? transaction.get(articleRef) : Promise.resolve(null)
      ]);
      if (!returnSnapshot.exists()) throw new Error('The cutting return no longer exists.');
      const returnData = returnSnapshot.data();
      const trackedReturns = Number(totalsSnapshot.data()?.returnedPairs) || quantity;
      const stockAdjustment = Number(returnData.stockAdjustedQty) || 0;
      const articleAdjustment = Number(returnData.articleStockAdjustedQty) || 0;
      transaction.delete(returnRef);
      if (trackedReturns - quantity > 0) {
        transaction.set(totalsRef, { returnedPairs: trackedReturns - quantity, updatedAt: new Date().toISOString() });
      } else {
        transaction.delete(totalsRef);
      }
      if (stockSnapshot?.exists() && stockRef && stockAdjustment > 0) {
        const stock = stockSnapshot.data();
        transaction.update(stockRef, {
          qty: (Number(stock.qty) || 0) + stockAdjustment,
          totalStock: (Number(stock.totalStock) || 0) + stockAdjustment,
          totalCuttingReceived: (Number(stock.totalCuttingReceived) || 0) + stockAdjustment,
          balance: (Number(stock.balance) || 0) + stockAdjustment,
          updatedAt: new Date().toISOString()
        });
      }
      if (articleSnapshot?.exists() && articleRef) {
        const article = articleSnapshot.data();
        transaction.update(articleRef, {
          totalReceived: (Number(article.totalReceived) || 0) + articleAdjustment,
          totalAvailable: (Number(article.totalAvailable) || 0) + articleAdjustment,
          cuttingHistory: (Array.isArray(article.cuttingHistory) ? article.cuttingHistory : [])
            .filter((entry: { receiveId?: string }) => entry.receiveId !== id),
          updatedAt: new Date().toISOString()
        });
      }
      transaction.update(doc(db, 'cutters', current.cutterId), {
        totalGiven,
        totalReceived,
        pendingBalance: Math.max(0, totalGiven - totalReceived),
        updatedAt: new Date().toISOString()
      });
      balancedEntries.forEach(entry => {
        transaction.update(doc(db, 'cuttingEntries', entry.id), { runningBalance: entry.runningBalance });
      });
    });

    setCuttingEntries(previous => [
      ...previous.filter(entry => entry.cutterId !== current.cutterId),
      ...balancedEntries
    ].sort((a, b) => (b.date || '').localeCompare(a.date || '')));
    setCutters(previous => previous.map(cutter => cutter.id === current.cutterId ? {
      ...cutter,
      totalGiven,
      totalReceived,
      pendingBalance: Math.max(0, totalGiven - totalReceived)
    } : cutter));
  };

  const updateCuttingEntry = async (
    id: string,
    updates: Pick<CuttingEntry, 'date' | 'customerName' | 'article' | 'size' | 'average' | 'remarks' | 'pairs' | 'rate' | 'billNo'>
  ): Promise<void> => {
    const currentEntry = cuttingEntries.find(entry => entry.id === id);
    const legacyTx = cuttingTransactions.find(tx => tx.id === id);
    const current = currentEntry || (legacyTx ? {
      id: legacyTx.id,
      cutterId: legacyTx.cutterId,
      cutterName: legacyTx.cutterName,
      type: legacyTx.type,
      date: legacyTx.date,
      customerName: legacyTx.customerName || '',
      article: legacyTx.article,
      size: legacyTx.size || '',
      average: legacyTx.average || '',
      remarks: legacyTx.remarks || '',
      pairs: legacyTx.qty,
      rate: legacyTx.rate || 0,
      lotTotal: legacyTx.lotTotal || legacyTx.qty * (legacyTx.rate || 0),
      runningBalance: 0,
      billNo: legacyTx.billNo || '',
      createdAt: legacyTx.createdAt
    } satisfies CuttingEntry : undefined);
    if (!current) throw new Error('Cutting entry no longer exists.');
    if (current.type === 'RETURN') {
      await updateCuttingReturn(id, {
        date: updates.date,
        remarks: updates.remarks,
        pairs: updates.pairs,
        rate: updates.rate
      });
      return;
    }

    const updated: CuttingEntry = {
      ...current,
      ...updates,
      articleTitle: updates.article,
      sizeName: updates.size,
      average: updates.average,
      remarks: updates.remarks,
      rate: Number(updates.rate),
      pairs: Number(updates.pairs),
      totalQty: Number(updates.pairs),
      lotTotal: Number(updates.pairs) * Number(updates.rate),
      totalBalance: Number(updates.pairs) * Number(updates.rate)
    };
    const legacyEntries = cuttingTransactions
      .filter(tx => tx.cutterId === current.cutterId && tx.id !== id && !cuttingEntries.some(entry => entry.id === tx.id))
      .map(tx => ({
        id: tx.id,
        cutterId: tx.cutterId,
        cutterName: tx.cutterName,
        type: tx.type,
        date: tx.date,
        customerName: tx.customerName || '',
        article: tx.article,
        size: tx.size || '',
        pairs: tx.qty,
        rate: tx.rate || 0,
        lotTotal: tx.lotTotal || tx.qty * (tx.rate || 0),
        runningBalance: 0,
        billNo: tx.billNo || '',
        createdAt: tx.createdAt
      } satisfies CuttingEntry));
    const ordered = [
      ...cuttingEntries.filter(entry => entry.id !== id),
      ...legacyEntries,
      updated
    ]
      .filter(entry => entry.cutterId === current.cutterId)
      .sort((a, b) => (a.date || '').localeCompare(b.date || '') || (a.createdAt || '').localeCompare(b.createdAt || '') || a.id.localeCompare(b.id));
    let balance = 0;
    const balanced = ordered.map(entry => {
      balance += entry.lotTotal;
      return { ...entry, runningBalance: balance };
    });
    const balancedById = new Map(balanced.map(entry => [entry.id, entry]));
    const totalGiven = balanced.filter(entry => entry.type === 'GIVE').reduce((sum, entry) => sum + entry.pairs, 0);
    const totalReceived = balanced
      .filter(entry => entry.type === 'RECEIVE' || entry.type === 'RETURN')
      .reduce((sum, entry) => sum + entry.pairs, 0);

    if (!db) throw new Error('Firestore is not available. The entry was not updated.');
    if (!currentEntry) await setDoc(doc(db, 'cuttingEntries', id), current);
    await updateDoc(doc(db, 'cuttingEntries', id), {
      ...updated,
      runningBalance: balancedById.get(id)?.runningBalance || 0,
      editedAt: serverTimestamp(),
      editedBy: 'User'
    });
    const batch = writeBatch(db);
    const savedEntryIds = new Set(cuttingEntries.map(entry => entry.id));
    balanced.filter(entry => entry.id !== id).forEach(entry => {
      const ref = doc(db, 'cuttingEntries', entry.id);
      if (savedEntryIds.has(entry.id)) {
        batch.update(ref, { runningBalance: entry.runningBalance });
      } else {
        batch.set(ref, entry);
      }
    });
    batch.update(doc(db, 'cutters', current.cutterId), {
        totalGiven,
        totalReceived,
        pendingBalance: Math.max(0, totalGiven - totalReceived)
    });
    if (legacyTx) {
      const txRef = doc(db, 'cutting_transactions', id);
      batch.update(txRef, {
        date: updated.date,
        customerName: updated.customerName,
        article: updated.article,
        articleTitle: updated.articleTitle,
        size: updated.size,
        sizeName: updated.sizeName,
        average: updated.average,
        remarks: updated.remarks,
        qty: updated.pairs,
        totalQty: updated.totalQty,
        rate: updated.rate,
        lotTotal: updated.lotTotal,
        totalBalance: updated.totalBalance,
        customerOrder: updated.customerOrder,
        billNo: updated.billNo
      });
    }
    await batch.commit();

    setCuttingEntries(previous => [
      ...previous.filter(entry => entry.cutterId !== current.cutterId),
      ...balanced
    ].sort((a, b) => (b.date || '').localeCompare(a.date || '')));
    setCuttingTransactions(previous => previous.map(tx => tx.id === id ? {
      ...tx,
      date: updated.date,
      customerName: updated.customerName,
      article: updated.article,
      articleTitle: updated.articleTitle,
      size: updated.size,
      sizeName: updated.sizeName,
      average: updated.average,
      remarks: updated.remarks,
      qty: updated.pairs,
      totalQty: updated.totalQty,
      rate: updated.rate,
      lotTotal: updated.lotTotal,
      totalBalance: updated.totalBalance,
      billNo: updated.billNo
    } : tx));
    setCutters(previous => previous.map(cutter => cutter.id === current.cutterId ? {
      ...cutter,
      totalGiven,
      totalReceived,
      pendingBalance: Math.max(0, totalGiven - totalReceived)
    } : cutter));
  };

  const deleteCuttingEntry = async (id: string): Promise<void> => {
    const current = cuttingEntries.find(entry => entry.id === id);
    const legacyTx = cuttingTransactions.find(tx => tx.id === id);
    const entry = current || (legacyTx ? {
      id: legacyTx.id,
      cutterId: legacyTx.cutterId,
      cutterName: legacyTx.cutterName,
      type: legacyTx.type,
      date: legacyTx.date,
      customerName: legacyTx.customerName || '',
      article: legacyTx.article,
      size: legacyTx.size || '',
      pairs: legacyTx.qty,
      rate: legacyTx.rate || 0,
      lotTotal: legacyTx.lotTotal || legacyTx.qty * (legacyTx.rate || 0),
      runningBalance: 0,
      billNo: legacyTx.billNo || '',
      createdAt: legacyTx.createdAt
    } satisfies CuttingEntry : undefined);
    if (!entry) throw new Error('Cutting entry no longer exists.');
    if (entry.type === 'RETURN') {
      await deleteCuttingReturn(id);
      return;
    }
    if (cuttingEntries.some(saved => saved.type === 'RETURN' && saved.returnReferenceId === entry.id)) {
      throw new Error('This cutting entry has recorded returns and cannot be deleted.');
    }
    if (!db) throw new Error('Firestore is not available. The entry was not deleted.');

    const remaining = cuttingEntries.filter(entry => entry.id !== id);
    const legacyRemaining = cuttingTransactions
      .filter(tx => tx.id !== id && !remaining.some(saved => saved.id === tx.id))
      .map(tx => ({
        id: tx.id,
        cutterId: tx.cutterId,
        cutterName: tx.cutterName,
        type: tx.type,
        date: tx.date,
        customerName: tx.customerName || '',
        article: tx.article,
        size: tx.size || '',
        sizeName: tx.sizeName || tx.size || '',
        average: tx.average || '',
        remarks: tx.notes || '',
        pairs: tx.qty,
        rate: tx.rate || 0,
        lotTotal: tx.lotTotal || tx.qty * (tx.rate || 0),
        runningBalance: 0,
        billNo: tx.billNo || '',
        createdAt: tx.createdAt
      } satisfies CuttingEntry));
    const affected = [...remaining, ...legacyRemaining]
      .filter(item => item.cutterId === entry.cutterId)
      .sort((a, b) => (a.date || '').localeCompare(b.date || '') || (a.createdAt || '').localeCompare(b.createdAt || '') || a.id.localeCompare(b.id));
    let balance = 0;
    const balanced = affected.map(entry => {
      balance += entry.lotTotal;
      return { ...entry, runningBalance: balance };
    });
    const totalGiven = affected.filter(entry => entry.type === 'GIVE').reduce((sum, entry) => sum + entry.pairs, 0);
    const totalReceived = affected
      .filter(entry => entry.type === 'RECEIVE' || entry.type === 'RETURN')
      .reduce((sum, entry) => sum + entry.pairs, 0);

    await deleteDoc(doc(db, 'cuttingEntries', id));
    await deleteDoc(doc(db, 'cutting_transactions', id));
    const batch = writeBatch(db);
    balanced.forEach(entry => {
      const entryRef = doc(db, 'cuttingEntries', entry.id);
      if (remaining.some(saved => saved.id === entry.id)) {
        batch.update(entryRef, { runningBalance: entry.runningBalance });
      } else {
        batch.set(entryRef, entry);
      }
    });
    batch.update(doc(db, 'cutters', entry.cutterId), {
      totalGiven,
      totalReceived,
      pendingBalance: Math.max(0, totalGiven - totalReceived)
    });
    await batch.commit();

    setCuttingEntries(previous => [
      ...previous.filter(saved => saved.cutterId !== entry.cutterId),
      ...balanced
    ].sort((a, b) => (b.date || '').localeCompare(a.date || '')));
    setCuttingTransactions(previous => previous.filter(tx => tx.id !== id));
    setCutters(previous => previous.map(cutter => cutter.id === entry.cutterId ? {
      ...cutter,
      totalGiven,
      totalReceived,
      pendingBalance: Math.max(0, totalGiven - totalReceived)
    } : cutter));
  };

  const returnCutting = async (data: {
    originalEntryId: string;
    quantity: number;
    reason: 'Damaged' | 'Wrong Size' | 'Quality';
    date: string;
  }): Promise<CuttingEntry> => {
    if (!db) throw new Error('Firestore is not available. The return was not saved.');
    const original = cuttingEntries.find(entry => entry.id === data.originalEntryId);
    if (!original || original.type !== 'RECEIVE' || original.pairs <= 0) {
      throw new Error('The original received cutting entry could not be found.');
    }
    if (!Number.isInteger(data.quantity) || data.quantity <= 0 || !data.date) {
      throw new Error('Enter a valid return date and whole-number quantity.');
    }

    const articleName = (original.articleTitle || original.article).trim();
    const articleKey = articleName.toLocaleLowerCase();
    const sizeName = (original.sizeName || original.size || 'Unspecified').trim();
    const sizeKey = sizeName.toLocaleLowerCase();
    const [stockDocuments, articleDocuments] = await Promise.all([
      getDocs(collection(db, 'stock_management')),
      getDocs(collection(db, 'article_stock'))
    ]);
    const matchedStock = stockDocuments.docs.find(snapshot => {
      const stock = snapshot.data();
      return String(stock.article || stock.articleName || '').trim().toLocaleLowerCase() === articleKey &&
        String(stock.size || '').trim().toLocaleLowerCase() === sizeKey;
    });
    const matchedArticle = articleDocuments.docs.find(snapshot =>
      String(snapshot.data().articleName || '').trim().toLocaleLowerCase() === articleKey
    );
    const stockItemId = `${normalizeStockDocumentId(articleName)}__${normalizeStockDocumentId(sizeName)}`;
    const stockRef = doc(db, 'stock_management', matchedStock?.id || stockItemId);
    const articleRef = doc(db, 'article_stock', matchedArticle?.id || normalizeStockDocumentId(articleName));
    const originalRef = doc(db, 'cuttingEntries', original.id);
    const returnTotalsRef = doc(db, 'cutting_return_totals', original.id);
    const returnRef = doc(collection(db, 'cuttingEntries'));
    const existingReturns = cuttingEntries
      .filter(entry => entry.type === 'RETURN' && entry.returnReferenceId === original.id)
      .reduce((sum, entry) => sum + Math.abs(entry.pairs), 0);
    let stockUnavailableForReturn = false;

    const returnedEntry: CuttingEntry = {
      ...original,
      id: returnRef.id,
      type: 'RETURN',
      date: data.date,
      pairs: -data.quantity,
      quantity: -data.quantity,
      totalQty: -data.quantity,
      lotTotal: -data.quantity * original.rate,
      totalBalance: -data.quantity * original.rate,
      runningBalance: 0,
      remarks: `Return: ${data.quantity} pairs ${data.reason} - Ref: ${original.date}`,
      returnReferenceId: original.id,
      returnReason: data.reason,
      createdAt: new Date().toISOString()
    };
    let stockAdjustedQty = 0;
    let articleStockAdjustedQty = 0;

    await runTransaction(db, async transaction => {
      const [originalSnapshot, stockSnapshot, articleSnapshot, totalsSnapshot] = await Promise.all([
        transaction.get(originalRef),
        transaction.get(stockRef),
        transaction.get(articleRef),
        transaction.get(returnTotalsRef)
      ]);
      if (!originalSnapshot.exists()) throw new Error('The original cutting entry no longer exists.');

      const stock = stockSnapshot.exists() ? stockSnapshot.data() : null;
      const articleStockData = articleSnapshot.exists() ? articleSnapshot.data() : null;
      const trackedReturns = Number(totalsSnapshot.data()?.returnedPairs) || existingReturns;
      if (trackedReturns + data.quantity > original.pairs) {
        throw new Error(`Only ${Math.max(0, original.pairs - trackedReturns)} pairs remain eligible for return.`);
      }

      const now = new Date().toISOString();
      transaction.set(returnTotalsRef, { returnedPairs: trackedReturns + data.quantity, updatedAt: now });
      if (stock) {
        const stockBalance = Number(stock.balance ?? stock.qty ?? stock.totalStock) || 0;
        if (stockBalance < data.quantity) stockUnavailableForReturn = true;
        stockAdjustedQty = Math.min(data.quantity, Math.max(0, stockBalance));
        transaction.update(stockRef, {
          qty: Math.max(0, (Number(stock.qty) || 0) - stockAdjustedQty),
          totalStock: Math.max(0, (Number(stock.totalStock) || 0) - stockAdjustedQty),
          totalCuttingReceived: Math.max(0, (Number(stock.totalCuttingReceived) || 0) - stockAdjustedQty),
          balance: Math.max(0, stockBalance - stockAdjustedQty),
          updatedAt: now
        });
      }
      if (articleStockData) {
        const available = Number(articleStockData.totalAvailable) || 0;
        const received = Number(articleStockData.totalReceived) || 0;
        if (available < data.quantity) stockUnavailableForReturn = true;
        articleStockAdjustedQty = Math.min(data.quantity, Math.max(0, available));
        transaction.update(articleRef, {
          totalReceived: Math.max(0, received - articleStockAdjustedQty),
          totalAvailable: Math.max(0, available - articleStockAdjustedQty),
          cuttingHistory: arrayUnion({
          date: data.date,
          pairs: -articleStockAdjustedQty,
          receiveId: returnRef.id,
          source: 'Nasim Cutting Return',
          reason: data.reason,
          returnReferenceId: original.id,
          totalBalance: -data.quantity * original.rate
          }),
          updatedAt: now
        });
      }
      transaction.set(returnRef, {
        ...returnedEntry,
        stockAdjustedQty,
        articleStockAdjustedQty,
        createdAt: serverTimestamp(),
        source: 'Cutting Return'
      });

      const cutterEntries = cuttingEntries.filter(entry => entry.cutterId === original.cutterId);
      const totalGiven = cutterEntries.filter(entry => entry.type === 'GIVE').reduce((sum, entry) => sum + entry.pairs, 0);
      const totalReceived = cutterEntries
        .filter(entry => entry.type === 'RECEIVE' || entry.type === 'RETURN')
        .reduce((sum, entry) => sum + entry.pairs, 0) - data.quantity;
      transaction.update(doc(db, 'cutters', original.cutterId), {
        totalGiven,
        totalReceived,
        pendingBalance: Math.max(0, totalGiven - totalReceived),
        updatedAt: now
      });
    });
    const savedReturnedEntry = { ...returnedEntry, stockAdjustedQty, articleStockAdjustedQty };
    const nextEntries = [...cuttingEntries, savedReturnedEntry].sort((a, b) =>
      (b.date || '').localeCompare(a.date || '') || (b.createdAt || '').localeCompare(a.createdAt || '')
    );
    setCuttingEntries(nextEntries);
    setCutters(previous => previous.map(cutter => {
      if (cutter.id !== original.cutterId) return cutter;
      const totalReceived = nextEntries
        .filter(entry => entry.cutterId === cutter.id && (entry.type === 'RECEIVE' || entry.type === 'RETURN'))
        .reduce((sum, entry) => sum + entry.pairs, 0);
      return {
        ...cutter,
        totalReceived,
        pendingBalance: Math.max(0, (cutter.totalGiven || 0) - totalReceived)
      };
    }));
    const stockWasAvailable = Boolean(matchedStock && matchedArticle) && !stockUnavailableForReturn;
    showToast(stockWasAvailable
      ? `${data.quantity} pairs returned and stock updated.`
      : `Stock did not have this full balance; ${data.quantity} pairs were recorded in the ledger and stock was reduced to zero where available.`,
    stockWasAvailable ? 'success' : 'info');
    return savedReturnedEntry;
  };

  const createArticleMaster = async (data: Omit<FactoryArticleMaster, 'id' | 'createdAt'>): Promise<FactoryArticleMaster> => {
    const articleName = data.articleName.trim();
    const sizes = data.sizes
      .map(size => ({ sizeName: size.sizeName.trim(), pairs: Number(size.pairs) }))
      .filter(size => size.sizeName && Number.isFinite(size.pairs) && size.pairs >= 0);
    if (!articleName || sizes.length === 0) throw new Error('Article name and at least one valid size are required.');
    if (!db) throw new Error('Firestore is not available. The article was not saved.');
    if ([...articlesMaster, ...articleCatalog, ...legacyArticleMaster].some(article => article.articleName.toLocaleLowerCase() === articleName.toLocaleLowerCase())) {
      throw new Error(`Article "${articleName}" already exists.`);
    }

    const createdAt = new Date().toISOString();
    const articleRef = await addDoc(collection(db, 'articles_master'), { articleName, sizes, createdAt });
    await updateDoc(articleRef, { id: articleRef.id });
    const created = { id: articleRef.id, articleName, articleCode: data.articleCode || '', sizes, createdAt };
    setArticlesMaster(previous => [...previous, created].sort((a, b) => a.articleName.localeCompare(b.articleName)));
    return created;
  };

  const deliverFromStock = async (data: {
    stockId: string;
    orderId: string;
    customerName: string;
    quantity: number;
    date: string;
  }): Promise<void> => {
    const stockItem = stockManagement.find(item => item.id === data.stockId);
    const order = orders.find(item => item.id === data.orderId);
    if (!stockItem || !order) throw new Error('The selected stock or customer order no longer exists.');
    if (!Number.isFinite(data.quantity) || data.quantity <= 0 || !data.date || !data.customerName.trim()) {
      throw new Error('Enter a valid delivery quantity, date, and customer.');
    }
    if (!db) throw new Error('Firestore is not available. The delivery was not saved.');

    const articleId = normalizeStockDocumentId(stockItem.article);
    const stockRef = doc(db, 'stock_management', stockItem.id);
    const articleRef = doc(db, 'article_stock', articleId);
    const deliveryRef = doc(collection(db, 'stock_delivery_history'));
    const dispatchHistoryRef = doc(collection(db, 'order_dispatch_history'));
    const orderHistoryRef = doc(collection(db, 'customer_orders', order.id, 'order_history'));
    const now = new Date().toISOString();

    await runTransaction(db, async transaction => {
      const [stockSnapshot, articleSnapshot] = await Promise.all([
        transaction.get(stockRef),
        transaction.get(articleRef)
      ]);
      if (!stockSnapshot.exists() || !articleSnapshot.exists()) {
        throw new Error('Stock records are unavailable. Refresh and try again.');
      }
      const stockData = stockSnapshot.data();
      const articleData = articleSnapshot.data();
      const currentBalance = Number(stockData.balance) || 0;
      if (data.quantity > currentBalance) throw new Error('Delivery quantity exceeds available stock.');

      const remainingAfter = (Number(articleData.totalAvailable) || 0) - data.quantity;
      const delivery: DeliveryHistoryEntry = {
        id: deliveryRef.id,
        orderId: order.id,
        customerOrderId: order.id,
        orderNo: order.orderNo,
        linkedStockId: stockItem.id,
        stockId: stockItem.id,
        dispatchHistoryId: dispatchHistoryRef.id,
        orderHistoryId: orderHistoryRef.id,
        date: data.date,
        deliveryDate: data.date,
        customerName: data.customerName.trim(),
        partyName: data.customerName.trim(),
        article: stockItem.article,
        size: stockItem.size,
        quantity: data.quantity,
        createdAt: now
      };
      const articleDelivery = {
        date: data.date,
        orderNo: order.orderNo,
        customerName: data.customerName.trim(),
        pairs: data.quantity,
        remainingAfter,
        deliveryId: deliveryRef.id
      };

      transaction.update(stockRef, {
        totalDelivered: increment(data.quantity),
        balance: increment(-data.quantity),
        deliveryIds: arrayUnion(deliveryRef.id),
        updatedAt: now
      });
      transaction.update(articleRef, {
        totalAvailable: increment(-data.quantity),
        totalDelivered: increment(data.quantity),
        deliveryHistory: arrayUnion(articleDelivery)
      });
      transaction.set(deliveryRef, delivery);
      transaction.set(dispatchHistoryRef, {
        orderId: order.id,
        orderNo: order.orderNo,
        date: data.date,
        actionType: 'dispatched_to_customer',
        quantity: data.quantity,
        article: stockItem.article,
        notes: `Stock delivery · ${stockItem.size}`,
        createdAt: now
      });
      transaction.set(orderHistoryRef, {
        date: data.date,
        actionType: 'dispatched_to_customer',
        quantity: data.quantity,
        article: stockItem.article,
        size: stockItem.size,
        notes: 'Delivered from Stock Management',
        createdAt: now
      });
    });
  };

  const addStockReceipt = async (data: {
    article: string;
    size: string;
    quantity: number;
    date: string;
    totalBalance?: number;
    source?: string;
  }): Promise<void> => {
    const articleName = data.article.trim();
    const size = data.size.trim() || 'Unspecified';
    if (!articleName || !data.date || !Number.isFinite(data.quantity) || data.quantity <= 0) {
      throw new Error('Enter an article, date, and a valid positive pair quantity.');
    }
    if (!db) throw new Error('Firestore is not available. The stock receipt was not saved.');

    const articleRef = doc(db, 'article_stock', normalizeStockDocumentId(articleName));
    const stockRef = doc(db, 'stock_management', `${normalizeStockDocumentId(articleName)}__${normalizeStockDocumentId(size)}`);
    const receiveRef = doc(collection(db, 'cuttingEntries'));
    const now = new Date().toISOString();
    await runTransaction(db, async transaction => {
      const [articleSnapshot, stockSnapshot] = await Promise.all([
        transaction.get(articleRef),
        transaction.get(stockRef)
      ]);
      const articleData = articleSnapshot.exists() ? articleSnapshot.data() : {};
      transaction.set(articleRef, {
        articleName,
        totalReceived: increment(data.quantity),
        totalAvailable: increment(data.quantity),
        totalDelivered: increment(0),
        cuttingHistory: arrayUnion({
          date: data.date,
          pairs: data.quantity,
          receiveId: receiveRef.id,
          totalBalance: Number(data.totalBalance) || 0,
          source: data.source || 'Nasim'
        }),
        lastUpdated: serverTimestamp(),
        updatedAt: now
      }, { merge: true });
      transaction.set(stockRef, {
        article: articleName,
        articleName,
        size,
        qty: increment(data.quantity),
        totalStock: increment(data.quantity),
        totalCuttingReceived: increment(data.quantity),
        totalDelivered: increment(0),
        balance: increment(data.quantity),
        rate: Number(stockSnapshot.data()?.rate) || 0,
        receiveIds: arrayUnion(receiveRef.id),
        updatedAt: now
      }, { merge: true });
    });
  };

  const updateStockDelivery = async (
    id: string,
    updates: Pick<DeliveryHistoryEntry, 'date' | 'quantity' | 'customerName'>
  ): Promise<void> => {
    const current = deliveryHistory.find(entry => entry.id === id);
    if (!current?.linkedStockId) throw new Error('The stock delivery no longer exists.');
    if (!Number.isFinite(updates.quantity) || updates.quantity <= 0 || !updates.date || !updates.customerName.trim()) {
      throw new Error('Enter a valid delivery quantity, date, and customer.');
    }
    if (!db) throw new Error('Firestore is not available. The delivery was not updated.');

    const stockRef = doc(db, 'stock_management', current.linkedStockId);
    const articleRef = doc(db, 'article_stock', normalizeStockDocumentId(current.article));
    const deliveryRef = doc(db, 'stock_delivery_history', id);
    const dispatchHistoryRef = current.dispatchHistoryId
      ? doc(db, 'order_dispatch_history', current.dispatchHistoryId)
      : null;
    const orderHistoryRef = current.orderHistoryId && current.orderId
      ? doc(db, 'customer_orders', current.orderId, 'order_history', current.orderHistoryId)
      : null;
    const now = new Date().toISOString();
    await runTransaction(db, async transaction => {
      const [stockSnapshot, articleSnapshot, deliverySnapshot, dispatchSnapshot, orderHistorySnapshot] = await Promise.all([
        transaction.get(stockRef),
        transaction.get(articleRef),
        transaction.get(deliveryRef),
        dispatchHistoryRef ? transaction.get(dispatchHistoryRef) : Promise.resolve(null),
        orderHistoryRef ? transaction.get(orderHistoryRef) : Promise.resolve(null)
      ]);
      if (!stockSnapshot.exists() || !articleSnapshot.exists() || !deliverySnapshot.exists()) {
        throw new Error('Stock delivery records are unavailable. Refresh and try again.');
      }
      const stockData = stockSnapshot.data();
      const articleData = articleSnapshot.data();
      const savedDelivery = deliverySnapshot.data() as DeliveryHistoryEntry;
      const oldQuantity = Number(savedDelivery.quantity) || 0;
      const nextBalance = (Number(stockData.balance) || 0) + oldQuantity - updates.quantity;
      const articleRemaining = (Number(articleData.totalAvailable) || 0) + oldQuantity - updates.quantity;
      if (nextBalance < 0) throw new Error('Delivery quantity exceeds available stock.');
      const updatedDelivery: DeliveryHistoryEntry = {
        ...savedDelivery,
        id,
        date: updates.date,
        deliveryDate: updates.date,
        quantity: updates.quantity,
        customerName: updates.customerName.trim(),
        partyName: updates.customerName.trim()
      };
      const nextArticleHistory = (Array.isArray(articleData.deliveryHistory) ? articleData.deliveryHistory : [])
        .filter((entry: { deliveryId?: string }) => entry.deliveryId !== id);
      nextArticleHistory.push({
        date: updates.date,
        orderNo: savedDelivery.orderNo || '',
        customerName: updates.customerName.trim(),
        pairs: updates.quantity,
        remainingAfter: articleRemaining,
        deliveryId: id
      });

      transaction.update(stockRef, {
        totalDelivered: increment(updates.quantity - oldQuantity),
        balance: increment(oldQuantity - updates.quantity),
        updatedAt: now
      });
      transaction.update(articleRef, {
        totalAvailable: increment(oldQuantity - updates.quantity),
        totalDelivered: increment(updates.quantity - oldQuantity),
        deliveryHistory: nextArticleHistory
      });
      transaction.update(deliveryRef, updatedDelivery);
      if (dispatchHistoryRef && dispatchSnapshot?.exists()) {
        transaction.update(dispatchHistoryRef, {
          date: updates.date,
          quantity: updates.quantity,
          customerName: updates.customerName.trim()
        });
      }
      if (orderHistoryRef && orderHistorySnapshot?.exists()) {
        transaction.update(orderHistoryRef, {
          date: updates.date,
          quantity: updates.quantity,
          customerName: updates.customerName.trim()
        });
      }
    });
  };

  const deleteStockDelivery = async (id: string): Promise<void> => {
    const current = deliveryHistory.find(entry => entry.id === id);
    if (!current?.linkedStockId) throw new Error('The stock delivery no longer exists.');
    if (!db) throw new Error('Firestore is not available. The delivery was not deleted.');

    const stockRef = doc(db, 'stock_management', current.linkedStockId);
    const articleRef = doc(db, 'article_stock', normalizeStockDocumentId(current.article));
    const deliveryRef = doc(db, 'stock_delivery_history', id);
    const now = new Date().toISOString();
    await runTransaction(db, async transaction => {
      const [stockSnapshot, articleSnapshot, deliverySnapshot] = await Promise.all([
        transaction.get(stockRef),
        transaction.get(articleRef),
        transaction.get(deliveryRef)
      ]);
      if (!stockSnapshot.exists() || !articleSnapshot.exists() || !deliverySnapshot.exists()) {
        throw new Error('Stock delivery records are unavailable. Refresh and try again.');
      }
      const quantity = Number(deliverySnapshot.data().quantity) || 0;
      const savedDelivery = deliverySnapshot.data() as DeliveryHistoryEntry;
      const articleData = articleSnapshot.data();
      transaction.update(stockRef, {
        totalDelivered: increment(-quantity),
        balance: increment(quantity),
        deliveryIds: (Array.isArray(stockSnapshot.data().deliveryIds) ? stockSnapshot.data().deliveryIds : [])
          .filter((deliveryId: string) => deliveryId !== id),
        updatedAt: now
      });
      transaction.update(articleRef, {
        totalAvailable: increment(quantity),
        totalDelivered: increment(-quantity),
        deliveryHistory: (Array.isArray(articleData.deliveryHistory) ? articleData.deliveryHistory : [])
          .filter((entry: { deliveryId?: string }) => entry.deliveryId !== id)
      });
      transaction.delete(deliveryRef);
      if (savedDelivery.dispatchHistoryId) {
        transaction.delete(doc(db, 'order_dispatch_history', savedDelivery.dispatchHistoryId));
      }
      if (savedDelivery.orderHistoryId && savedDelivery.orderId) {
        transaction.delete(doc(db, 'customer_orders', savedDelivery.orderId, 'order_history', savedDelivery.orderHistoryId));
      }
    });
  };

  const deleteFactoryStock = async (id: string): Promise<void> => {
    const stock = stockManagement.find(item => item.id === id);
    if (!stock) throw new Error('The stock record no longer exists.');
    if (!db) throw new Error('Firestore is not available. The stock record was not deleted.');

    const articleRef = doc(db, 'article_stock', normalizeStockDocumentId(stock.article));
    const stockRef = doc(db, 'stock_management', id);
    const relatedDeliveries = deliveryHistory.filter(entry => entry.linkedStockId === id);
    const now = new Date().toISOString();
    await runTransaction(db, async transaction => {
      const articleSnapshot = await transaction.get(articleRef);
      if (!articleSnapshot.exists()) throw new Error('The article stock record is unavailable.');
      const articleData = articleSnapshot.data();
      const receiveIds = new Set(stock.receiveIds || []);
      const deliveryIds = new Set(stock.deliveryIds || relatedDeliveries.map(entry => entry.id));
      transaction.update(articleRef, {
        totalReceived: increment(-stock.totalCuttingReceived),
        totalAvailable: increment(-stock.balance),
        totalDelivered: increment(-stock.totalDelivered),
        cuttingHistory: (Array.isArray(articleData.cuttingHistory) ? articleData.cuttingHistory : [])
          .filter((entry: { receiveId?: string }) => !entry.receiveId || !receiveIds.has(entry.receiveId)),
        deliveryHistory: (Array.isArray(articleData.deliveryHistory) ? articleData.deliveryHistory : [])
          .filter((entry: { deliveryId?: string }) => !entry.deliveryId || !deliveryIds.has(entry.deliveryId))
      });
      transaction.delete(stockRef);
      relatedDeliveries.forEach(delivery => {
        transaction.delete(doc(db, 'stock_delivery_history', delivery.id));
        if (delivery.dispatchHistoryId) {
          transaction.delete(doc(db, 'order_dispatch_history', delivery.dispatchHistoryId));
        }
        if (delivery.orderHistoryId && delivery.orderId) {
          transaction.delete(doc(db, 'customer_orders', delivery.orderId, 'order_history', delivery.orderHistoryId));
        }
      });
    });
  };

  const deleteCuttingTransaction = async (id: string): Promise<void> => {
    if (db) {
      try {
        await deleteDoc(doc(db, 'cutting_transactions', id));
      } catch (e) {
        console.error('Error deleting cutting transaction:', e);
      }
    }
    const next = cuttingTransactions.filter(t => t.id !== id);
    setCuttingTransactions(next);
    saveLocal(STORAGE_KEYS.CUTTING_TXS, next);
    showToast('Transaction removed', 'info');
  };

  const clearCuttingData = async (): Promise<void> => {
    if (db) {
      try {
        const cSnap = await getDocs(collection(db, 'cutters'));
        for (const d of cSnap.docs) {
          await deleteDoc(doc(db, 'cutters', d.id));
        }
        const txSnap = await getDocs(collection(db, 'cutting_transactions'));
        for (const d of txSnap.docs) {
          await deleteDoc(doc(db, 'cutting_transactions', d.id));
        }
        const entriesSnap = await getDocs(collection(db, 'cuttingEntries'));
        for (const d of entriesSnap.docs) {
          await deleteDoc(doc(db, 'cuttingEntries', d.id));
        }
      } catch (e) {
        console.error('Error clearing cutting data:', e);
      }
    }
    setCutters([]);
    setCuttingTransactions([]);
    setCuttingEntries([]);
    saveLocal(STORAGE_KEYS.CUTTERS, []);
    saveLocal(STORAGE_KEYS.CUTTING_TXS, []);
    showToast('All cutting management sample and demo data deleted successfully');
  };

  const addStitcher = async (data: { name: string; phone?: string; city?: string; perPairRate?: number; stitcherType?: Stitcher['stitcherType']; isActive?: boolean }): Promise<Stitcher> => {
    const now = new Date().toISOString();
    const id = `stitcher-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const stitcher: Stitcher = {
      id,
      name: data.name.trim(),
      phone: data.phone?.trim() || '',
      city: data.city?.trim() || '',
      perPairRate: Number(data.perPairRate) || 0,
      stitcherType: data.stitcherType || 'factory_worker',
      isActive: data.isActive !== false,
      createdAt: now,
      updatedAt: now
    };
    if (!stitcher.name) throw new Error('Enter a stitcher name.');
    if (db) await setDoc(doc(db, 'stitchers', id), stitcher);
    const next = [stitcher, ...stitchers];
    setStitchers(next);
    saveLocal(STORAGE_KEYS.STITCHERS, next);
    return stitcher;
  };

  const updateStitcher = async (id: string, updates: { name: string; phone?: string; city?: string; perPairRate?: number; stitcherType?: Stitcher['stitcherType']; isActive?: boolean }): Promise<void> => {
    const current = stitchers.find(item => item.id === id);
    if (!current) throw new Error('Stitcher no longer exists.');
    const updated: Stitcher = {
      ...current,
      name: updates.name.trim(),
      phone: updates.phone?.trim() || '',
      city: updates.city?.trim() || '',
      perPairRate: Number(updates.perPairRate) || 0,
      stitcherType: updates.stitcherType || current.stitcherType || 'factory_worker',
      isActive: updates.isActive ?? current.isActive,
      updatedAt: new Date().toISOString()
    };
    if (!updated.name) throw new Error('Enter a stitcher name.');
    if (db) await updateDoc(doc(db, 'stitchers', id), updated);
    const next = stitchers.map(item => item.id === id ? updated : item);
    setStitchers(next);
    saveLocal(STORAGE_KEYS.STITCHERS, next);
    const nextOrders = stitchingOrders.map(order => order.stitcherId === id
      ? { ...order, stitcherName: updated.name, stitcherPhone: updated.phone, updatedAt: updated.updatedAt }
      : order);
    setStitchingOrders(nextOrders);
    saveLocal(STORAGE_KEYS.STITCHING_ORDERS, nextOrders);
  };

  const deleteStitcher = async (id: string): Promise<void> => {
    if (!stitchers.some(item => item.id === id)) throw new Error('Stitcher no longer exists.');
    if (db) await deleteDoc(doc(db, 'stitchers', id));
    const next = stitchers.filter(item => item.id !== id);
    setStitchers(next);
    saveLocal(STORAGE_KEYS.STITCHERS, next);
  };

  const createStitchingOrder = async (
    data: Omit<StitchingOrder, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<StitchingOrder> => {
    const order = orders.find(item => item.id === data.orderId);
    const stitcher = stitchers.find(item => item.id === data.stitcherId);
    if (!order) throw new Error('The selected customer order no longer exists.');
    if (!stitcher) throw new Error('Select a valid stitcher.');
    if (!Number.isFinite(data.qty) || data.qty <= 0 || !Number.isFinite(data.rate) || data.rate < 0) {
      throw new Error('Quantity must be greater than zero and rate cannot be negative.');
    }
    if (!Number.isFinite(data.advancePaid) || data.advancePaid < 0 || data.advancePaid > data.qty * data.rate) {
      throw new Error('Advance paid must be non-negative and cannot exceed the stitching total.');
    }
    if (data.size) {
      const normalize = (value: string | undefined) => {
        const normalized = (value || '').trim().toLocaleLowerCase();
        const aliases: Record<string, string> = {
          small: 's',
          medium: 'm',
          large: 'l',
          'extra large': 'xl',
          xlarge: 'xl',
          '2xl': 'xxl',
          'xx-large': 'xxl'
        };
        return aliases[normalized] || normalized;
      };
      const article = data.article.trim().toLocaleLowerCase();
      const selectedSize = normalize(data.size);
      const cuttingRows = new Map<string, { type: 'GIVE' | 'RECEIVE'; qty: number }>();
      cuttingTransactions
        .filter(entry => entry.orderId === order.id)
        .forEach(entry => cuttingRows.set(entry.id, {
          type: entry.type,
          qty: Number(entry.totalQty) || Number(entry.qty) || 0
        }));
      cuttingEntries
        .filter(entry => entry.orderId === order.id)
        .forEach(entry => cuttingRows.set(entry.id, {
          type: entry.type === 'GIVE' ? 'GIVE' : 'RECEIVE',
          qty: Number(entry.totalQty) || Number(entry.quantity) || Number(entry.pairs) || 0
        }));
      cuttings
        .filter(entry => entry.orderId === order.id)
        .forEach(entry => {
          if (cuttingRows.has(entry.id)) return;
          cuttingRows.set(entry.id, {
            type: entry.status === 'Received' ? 'RECEIVE' : 'GIVE',
            qty: Number(entry.qty) || 0
          });
        });
      const cuttingById = new Map<string, CuttingTransaction | CuttingEntry | Cutting>();
      [...cuttingTransactions, ...cuttingEntries, ...cuttings].forEach(entry => {
        if (entry.orderId === order.id) cuttingById.set(entry.id, entry);
      });
      const receivedPairs = [...cuttingRows.entries()].reduce((total, [id, row]) => {
        const entry = cuttingById.get(id);
        const rowArticle = entry && 'article' in entry
          ? (('articleTitle' in entry && entry.articleTitle) || entry.article)
          : entry && 'gloveType' in entry
            ? entry.gloveType
            : '';
        const rowSize = entry && ('sizeName' in entry || 'size' in entry)
          ? (('sizeName' in entry && entry.sizeName) || ('size' in entry ? entry.size : ''))
          : '';
        return row.type === 'RECEIVE' &&
          (rowArticle || '').trim().toLocaleLowerCase() === article &&
          normalize(rowSize) === selectedSize
          ? total + row.qty
          : total;
      }, 0);
      const alreadyStitched = stitchingOrders
        .filter(existing =>
          existing.orderId === order.id &&
          existing.article.trim().toLocaleLowerCase() === article &&
          normalize(existing.size) === selectedSize
        )
        .reduce((total, existing) => total + (Number(existing.qty) || 0), 0);
      const availablePairs = Math.max(0, receivedPairs - alreadyStitched);
      if (data.qty > availablePairs) {
        throw new Error(`Stitching quantity cannot exceed Cutting Received. ${availablePairs} pairs are available for ${data.article} / ${data.size}.`);
      }
    }
    const now = new Date().toISOString();
    const id = `stitch-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const stitchingOrder: StitchingOrder = {
      ...data,
      id,
      orderNo: order.orderNo,
      customerName: order.customerName,
      stitcherName: stitcher.name,
      stitcherPhone: stitcher.phone || '',
      totalAmount: data.qty * data.rate,
      remainingBalance: Math.max(0, data.qty * data.rate - data.advancePaid),
      createdAt: now,
      updatedAt: now
    };
    const workTx: StitcherKhataTransaction = {
      id: `${id}-work`,
      stitcherId: stitcher.id,
      stitcherName: stitcher.name,
      orderId: order.id,
      stitchingOrderId: id,
      type: 'WORK',
      date: data.issueDate,
      amount: stitchingOrder.totalAmount,
      qty: data.qty,
      rate: data.rate,
      description: `Stitching work: ${data.article} (${order.orderNo})`,
      createdAt: now
    };
    const historyEntry: StitchingHistoryEntry = {
      id: `${id}-issue`,
      stitchingOrderId: id,
      orderId: order.id,
      orderNo: order.orderNo,
      stitcherId: stitcher.id,
      stitcherName: stitcher.name,
      customerName: order.customerName,
      article: data.article,
      size: data.size,
      type: 'ISSUE',
      date: data.issueDate,
      quantity: data.qty,
      rate: data.rate,
      amount: stitchingOrder.totalAmount,
      remarks: data.remarks || '',
      createdAt: now
    };
    const transactions = [workTx];
    if (data.advancePaid > 0) {
      transactions.push({
        id: `${id}-advance`,
        stitcherId: stitcher.id,
        stitcherName: stitcher.name,
        orderId: order.id,
        stitchingOrderId: id,
        type: 'ADVANCE',
        date: data.issueDate,
        amount: data.advancePaid,
        description: `Advance paid for ${order.orderNo}`,
        createdAt: now
      });
    }
    if (db) {
      const batch = writeBatch(db);
      batch.set(doc(db, 'stitching_orders', id), stitchingOrder);
      batch.set(doc(db, 'stitching_history', historyEntry.id), historyEntry);
      transactions.forEach(tx => batch.set(doc(db, 'stitcher_khata_transactions', tx.id), tx));
      await batch.commit();
    }
    const nextOrders = [stitchingOrder, ...stitchingOrders];
    const nextTransactions = [...transactions, ...stitcherKhataTransactions];
    setStitchingOrders(nextOrders);
    setStitcherKhataTransactions(nextTransactions);
    const nextHistory = [historyEntry, ...stitchingHistory];
    setStitchingHistory(nextHistory);
    saveLocal(STORAGE_KEYS.STITCHING_ORDERS, nextOrders);
    saveLocal(STORAGE_KEYS.STITCHER_KHATA, nextTransactions);
    saveLocal(STORAGE_KEYS.STITCHING_HISTORY, nextHistory);
    return stitchingOrder;
  };

  const updateStitchingOrderStatus = async (id: string, status: StitchingOrderStatus): Promise<void> => {
    const existing = stitchingOrders.find(item => item.id === id);
    if (!existing) throw new Error('Stitching order not found.');
    if (existing.status === status) return;
    const now = new Date().toISOString();
    const updated = { ...existing, status, updatedAt: new Date().toISOString() };
    const historyEntry: StitchingHistoryEntry = {
      id: `stitch-history-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      stitchingOrderId: existing.id,
      orderId: existing.orderId,
      orderNo: existing.orderNo,
      stitcherId: existing.stitcherId,
      stitcherName: existing.stitcherName,
      customerName: existing.customerName,
      article: existing.article,
      type: 'STATUS',
      date: now.slice(0, 10),
      quantity: existing.receivedQuantity || existing.qty,
      rate: existing.rate,
      amount: existing.totalAmount,
      status,
      remarks: `Status changed to ${status}`,
      createdAt: now
    };
    if (db) {
      const batch = writeBatch(db);
      batch.update(doc(db, 'stitching_orders', id), { status, updatedAt: updated.updatedAt });
      batch.set(doc(db, 'stitching_history', historyEntry.id), historyEntry);
      await batch.commit();
    }
    const next = stitchingOrders.map(item => item.id === id ? updated : item);
    const nextHistory = [historyEntry, ...stitchingHistory];
    setStitchingOrders(next);
    setStitchingHistory(nextHistory);
    saveLocal(STORAGE_KEYS.STITCHING_ORDERS, next);
    saveLocal(STORAGE_KEYS.STITCHING_HISTORY, nextHistory);
  };

  const receiveStitchingOrder = async (data: {
    stitchingOrderId: string;
    date: string;
    receivedQuantity: number;
    lossQuantity: number;
    remarks?: string;
  }): Promise<void> => {
    const current = stitchingOrders.find(item => item.id === data.stitchingOrderId);
    if (!current) throw new Error('Stitching order not found.');
    if (!Number.isFinite(data.receivedQuantity) || data.receivedQuantity < 0 ||
        !Number.isFinite(data.lossQuantity) || data.lossQuantity < 0 ||
        data.receivedQuantity + data.lossQuantity > current.qty) {
      throw new Error('Received and loss quantities must be valid and cannot exceed the issued quantity.');
    }
    const now = new Date().toISOString();
    const receivedQuantity = (current.receivedQuantity || 0) + data.receivedQuantity;
    const lossQuantity = (current.lossQuantity || 0) + data.lossQuantity;
    if (receivedQuantity + lossQuantity > current.qty) {
      throw new Error('Cumulative received and loss quantities cannot exceed the issued quantity.');
    }
    const updated: StitchingOrder = {
      ...current,
      receivedQuantity,
      lossQuantity,
      receivedDate: data.date,
      status: 'Received',
      remarks: [current.remarks, data.remarks?.trim()].filter(Boolean).join(' | '),
      updatedAt: now
    };
    const historyEntry: StitchingHistoryEntry = {
      id: `stitch-history-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      stitchingOrderId: current.id,
      orderId: current.orderId,
      orderNo: current.orderNo,
      stitcherId: current.stitcherId,
      stitcherName: current.stitcherName,
      customerName: current.customerName,
      article: current.article,
      type: 'RECEIVE',
      date: data.date,
      quantity: data.receivedQuantity,
      lossQuantity: data.lossQuantity,
      rate: current.rate,
      amount: data.receivedQuantity * current.rate,
      remarks: data.remarks?.trim() || '',
      createdAt: now
    };
    if (db) {
      const batch = writeBatch(db);
      batch.update(doc(db, 'stitching_orders', current.id), {
        receivedQuantity,
        lossQuantity,
        receivedDate: data.date,
        status: 'Received',
        remarks: updated.remarks || '',
        updatedAt: now
      });
      batch.set(doc(db, 'stitching_history', historyEntry.id), historyEntry);
      await batch.commit();
    }
    const nextOrders = stitchingOrders.map(item => item.id === current.id ? updated : item);
    const nextHistory = [historyEntry, ...stitchingHistory];
    setStitchingOrders(nextOrders);
    setStitchingHistory(nextHistory);
    saveLocal(STORAGE_KEYS.STITCHING_ORDERS, nextOrders);
    saveLocal(STORAGE_KEYS.STITCHING_HISTORY, nextHistory);
  };

  const updateStitchingHistoryEntry = async (
    id: string,
    updates: Pick<StitchingHistoryEntry, 'date' | 'quantity' | 'rate' | 'article' | 'remarks'>
  ): Promise<void> => {
    const current = stitchingHistory.find(entry => entry.id === id);
    if (!current) throw new Error('Stitching ledger entry no longer exists.');
    if (current.type === 'STATUS') throw new Error('Status audit entries cannot be edited.');
    if (!updates.date || !updates.article.trim() || !Number.isFinite(updates.quantity) || updates.quantity <= 0 ||
        !Number.isFinite(updates.rate) || updates.rate < 0) {
      throw new Error('Enter a valid date, article, quantity, and non-negative rate.');
    }
    const order = stitchingOrders.find(item => item.id === current.stitchingOrderId);
    if (!order) throw new Error('The linked stitching order no longer exists.');

    const now = new Date().toISOString();
    const updatedEntry: StitchingHistoryEntry = {
      ...current,
      ...updates,
      article: updates.article.trim(),
      remarks: updates.remarks?.trim() || '',
      amount: updates.quantity * updates.rate,
      updatedAt: now
    } as StitchingHistoryEntry;
    let updatedOrder: StitchingOrder;
    let updatedTransactions = stitcherKhataTransactions;

    if (current.type === 'ISSUE') {
      const received = stitchingHistory
        .filter(entry => entry.stitchingOrderId === order.id && entry.type === 'RECEIVE' && entry.id !== current.id)
        .reduce((sum, entry) => sum + entry.quantity + (entry.lossQuantity || 0), 0);
      if (updates.quantity < received) {
        throw new Error('Issued quantity cannot be less than the quantity already received or marked as loss.');
      }
      updatedOrder = {
        ...order,
        issueDate: updates.date,
        article: updates.article.trim(),
        qty: updates.quantity,
        rate: updates.rate,
        totalAmount: updates.quantity * updates.rate,
        remainingBalance: Math.max(0, updates.quantity * updates.rate - order.advancePaid),
        remarks: updates.remarks,
        updatedAt: now
      };
      updatedTransactions = stitcherKhataTransactions.map(tx => tx.stitchingOrderId === order.id && tx.type === 'WORK'
        ? { ...tx, date: updates.date, qty: updates.quantity, rate: updates.rate, amount: updatedOrder.totalAmount, description: `Stitching work: ${updatedOrder.article} (${order.orderNo})` }
        : tx);
    } else {
      const otherReceipts = stitchingHistory
        .filter(entry => entry.stitchingOrderId === order.id && entry.type === 'RECEIVE' && entry.id !== current.id)
        .reduce((sum, entry) => sum + entry.quantity, 0);
      const receivedQuantity = otherReceipts + updates.quantity;
      const lossQuantity = Math.max(0, (order.lossQuantity || 0) - (current.lossQuantity || 0));
      if (receivedQuantity + lossQuantity > order.qty) {
        throw new Error('Received and loss quantities cannot exceed the issued quantity.');
      }
      const latestReceipt = [...stitchingHistory.filter(entry => entry.stitchingOrderId === order.id && entry.type === 'RECEIVE' && entry.id !== current.id), updatedEntry]
        .sort((a, b) => b.date.localeCompare(a.date))[0];
      updatedOrder = {
        ...order,
        article: updates.article.trim(),
        receivedQuantity,
        lossQuantity,
        receivedDate: latestReceipt?.date,
        status: receivedQuantity + lossQuantity >= order.qty ? 'Received' : order.status === 'Received' ? 'In Progress' : order.status,
        updatedAt: now
      };
    }

    if (db) {
      const batch = writeBatch(db);
      batch.update(doc(db, 'stitching_history', id), updatedEntry);
      batch.update(doc(db, 'stitching_orders', order.id), updatedOrder);
      updatedTransactions.filter(tx => tx.stitchingOrderId === order.id && tx.type === 'WORK').forEach(tx => {
        batch.update(doc(db, 'stitcher_khata_transactions', tx.id), tx);
      });
      await batch.commit();
    }
    const nextHistory = stitchingHistory.map(entry => entry.id === id ? updatedEntry : entry);
    const nextOrders = stitchingOrders.map(item => item.id === order.id ? updatedOrder : item);
    setStitchingHistory(nextHistory);
    setStitchingOrders(nextOrders);
    setStitcherKhataTransactions(updatedTransactions);
    saveLocal(STORAGE_KEYS.STITCHING_HISTORY, nextHistory);
    saveLocal(STORAGE_KEYS.STITCHING_ORDERS, nextOrders);
    saveLocal(STORAGE_KEYS.STITCHER_KHATA, updatedTransactions);
  };

  const deleteStitchingHistoryEntry = async (id: string): Promise<void> => {
    const entry = stitchingHistory.find(item => item.id === id);
    if (!entry) throw new Error('Stitching ledger entry no longer exists.');
    if (entry.type === 'STATUS') throw new Error('Status audit entries cannot be deleted.');
    const order = stitchingOrders.find(item => item.id === entry.stitchingOrderId);
    if (!order) throw new Error('The linked stitching order no longer exists.');
    const now = new Date().toISOString();
    let nextHistory: StitchingHistoryEntry[];
    let nextOrders: StitchingOrder[];
    let nextTransactions: StitcherKhataTransaction[];

    if (entry.type === 'ISSUE') {
      if (stitchingHistory.some(item => item.stitchingOrderId === order.id && item.type === 'RECEIVE')) {
        throw new Error('This issue has receiving entries. Delete the receiving entries first.');
      }
      nextHistory = stitchingHistory.filter(item => item.stitchingOrderId !== order.id);
      nextOrders = stitchingOrders.filter(item => item.id !== order.id);
      nextTransactions = stitcherKhataTransactions.filter(item => item.stitchingOrderId !== order.id);
      if (db) {
        const batch = writeBatch(db);
        nextHistory.length !== stitchingHistory.length &&
          stitchingHistory.filter(item => item.stitchingOrderId === order.id).forEach(item => batch.delete(doc(db, 'stitching_history', item.id)));
        batch.delete(doc(db, 'stitching_orders', order.id));
        stitcherKhataTransactions.filter(item => item.stitchingOrderId === order.id).forEach(item => batch.delete(doc(db, 'stitcher_khata_transactions', item.id)));
        await batch.commit();
      }
    } else {
      const receivedQuantity = Math.max(0, (order.receivedQuantity || 0) - entry.quantity);
      const lossQuantity = Math.max(0, (order.lossQuantity || 0) - (entry.lossQuantity || 0));
      const remainingReceipts = stitchingHistory.filter(item => item.stitchingOrderId === order.id && item.type === 'RECEIVE' && item.id !== entry.id);
      const latestReceipt = remainingReceipts.sort((a, b) => b.date.localeCompare(a.date))[0];
      const updatedOrder: StitchingOrder = {
        ...order,
        receivedQuantity,
        lossQuantity,
        receivedDate: latestReceipt?.date,
        status: receivedQuantity + lossQuantity >= order.qty ? 'Received' : 'In Progress',
        updatedAt: now
      };
      nextHistory = stitchingHistory.filter(item => item.id !== entry.id);
      nextOrders = stitchingOrders.map(item => item.id === order.id ? updatedOrder : item);
      nextTransactions = stitcherKhataTransactions;
      if (db) {
        const batch = writeBatch(db);
        batch.delete(doc(db, 'stitching_history', entry.id));
        batch.update(doc(db, 'stitching_orders', order.id), updatedOrder);
        await batch.commit();
      }
    }
    setStitchingHistory(nextHistory);
    setStitchingOrders(nextOrders);
    setStitcherKhataTransactions(nextTransactions);
    saveLocal(STORAGE_KEYS.STITCHING_HISTORY, nextHistory);
    saveLocal(STORAGE_KEYS.STITCHING_ORDERS, nextOrders);
    saveLocal(STORAGE_KEYS.STITCHER_KHATA, nextTransactions);
  };

  const addStitcherKhataPayment = async (data: {
    stitcherId: string;
    stitchingOrderId?: string;
    type: 'ADVANCE' | 'PAYMENT_RETURN';
    date: string;
    amount: number;
    description: string;
  }): Promise<StitcherKhataTransaction> => {
    const stitcher = stitchers.find(item => item.id === data.stitcherId);
    if (!stitcher) throw new Error('Select a valid stitcher.');
    if (!Number.isFinite(data.amount) || data.amount <= 0) throw new Error('Payment amount must be greater than zero.');
    const now = new Date().toISOString();
    const id = `stitcher-tx-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const tx: StitcherKhataTransaction = {
      ...data,
      id,
      stitcherName: stitcher.name,
      amount: Number(data.amount),
      description: data.description.trim() || (data.type === 'ADVANCE' ? 'Advance paid' : 'Payment returned'),
      createdAt: now
    };
    const linkedOrder = data.stitchingOrderId
      ? stitchingOrders.find(item => item.id === data.stitchingOrderId && item.stitcherId === stitcher.id)
      : undefined;
    if (data.stitchingOrderId && !linkedOrder) throw new Error('The linked stitching order was not found.');
    if (linkedOrder && data.type === 'ADVANCE' && tx.amount > linkedOrder.remainingBalance) {
      throw new Error('Advance payment cannot exceed the linked order balance.');
    }
    if (linkedOrder && data.type === 'PAYMENT_RETURN' && tx.amount > linkedOrder.advancePaid) {
      throw new Error('Payment return cannot exceed the advance paid on the linked order.');
    }
    const updatedOrder = linkedOrder ? {
      ...linkedOrder,
      advancePaid: Math.max(0, linkedOrder.advancePaid + (data.type === 'ADVANCE' ? tx.amount : -tx.amount)),
      remainingBalance: Math.max(0, linkedOrder.totalAmount - Math.max(0, linkedOrder.advancePaid + (data.type === 'ADVANCE' ? tx.amount : -tx.amount))),
      updatedAt: now
    } : undefined;
    if (db) {
      const batch = writeBatch(db);
      batch.set(doc(db, 'stitcher_khata_transactions', id), tx);
      if (updatedOrder) {
        batch.update(doc(db, 'stitching_orders', updatedOrder.id), {
          advancePaid: updatedOrder.advancePaid,
          remainingBalance: updatedOrder.remainingBalance,
          updatedAt: now
        });
      }
      await batch.commit();
    }
    const nextTransactions = [tx, ...stitcherKhataTransactions];
    setStitcherKhataTransactions(nextTransactions);
    saveLocal(STORAGE_KEYS.STITCHER_KHATA, nextTransactions);
    if (updatedOrder) {
      const nextOrders = stitchingOrders.map(item => item.id === updatedOrder.id ? updatedOrder : item);
      setStitchingOrders(nextOrders);
      saveLocal(STORAGE_KEYS.STITCHING_ORDERS, nextOrders);
    }
    return tx;
  };

  const updateStitcherKhataPayment = async (
    id: string,
    updates: Pick<StitcherKhataTransaction, 'type' | 'date' | 'amount' | 'description'>
  ): Promise<void> => {
    const current = stitcherKhataTransactions.find(item => item.id === id);
    if (!current) throw new Error('Stitcher payment entry no longer exists.');
    if (!updates.date || !Number.isFinite(updates.amount) || updates.amount <= 0) {
      throw new Error('Enter a valid date and payment amount greater than zero.');
    }
    const updated: StitcherKhataTransaction = {
      ...current,
      ...updates,
      description: updates.description.trim() || (updates.type === 'ADVANCE' ? 'Advance paid' : 'Payment returned')
    };
    const order = current.stitchingOrderId
      ? stitchingOrders.find(item => item.id === current.stitchingOrderId)
      : undefined;
    let updatedOrder: StitchingOrder | undefined;
    if (order) {
      const previousContribution = current.type === 'ADVANCE' ? current.amount : -current.amount;
      const nextContribution = updates.type === 'ADVANCE' ? updates.amount : -updates.amount;
      const advancePaid = order.advancePaid - previousContribution + nextContribution;
      if (advancePaid < 0 || advancePaid > order.totalAmount) {
        throw new Error('The changed payment would place the linked order advance outside its valid range.');
      }
      updatedOrder = {
        ...order,
        advancePaid,
        remainingBalance: Math.max(0, order.totalAmount - advancePaid),
        updatedAt: new Date().toISOString()
      };
    }
    if (db) {
      const batch = writeBatch(db);
      batch.update(doc(db, 'stitcher_khata_transactions', id), updated);
      if (updatedOrder) batch.update(doc(db, 'stitching_orders', updatedOrder.id), updatedOrder);
      await batch.commit();
    }
    const nextTransactions = stitcherKhataTransactions.map(item => item.id === id ? updated : item);
    setStitcherKhataTransactions(nextTransactions);
    saveLocal(STORAGE_KEYS.STITCHER_KHATA, nextTransactions);
    if (updatedOrder) {
      const nextOrders = stitchingOrders.map(item => item.id === updatedOrder?.id ? updatedOrder : item);
      setStitchingOrders(nextOrders);
      saveLocal(STORAGE_KEYS.STITCHING_ORDERS, nextOrders);
    }
  };

  const deleteStitcherKhataPayment = async (id: string): Promise<void> => {
    const transaction = stitcherKhataTransactions.find(item => item.id === id);
    if (!transaction || transaction.type === 'WORK') throw new Error('Stitcher payment entry no longer exists.');
    const order = transaction.stitchingOrderId
      ? stitchingOrders.find(item => item.id === transaction.stitchingOrderId)
      : undefined;
    let updatedOrder: StitchingOrder | undefined;
    if (order) {
      const contribution = transaction.type === 'ADVANCE' ? transaction.amount : -transaction.amount;
      const advancePaid = order.advancePaid - contribution;
      if (advancePaid < 0 || advancePaid > order.totalAmount) {
        throw new Error('The linked order balance cannot be reconciled after removing this payment.');
      }
      updatedOrder = {
        ...order,
        advancePaid,
        remainingBalance: Math.max(0, order.totalAmount - advancePaid),
        updatedAt: new Date().toISOString()
      };
    }
    if (db) {
      const batch = writeBatch(db);
      batch.delete(doc(db, 'stitcher_khata_transactions', id));
      if (updatedOrder) batch.update(doc(db, 'stitching_orders', updatedOrder.id), updatedOrder);
      await batch.commit();
    }
    const nextTransactions = stitcherKhataTransactions.filter(item => item.id !== id);
    setStitcherKhataTransactions(nextTransactions);
    saveLocal(STORAGE_KEYS.STITCHER_KHATA, nextTransactions);
    if (updatedOrder) {
      const nextOrders = stitchingOrders.map(item => item.id === updatedOrder?.id ? updatedOrder : item);
      setStitchingOrders(nextOrders);
      saveLocal(STORAGE_KEYS.STITCHING_ORDERS, nextOrders);
    }
  };

  // --- 2. CUTTINGS AUTO LOGIC (2 TYPES: Cutting Man vs Cutter Maker) ---
  const createCutting = (data: {
    orderId: string;
    orderItemId: string;
    cuttingType: CuttingType;
    personId: string;
    qty: number;
    rate: number;
    date: string;
    notes?: string;
  }): Cutting => {
    const targetOrder = orders.find(o => o.id === data.orderId);
    const targetItem = targetOrder?.items.find(i => i.id === data.orderItemId);
    if (!targetOrder || !targetItem) {
      throw new Error("Order or item not found");
    }

    const now = new Date().toISOString();
    const id = 'cut-' + Date.now();
    const totalAmount = data.qty * data.rate;

    let personName = '';
    if (data.cuttingType === 'cutting_man') {
      const worker = staff.find(s => s.id === data.personId);
      personName = worker ? `${worker.name} (Factory Worker)` : 'Factory Cutter';

      // AUTO LOGIC: Create doc in staff_ledger with debit/payable work done
      const slEntry: StaffLedgerEntry = {
        id: 'sl-' + Date.now(),
        staffId: data.personId,
        staffName: worker?.name || 'Worker',
        type: 'credit', // Credit means wage payable to worker
        amount: totalAmount,
        qty: data.qty,
        date: data.date,
        description: `Cutting assigned: ${data.qty} pairs ${targetItem.gloveType} (${targetOrder.orderNo})`,
        cuttingId: id,
        createdAt: now
      };
      const nextStaffLedger = [slEntry, ...staffLedger];
      setStaffLedger(nextStaffLedger);
      saveLocal(STORAGE_KEYS.STAFF_LEDGER, nextStaffLedger);

      // Increase worker unpaid balance
      const updatedStaff = staff.map(s => s.id === data.personId ? { ...s, currentBalance: s.currentBalance + totalAmount } : s);
      setStaff(updatedStaff);
      saveLocal(STORAGE_KEYS.STAFF, updatedStaff);
    } else {
      // Outside Contractor / Cutter Maker
      const party = parties.find(p => p.id === data.personId);
      personName = party ? `${party.name} (Outside Cutter Maker)` : 'Outside Maker';

      // AUTO LOGIC: Create doc in party_transactions with credit (payable to cutter maker)
      const ptx: PartyTransaction = {
        id: 'ptx-' + Date.now(),
        partyId: data.personId,
        partyName: party?.name || 'Cutter Maker',
        type: 'credit', // Credit means we owe them
        amount: totalAmount,
        date: data.date,
        description: `Cutting Job: ${data.qty} pairs ${targetItem.gloveType} for ${targetOrder.orderNo}`,
        referenceType: 'cutting',
        referenceId: id,
        createdAt: now
      };
      const nextPtx = [ptx, ...partyTransactions];
      setPartyTransactions(nextPtx);
      saveLocal(STORAGE_KEYS.PARTY_TXS, nextPtx);

      // Update party currentBalance (decreases because negative = payable we owe)
      const updatedParties = parties.map(p => p.id === data.personId ? { ...p, currentBalance: p.currentBalance - totalAmount } : p);
      setParties(updatedParties);
      saveLocal(STORAGE_KEYS.PARTIES, updatedParties);
    }

    const newCutting: Cutting = {
      id,
      orderId: data.orderId,
      orderNo: targetOrder.orderNo,
      orderItemId: data.orderItemId,
      gloveType: targetItem.gloveType,
      size: targetItem.size || 'Size Matrix',
      color: targetItem.color || '',
      date: data.date,
      cuttingType: data.cuttingType,
      personId: data.personId,
      personName,
      qty: data.qty,
      rate: data.rate,
      totalAmount,
      status: 'Given',
      notes: data.notes,
      createdAt: now
    };

    // AUTO: Update customer_orders items cuttingGivenQty += qty
    const nextOrders = orders.map(ord => {
      if (ord.id === data.orderId) {
        const updatedItems = ord.items.map(itm => {
          if (itm.id === data.orderItemId) {
            return {
              ...itm,
              cuttingGivenQty: itm.cuttingGivenQty + data.qty
            };
          }
          return itm;
        });

        // Auto update order status
        let newStatus = ord.status;
        if (ord.status === 'Pending') {
          newStatus = 'Cutting-Given';
        }

        return {
          ...ord,
          status: newStatus,
          items: updatedItems,
          updatedAt: now
        };
      }
      return ord;
    });

    setOrders(nextOrders);
    saveLocal(STORAGE_KEYS.ORDERS, nextOrders);

    const nextCuttings = [newCutting, ...cuttings];
    setCuttings(nextCuttings);
    saveLocal(STORAGE_KEYS.CUTTINGS, nextCuttings);

    syncFirestoreDoc('cuttings', id, newCutting);
    const updatedOrder = nextOrders.find(o => o.id === data.orderId);
    if (updatedOrder) syncFirestoreDoc('customer_orders', data.orderId, updatedOrder);

    showToast(`Cutting of ${data.qty} pairs assigned to ${personName}`);
    return newCutting;
  };

  // When cutting status is marked 'Received':
  // 1. Add qty to products.currentStock (via stock_ledger entry type='cutting_received')
  // 2. Update customer_orders/items stockReceivedQty += qty
  // 3. Update cuttings collection status='Received'
  // 4. Update order status automatically
  const receiveCutting = (cuttingId: string) => {
    const cut = cuttings.find(c => c.id === cuttingId);
    if (!cut || cut.status === 'Received') return;

    const now = new Date().toISOString();
    const today = now.split('T')[0];

    // Find linked order & item
    const targetOrder = orders.find(o => o.id === cut.orderId);
    const targetItem = targetOrder?.items.find(i => i.id === cut.orderItemId);
    const productId = (targetItem && targetItem.productId) ? targetItem.productId : (products.find(p => p.gloveName === cut.gloveType)?.id || 'unknown-prod');

    // 1. AUTO: Create stock_ledger entry
    const stockEntry: StockLedgerEntry = {
      id: 'stk-' + Date.now(),
      productId,
      productName: `${cut.gloveType} (${cut.size}/${cut.color})`,
      orderId: cut.orderId,
      orderNo: cut.orderNo,
      type: 'cutting_received',
      qty: cut.qty,
      date: today,
      referenceId: cuttingId,
      notes: `Received from ${cut.personName} for Order #${cut.orderNo}`,
      createdAt: now
    };
    const nextStockLedger = [stockEntry, ...stockLedger];
    setStockLedger(nextStockLedger);
    saveLocal(STORAGE_KEYS.STOCK_LEDGER, nextStockLedger);
    syncFirestoreDoc('stock_ledger', stockEntry.id, stockEntry);

    // 2. Recalculate and update product currentStock
    const updatedProducts = products.map(prod => {
      if (prod.id === productId) {
        const newStock = recalculateStockForProduct(productId, nextStockLedger);
        return {
          ...prod,
          currentStock: newStock,
          updatedAt: now
        };
      }
      return prod;
    });
    setProducts(updatedProducts);
    saveLocal(STORAGE_KEYS.PRODUCTS, updatedProducts);
    const updatedProd = updatedProducts.find(p => p.id === productId);
    if (updatedProd) syncFirestoreDoc('products', productId, updatedProd);

    // 3. Update cuttings status to Received
    const nextCuttings = cuttings.map(c => c.id === cuttingId ? { ...c, status: 'Received' as const, receivedDate: today } : c);
    setCuttings(nextCuttings);
    saveLocal(STORAGE_KEYS.CUTTINGS, nextCuttings);
    const updatedCut = nextCuttings.find(c => c.id === cuttingId);
    if (updatedCut) syncFirestoreDoc('cuttings', cuttingId, updatedCut);

    // 4. Update customer_orders items stockReceivedQty += qty & order status
    const nextOrders = orders.map(ord => {
      if (ord.id === cut.orderId) {
        const updatedItems = ord.items.map(itm => {
          if (itm.id === cut.orderItemId) {
            return {
              ...itm,
              stockReceivedQty: itm.stockReceivedQty + cut.qty
            };
          }
          return itm;
        });

        // If all items have stockReceivedQty >= qty, order is 'Stock-Ready', else 'In-Production'
        const allStockReady = updatedItems.every(itm => itm.stockReceivedQty >= itm.qty);
        let newStatus = ord.status;
        if (allStockReady) {
          newStatus = 'Stock-Ready';
        } else {
          newStatus = 'In-Production';
        }

        return {
          ...ord,
          status: newStatus,
          items: updatedItems,
          updatedAt: now
        };
      }
      return ord;
    });
    setOrders(nextOrders);
    saveLocal(STORAGE_KEYS.ORDERS, nextOrders);
    const updatedOrder = nextOrders.find(o => o.id === cut.orderId);
    if (updatedOrder) syncFirestoreDoc('customer_orders', cut.orderId, updatedOrder);

    showToast(`Received ${cut.qty} pairs from ${cut.personName}. Stock increased & order updated!`);
  };

  const deleteCutting = (cuttingId: string) => {
    const cut = cuttings.find(c => c.id === cuttingId);
    if (!cut) return;

    // Rollback cuttingGivenQty on order
    const nextOrders = orders.map(ord => {
      if (ord.id === cut.orderId) {
        const updatedItems = ord.items.map(itm => {
          if (itm.id === cut.orderItemId) {
            return {
              ...itm,
              cuttingGivenQty: Math.max(0, itm.cuttingGivenQty - cut.qty)
            };
          }
          return itm;
        });
        return { ...ord, items: updatedItems };
      }
      return ord;
    });
    setOrders(nextOrders);
    saveLocal(STORAGE_KEYS.ORDERS, nextOrders);

    const nextCuttings = cuttings.filter(c => c.id !== cuttingId);
    setCuttings(nextCuttings);
    saveLocal(STORAGE_KEYS.CUTTINGS, nextCuttings);
    showToast('Cutting entry removed', 'info');
  };

  // --- 3. SALES INVOICES (Billing with automatic stock deduction and ledger updates) ---
  const createSaleInvoice = (invoiceData: {
    orderId: string;
    customerId: string;
    customerName: string;
    date: string;
    items: Array<{
      productId: string;
      gloveType: string;
      size: string;
      color: string;
      qty: number;
      rate: number;
    }>;
    discount: number;
    paidAmount: number;
    paymentMode: 'cash' | 'bank' | 'credit';
    notes?: string;
  }): SaleInvoice => {
    const targetOrder = orders.find(o => o.id === invoiceData.orderId);
    const now = new Date().toISOString();
    const id = 'inv-' + Date.now();
    const invoiceNo = `${settings.invoicePrefix || 'INV-'}${(invoices.length + 1).toString().padStart(3, '0')}`;

    const lineItems = invoiceData.items.map(item => ({
      ...item,
      amount: item.qty * item.rate
    }));

    const subtotal = lineItems.reduce((sum, i) => sum + i.amount, 0);
    const grandTotal = Math.max(0, subtotal - (invoiceData.discount || 0));
    const paidAmount = invoiceData.paidAmount || 0;
    const remaining = Math.max(0, grandTotal - paidAmount);

    let paymentStatus: 'paid' | 'partial' | 'unpaid' = 'unpaid';
    if (paidAmount >= grandTotal) {
      paymentStatus = 'paid';
    } else if (paidAmount > 0) {
      paymentStatus = 'partial';
    }

    const newInvoice: SaleInvoice = {
      id,
      invoiceNo,
      orderId: invoiceData.orderId,
      orderNo: targetOrder?.orderNo || 'DIRECT',
      customerId: invoiceData.customerId,
      customerName: invoiceData.customerName,
      date: invoiceData.date,
      items: lineItems,
      subtotal,
      discount: invoiceData.discount || 0,
      grandTotal,
      paidAmount,
      remaining,
      paymentStatus,
      paymentMode: invoiceData.paymentMode,
      notes: invoiceData.notes,
      createdAt: now
    };

    // 1. AUTO LOGIC: For each item, create stock_ledger entry type='out'
    const newStockEntries: StockLedgerEntry[] = lineItems.map((item, idx) => ({
      id: `stk-out-${idx + 1}-${Date.now()}`,
      productId: item.productId,
      productName: `${item.gloveType} (${item.size}/${item.color})`,
      orderId: invoiceData.orderId,
      orderNo: targetOrder?.orderNo,
      type: 'sale' as const,
      qty: item.qty,
      date: invoiceData.date,
      referenceId: id,
      notes: `Sale Bill #${invoiceNo} to ${invoiceData.customerName}`,
      createdAt: now
    }));

    const nextStockLedger = [...newStockEntries, ...stockLedger];
    setStockLedger(nextStockLedger);
    saveLocal(STORAGE_KEYS.STOCK_LEDGER, nextStockLedger);

    // 2. AUTO LOGIC: Recalculate currentStock for affected products
    const updatedProducts = products.map(prod => {
      const soldItem = lineItems.find(i => i.productId === prod.id);
      if (soldItem) {
        const newStock = recalculateStockForProduct(prod.id, nextStockLedger);
        return {
          ...prod,
          currentStock: newStock,
          updatedAt: now
        };
      }
      return prod;
    });
    setProducts(updatedProducts);
    saveLocal(STORAGE_KEYS.PRODUCTS, updatedProducts);

    // 3. AUTO LOGIC: Update customer_orders items billedQty += qty & order status
    let nextOrders = orders;
    if (targetOrder) {
      nextOrders = orders.map(ord => {
        if (ord.id === invoiceData.orderId) {
          const updatedItems = ord.items.map(itm => {
            const invoicedLine = lineItems.find(li => li.productId === itm.productId && li.size === itm.size && li.color === itm.color);
            if (invoicedLine) {
              const newBilled = itm.billedQty + invoicedLine.qty;
              return {
                ...itm,
                billedQty: newBilled,
                pendingQty: Math.max(0, itm.qty - newBilled)
              };
            }
            return itm;
          });

          // Check if order is fully billed
          const allBilled = updatedItems.every(itm => itm.billedQty >= itm.qty);
          const anyBilled = updatedItems.some(itm => itm.billedQty > 0);

          return {
            ...ord,
            status: allBilled ? 'Completed' : anyBilled ? 'Partial-Billed' : ord.status,
            items: updatedItems,
            updatedAt: now
          };
        }
        return ord;
      });
      setOrders(nextOrders);
      saveLocal(STORAGE_KEYS.ORDERS, nextOrders);
    }

    // 4. Create a customer ledger transaction.
    if (invoiceData.customerId) {
      const ptx: PartyTransaction = {
        id: 'ptx-' + Date.now(),
        partyId: invoiceData.customerId,
        partyName: invoiceData.customerName,
        type: 'debit', // Customer owes us (Receivable)
        amount: remaining > 0 ? remaining : grandTotal,
        date: invoiceData.date,
        description: `Sale Invoice #${invoiceNo} (Remaining Due: ${settings.currency} ${remaining})`,
        referenceType: 'sale_invoice',
        referenceId: id,
        createdAt: now
      };
      const nextPtx = [ptx, ...partyTransactions];
      setPartyTransactions(nextPtx);
      saveLocal(STORAGE_KEYS.PARTY_TXS, nextPtx);

      // 5. Update parties currentBalance (increases receivable)
      const nextParties = parties.map(p => {
        if (p.id === invoiceData.customerId) {
          return {
            ...p,
            currentBalance: p.currentBalance + remaining,
            updatedAt: now
          };
        }
        return p;
      });
      setParties(nextParties);
      saveLocal(STORAGE_KEYS.PARTIES, nextParties);
    }

    // 6. AUTO LOGIC: If paidAmount > 0 and cash/bank paid, log to Cashbook
    if (paidAmount > 0 && (invoiceData.paymentMode === 'cash' || invoiceData.paymentMode === 'bank')) {
      const cbEntry: CashbookEntry = {
        id: 'cb-' + Date.now(),
        type: 'in',
        amount: paidAmount,
        date: invoiceData.date,
        category: 'Sale Invoice Collection',
        paymentMode: invoiceData.paymentMode,
        description: `Bill #${invoiceNo} - ${invoiceData.customerName}`,
        referenceId: id,
        createdAt: now
      };
      const nextCb = [cbEntry, ...cashbook];
      setCashbook(nextCb);
      saveLocal(STORAGE_KEYS.CASHBOOK, nextCb);
    }

    const nextInvoices = [newInvoice, ...invoices];
    setInvoices(nextInvoices);
    saveLocal(STORAGE_KEYS.INVOICES, nextInvoices);

    syncFirestoreDoc('sales_invoices', id, newInvoice);

    // AUTO LOGIC: Record in order_dispatch_history for this order (Immutable PO)
    if (invoiceData.orderId) {
      const totalPairsDispatched = lineItems.reduce((s, i) => s + i.qty, 0);
      const remainingBalance = Math.max(0, (targetOrder?.totalPairs || 0) - totalPairsDispatched);
      const dispatchHistoryEntry: OrderDispatchHistory = {
        id: 'disp-' + Date.now(),
        orderId: invoiceData.orderId,
        orderNo: targetOrder?.orderNo || '',
        date: invoiceData.date,
        actionType: 'dispatched_to_customer',
        quantity: totalPairsDispatched,
        personName: invoiceData.customerName,
        notes: `Billed & Dispatched via Invoice #${invoiceNo}`,
        remainingBalance,
        createdAt: now
      };
      const nextHistory = [dispatchHistoryEntry, ...orderDispatchHistory];
      setOrderDispatchHistory(nextHistory);
      saveLocal(STORAGE_KEYS.ORDER_HISTORY, nextHistory);
      syncFirestoreDoc('order_dispatch_history', dispatchHistoryEntry.id, dispatchHistoryEntry);

      if (db) {
        try {
          const subHistoryRef = doc(collection(db, 'customer_orders', invoiceData.orderId, 'order_history'));
          setDoc(subHistoryRef, dispatchHistoryEntry);
        } catch (e) {
          console.error('Error logging order dispatch history:', e);
        }
      }
    }

    showToast(`Invoice ${invoiceNo} generated. Stock deducted and customer ledger updated.`);
    return newInvoice;
  };

  const deleteSaleInvoice = (invoiceId: string) => {
    const inv = invoices.find(i => i.id === invoiceId);
    if (!inv) return;

    // Rollback stock ledger entries for this invoice
    const nextStockLedger = stockLedger.filter(s => s.referenceId !== invoiceId);
    setStockLedger(nextStockLedger);
    saveLocal(STORAGE_KEYS.STOCK_LEDGER, nextStockLedger);

    // Recalculate stock
    const updatedProducts = products.map(prod => {
      const sold = inv.items.find(i => i.productId === prod.id);
      if (sold) {
        return {
          ...prod,
          currentStock: recalculateStockForProduct(prod.id, nextStockLedger),
          updatedAt: new Date().toISOString()
        };
      }
      return prod;
    });
    setProducts(updatedProducts);
    saveLocal(STORAGE_KEYS.PRODUCTS, updatedProducts);

    // Rollback party balance
    if (inv.customerId && inv.remaining > 0) {
      const nextParties = parties.map(p => {
        if (p.id === inv.customerId) {
          return {
            ...p,
            currentBalance: p.currentBalance - inv.remaining
          };
        }
        return p;
      });
      setParties(nextParties);
      saveLocal(STORAGE_KEYS.PARTIES, nextParties);
    }

    const nextInvoices = invoices.filter(i => i.id !== invoiceId);
    setInvoices(nextInvoices);
    saveLocal(STORAGE_KEYS.INVOICES, nextInvoices);

    showToast(`Invoice #${inv.invoiceNo} cancelled and stock restored`, 'info');
  };

  // --- 4. Raw Material Purchase (Leather Buying) ---
  const createPurchase = (data: {
    supplierId: string;
    supplierName: string;
    date: string;
    material: string;
    qty: number;
    unit: string;
    rate: number;
    paid: number;
    paymentMode: 'cash' | 'bank' | 'credit';
    notes?: string;
  }): Purchase => {
    const now = new Date().toISOString();
    const id = 'pur-' + Date.now();
    const total = data.qty * data.rate;
    const remaining = Math.max(0, total - data.paid);

    const newPurchase: Purchase = {
      id,
      supplierId: data.supplierId,
      supplierName: data.supplierName,
      date: data.date,
      material: data.material,
      qty: data.qty,
      unit: data.unit,
      rate: data.rate,
      total,
      paid: data.paid,
      remaining,
      paymentMode: data.paymentMode,
      notes: data.notes,
      createdAt: now
    };

    // 1. Update Raw Material Stock
    const existingRaw = rawMaterials.find(r => r.material.toLowerCase() === data.material.toLowerCase());
    let nextRawMaterials: RawMaterialStock[];
    if (existingRaw) {
      nextRawMaterials = rawMaterials.map(r => r.id === existingRaw.id ? {
        ...r,
        currentStock: r.currentStock + data.qty,
        lastPurchaseRate: data.rate,
        updatedAt: now
      } : r);
    } else {
      nextRawMaterials = [
        ...rawMaterials,
        {
          id: 'raw-' + Date.now(),
          material: data.material,
          unit: data.unit,
          currentStock: data.qty,
          lastPurchaseRate: data.rate,
          updatedAt: now
        }
      ];
    }
    setRawMaterials(nextRawMaterials);
    saveLocal(STORAGE_KEYS.RAW_MATERIALS, nextRawMaterials);

    // 2. Add supplier ledger transactions.
    if (data.supplierId) {
      const ptx: PartyTransaction = {
        id: 'ptx-' + Date.now(),
        partyId: data.supplierId,
        partyName: data.supplierName,
        type: 'credit', // We owe supplier
        amount: remaining > 0 ? remaining : total,
        date: data.date,
        description: `Leather / Raw Material Purchase: ${data.qty} ${data.unit} ${data.material}`,
        referenceType: 'purchase',
        referenceId: id,
        createdAt: now
      };
      const nextPtx = [ptx, ...partyTransactions];
      setPartyTransactions(nextPtx);
      saveLocal(STORAGE_KEYS.PARTY_TXS, nextPtx);

      // Update supplier currentBalance (more negative = we owe more)
      const nextParties = parties.map(p => {
        if (p.id === data.supplierId) {
          return {
            ...p,
            currentBalance: p.currentBalance - remaining,
            updatedAt: now
          };
        }
        return p;
      });
      setParties(nextParties);
      saveLocal(STORAGE_KEYS.PARTIES, nextParties);
    }

    // 3. If paid > 0, log cash out in Cashbook
    if (data.paid > 0 && (data.paymentMode === 'cash' || data.paymentMode === 'bank')) {
      const cbEntry: CashbookEntry = {
        id: 'cb-' + Date.now(),
        type: 'out',
        amount: data.paid,
        date: data.date,
        category: 'Raw Leather Purchase',
        paymentMode: data.paymentMode,
        description: `Purchase: ${data.material} from ${data.supplierName}`,
        referenceId: id,
        createdAt: now
      };
      const nextCb = [cbEntry, ...cashbook];
      setCashbook(nextCb);
      saveLocal(STORAGE_KEYS.CASHBOOK, nextCb);
    }

    const nextPurchases = [newPurchase, ...purchases];
    setPurchases(nextPurchases);
    saveLocal(STORAGE_KEYS.PURCHASES, nextPurchases);

    showToast(`Leather purchase recorded: ${data.qty} ${data.unit} added to raw material stock`);
    return newPurchase;
  };

  // --- 5. Expenses & Cashbook ---
  const addExpense = (data: Omit<Expense, 'id' | 'createdAt'>): Expense => {
    const now = new Date().toISOString();
    const id = 'exp-' + Date.now();
    const newExpense: Expense = {
      ...data,
      id,
      createdAt: now
    };
    const nextExpenses = [newExpense, ...expenses];
    setExpenses(nextExpenses);
    saveLocal(STORAGE_KEYS.EXPENSES, nextExpenses);

    // Auto debit cashbook
    const cbEntry: CashbookEntry = {
      id: 'cb-' + Date.now(),
      type: 'out',
      amount: data.amount,
      date: data.date,
      category: data.category,
      paymentMode: data.paymentMode,
      description: `${data.category}: ${data.title}`,
      referenceId: id,
      createdAt: now
    };
    const nextCb = [cbEntry, ...cashbook];
    setCashbook(nextCb);
    saveLocal(STORAGE_KEYS.CASHBOOK, nextCb);

    showToast(`Expense of ${settings.currency} ${data.amount} recorded`);
    return newExpense;
  };

  const deleteExpense = (id: string) => {
    const next = expenses.filter(e => e.id !== id);
    setExpenses(next);
    saveLocal(STORAGE_KEYS.EXPENSES, next);
    const nextCb = cashbook.filter(cb => cb.referenceId !== id);
    setCashbook(nextCb);
    saveLocal(STORAGE_KEYS.CASHBOOK, nextCb);
    showToast('Expense removed', 'info');
  };

  const addCashbookEntry = (data: Omit<CashbookEntry, 'id' | 'createdAt'>): CashbookEntry => {
    const now = new Date().toISOString();
    const id = 'cb-' + Date.now();
    const newEntry: CashbookEntry = {
      ...data,
      id,
      createdAt: now
    };
    const next = [newEntry, ...cashbook];
    setCashbook(next);
    saveLocal(STORAGE_KEYS.CASHBOOK, next);
    showToast(`Cashbook ${data.type === 'in' ? 'Cash Inflow' : 'Cash Outflow'} recorded`);
    return newEntry;
  };

  const deleteCashbookEntry = (id: string) => {
    const next = cashbook.filter(c => c.id !== id);
    setCashbook(next);
    saveLocal(STORAGE_KEYS.CASHBOOK, next);
    showToast('Cashbook entry removed', 'info');
  };

  // --- 6. Staff Attendance ---
  const markAttendance = (record: Omit<StaffAttendance, 'id'>) => {
    const id = 'att-' + Date.now();
    const newRecord: StaffAttendance = { ...record, id };
    const next = [newRecord, ...attendance];
    setAttendance(next);
    saveLocal(STORAGE_KEYS.ATTENDANCE, next);
    showToast(`Attendance marked for ${record.staffName}`);
  };

  const updateSettings = (newSettings: Partial<FactorySettings>) => {
    const next = { ...settings, ...newSettings };
    setSettings(next);
    saveLocal(STORAGE_KEYS.SETTINGS, next);
    showToast('Factory settings saved successfully');
  };

  const clearAllFactoryData = () => {
    Object.values(STORAGE_KEYS).forEach(k => localStorage.removeItem(k));
    setParties([]);
    setStaff([]);
    setProducts([]);
    setOrders([]);
    setCuttings([]);
    setStockLedger([]);
    setInvoices([]);
    setPartyTransactions([]);
    setStaffLedger([]);
    setPurchases([]);
    setRawMaterials([]);
    setExpenses([]);
    setCashbook([]);
    setAttendance([]);
    setStitchers([]);
    setStitchingOrders([]);
    setStitcherKhataTransactions([]);
    setStitchingHistory([]);
    showToast('All factory records reset to clean slate', 'info');
  };

  return (
    <FactoryContext.Provider
      value={{
        activeModule,
        setActiveModule,
        selectedOrderId,
        setSelectedOrderId,
        selectedInvoiceId,
        setSelectedInvoiceId,
        parties,
        staff,
        products,
        orders,
        cuttings,
        cutters,
        stitchers,
        stitchingOrders,
        stitcherKhataTransactions,
        stitchingHistory,
        cuttingTransactions,
        cuttingEntries,
        orderDispatchHistory,
        stockLedger,
        stockManagement,
        articleStock,
        deliveryHistory,
        articlesMaster: [...new Map(
          [...articlesMaster, ...articleCatalog, ...legacyArticleMaster]
            .map(article => [article.articleName.trim().toLocaleLowerCase(), article] as const)
        ).values()].sort((a, b) => a.articleName.localeCompare(b.articleName)),
        invoices,
        partyTransactions,
        staffLedger,
        purchases,
        rawMaterials,
        expenses,
        cashbook,
        attendance,
        settings,
        toasts,
        showToast,
        removeToast,
        addCutter,
        updateCutter,
        setCutterActive,
        deleteCutter,
        saveCuttingTransaction,
        deleteCuttingTransaction,
        updateCuttingEntry,
        deleteCuttingEntry,
        updateCuttingReturn,
        deleteCuttingReturn,
        clearCuttingData,
        returnCutting,
        createArticleMaster,
        deliverFromStock,
        addStockReceipt,
        deleteFactoryStock,
        updateStockDelivery,
        deleteStockDelivery,
        addStitcher,
        updateStitcher,
        deleteStitcher,
        createStitchingOrder,
        updateStitchingOrderStatus,
        receiveStitchingOrder,
        updateStitchingHistoryEntry,
        deleteStitchingHistoryEntry,
        addStitcherKhataPayment,
        updateStitcherKhataPayment,
        deleteStitcherKhataPayment,
        addParty,
        updateParty,
        deleteParty,
        addStaff,
        updateStaff,
        deleteStaff,
        payStaffWage,
        addProduct,
        updateProduct,
        deleteProduct,
        loadFactoryPresets,
        createCustomerOrder,
        updateCustomerOrder,
        updateOrderStatus,
        deleteCustomerOrder,
        createCutting,
        receiveCutting,
        deleteCutting,
        createSaleInvoice,
        deleteSaleInvoice,
        createPurchase({ ...data }) {
          return createPurchase(data);
        },
        addExpense,
        deleteExpense,
        addCashbookEntry,
        deleteCashbookEntry,
        markAttendance,
        updateSettings,
        clearAllFactoryData
      }}
    >
      {children}
    </FactoryContext.Provider>
  );
};

export const useFactory = () => {
  const ctx = useContext(FactoryContext);
  if (!ctx) throw new Error('useFactory must be used within FactoryProvider');
  return ctx;
};
