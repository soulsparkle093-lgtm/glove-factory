import React, { createContext, useContext, useState, useEffect, useMemo, useRef } from 'react';
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
  FactoryArticleMaster,
  StockInHistoryItem,
  StockOutHistoryItem,
  DistinctArticleStock,
  CompanyOrderStats,
  OrderCompany
} from '../types/factory';
import { 
  defaultFactorySettings, 
  FactorySettings, 
  GLOVE_TEMPLATE_PRESETS,
  initialParties,
  initialOrders,
  initialCuttings,
  initialStockLedger
} from '../data/initialFactoryData';
import { formatStockInDateTime, safeStringCompare, toComparableString } from '../utils/factoryFormatters';
import { 
  db, 
  isFirebaseOnline, 
  collection, 
  doc, 
  getDoc,
  getDocs, 
  query,
  where,
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
  ORDER_HISTORY: 'gferp_order_dispatch_history_v3',
  ORDER_COMPANIES: 'gferp_order_companies_v1',
  DELETED_CUTTING_IDS: 'gferp_deleted_cutting_ids_v1',
  STOCK_OUT: 'gferp_stock_out_v1',
  DELETED_DELIVERY_IDS: 'gferp_deleted_delivery_ids_v1',
  DELETED_ORDER_IDS: 'gferp_deleted_order_ids_v1'
};

// Recursively remove `undefined` values from plain objects/arrays before writing to Firestore,
// while leaving Firestore FieldValue sentinels (increment, arrayUnion, serverTimestamp) untouched.
const stripUndefined = <T,>(input: T): T => {
  if (input === null || input === undefined) return input;
  if (Array.isArray(input)) {
    return input
      .filter(item => item !== undefined)
      .map(item => stripUndefined(item)) as unknown as T;
  }
  if (typeof input === 'object') {
    const proto = Object.getPrototypeOf(input);
    const isPlainObject = proto === Object.prototype || proto === null;
    if (!isPlainObject) return input;
    const out: Record<string, unknown> = {};
    Object.entries(input as Record<string, unknown>).forEach(([k, v]) => {
      if (v !== undefined) {
        out[k] = stripUndefined(v);
      }
    });
    return out as T;
  }
  return input;
};

const dedupeCuttersList = (rawList: Cutter[]): Cutter[] => {
  const map = new Map<string, Cutter>();
  (rawList || []).forEach(c => {
    if (!c || !c.id) return;
    if (['cutter-1', 'cutter-2', 'cutter-3', 'cutter-4', 'cutter-5', 'cutter-6', 'cutter-7'].includes(c.id)) return;
    const safeName = String(c.name || c.khataName || c.id || 'Cutting Master').trim() || 'Cutting Master';
    const normalized: Cutter = {
      ...c,
      id: String(c.id),
      name: safeName,
      khataName: String(c.khataName || `${safeName} Ledger`).trim(),
      cutterType: c.cutterType || 'cutting_man',
      isActive: c.isActive !== false,
      status: c.status || (c.isActive === false ? 'deactive' : 'active')
    };
    map.set(normalized.id, normalized);
  });
  return Array.from(map.values());
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

export interface DeletedProductItem {
  id: string;
  name: string;
  displayName: string;
  deletedAt: string;
}

interface FactoryContextType {
  activeModule: FactoryModule;
  setActiveModule: (m: FactoryModule) => void;
  selectedOrderId: string | null;
  setSelectedOrderId: (id: string | null) => void;
  selectedInvoiceId: string | null;
  setSelectedInvoiceId: (id: string | null) => void;
  selectedCompanyName: string | null;
  setSelectedCompanyName: (name: string | null) => void;

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
  deletedProductsList: DeletedProductItem[];

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
    isExtraCutting?: boolean;
    extraCuttingQty?: number;
    notes?: string;
  }) => Promise<CuttingTransaction>;
  deleteCuttingTransaction: (id: string) => Promise<void>;
  updateCuttingEntry: (id: string, updates: Partial<CuttingEntry>) => Promise<void>;
  deleteCuttingEntry: (id: string) => Promise<void>;
  updateCuttingReturn: (id: string, updates: Pick<CuttingEntry, 'date' | 'remarks' | 'pairs' | 'rate'>) => Promise<void>;
  deleteCuttingReturn: (id: string) => Promise<void>;
  clearCuttingData: () => Promise<void>;
  returnCutting: (data: {
    originalEntryId: string;
    quantity: number;
    reason: 'Damaged' | 'Wrong Size' | 'Quality' | string;
    date: string;
    remarks?: string;
  }) => Promise<CuttingEntry>;
  createArticleMaster: (data: Omit<FactoryArticleMaster, 'id' | 'createdAt'>) => Promise<FactoryArticleMaster>;
  addStockReceipt: (data: {
    article: string;
    size: string;
    quantity: number;
    date: string;
    totalBalance?: number;
    source?: string;
  }) => Promise<void>;
  deliverFromStock: (data: {
    stockId?: string;
    orderId: string;
    customerName: string;
    quantity: number;
    date: string;
    article?: string;
    size?: string;
    billNo?: string;
    gatePassNo?: string;
    rate?: number;
    amount?: number;
    vehicleNo?: string;
    driverName?: string;
    biltyNo?: string;
    status?: 'Delivered' | 'Partial Delivered' | 'Pending';
    notes?: string;
  }) => Promise<void>;
  deleteFactoryStock: (id: string) => Promise<void>;
  updateStockDelivery: (id: string, updates: Partial<DeliveryHistoryEntry>) => Promise<void>;
  deleteStockDelivery: (id: string, fallbackMeta?: { article?: string; quantity?: number; orderId?: string }) => Promise<void>;
  clearAllStockOutData: () => Promise<void>;
  deleteStockInEntry: (id: string) => Promise<void>;
  updateArticleName: (oldName: string, newName: string) => Promise<void>;
  deleteWholeArticle: (articleName: string) => Promise<void>;
  restoreArticle: (articleName: string) => Promise<void>;
  getCuttingLedgerByCutter: (cutterId: string) => CuttingEntry[];
  getStockInHistory: (articleName: string) => StockInHistoryItem[];
  getStockOutHistory: (articleName: string) => StockOutHistoryItem[];
  getDistinctArticles: () => DistinctArticleStock[];

  // Customer Order Companies
  getCompanyStats: () => CompanyOrderStats[];
  updateCompanyAndSyncOrders: (oldName: string, updates: Partial<OrderCompany>) => Promise<void>;
  toggleCompanyComplete: (companyName: string, isCompleted: boolean) => Promise<void>;
  upsertOrderCompany: (company: Partial<OrderCompany> & { name: string }) => Promise<void>;

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
  deleteProduct: (id: string) => Promise<void>;
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
      article?: string;
      title: string;
      gloveType?: string;
      color?: string;
      leatherType?: string;
      sizes: { small: number; medium: number; large: number; xl: number; xxl: number };
      customSizes?: Array<{ size: string; quantity: number }>;
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
        size?: string;
        sizes?: { small: number; medium: number; large: number; xl: number; xxl: number };
        customSizes?: Array<{ id?: string; size: string; quantity: number }>;
        totalPairs: number;
        rate?: number;
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
  const [selectedCompanyName, setSelectedCompanyName] = useState<string | null>(null);

  const [parties, setParties] = useState<Party[]>(() => {
    const local = loadLocal<Party[]>(STORAGE_KEYS.PARTIES, []);
    let list = [...local];
    initialParties.forEach(ip => {
      if (!list.some(p => p.id === ip.id || p.name.toLowerCase() === ip.name.toLowerCase())) {
        list.push(ip);
      }
    });
    return list;
  });
  const [staff, setStaff] = useState<Staff[]>(() => loadLocal(STORAGE_KEYS.STAFF, []));
  const [products, setProducts] = useState<Product[]>(() => loadLocal(STORAGE_KEYS.PRODUCTS, []));
  const [orders, setOrders] = useState<CustomerOrder[]>(() => {
    const deletedOrds = new Set(loadLocal<string[]>(STORAGE_KEYS.DELETED_ORDER_IDS, []));
    const local = loadLocal<CustomerOrder[]>(STORAGE_KEYS.ORDERS, []).filter(o => !deletedOrds.has(o.id));
    let list = [...local];
    initialOrders.forEach(io => {
      if (deletedOrds.has(io.id)) return;
      const idx = list.findIndex(o => o.orderNo === io.orderNo || o.id === io.id);
      if (idx === -1) {
        list.push(io);
      } else {
        const existing = list[idx];
        const isOrd004 = io.orderNo === 'ORD-004' && (existing.orderNo === 'ORD-004' || existing.customerName?.toLowerCase() === 'traders');
        if (isOrd004) {
          const hasCustomSizes = existing.items?.some(i => i.customSizes && i.customSizes.length >= 2);
          if (!hasCustomSizes) {
            list[idx] = { ...existing, items: io.items, totalPairs: 16000, originalTotalPairs: 16000 };
          }
        }
      }
    });
    return list;
  });
  const [cuttings, setCuttings] = useState<Cutting[]>(() => {
    const deletedCuts = new Set(loadLocal<string[]>(STORAGE_KEYS.DELETED_CUTTING_IDS, []));
    const deletedOrds = new Set(loadLocal<string[]>(STORAGE_KEYS.DELETED_ORDER_IDS, []));
    const local = loadLocal<Cutting[]>(STORAGE_KEYS.CUTTINGS, []).filter(
      c => !deletedCuts.has(c.id) && !deletedOrds.has(c.orderId)
    );
    let list = [...local];
    initialCuttings.forEach(ic => {
      if (deletedCuts.has(ic.id) || deletedOrds.has(ic.orderId)) return;
      if (!list.some(c => c.id === ic.id)) {
        list.push(ic);
      }
    });
    return list;
  });
  const [cutters, setCutters] = useState<Cutter[]>(() => {
    const local = loadLocal<Cutter[]>(STORAGE_KEYS.CUTTERS, []);
    return dedupeCuttersList(local);
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
  const [deliveryHistory, setDeliveryHistory] = useState<DeliveryHistoryEntry[]>(() => {
    const deletedDels = new Set(loadLocal<string[]>(STORAGE_KEYS.DELETED_DELIVERY_IDS, []));
    const deletedOrds = new Set(loadLocal<string[]>(STORAGE_KEYS.DELETED_ORDER_IDS, []));
    return loadLocal<DeliveryHistoryEntry[]>(STORAGE_KEYS.STOCK_OUT, []).filter(
      d => !deletedDels.has(d.id) && !deletedOrds.has(d.orderId || '') && !deletedOrds.has(d.customerOrderId || '')
    );
  });
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
  const [deletedProductsList, setDeletedProductsList] = useState<DeletedProductItem[]>(() =>
    loadLocal<DeletedProductItem[]>('gferp_deleted_products_v1', [])
  );
  const [deletedCuttingIdsList, setDeletedCuttingIdsList] = useState<string[]>(() =>
    loadLocal<string[]>(STORAGE_KEYS.DELETED_CUTTING_IDS, [])
  );
  const [deletedOrderIdsList, setDeletedOrderIdsList] = useState<string[]>(() =>
    loadLocal<string[]>(STORAGE_KEYS.DELETED_ORDER_IDS, [])
  );
  const [deletedDeliveryIdsList, setDeletedDeliveryIdsList] = useState<string[]>(() =>
    loadLocal<string[]>(STORAGE_KEYS.DELETED_DELIVERY_IDS, [])
  );
  const [orderCompanies, setOrderCompanies] = useState<OrderCompany[]>(() =>
    loadLocal<OrderCompany[]>(STORAGE_KEYS.ORDER_COMPANIES, [])
  );

  const deletedProductNames = useMemo(() => {
    const s = new Set<string>();
    deletedProductsList.forEach(item => {
      if (item.name) s.add(item.name.trim().toLowerCase());
    });
    return s;
  }, [deletedProductsList]);

  const deletedProductNamesRef = useRef<Set<string>>(deletedProductNames);
  deletedProductNamesRef.current = deletedProductNames;

  const deletedCuttingIdSet = useMemo(() => new Set(deletedCuttingIdsList), [deletedCuttingIdsList]);
  const deletedCuttingIdsRef = useRef<Set<string>>(deletedCuttingIdSet);
  deletedCuttingIdsRef.current = deletedCuttingIdSet;

  const deletedOrderIdSet = useMemo(() => new Set(deletedOrderIdsList), [deletedOrderIdsList]);
  const deletedOrderIdsRef = useRef<Set<string>>(deletedOrderIdSet);
  deletedOrderIdsRef.current = deletedOrderIdSet;

  const deletedDeliveryIdSet = useMemo(() => new Set(deletedDeliveryIdsList), [deletedDeliveryIdsList]);
  const deletedDeliveryIdsRef = useRef<Set<string>>(deletedDeliveryIdSet);
  deletedDeliveryIdsRef.current = deletedDeliveryIdSet;

  const snapshotReadyRef = useRef({
    cuttingEntries: false,
    cuttingTxs: false,
    stockManagement: false,
    articleStock: false
  });
  const [snapshotsReadyTick, setSnapshotsReadyTick] = useState(0);
  const backfilledCuttingIdsRef = useRef<Set<string>>(new Set());
  const isBackfillingCuttingStockRef = useRef(false);

  const getCuttingSignature = (item: {
    cutterId?: string;
    date?: string;
    article?: string;
    articleTitle?: string;
    size?: string;
    sizeName?: string;
    pairs?: number;
    quantity?: number;
    totalQty?: number;
    qty?: number;
    type?: string;
    orderId?: string;
    orderNo?: string;
    customerName?: string;
  }): string => {
    const artKey = (item.articleTitle || item.article || '').trim().toLowerCase();
    const sizeKey = (item.sizeName || item.size || '').trim().toLowerCase();
    const cutterKey = (item.cutterId || '').trim();
    const dateKey = (item.date || '').slice(0, 10);
    const pairsKey = Math.abs(Number(item.pairs ?? item.totalQty ?? item.quantity ?? item.qty ?? 0));
    const typeKey = item.type || 'RECEIVE';
    const orderKey = (item.orderId || item.orderNo || (item.customerName || '').toLowerCase().trim());
    return `${cutterKey}__${dateKey}__${artKey}__${sizeKey}__${pairsKey}__${typeKey}__${orderKey}`;
  };

  const unmarkDeletedArticle = async (articleName: string): Promise<void> => {
    const norm = (articleName || '').trim().toLowerCase();
    if (!norm) return;
    if (deletedProductNamesRef.current.has(norm)) {
      const next = loadLocal<DeletedProductItem[]>('gferp_deleted_products_v1', []).filter(
        d => (d.name || '').trim().toLowerCase() !== norm
      );
      saveLocal('gferp_deleted_products_v1', next);
      setDeletedProductsList(next);
      const nextSet = new Set(deletedProductNamesRef.current);
      nextSet.delete(norm);
      deletedProductNamesRef.current = nextSet;
    }
    if (db) {
      await deleteDoc(doc(db, 'deleted_products', norm)).catch(() => {});
    }
  };

  const markCuttingIdsDeleted = async (ids: Iterable<string>): Promise<void> => {
    const idList = Array.from(new Set(Array.from(ids).map(i => (i || '').trim()).filter(Boolean)));
    if (idList.length === 0) return;

    const currentLocal = loadLocal<string[]>(STORAGE_KEYS.DELETED_CUTTING_IDS, []);
    const mergedSet = new Set<string>([...currentLocal, ...deletedCuttingIdsRef.current, ...idList]);
    const mergedArr = Array.from(mergedSet);
    deletedCuttingIdsRef.current = mergedSet;
    saveLocal(STORAGE_KEYS.DELETED_CUTTING_IDS, mergedArr);
    setDeletedCuttingIdsList(mergedArr);

    if (db) {
      const now = new Date().toISOString();
      await Promise.allSettled(
        idList.map(delId => setDoc(doc(db!, 'deleted_cutting_ids', delId), { id: delId, deletedAt: now }, { merge: true }))
      );
    }
  };

  const markOrdersDeleted = async (ids: Iterable<string>): Promise<void> => {
    const idList = Array.from(new Set(Array.from(ids).map(i => (i || '').trim()).filter(Boolean)));
    if (idList.length === 0) return;

    const currentLocal = loadLocal<string[]>(STORAGE_KEYS.DELETED_ORDER_IDS, []);
    const mergedSet = new Set<string>([...currentLocal, ...deletedOrderIdsRef.current, ...idList]);
    const mergedArr = Array.from(mergedSet);
    deletedOrderIdsRef.current = mergedSet;
    saveLocal(STORAGE_KEYS.DELETED_ORDER_IDS, mergedArr);
    setDeletedOrderIdsList(mergedArr);

    if (db) {
      const now = new Date().toISOString();
      await Promise.allSettled(
        idList.map(delId => setDoc(doc(db!, 'deleted_order_ids', delId), { id: delId, deletedAt: now }, { merge: true }))
      );
    }
  };

  const markDeliveriesDeleted = async (ids: Iterable<string>): Promise<void> => {
    const idList = Array.from(new Set(Array.from(ids).map(i => (i || '').trim()).filter(Boolean)));
    if (idList.length === 0) return;

    const currentLocal = loadLocal<string[]>(STORAGE_KEYS.DELETED_DELIVERY_IDS, []);
    const mergedSet = new Set<string>([...currentLocal, ...deletedDeliveryIdsRef.current, ...idList]);
    const mergedArr = Array.from(mergedSet);
    deletedDeliveryIdsRef.current = mergedSet;
    saveLocal(STORAGE_KEYS.DELETED_DELIVERY_IDS, mergedArr);
    setDeletedDeliveryIdsList(mergedArr);

    if (db) {
      const now = new Date().toISOString();
      await Promise.allSettled(
        idList.map(delId => setDoc(doc(db!, 'deleted_delivery_ids', delId), { id: delId, deletedAt: now }, { merge: true }))
      );
    }
  };

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
        let list = snap.docs
          .filter(d => !deletedOrderIdsRef.current.has(d.id) && !d.data()?.isDeleted)
          .map(d => {
          const data = d.data();
          const items = (data.items || []).map((itm: any, idx: number) => {
            const sizes = itm.sizes || {
              small: 0,
              medium: 0,
              large: itm.qty || 0,
              xl: 0,
              xxl: 0
            };

            const customSizes = Array.isArray(itm.customSizes) && itm.customSizes.length > 0
              ? itm.customSizes.map((cs: any) => ({
                  id: cs.id || `cs-${Math.random().toString(36).slice(2, 6)}`,
                  size: String(cs.size || 'Standard').trim(),
                  quantity: Number(cs.quantity) || 0
                }))
              : (Array.isArray(itm.customSizesList) && itm.customSizesList.length > 0
                  ? itm.customSizesList.map((cs: any) => ({
                      id: cs.id || `cs-${Math.random().toString(36).slice(2, 6)}`,
                      size: String(cs.size || 'Standard').trim(),
                      quantity: Number(cs.quantity) || 0
                    }))
                  : undefined);

            const customPairsSum = customSizes ? customSizes.reduce((sum: number, cs: any) => sum + cs.quantity, 0) : 0;
            const totalPairs = customPairsSum > 0 ? customPairsSum : (Number(itm.totalPairs) || Number(itm.qty) || (
              (Number(sizes.small) || 0) + 
              (Number(sizes.medium) || 0) + 
              (Number(sizes.large) || 0) + 
              (Number(sizes.xl) || 0) + 
              (Number(sizes.xxl) || 0)
            ));
            const originalQty = Number(itm.originalQty) || totalPairs;
            return {
              ...itm,
              id: itm.id || `item-${idx + 1}`,
              title: itm.title || itm.gloveType || itm.article || 'Custom Glove',
              gloveType: itm.gloveType || itm.title || itm.article || 'Custom Glove',
              article: itm.article || itm.title || itm.gloveType || 'Custom Glove',
              color: itm.color || '',
              size: itm.size || (customSizes?.[0]?.size || ''),
              customSizes,
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
              rate: Number(itm.rate) || 0,
              amount: Number(itm.amount) || (totalPairs * (Number(itm.rate) || 0)),
              cuttingGivenQty: Number(itm.cuttingGivenQty) || 0,
              stockReceivedQty: Number(itm.stockReceivedQty) || 0,
              billedQty: Number(itm.billedQty) || 0,
              pendingQty: itm.pendingQty ?? Math.max(0, totalPairs - (Number(itm.billedQty) || 0))
            };
          });

          // Heal ORD-004 / traders if its customSizes were wiped out or collapsed
          const isOrd004 = d.id === 'ord-004-traders' || data.orderNo === 'ORD-004' || String(data.customerName || '').toLowerCase().trim() === 'traders';
          let healedItems = items;
          if (isOrd004) {
            const hasProperMg = items.some((i: OrderItem) => (i.title === 'mg' || i.article === 'mg') && i.customSizes && i.customSizes.length >= 2);
            const hasProperPride = items.some((i: OrderItem) => (i.title === 'pride' || i.article === 'pride') && i.customSizes && i.customSizes.length >= 2);
            if (!hasProperMg || !hasProperPride) {
              const ord004Template = initialOrders.find(o => o.orderNo === 'ORD-004');
              if (ord004Template) {
                healedItems = ord004Template.items;
              }
            }
          }

          const totalPairs = Number(data.totalPairs) || Number(data.totalQty) || healedItems.reduce((s: number, i: any) => s + i.totalPairs, 0);
          const originalTotalPairs = Number(data.originalTotalPairs) || healedItems.reduce((s: number, i: any) => s + (i.originalQty || i.totalPairs), 0) || totalPairs;

          return {
            ...data,
            id: d.id,
            orderNo: data.orderNo || `ORD-${d.id.slice(-4).toUpperCase()}`,
            customerName: data.customerName || 'Walk-in Customer',
            orderDate: data.orderDate || '',
            deliveryDate: data.deliveryDate || '',
            items: healedItems,
            totalPairs,
            originalTotalPairs,
            totalQty: totalPairs,
            status: data.status || 'Pending',
            createdAt: toComparableString(data.createdAt) || new Date().toISOString(),
            createdBy: data.createdBy || 'Factory Admin',
            notes: data.notes || ''
          } as CustomerOrder;
        });

        // Ensure initialOrders exist only if not explicitly deleted by user
        initialOrders.forEach(initOrder => {
          if (deletedOrderIdsRef.current.has(initOrder.id)) return;
          if (!list.some(o => o.orderNo === initOrder.orderNo || o.id === initOrder.id)) {
            list.push(initOrder);
          }
        });

        // Newest orders on top
        list.sort((a, b) => safeStringCompare(b.createdAt, a.createdAt));
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
        const currentDeleted = loadLocal<DeletedProductItem[]>('gferp_deleted_products_v1', []).map(d => d.name);
        const list = snap.docs
          .map(d => ({ ...d.data(), id: d.id } as Product))
          .filter(p => !currentDeleted.includes((p.gloveName || '').trim().toLowerCase()));
        setProducts(list);
        saveLocal(STORAGE_KEYS.PRODUCTS, list);
      }, err => console.error('Firestore onSnapshot error (products):', err)));

      // 3b. deleted_products blocklist
      unsubs.push(onSnapshot(collection(db, 'deleted_products'), snap => {
        const remoteList = snap.docs.map(d => {
          const data = d.data();
          return {
            id: d.id,
            name: (data.name || d.id).trim().toLowerCase(),
            displayName: data.displayName || data.name || d.id,
            deletedAt: data.deletedAt || new Date().toISOString()
          } as DeletedProductItem;
        });
        const localList = loadLocal<DeletedProductItem[]>('gferp_deleted_products_v1', []);
        const mergedMap = new Map<string, DeletedProductItem>();
        localList.forEach(item => { if (item.name) mergedMap.set(item.name.toLowerCase(), item); });
        remoteList.forEach(item => { if (item.name) mergedMap.set(item.name.toLowerCase(), item); });
        const merged = Array.from(mergedMap.values());
        setDeletedProductsList(merged);
        saveLocal('gferp_deleted_products_v1', merged);
      }, err => console.error('Firestore onSnapshot error (deleted_products):', err)));

      // 3c. deleted_cutting_ids blocklist (prevents deleted rows from resurrecting after Ctrl+R or snapshot races)
      unsubs.push(onSnapshot(collection(db, 'deleted_cutting_ids'), snap => {
        const localIds = loadLocal<string[]>(STORAGE_KEYS.DELETED_CUTTING_IDS, []);
        const merged = new Set<string>([...localIds, ...deletedCuttingIdsRef.current]);
        snap.docs.forEach(d => merged.add(d.id));
        const mergedArr = Array.from(merged);
        deletedCuttingIdsRef.current = merged;
        saveLocal(STORAGE_KEYS.DELETED_CUTTING_IDS, mergedArr);
        setDeletedCuttingIdsList(mergedArr);
      }, err => console.error('Firestore onSnapshot error (deleted_cutting_ids):', err)));

      // 3d. deleted_order_ids & deleted_delivery_ids blocklists
      unsubs.push(onSnapshot(collection(db, 'deleted_order_ids'), snap => {
        const localIds = loadLocal<string[]>(STORAGE_KEYS.DELETED_ORDER_IDS, []);
        const merged = new Set<string>([...localIds, ...deletedOrderIdsRef.current]);
        snap.docs.forEach(d => merged.add(d.id));
        const mergedArr = Array.from(merged);
        deletedOrderIdsRef.current = merged;
        saveLocal(STORAGE_KEYS.DELETED_ORDER_IDS, mergedArr);
        setDeletedOrderIdsList(mergedArr);
      }, err => console.error('Firestore onSnapshot error (deleted_order_ids):', err)));

      unsubs.push(onSnapshot(collection(db, 'deleted_delivery_ids'), snap => {
        const localIds = loadLocal<string[]>(STORAGE_KEYS.DELETED_DELIVERY_IDS, []);
        const merged = new Set<string>([...localIds, ...deletedDeliveryIdsRef.current]);
        snap.docs.forEach(d => merged.add(d.id));
        const mergedArr = Array.from(merged);
        deletedDeliveryIdsRef.current = merged;
        saveLocal(STORAGE_KEYS.DELETED_DELIVERY_IDS, mergedArr);
        setDeletedDeliveryIdsList(mergedArr);
      }, err => console.error('Firestore onSnapshot error (deleted_delivery_ids):', err)));

      // 4. cuttings
      unsubs.push(onSnapshot(collection(db, 'cuttings'), snap => {
        let list = snap.docs
          .filter(d => !deletedCuttingIdsRef.current.has(d.id) && !deletedOrderIdsRef.current.has(String(d.data()?.orderId || '')) && !d.data()?.isDeleted)
          .map(d => ({ ...d.data(), id: d.id } as Cutting));
        if (list.length === 0) {
          list = initialCuttings.filter(ic => !deletedCuttingIdsRef.current.has(ic.id) && !deletedOrderIdsRef.current.has(ic.orderId));
        } else if (!list.some(c => c.orderNo === 'ORD-003') && !deletedOrderIdsRef.current.has('ord-003-bestway')) {
          initialCuttings.forEach(ic => {
            if (!deletedCuttingIdsRef.current.has(ic.id) && !deletedOrderIdsRef.current.has(ic.orderId) && !list.some(existing => existing.id === ic.id)) {
              list.push(ic);
            }
          });
        }
        setCuttings(list);
        saveLocal(STORAGE_KEYS.CUTTINGS, list);
      }, err => console.error('Firestore onSnapshot error (cuttings):', err)));

      // 5. cutters
      unsubs.push(onSnapshot(collection(db, 'cutters'), snap => {
        const list = snap.docs.map(d => {
          const data = d.data();
          const safeName = String(data.name || data.khataName || d.id || 'Cutting Master').trim() || 'Cutting Master';
          return {
            ...data,
            id: d.id,
            name: safeName,
            khataName: String(data.khataName || `${safeName} Ledger`).trim(),
            cutterType: data.cutterType || 'cutting_man',
            isActive: data.isActive !== false,
            status: data.status || (data.isActive === false ? 'deactive' : 'active')
          } as Cutter;
        });
        const cleanList = dedupeCuttersList(list);
        const hasTariq = cleanList.some(
          c => c.id === 'cutter-tariq' || (c.name || '').trim().toLowerCase() === 'tariq mehmood'
        );
        if (!hasTariq) {
          cleanList.push({
            id: 'cutter-tariq',
            name: 'Tariq Mehmood',
            khataName: 'Tariq Mehmood Cutter',
            phone: '+92 301 2345678',
            perPairRate: 12,
            cutterType: 'cutting_man',
            totalGiven: 6000,
            totalReceived: 6000,
            pendingBalance: 0,
            isActive: true,
            status: 'active',
            createdAt: '2026-11-01T08:00:00.000Z'
          } as Cutter);
        }
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
        list.sort((a, b) => safeStringCompare(b.issueDate || b.createdAt, a.issueDate || a.createdAt));
        setStitchingOrders(list);
        saveLocal(STORAGE_KEYS.STITCHING_ORDERS, list);
      }, err => console.error('Firestore onSnapshot error (stitching_orders):', err)));

      unsubs.push(onSnapshot(collection(db, 'stitching_history'), snap => {
        const list = snap.docs.flatMap(d => {
          const data = d.data();
          if (data.type !== 'ISSUE' && data.type !== 'RECEIVE' && data.type !== 'STATUS') return [];
          return [{ ...data, id: d.id } as StitchingHistoryEntry];
        });
        list.sort((a, b) => safeStringCompare(b.date || b.createdAt, a.date || a.createdAt));
        setStitchingHistory(list);
        saveLocal(STORAGE_KEYS.STITCHING_HISTORY, list);
      }, err => console.error('Firestore onSnapshot error (stitching_history):', err)));

      unsubs.push(onSnapshot(collection(db, 'stitcher_khata_transactions'), snap => {
        const list = snap.docs.map(d => ({ ...d.data(), id: d.id } as StitcherKhataTransaction));
        list.sort((a, b) => safeStringCompare(b.date || b.createdAt, a.date || a.createdAt));
        setStitcherKhataTransactions(list);
        saveLocal(STORAGE_KEYS.STITCHER_KHATA, list);
      }, err => console.error('Firestore onSnapshot error (stitcher_khata_transactions):', err)));

      // 6. cutting_transactions
      unsubs.push(onSnapshot(collection(db, 'cutting_transactions'), snap => {
        const list = snap.docs
          .filter(d => !deletedCuttingIdsRef.current.has(d.id) && !deletedOrderIdsRef.current.has(String(d.data()?.orderId || '')) && !d.data()?.isDeleted)
          .map(d => ({ ...d.data(), id: d.id } as CuttingTransaction));
        list.sort((a, b) => safeStringCompare(b.date || b.createdAt, a.date || a.createdAt));
        setCuttingTransactions(list);
        saveLocal(STORAGE_KEYS.CUTTING_TXS, list);
        if (!snapshotReadyRef.current.cuttingTxs) {
          snapshotReadyRef.current.cuttingTxs = true;
          setSnapshotsReadyTick(t => t + 1);
        }
      }, err => console.error('Firestore onSnapshot error (cutting_transactions):', err)));

      // 7. cuttingEntries: editable notebook ledger - Single Source of Truth
      unsubs.push(onSnapshot(collection(db, 'cuttingEntries'), snap => {
        const rawList: CuttingEntry[] = [];
        snap.docs.forEach(d => {
          const data = d.data();
          if (data.isDeleted || deletedCuttingIdsRef.current.has(d.id) || deletedOrderIdsRef.current.has(String(data.orderId || ''))) return;
          const pairs = Number(data.pairs) || Number(data.quantity) || Number(data.totalQty) || Number(data.qty) || 0;
          if (data.type !== 'RETURN' && pairs <= 0) return;
          const rate = Number(data.rate) || Number(data.boxRate) || 0;
          const totalBalance = Number(data.totalBalance) || Number(data.lotTotal) || pairs * rate;

          let orderId = data.orderId || '';
          let orderNo = data.orderNo || '';
          let customerName = data.customerName || data.customerOrder || '';

          // Auto-link legacy entries without orderNo if matching customer order exists
          if (!orderNo) {
            const custMatch = orders.find(o => 
              customerName && o.customerName && 
              o.customerName.trim().toLowerCase() === customerName.trim().toLowerCase()
            );
            if (custMatch) {
              orderId = orderId || custMatch.id;
              orderNo = custMatch.orderNo;
            }
          }

          rawList.push({
            ...data,
            id: d.id,
            customerName: customerName || 'Direct',
            orderId,
            orderNo,
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
            runningBalance: Number(data.runningBalance) || 0,
            isExtraCutting: Boolean(data.isExtraCutting),
            extraCuttingQty: data.extraCuttingQty !== undefined ? Number(data.extraCuttingQty) : (data.isExtraCutting ? -Math.abs(pairs) : 0),
            createdAt: toComparableString(data.createdAt) || new Date().toISOString()
          } as CuttingEntry);
        });

        // Deduplicate entries created close together with identical parameters
        const seenSignatures = new Set<string>();
        const dedupedList: CuttingEntry[] = [];
        rawList.forEach(entry => {
          const signature = getCuttingSignature(entry);
          if (seenSignatures.has(signature)) return;
          seenSignatures.add(signature);
          dedupedList.push(entry);
        });

        dedupedList.sort((a, b) => safeStringCompare(b.date || b.createdAt, a.date || a.createdAt));
        setCuttingEntries(dedupedList);
        if (!snapshotReadyRef.current.cuttingEntries) {
          snapshotReadyRef.current.cuttingEntries = true;
          setSnapshotsReadyTick(t => t + 1);
        }
      }, err => console.error('Firestore onSnapshot error (cuttingEntries):', err)));

      // 8. order_dispatch_history
      unsubs.push(onSnapshot(collection(db, 'order_dispatch_history'), snap => {
        const list = snap.docs
          .filter(d => {
            const data = d.data();
            return (
              !deletedCuttingIdsRef.current.has(d.id) &&
              !deletedCuttingIdsRef.current.has(String(data?.cuttingId || '')) &&
              !deletedOrderIdsRef.current.has(String(data?.orderId || '')) &&
              !deletedDeliveryIdsRef.current.has(d.id)
            );
          })
          .map(d => ({ ...d.data(), id: d.id } as OrderDispatchHistory));
        list.sort((a, b) => safeStringCompare(b.date || b.createdAt, a.date || a.createdAt));
        setOrderDispatchHistory(list);
        saveLocal(STORAGE_KEYS.ORDER_HISTORY, list);
      }, err => console.error('Firestore onSnapshot error (order_dispatch_history):', err)));

      // 9. stock_ledger
      unsubs.push(onSnapshot(collection(db, 'stock_ledger'), snap => {
        const list = snap.docs
          .filter(d => {
            const data = d.data();
            const refId = String(data?.referenceId || '');
            const ordId = String(data?.orderId || '');
            return !deletedCuttingIdsRef.current.has(d.id) &&
              !deletedCuttingIdsRef.current.has(d.id.replace(/^stk-/, '')) &&
              (!refId || (!deletedCuttingIdsRef.current.has(refId) && !deletedDeliveryIdsRef.current.has(refId))) &&
              (!ordId || !deletedOrderIdsRef.current.has(ordId));
          })
          .map(d => ({ ...d.data(), id: d.id } as StockLedgerEntry));
        setStockLedger(list);
        saveLocal(STORAGE_KEYS.STOCK_LEDGER, list);
      }, err => console.error('Firestore onSnapshot error (stock_ledger):', err)));

      unsubs.push(onSnapshot(collection(db, 'stock_management'), snap => {
        const currentDeleted = loadLocal<DeletedProductItem[]>('gferp_deleted_products_v1', []).map(d => d.name);
        const list = snap.docs.flatMap(d => {
          const data = d.data();
          const art = String(data.article || data.articleName || '').trim().toLowerCase();
          if (currentDeleted.includes(art)) return [];
          const receiveIds = Array.isArray(data.receiveIds)
            ? data.receiveIds.filter((rId: string) => !deletedCuttingIdsRef.current.has(rId))
            : [];
          const deliveryIds = Array.isArray(data.deliveryIds)
            ? data.deliveryIds.filter((dId: string) => !deletedDeliveryIdsRef.current.has(dId))
            : [];
          return [{
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
            receiveIds,
            deliveryIds
          } as FactoryStockItem];
        });
        list.sort((a, b) => a.article.localeCompare(b.article) || a.size.localeCompare(b.size));
        setStockManagement(list);
        if (!snapshotReadyRef.current.stockManagement) {
          snapshotReadyRef.current.stockManagement = true;
          setSnapshotsReadyTick(t => t + 1);
        }
      }, err => console.error('Firestore onSnapshot error (stock_management):', err)));

      unsubs.push(onSnapshot(collection(db, 'article_stock'), snap => {
        const currentDeleted = loadLocal<DeletedProductItem[]>('gferp_deleted_products_v1', []).map(d => d.name);
        const list = snap.docs.flatMap(d => {
          const data = d.data();
          const art = String(data.articleName || '').trim().toLowerCase();
          if (currentDeleted.includes(art)) return [];
          const cuttingHistory = (Array.isArray(data.cuttingHistory) ? data.cuttingHistory : [])
            .filter((h: any) => !deletedCuttingIdsRef.current.has(h?.receiveId || '') && !deletedOrderIdsRef.current.has(h?.orderId || ''));
          const deliveryHistFiltered = (Array.isArray(data.deliveryHistory) ? data.deliveryHistory : [])
            .filter((h: any) => !deletedDeliveryIdsRef.current.has(h?.deliveryId || '') && !deletedOrderIdsRef.current.has(h?.orderId || ''));
          return [{
            ...data,
            id: d.id,
            articleName: String(data.articleName || ''),
            totalReceived: Number(data.totalReceived) || 0,
            totalAvailable: Number(data.totalAvailable) || 0,
            totalDelivered: Number(data.totalDelivered) || 0,
            cuttingHistory,
            deliveryHistory: deliveryHistFiltered
          } as ArticleStockItem];
        });
        list.sort((a, b) => a.articleName.localeCompare(b.articleName));
        setArticleStock(list);
        if (!snapshotReadyRef.current.articleStock) {
          snapshotReadyRef.current.articleStock = true;
          setSnapshotsReadyTick(t => t + 1);
        }
      }, err => console.error('Firestore onSnapshot error (article_stock):', err)));

      unsubs.push(onSnapshot(collection(db, 'stock_delivery_history'), snap => {
        const list = snap.docs
          .map(d => ({ ...d.data(), id: d.id } as DeliveryHistoryEntry))
          .filter(d => {
            if (deletedDeliveryIdsRef.current.has(d.id)) return false;
            if (d.orderId && deletedOrderIdsRef.current.has(d.orderId)) return false;
            if (d.customerOrderId && deletedOrderIdsRef.current.has(d.customerOrderId)) return false;
            // Strip corrupted combined-string articles like "mg, pride"
            if (d.article && d.article.includes(',')) return false;
            // Pride was never delivered for ORD-004 / traders
            const isOrd004 = d.orderId === 'ord-004-traders' || (d.customerName && d.customerName.toLowerCase().trim() === 'traders');
            if (isOrd004 && d.article && d.article.toLowerCase().trim() === 'pride') {
              return false;
            }
            return true;
          });
        list.sort((a, b) => safeStringCompare(b.date, a.date) || safeStringCompare(b.createdAt, a.createdAt));
        setDeliveryHistory(list);
        saveLocal(STORAGE_KEYS.STOCK_OUT, list);
      }, err => console.error('Firestore onSnapshot error (stock_delivery_history):', err)));

      unsubs.push(onSnapshot(collection(db, 'articles_master'), snap => {
        const currentDeleted = loadLocal<DeletedProductItem[]>('gferp_deleted_products_v1', []).map(d => d.name);
        const list = snap.docs.flatMap(d => {
          const data = d.data();
          const articleName = String(data.articleName || data.name || data.title || '').trim();
          const status = String(data.status || '').toLocaleLowerCase();
          if (!articleName || data.isActive === false || (status && status !== 'active') || currentDeleted.includes(articleName.toLowerCase())) return [];
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
        const currentDeleted = loadLocal<DeletedProductItem[]>('gferp_deleted_products_v1', []).map(d => d.name);
        const list = snap.docs.flatMap(d => {
          const data = d.data();
          const articleName = String(data.articleName || data.name || data.title || '').trim();
          const status = String(data.status || '').toLocaleLowerCase();
          if (!articleName || data.isActive === false || (status && status !== 'active') || currentDeleted.includes(articleName.toLowerCase())) return [];
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
        const currentDeleted = loadLocal<DeletedProductItem[]>('gferp_deleted_products_v1', []).map(d => d.name);
        const list = snap.docs.flatMap(d => {
          const data = d.data();
          const articleName = String(data.articleName || data.article_name || data.name || data.title || '').trim();
          const status = String(data.status || '').toLocaleLowerCase();
          if (!articleName || data.isActive === false || (status && status !== 'active') || currentDeleted.includes(articleName.toLowerCase())) return [];
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

      // 11. order_companies
      unsubs.push(onSnapshot(collection(db, 'order_companies'), snap => {
        const list = snap.docs.map(d => ({ ...d.data(), id: d.id } as OrderCompany));
        setOrderCompanies(list);
        saveLocal(STORAGE_KEYS.ORDER_COMPANIES, list);
      }, err => console.error('Firestore onSnapshot error (order_companies):', err)));
    } catch (e) {
      console.warn('Firestore onSnapshot setup notice:', e);
    }

    return () => {
      unsubs.forEach(unsub => unsub());
    };
  }, []);

  // Idempotent one-time backfill: ensure any existing Cutting RECEIVE entry that shows in
  // Order Detail / Cutting History but is missing in Stock Management is synced cleanly once.
  useEffect(() => {
    if (!isFirebaseOnline || !db) return;
    const ready = snapshotReadyRef.current;
    if (!ready.cuttingEntries || !ready.cuttingTxs || !ready.stockManagement || !ready.articleStock) return;
    if (isBackfillingCuttingStockRef.current) return;

    const candidatesMap = new Map<string, {
      id: string;
      date: string;
      article: string;
      size: string;
      qty: number;
      cutterName: string;
      customerName: string;
      orderId: string;
      orderNo: string;
    }>();

    cuttingEntries.forEach(e => {
      if (e.isDeleted || deletedCuttingIdsRef.current.has(e.id)) return;
      if (e.type !== 'RECEIVE') return;
      const qty = Math.abs(Number(e.pairs ?? e.totalQty ?? 0));
      const article = (e.articleTitle || e.article || '').trim();
      if (!article || qty <= 0) return;
      if (deletedProductNamesRef.current.has(article.toLowerCase())) return;
      const linkedOrder = e.orderId ? orders.find(o => o.id === e.orderId) : undefined;
      candidatesMap.set(e.id, {
        id: e.id,
        date: e.date,
        article,
        size: (e.sizeName || e.size || 'Standard').trim() || 'Standard',
        qty,
        cutterName: e.cutterName || 'Cutting Master',
        customerName: e.customerName?.trim() || linkedOrder?.customerName || 'Stock - No Order',
        orderId: e.orderId || '',
        orderNo: e.orderNo?.trim() || linkedOrder?.orderNo || ''
      });
    });

    cuttingTransactions.forEach(tx => {
      if (tx.isDeleted || deletedCuttingIdsRef.current.has(tx.id) || candidatesMap.has(tx.id)) return;
      if (tx.type !== 'RECEIVE') return;
      const qty = Math.abs(Number(tx.qty ?? tx.totalQty ?? 0));
      const article = (tx.articleTitle || tx.article || '').trim();
      if (!article || qty <= 0) return;
      if (deletedProductNamesRef.current.has(article.toLowerCase())) return;
      const linkedOrder = tx.orderId ? orders.find(o => o.id === tx.orderId) : undefined;
      candidatesMap.set(tx.id, {
        id: tx.id,
        date: tx.date,
        article,
        size: (tx.sizeName || tx.size || 'Standard').trim() || 'Standard',
        qty,
        cutterName: tx.cutterName || 'Cutting Master',
        customerName: tx.customerName?.trim() || linkedOrder?.customerName || 'Stock - No Order',
        orderId: tx.orderId || '',
        orderNo: tx.orderNo?.trim() || linkedOrder?.orderNo || ''
      });
    });

    const knownStockMgmtIds = new Set<string>();
    stockManagement.forEach(s => {
      (s.receiveIds || []).forEach(rId => { if (rId) knownStockMgmtIds.add(rId); });
    });

    const knownArticleHistoryIds = new Set<string>();
    articleStock.forEach(a => {
      (a.cuttingHistory || []).forEach(h => { if (h.receiveId) knownArticleHistoryIds.add(h.receiveId); });
    });

    const toBackfill = Array.from(candidatesMap.values()).filter(c =>
      !backfilledCuttingIdsRef.current.has(c.id) &&
      (!knownStockMgmtIds.has(c.id) || !knownArticleHistoryIds.has(c.id))
    );

    if (toBackfill.length === 0) return;

    isBackfillingCuttingStockRef.current = true;
    (async () => {
      try {
        const now = new Date().toISOString();
        for (const item of toBackfill) {
          backfilledCuttingIdsRef.current.add(item.id);
          if (deletedCuttingIdsRef.current.has(item.id)) continue;

          const articleId = normalizeStockDocumentId(item.article);
          const stockItemId = `${articleId}__${normalizeStockDocumentId(item.size)}`;
          const stockRef = doc(db!, 'stock_management', stockItemId);
          const articleRef = doc(db!, 'article_stock', articleId);
          const stkLedgerId = `stk-${item.id}`;
          const stkLedgerRef = doc(db!, 'stock_ledger', stkLedgerId);

          const [stockSnap, articleSnap, stkLedgerSnap] = await Promise.all([
            getDoc(stockRef),
            getDoc(articleRef),
            getDoc(stkLedgerRef)
          ]);

          const existingReceiveIds: string[] = stockSnap.exists() && Array.isArray(stockSnap.data().receiveIds)
            ? stockSnap.data().receiveIds
            : [];
          const existingCuttingHistory: any[] = articleSnap.exists() && Array.isArray(articleSnap.data().cuttingHistory)
            ? articleSnap.data().cuttingHistory
            : [];

          const batch = writeBatch(db!);
          let hasWrites = false;

          if (!existingReceiveIds.includes(item.id)) {
            hasWrites = true;
            batch.set(stockRef, {
              article: item.article,
              articleName: item.article,
              size: item.size,
              qty: increment(item.qty),
              totalStock: increment(item.qty),
              totalCuttingReceived: increment(item.qty),
              balance: increment(item.qty),
              rate: stockSnap.exists() ? (Number(stockSnap.data().rate) || 0) : 0,
              receiveIds: arrayUnion(item.id),
              updatedAt: now
            }, { merge: true });
          }

          if (!existingCuttingHistory.some((h: any) => h?.receiveId === item.id)) {
            hasWrites = true;
            batch.set(articleRef, {
              articleName: item.article,
              totalReceived: increment(item.qty),
              totalAvailable: increment(item.qty),
              cuttingHistory: arrayUnion({
                date: item.date,
                pairs: item.qty,
                receiveId: item.id,
                source: item.cutterName,
                cutterName: item.cutterName,
                customerName: item.customerName || 'Stock - No Order',
                orderNo: item.orderNo || '',
                orderId: item.orderId || '',
                size: item.size
              })
            }, { merge: true });
          }

          if (!stkLedgerSnap.exists()) {
            hasWrites = true;
            batch.set(stkLedgerRef, {
              id: stkLedgerId,
              productId: 'prod-' + item.article.toLowerCase().replace(/\s+/g, '-'),
              productName: item.article,
              orderId: item.orderId || '',
              orderNo: item.orderNo || '',
              type: 'in',
              qty: item.qty,
              date: item.date,
              referenceId: item.id,
              notes: `Cutting received from ${item.cutterName}`,
              createdAt: now
            });
          }

          if (hasWrites) {
            await batch.commit();
          }
        }
      } catch (err) {
        console.warn('Cutting-to-Stock backfill notice:', err);
      } finally {
        isBackfillingCuttingStockRef.current = false;
      }
    })();
  }, [snapshotsReadyTick, cuttingEntries, cuttingTransactions, stockManagement, articleStock, orders]);

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

  const deleteProduct = async (id: string): Promise<void> => {
    const targetProduct = products.find(p => p.id === id);
    const prodName = targetProduct?.gloveName || '';
    const norm = prodName.trim().toLowerCase();

    if (norm) {
      const blockItem: DeletedProductItem = {
        id: norm,
        name: norm,
        displayName: targetProduct?.gloveName || prodName,
        deletedAt: new Date().toISOString()
      };
      if (db) {
        try {
          await setDoc(doc(db, 'deleted_products', norm), blockItem);
        } catch (err) {
          console.error('Error adding to deleted_products in Firestore:', err);
        }
      }
      setDeletedProductsList(prev => {
        if (prev.some(d => d.name === norm)) return prev;
        const updated = [blockItem, ...prev];
        saveLocal('gferp_deleted_products_v1', updated);
        return updated;
      });
    }

    if (db) {
      try {
        await deleteDoc(doc(db, 'products', id));
      } catch (err) {
        console.error('Error deleting product doc from Firestore:', err);
      }
      if (norm) {
        try {
          const snapProds = await getDocs(collection(db, 'products'));
          snapProds.docs.forEach(d => {
            const data = d.data();
            if (String(data.gloveName || '').trim().toLowerCase() === norm) {
              void deleteDoc(doc(db, 'products', d.id));
            }
          });
        } catch (e) { /* ignore */ }
      }
    }

    const next = products.filter(p => p.id !== id && (p.gloveName || '').trim().toLowerCase() !== norm);
    setProducts(next);
    saveLocal(STORAGE_KEYS.PRODUCTS, next);

    showToast(`Product "${prodName || 'Item'}" deleted permanently.`, 'info');
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
      article?: string;
      title: string;
      gloveType?: string;
      color?: string;
      leatherType?: string;
      sizes: { small: number; medium: number; large: number; xl: number; xxl: number };
      customSizes?: Array<{ size: string; quantity: number }>;
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
      const title = (item.title || item.gloveType || item.article || '').trim() || 'Custom Glove';
      const sizes = {
        small: Number(item.sizes?.small) || 0,
        medium: Number(item.sizes?.medium) || 0,
        large: Number(item.sizes?.large) || 0,
        xl: Number(item.sizes?.xl) || 0,
        xxl: Number(item.sizes?.xxl) || 0
      };
      const pairsSum = sizes.small + sizes.medium + sizes.large + sizes.xl + sizes.xxl;
      const customPairsSum = Array.isArray(item.customSizes) 
        ? item.customSizes.reduce((s, c) => s + (Number(c.quantity) || 0), 0)
        : 0;
      const totalPairs = pairsSum > 0 ? pairsSum : (customPairsSum > 0 ? customPairsSum : (Number(item.totalPairs) || Number(item.qty) || 0));

      return {
        id: item.id || `item-${idx + 1}-${Date.now()}`,
        productId: item.productId || `prod-${Date.now()}-${idx}`,
        article: item.article || title,
        title,
        gloveType: title,
        color: (item.color || '').trim(),
        leatherType: item.leatherType || '',
        sizes,
        customSizes: item.customSizes,
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
        size?: string;
        sizes?: { small: number; medium: number; large: number; xl: number; xxl: number };
        customSizes?: Array<{ id?: string; size: string; quantity: number }>;
        totalPairs: number;
        rate?: number;
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

      const oldItem = existing?.items.find(i => i.id === item.id || i.title === title);

      // Preserve custom sizes if provided or fall back to existing
      const customSizes = item.customSizes && item.customSizes.length > 0
        ? item.customSizes.map(cs => ({
            id: cs.id,
            size: cs.size || 'Standard',
            quantity: Number(cs.quantity) || 0
          }))
        : (oldItem?.customSizes && oldItem.customSizes.length > 0 ? oldItem.customSizes : undefined);

      const customPairsSum = customSizes ? customSizes.reduce((sum, cs) => sum + cs.quantity, 0) : 0;
      const totalPairs = customPairsSum > 0 ? customPairsSum : (pairsSum > 0 ? pairsSum : (Number(item.totalPairs) || 0));

      const originalQty = oldItem?.originalQty ?? totalPairs;
      const cuttingGiven = oldItem?.cuttingGivenQty || 0;
      const stockReceived = oldItem?.stockReceivedQty || 0;
      const billed = oldItem?.billedQty || 0;

      const primarySize = (customSizes && customSizes[0]?.size)
        || item.size
        || oldItem?.size
        || '';

      return {
        id: item.id || oldItem?.id || `item-${idx + 1}-${Date.now()}`,
        productId: oldItem?.productId || `prod-${Date.now()}-${idx}`,
        title,
        gloveType: title,
        article: title,
        color: (item.color || '').trim(),
        sizes,
        size: primarySize,
        customSizes,
        totalPairs,
        originalQty, // IMMUTABLE
        qty: totalPairs,
        rate: item.rate ?? oldItem?.rate ?? 0,
        amount: ((item.rate ?? oldItem?.rate ?? 0) * totalPairs),
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

    const sizeLabels = updatedItems.flatMap(i => (i.customSizes || []).map(cs => cs.size).filter(Boolean));
    const sizeText = sizeLabels.length > 0 ? sizeLabels.join(', ') : (updatedItems[0]?.size || '');
    showToast(sizeText ? `Order Updated - Size ${sizeText} Saved` : 'Order Updated Successfully');
  };

  const updateOrderStatus = (orderId: string, status: CustomerOrder['status']) => {
    const next = orders.map(o => o.id === orderId ? { ...o, status, updatedAt: new Date().toISOString() } : o);
    setOrders(next);
    saveLocal(STORAGE_KEYS.ORDERS, next);
    const updated = next.find(o => o.id === orderId);
    if (updated) syncFirestoreDoc('customer_orders', orderId, updated);
  };

  const deleteCustomerOrder = async (orderId: string): Promise<void> => {
    const targetOrder = orders.find(o => o.id === orderId);
    const targetOrderNo = (targetOrder?.orderNo || '').trim();

    const matchesOrder = (record: any): boolean => {
      if (!record) return false;
      if (record.orderId === orderId || record.customerOrderId === orderId) return true;
      if (targetOrderNo && record.orderNo && String(record.orderNo).trim() === targetOrderNo) return true;
      return false;
    };

    // Persist blocklist so seed orders or offline snapshots never resurrect this order
    await markOrdersDeleted([orderId]);

    const cuttingIdsToDelete = new Set<string>();
    const deliveryIdsToDelete = new Set<string>();
    const dispatchHistoryIdsToDelete = new Set<string>();
    const stitchingOrderIdsToDelete = new Set<string>();
    const stitchingHistoryIdsToDelete = new Set<string>();
    const khataIdsToDelete = new Set<string>();
    const invoiceIdsToDelete = new Set<string>();
    const stockLedgerIdsToDelete = new Set<string>();
    const legacyCuttingIdsToDelete = new Set<string>();

    // Gather matching IDs from local state first
    cuttingEntries.filter(matchesOrder).forEach(e => cuttingIdsToDelete.add(e.id));
    cuttingTransactions.filter(matchesOrder).forEach(t => cuttingIdsToDelete.add(t.id));
    cuttings.filter(matchesOrder).forEach(c => legacyCuttingIdsToDelete.add(c.id));
    deliveryHistory.filter(matchesOrder).forEach(d => {
      deliveryIdsToDelete.add(d.id);
      if (d.dispatchHistoryId) dispatchHistoryIdsToDelete.add(d.dispatchHistoryId);
    });
    orderDispatchHistory.filter(matchesOrder).forEach(h => dispatchHistoryIdsToDelete.add(h.id));
    stitchingOrders.filter(matchesOrder).forEach(so => stitchingOrderIdsToDelete.add(so.id));
    stitchingHistory
      .filter(h => matchesOrder(h) || (h.stitchingOrderId && stitchingOrderIdsToDelete.has(h.stitchingOrderId)))
      .forEach(h => stitchingHistoryIdsToDelete.add(h.id));
    stitcherKhataTransactions
      .filter(k => matchesOrder(k) || (k.stitchingOrderId && stitchingOrderIdsToDelete.has(k.stitchingOrderId)))
      .forEach(k => khataIdsToDelete.add(k.id));
    invoices.filter(matchesOrder).forEach(inv => invoiceIdsToDelete.add(inv.id));

    if (db) {
      try {
        const [
          entriesSnap,
          txSnap,
          cuttingsSnap,
          deliveriesSnap,
          dispatchSnap,
          stitchOrdersSnap,
          stitchHistorySnap,
          khataSnap,
          stockLedgerSnap,
          invoicesSnap,
          articleStockSnap,
          stockMgmtSnap,
          orderHistSubSnap
        ] = await Promise.all([
          getDocs(collection(db, 'cuttingEntries')),
          getDocs(collection(db, 'cutting_transactions')),
          getDocs(collection(db, 'cuttings')),
          getDocs(collection(db, 'stock_delivery_history')),
          getDocs(collection(db, 'order_dispatch_history')),
          getDocs(collection(db, 'stitching_orders')),
          getDocs(collection(db, 'stitching_history')),
          getDocs(collection(db, 'stitcher_khata_transactions')),
          getDocs(collection(db, 'stock_ledger')),
          getDocs(collection(db, 'sales_invoices')),
          getDocs(collection(db, 'article_stock')),
          getDocs(collection(db, 'stock_management')),
          getDocs(collection(db, 'customer_orders', orderId, 'order_history'))
        ]);

        entriesSnap.docs.forEach(d => { if (matchesOrder(d.data())) cuttingIdsToDelete.add(d.id); });
        txSnap.docs.forEach(d => { if (matchesOrder(d.data())) cuttingIdsToDelete.add(d.id); });
        cuttingsSnap.docs.forEach(d => { if (matchesOrder(d.data())) legacyCuttingIdsToDelete.add(d.id); });
        deliveriesSnap.docs.forEach(d => {
          const data = d.data();
          if (matchesOrder(data)) {
            deliveryIdsToDelete.add(d.id);
            if (data.dispatchHistoryId) dispatchHistoryIdsToDelete.add(String(data.dispatchHistoryId));
          }
        });
        dispatchSnap.docs.forEach(d => {
          const data = d.data();
          if (matchesOrder(data)) {
            dispatchHistoryIdsToDelete.add(d.id);
            if (data.actionType === 'dispatched_to_customer') deliveryIdsToDelete.add(d.id);
          }
        });
        stitchOrdersSnap.docs.forEach(d => { if (matchesOrder(d.data())) stitchingOrderIdsToDelete.add(d.id); });
        stitchHistorySnap.docs.forEach(d => {
          const data = d.data();
          if (matchesOrder(data) || (data.stitchingOrderId && stitchingOrderIdsToDelete.has(String(data.stitchingOrderId)))) {
            stitchingHistoryIdsToDelete.add(d.id);
          }
        });
        khataSnap.docs.forEach(d => {
          const data = d.data();
          if (matchesOrder(data) || (data.stitchingOrderId && stitchingOrderIdsToDelete.has(String(data.stitchingOrderId)))) {
            khataIdsToDelete.add(d.id);
          }
        });
        invoicesSnap.docs.forEach(d => { if (matchesOrder(d.data())) invoiceIdsToDelete.add(d.id); });
        stockLedgerSnap.docs.forEach(d => {
          const data = d.data();
          const refId = String(data.referenceId || '');
          if (
            matchesOrder(data) ||
            (refId && (cuttingIdsToDelete.has(refId) || deliveryIdsToDelete.has(refId) || invoiceIdsToDelete.has(refId))) ||
            cuttingIdsToDelete.has(d.id.replace(/^stk-/, ''))
          ) {
            stockLedgerIdsToDelete.add(d.id);
          }
        });

        await Promise.all([
          markCuttingIdsDeleted([...cuttingIdsToDelete, ...legacyCuttingIdsToDelete]),
          markDeliveriesDeleted([...deliveryIdsToDelete])
        ]);

        const ops: Array<(batch: ReturnType<typeof writeBatch>) => void> = [];

        cuttingIdsToDelete.forEach(cId => {
          ops.push(b => b.delete(doc(db!, 'cuttingEntries', cId)));
          ops.push(b => b.delete(doc(db!, 'cutting_transactions', cId)));
        });
        legacyCuttingIdsToDelete.forEach(cId => {
          ops.push(b => b.delete(doc(db!, 'cuttings', cId)));
        });
        deliveryIdsToDelete.forEach(delId => {
          ops.push(b => b.delete(doc(db!, 'stock_delivery_history', delId)));
        });
        dispatchHistoryIdsToDelete.forEach(dhId => {
          ops.push(b => b.delete(doc(db!, 'order_dispatch_history', dhId)));
        });
        stitchingOrderIdsToDelete.forEach(soId => {
          ops.push(b => b.delete(doc(db!, 'stitching_orders', soId)));
        });
        stitchingHistoryIdsToDelete.forEach(shId => {
          ops.push(b => b.delete(doc(db!, 'stitching_history', shId)));
        });
        khataIdsToDelete.forEach(kId => {
          ops.push(b => b.delete(doc(db!, 'stitcher_khata_transactions', kId)));
        });
        invoiceIdsToDelete.forEach(invId => {
          ops.push(b => b.delete(doc(db!, 'sales_invoices', invId)));
        });
        stockLedgerIdsToDelete.forEach(slId => {
          ops.push(b => b.delete(doc(db!, 'stock_ledger', slId)));
        });
        orderHistSubSnap.docs.forEach(subDoc => {
          ops.push(b => b.delete(doc(db!, 'customer_orders', orderId, 'order_history', subDoc.id)));
        });

        // Clean matching entries from article_stock
        articleStockSnap.docs.forEach(aDoc => {
          const data = aDoc.data();
          const cutHist: any[] = Array.isArray(data.cuttingHistory) ? data.cuttingHistory : [];
          const delHist: any[] = Array.isArray(data.deliveryHistory) ? data.deliveryHistory : [];

          const nextCutHist = cutHist.filter(h => !matchesOrder(h) && !cuttingIdsToDelete.has(String(h?.receiveId || '')));
          const nextDelHist = delHist.filter(h => !matchesOrder(h) && !deliveryIdsToDelete.has(String(h?.deliveryId || '')));

          if (nextCutHist.length !== cutHist.length || nextDelHist.length !== delHist.length) {
            const removedCutPairs = cutHist
              .filter(h => matchesOrder(h) || cuttingIdsToDelete.has(String(h?.receiveId || '')))
              .reduce((s, h) => s + (Number(h?.pairs) || 0), 0);
            const removedDelPairs = delHist
              .filter(h => matchesOrder(h) || deliveryIdsToDelete.has(String(h?.deliveryId || '')))
              .reduce((s, h) => s + (Number(h?.pairs) || 0), 0);

            const nextReceived = Math.max(0, (Number(data.totalReceived) || 0) - removedCutPairs);
            const nextDelivered = Math.max(0, (Number(data.totalDelivered) || 0) - removedDelPairs);
            const nextAvailable = nextReceived - nextDelivered;

            ops.push(b => b.update(doc(db!, 'article_stock', aDoc.id), {
              cuttingHistory: nextCutHist,
              deliveryHistory: nextDelHist,
              totalReceived: nextReceived,
              totalDelivered: nextDelivered,
              totalAvailable: nextAvailable,
              lastUpdated: new Date().toISOString()
            }));
          }
        });

        // Clean matching cutting receiveIds and deliveryIds from stock_management
        stockMgmtSnap.docs.forEach(sDoc => {
          const data = sDoc.data();
          const recIds: string[] = Array.isArray(data.receiveIds) ? data.receiveIds : [];
          const delIds: string[] = Array.isArray(data.deliveryIds) ? data.deliveryIds : [];

          const removedRecIds = recIds.filter(rId => cuttingIdsToDelete.has(rId));
          const removedDelIds = delIds.filter(dId => deliveryIdsToDelete.has(dId));

          if (removedRecIds.length > 0 || removedDelIds.length > 0) {
            const removedRecQty = removedRecIds.reduce((sum, rId) => {
              const eDoc = entriesSnap.docs.find(d => d.id === rId);
              const tDoc = txSnap.docs.find(d => d.id === rId);
              const raw = eDoc?.data() || tDoc?.data();
              return sum + Math.abs(Number(raw?.pairs ?? raw?.totalQty ?? raw?.qty ?? 0));
            }, 0);
            const removedDelQty = removedDelIds.reduce((sum, dId) => {
              const dDoc = deliveriesSnap.docs.find(d => d.id === dId);
              const localD = deliveryHistory.find(d => d.id === dId);
              const raw = dDoc?.data() || localD;
              return sum + Math.abs(Number(raw?.quantity ?? 0));
            }, 0);

            const nextRecIds = recIds.filter(rId => !cuttingIdsToDelete.has(rId));
            const nextDelIds = delIds.filter(dId => !deliveryIdsToDelete.has(dId));
            const nextCuttingReceived = Math.max(0, (Number(data.totalCuttingReceived) || 0) - removedRecQty);
            const nextDelivered = Math.max(0, (Number(data.totalDelivered) || 0) - removedDelQty);
            const nextBalance = nextCuttingReceived - nextDelivered;

            if (nextRecIds.length === 0 && nextDelIds.length === 0 && nextCuttingReceived === 0 && nextDelivered === 0) {
              ops.push(b => b.delete(doc(db!, 'stock_management', sDoc.id)));
            } else {
              ops.push(b => b.update(doc(db!, 'stock_management', sDoc.id), {
                receiveIds: nextRecIds,
                deliveryIds: nextDelIds,
                totalCuttingReceived: nextCuttingReceived,
                totalStock: nextCuttingReceived,
                qty: nextCuttingReceived,
                totalDelivered: nextDelivered,
                balance: nextBalance,
                updatedAt: new Date().toISOString()
              }));
            }
          }
        });

        // Recalculate affected cutters' balances from remaining cutting entries
        const remainingEntriesForCutters = entriesSnap.docs
          .filter(d => !cuttingIdsToDelete.has(d.id) && !d.data()?.isDeleted)
          .map(d => d.data());
        const affectedCutterIds = new Set<string>();
        entriesSnap.docs.forEach(d => {
          if (cuttingIdsToDelete.has(d.id) && d.data()?.cutterId) {
            affectedCutterIds.add(String(d.data().cutterId));
          }
        });
        txSnap.docs.forEach(d => {
          if (cuttingIdsToDelete.has(d.id) && d.data()?.cutterId) {
            affectedCutterIds.add(String(d.data().cutterId));
          }
        });
        affectedCutterIds.forEach(cutterId => {
          const cutterRows = remainingEntriesForCutters.filter(e => e.cutterId === cutterId);
          const totalGiven = cutterRows
            .filter(e => e.type === 'GIVE')
            .reduce((s, e) => s + Math.abs(Number(e.pairs ?? e.totalQty ?? e.qty ?? 0)), 0);
          const totalReceived = cutterRows
            .filter(e => e.type === 'RECEIVE')
            .reduce((s, e) => s + Math.abs(Number(e.pairs ?? e.totalQty ?? e.qty ?? 0)), 0);
          const totalReturned = cutterRows
            .filter(e => e.type === 'RETURN')
            .reduce((s, e) => s + Math.abs(Number(e.pairs ?? e.totalQty ?? e.qty ?? 0)), 0);
          ops.push(b => b.update(doc(db!, 'cutters', cutterId), {
            totalGiven,
            totalReceived: Math.max(0, totalReceived - totalReturned),
            pendingBalance: Math.max(0, totalGiven - Math.max(0, totalReceived - totalReturned)),
            updatedAt: new Date().toISOString()
          }));
        });

        // Finally delete the customer_orders document itself
        ops.push(b => b.delete(doc(db!, 'customer_orders', orderId)));

        // Commit in chunks of 450 operations to stay safely under Firestore 500-op batch limit
        for (let i = 0; i < ops.length; i += 450) {
          const batch = writeBatch(db);
          ops.slice(i, i + 450).forEach(fn => fn(batch));
          await batch.commit();
        }
      } catch (e) {
        console.error('Error cascade deleting customer order from Firestore:', e);
      }
    } else {
      await Promise.all([
        markCuttingIdsDeleted([...cuttingIdsToDelete, ...legacyCuttingIdsToDelete]),
        markDeliveriesDeleted([...deliveryIdsToDelete])
      ]);
    }

    // Update all React state & localStorage immediately so UI updates without refresh
    const nextOrders = orders.filter(o => o.id !== orderId);
    setOrders(nextOrders);
    saveLocal(STORAGE_KEYS.ORDERS, nextOrders);

    const nextCuttingEntries = cuttingEntries.filter(e => !matchesOrder(e) && !cuttingIdsToDelete.has(e.id));
    setCuttingEntries(nextCuttingEntries);

    const nextCuttingTxs = cuttingTransactions.filter(t => !matchesOrder(t) && !cuttingIdsToDelete.has(t.id));
    setCuttingTransactions(nextCuttingTxs);
    saveLocal(STORAGE_KEYS.CUTTING_TXS, nextCuttingTxs);

    const nextCuttings = cuttings.filter(c => !matchesOrder(c) && !legacyCuttingIdsToDelete.has(c.id));
    setCuttings(nextCuttings);
    saveLocal(STORAGE_KEYS.CUTTINGS, nextCuttings);

    const nextDeliveries = deliveryHistory.filter(d => !matchesOrder(d) && !deliveryIdsToDelete.has(d.id));
    setDeliveryHistory(nextDeliveries);
    saveLocal(STORAGE_KEYS.STOCK_OUT, nextDeliveries);

    const nextDispatchHistory = orderDispatchHistory.filter(h => !matchesOrder(h) && !dispatchHistoryIdsToDelete.has(h.id));
    setOrderDispatchHistory(nextDispatchHistory);
    saveLocal(STORAGE_KEYS.ORDER_HISTORY, nextDispatchHistory);

    const nextStitchOrders = stitchingOrders.filter(so => !matchesOrder(so) && !stitchingOrderIdsToDelete.has(so.id));
    setStitchingOrders(nextStitchOrders);
    saveLocal(STORAGE_KEYS.STITCHING_ORDERS, nextStitchOrders);

    const nextStitchHist = stitchingHistory.filter(h => !matchesOrder(h) && !stitchingHistoryIdsToDelete.has(h.id));
    setStitchingHistory(nextStitchHist);
    saveLocal(STORAGE_KEYS.STITCHING_HISTORY, nextStitchHist);

    const nextKhata = stitcherKhataTransactions.filter(k => !matchesOrder(k) && !khataIdsToDelete.has(k.id));
    setStitcherKhataTransactions(nextKhata);
    saveLocal(STORAGE_KEYS.STITCHER_KHATA, nextKhata);

    const nextInvoices = invoices.filter(inv => !matchesOrder(inv) && !invoiceIdsToDelete.has(inv.id));
    setInvoices(nextInvoices);
    saveLocal(STORAGE_KEYS.INVOICES, nextInvoices);

    const nextStockLedger = stockLedger.filter(sl =>
      !matchesOrder(sl) &&
      !stockLedgerIdsToDelete.has(sl.id) &&
      !cuttingIdsToDelete.has(sl.referenceId || '') &&
      !deliveryIdsToDelete.has(sl.referenceId || '') &&
      !invoiceIdsToDelete.has(sl.referenceId || '')
    );
    setStockLedger(nextStockLedger);
    saveLocal(STORAGE_KEYS.STOCK_LEDGER, nextStockLedger);

    setArticleStock(prev => prev.map(a => {
      const nextCut = (a.cuttingHistory || []).filter(h => !matchesOrder(h) && !cuttingIdsToDelete.has(h.receiveId || ''));
      const nextDel = (a.deliveryHistory || []).filter(h => !matchesOrder(h) && !deliveryIdsToDelete.has(h.deliveryId || ''));
      if (nextCut.length === (a.cuttingHistory || []).length && nextDel.length === (a.deliveryHistory || []).length) {
        return a;
      }
      const nextRec = nextCut.reduce((s, h) => s + (Number(h.pairs) || 0), 0);
      const nextOut = nextDel.reduce((s, h) => s + (Number(h.pairs) || 0), 0);
      return {
        ...a,
        cuttingHistory: nextCut,
        deliveryHistory: nextDel,
        totalReceived: nextRec,
        totalDelivered: nextOut,
        totalAvailable: nextRec - nextOut
      };
    }));

    setStockManagement(prev => prev.map(s => ({
      ...s,
      receiveIds: (s.receiveIds || []).filter(rId => !cuttingIdsToDelete.has(rId)),
      deliveryIds: (s.deliveryIds || []).filter(dId => !deliveryIdsToDelete.has(dId))
    })));

    const totalCuttingRemoved = cuttingIdsToDelete.size + legacyCuttingIdsToDelete.size;
    const totalStockOutRemoved = deliveryIdsToDelete.size + dispatchHistoryIdsToDelete.size;
    console.log(`Deleted Order ID: ${orderId}, Deleted related: Cutting: ${totalCuttingRemoved}, Stock Out: ${totalStockOutRemoved}`);

    if (selectedOrderId === orderId) setSelectedOrderId(null);
    showToast(`Order & all related records deleted (Cutting: ${totalCuttingRemoved}, Stock Out: ${totalStockOutRemoved})`, 'info');
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
    isExtraCutting?: boolean;
    extraCuttingQty?: number;
    notes?: string;
  }): Promise<CuttingTransaction> => {
    const now = new Date().toISOString();
    const txId = 'CUT-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6);
    const targetCutter = cutters.find(c => c.id === data.cutterId);
    const safeCutterName = String(data.cutterName || targetCutter?.name || targetCutter?.khataName || 'Cutting Master').trim() || 'Cutting Master';
    const safeCutterType: CutterCategory = data.cutterType || targetCutter?.cutterType || 'cutting_man';
    const safeArticle = String(data.article || data.articleTitle || '').trim();
    const safeArticleTitle = String(data.articleTitle || safeArticle).trim();
    const resolvedCustomerName = data.customerName?.trim() || (data.type === 'RECEIVE' && !data.orderId ? 'Stock - No Order' : '');
    const resolvedCustomerOrder = data.customerOrder?.trim() || (data.orderId ? data.orderNo || '' : (data.type === 'RECEIVE' ? 'Stock - No Order' : 'Direct Cutting'));
    const isExtraCutting = Boolean(data.isExtraCutting && data.type === 'RECEIVE');
    const extraCuttingQty = isExtraCutting ? Math.abs(data.qty) : 0;

    const txDoc: CuttingTransaction = stripUndefined({
      id: txId,
      cutterId: data.cutterId,
      cutterName: safeCutterName,
      cutterType: safeCutterType,
      type: data.type,
      date: data.date || now.slice(0, 10),
      qty: Number(data.qty) || 0,
      totalQty: data.totalQty ?? data.qty,
      rate: Number(data.rate) || 0,
      lotTotal: data.qty * (Number(data.rate) || 0),
      article: safeArticle,
      articleTitle: safeArticleTitle,
      size: data.size || '',
      sizeName: data.sizeName || data.size || '',
      average: data.average || '',
      remarks: data.remarks || '',
      totalBalance: data.totalBalance ?? data.qty * (Number(data.rate) || 0),
      customerOrder: resolvedCustomerOrder,
      orderId: data.orderId || '',
      orderNo: data.orderNo || '',
      customerName: resolvedCustomerName,
      sizes: data.sizes || { small: 0, medium: 0, large: 0, xl: 0, xxl: 0 },
      billNo: data.billNo || '',
      factoryName: data.factoryName || '',
      addToStock: data.type === 'RECEIVE' ? true : !!data.addToStock,
      isExtraCutting,
      extraCuttingQty,
      notes: data.notes || '',
      createdAt: now
    });
    const entry: CuttingEntry = stripUndefined({
      id: txId,
      cutterId: data.cutterId,
      cutterName: safeCutterName,
      type: data.type,
      date: data.date || now.slice(0, 10),
      customerName: resolvedCustomerName,
      article: safeArticle,
      articleTitle: safeArticleTitle,
      size: data.size || '',
      sizeName: data.sizeName || data.size || '',
      average: data.average || '',
      remarks: data.remarks || '',
      pairs: Number(data.qty) || 0,
      totalQty: data.totalQty ?? data.qty,
      rate: Number(data.rate) || 0,
      lotTotal: data.qty * (Number(data.rate) || 0),
      totalBalance: data.totalBalance ?? data.qty * (Number(data.rate) || 0),
      customerOrder: resolvedCustomerOrder,
      orderId: data.orderId || '',
      orderNo: data.orderNo || '',
      runningBalance: 0,
      billNo: data.billNo || '',
      isExtraCutting,
      extraCuttingQty,
      createdAt: now
    });
    const legacyEntries = cuttingTransactions
      .filter(tx => tx.cutterId === data.cutterId && tx.id !== entry.id && !cuttingEntries.some(saved => saved.id === tx.id))
      .map(tx => stripUndefined({
        id: tx.id,
        cutterId: tx.cutterId,
        cutterName: String(tx.cutterName || safeCutterName).trim() || 'Cutting Master',
        type: tx.type,
        date: tx.date || now.slice(0, 10),
        customerName: tx.customerName || '',
        article: tx.article || tx.articleTitle || '',
        articleTitle: tx.articleTitle || tx.article || '',
        size: tx.size || '',
        sizeName: tx.sizeName || tx.size || '',
        average: tx.average || '',
        remarks: tx.remarks || tx.notes || '',
        pairs: tx.totalQty || tx.qty || 0,
        totalQty: tx.totalQty || tx.qty || 0,
        rate: tx.rate || 0,
        lotTotal: tx.lotTotal || (tx.qty || 0) * (tx.rate || 0),
        totalBalance: tx.totalBalance || tx.lotTotal || (tx.qty || 0) * (tx.rate || 0),
        customerOrder: tx.customerOrder || tx.orderNo || 'Direct Cutting',
        runningBalance: 0,
        billNo: tx.billNo || '',
        createdAt: tx.createdAt || now
      } satisfies CuttingEntry));
    const nextEntries = [...cuttingEntries.filter(item => item.id !== entry.id), ...legacyEntries, entry]
      .sort((a, b) => safeStringCompare(a.date, b.date) || safeStringCompare(a.createdAt, b.createdAt) || safeStringCompare(a.id, b.id));
    const cutterBalances = new Map<string, number>();
    const balancedEntries = nextEntries.map(item => {
      const balance = (cutterBalances.get(item.cutterId) || 0) + item.lotTotal;
      cutterBalances.set(item.cutterId, balance);
      return { ...item, runningBalance: balance };
    });

    const targetOrder = data.orderId ? orders.find(order => order.id === data.orderId) : undefined;
    // GOLDEN RULE: Every Receive Cutting ALWAYS goes into Stock IN History (never auto-deduct as directDelivery)
    const directDelivery = false;
    if (data.orderId && !targetOrder) throw new Error('The selected customer order no longer exists.');
    const currentGiven = targetCutter?.totalGiven || 0;
    const currentReceived = targetCutter?.totalReceived || 0;

    const newGiven = data.type === 'GIVE' ? currentGiven + data.qty : currentGiven;
    const newReceived = data.type === 'RECEIVE' ? currentReceived + data.qty : currentReceived;
    const newPending = Math.max(0, newGiven - newReceived);

    // GOLDEN RULE: Receiving Cutting for an article unblocks it from deleted_products so Stock Management ALWAYS shows it
    if (data.type === 'RECEIVE') {
      await unmarkDeletedArticle(data.article);
    }

    // Dual Entry Batched Write
    if (!db) throw new Error('Firestore is not available. The cutting entry was not saved.');
    const directDispatchHistoryRef = directDelivery ? doc(db, 'order_dispatch_history', `disp-${txId}`) : null;
    const directOrderHistoryRef = directDelivery && data.orderId
      ? doc(db, 'customer_orders', data.orderId, 'order_history', `disp-${txId}`)
      : null;

    const articleName = safeArticle;
    const articleId = normalizeStockDocumentId(articleName);
    const sizeName = (data.sizeName || data.size || 'Standard').trim() || 'Standard';
    const stockItemId = `${articleId}__${normalizeStockDocumentId(sizeName)}`;
    const deliveredQty = directDelivery ? data.qty : 0;
    const stkId = `stk-${txId}`;
    const receivedHistoryEntry = stripUndefined({
      date: data.date,
      pairs: data.qty,
      receiveId: txId,
      source: safeCutterName,
      cutterName: safeCutterName,
      customerName: targetOrder?.customerName || resolvedCustomerName || 'Stock - No Order',
      orderNo: data.orderNo || targetOrder?.orderNo || '',
      orderId: data.orderId || '',
      size: sizeName,
      article: articleName,
      isExtraCutting,
      extraCuttingQty
    });
    const nextOrderItems = targetOrder
      ? targetOrder.items.map(itm => {
          if (itm.title.toLowerCase() === articleName.toLowerCase() || itm.gloveType.toLowerCase() === articleName.toLowerCase()) {
            return {
              ...itm,
              cuttingGivenQty: data.type === 'GIVE' ? itm.cuttingGivenQty + data.qty : itm.cuttingGivenQty,
              stockReceivedQty: data.type === 'RECEIVE' ? itm.stockReceivedQty + data.qty : itm.stockReceivedQty
            };
          }
          return itm;
        })
      : null;

    {
      try {
        const batch = writeBatch(db);

        // 1. Write cutting_transactions doc
        const txRef = doc(db, 'cutting_transactions', txId);
        batch.set(txRef, stripUndefined(txDoc));

        // 2. Write the editable notebook entry and refresh its running balances.
        const savedEntryIds = new Set(cuttingEntries.map(saved => saved.id));
        balancedEntries.forEach(item => {
          const entryRef = doc(db, 'cuttingEntries', item.id);
          if (item.id === txId) batch.set(entryRef, stripUndefined(item));
          else if (savedEntryIds.has(item.id)) batch.set(entryRef, { runningBalance: Number(item.runningBalance) || 0 }, { merge: true });
          else batch.set(entryRef, stripUndefined(item));
        });

        // 3. Update the cutter ledger summary safely with merge (prevents NOT_FOUND on preset cutters).
        const cutterRef = doc(db, 'cutters', data.cutterId);
        batch.set(cutterRef, stripUndefined({
          ...(targetCutter ? {} : {
            id: data.cutterId,
            name: safeCutterName,
            khataName: `${safeCutterName} Ledger`,
            cutterType: safeCutterType,
            isActive: true,
            status: 'active',
            createdAt: now
          }),
          totalGiven: newGiven,
          totalReceived: newReceived,
          pendingBalance: newPending,
          lastTransactionDate: data.date,
          updatedAt: now
        }), { merge: true });

        // 4. Customer order history & live progress tracking (deterministic txId for clean 1-click delete)
        if (data.orderId) {
          const subHistoryRef = doc(db, 'customer_orders', data.orderId, 'order_history', txId);
          batch.set(subHistoryRef, stripUndefined({
            id: txId,
            cuttingId: txId,
            date: data.date,
            actionType: data.type === 'GIVE' ? 'cutting_given' : 'stock_received',
            quantity: data.qty,
            personName: safeCutterName,
            article: articleName,
            size: sizeName,
            isExtraCutting,
            extraCuttingQty,
            notes: data.notes || (isExtraCutting ? `Extra Cutting (${data.qty} Pairs)` : (data.type === 'GIVE' ? 'Cutting Assigned' : 'Cutting Received')),
            createdAt: now
          }));

          const topHistoryRef = doc(db, 'order_dispatch_history', txId);
          batch.set(topHistoryRef, stripUndefined({
            id: txId,
            cuttingId: txId,
            orderId: data.orderId,
            orderNo: data.orderNo || targetOrder?.orderNo || '',
            date: data.date,
            actionType: data.type === 'GIVE' ? 'cutting_given' : 'stock_received',
            quantity: data.qty,
            personName: safeCutterName,
            article: articleName,
            isExtraCutting,
            extraCuttingQty,
            notes: data.notes || (isExtraCutting ? `Extra Cutting (${data.qty} Pairs)` : ''),
            createdAt: now
          }));

          if (targetOrder && nextOrderItems) {
            batch.set(doc(db, 'customer_orders', data.orderId), stripUndefined({
              items: nextOrderItems,
              status: targetOrder.status === 'Pending' ? 'Cutting-Given' : targetOrder.status,
              updatedAt: now
            }), { merge: true });
          }

          if (directDispatchHistoryRef && directOrderHistoryRef) {
            batch.set(directDispatchHistoryRef, stripUndefined({
              orderId: data.orderId,
              orderNo: data.orderNo || targetOrder?.orderNo || '',
              date: data.date,
              actionType: 'dispatched_to_customer',
              quantity: data.qty,
              personName: safeCutterName,
              article: articleName,
              sizes: { small: 0, medium: 0, large: 0, xl: 0, xxl: 0 },
              notes: `Direct cutting delivery · ${sizeName}`,
              createdAt: now
            }));
            batch.set(directOrderHistoryRef, stripUndefined({
              date: data.date,
              actionType: 'dispatched_to_customer',
              quantity: data.qty,
              personName: safeCutterName,
              article: articleName,
              size: sizeName,
              notes: 'Directly delivered from cutting receive',
              createdAt: now
            }));
          }

          // Mirror in cuttings collection
          const cuttingRef = doc(db, 'cuttings', txId);
          batch.set(cuttingRef, stripUndefined({
            id: txId,
            orderId: data.orderId,
            orderNo: data.orderNo || targetOrder?.orderNo || '',
            orderItemId: '',
            gloveType: articleName,
            size: sizeName,
            color: '',
            date: data.date,
            cuttingType: safeCutterType === 'cutting_man' ? 'cutting_man' : 'cutter_maker',
            personId: data.cutterId,
            personName: safeCutterName,
            qty: data.qty,
            rate: Number(data.rate) || 0,
            totalAmount: data.qty * (Number(data.rate) || 0),
            status: data.type === 'GIVE' ? 'Given' : 'Received',
            receivedDate: data.type === 'RECEIVE' ? data.date : '',
            isExtraCutting,
            extraCuttingQty,
            notes: data.notes || '',
            createdAt: now
          }));
        }

        if (data.type === 'RECEIVE') {
          const articleAvailable = articleStock.find(item =>
            item.articleName.trim().toLocaleLowerCase() === articleName.toLocaleLowerCase()
          )?.totalAvailable || 0;
          const deliveryHistoryRef = directDelivery ? doc(collection(db, 'stock_delivery_history')) : null;
          const deliveryRecord: DeliveryHistoryEntry | null = directDelivery && deliveryHistoryRef ? stripUndefined({
            id: deliveryHistoryRef.id,
            orderId: data.orderId || '',
            customerOrderId: data.orderId || '',
            orderNo: data.orderNo || targetOrder?.orderNo || '',
            linkedStockId: stockItemId,
            stockId: stockItemId,
            dispatchHistoryId: directDispatchHistoryRef?.id || '',
            orderHistoryId: directOrderHistoryRef?.id || '',
            date: data.date,
            deliveryDate: data.date,
            customerName: targetOrder?.customerName || data.customerName || '',
            partyName: targetOrder?.customerName || data.customerName || '',
            article: articleName,
            size: sizeName,
            quantity: deliveredQty,
            createdAt: now
          }) : null;

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
          const articleDelivery = deliveryRecord ? stripUndefined({
            date: data.date,
            orderNo: deliveryRecord.orderNo || '',
            customerName: deliveryRecord.customerName,
            pairs: deliveredQty,
            remainingAfter: articleAvailable + data.qty - deliveredQty,
            deliveryId: deliveryRecord.id
          }) : null;
          batch.set(articleRef, {
            articleName,
            totalReceived: increment(data.qty),
            totalAvailable: increment(data.qty - deliveredQty),
            totalDelivered: increment(deliveredQty),
            cuttingHistory: arrayUnion(receivedHistoryEntry),
            ...(articleDelivery ? { deliveryHistory: arrayUnion(articleDelivery) } : {})
          }, { merge: true });
          if (deliveryRecord && deliveryHistoryRef) batch.set(deliveryHistoryRef, stripUndefined(deliveryRecord));

          // Deterministic stk-${txId} so Stock Ledger and Deletes stay 100% synced by 1 ID
          const stkRef = doc(db, 'stock_ledger', stkId);
          batch.set(stkRef, stripUndefined({
            id: stkId,
            productId: 'prod-' + articleName.toLowerCase().replace(/\s+/g, '-'),
            productName: articleName,
            orderId: data.orderId || '',
            orderNo: data.orderNo || targetOrder?.orderNo || '',
            type: 'in',
            qty: data.qty,
            date: data.date,
            referenceId: txId,
            isExtraCutting,
            extraCuttingQty,
            notes: `Cutting received from ${safeCutterName}${isExtraCutting ? ' [Extra Cutting]' : ''}${data.billNo ? ` (Bill #${data.billNo})` : ''}`,
            createdAt: now
          }));
        }

        await batch.commit();
      } catch (e) {
        console.error('Error executing dual entry batched write:', e);
        throw e;
      }
    }

    // Immediate Local state & localStorage updates (no manual refresh required)
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
    setCuttingEntries([...balancedEntries].sort((a, b) => safeStringCompare(b.date, a.date)));

    if (data.type === 'RECEIVE') {
      setStockManagement(prev => {
        const idx = prev.findIndex(s => s.id === stockItemId);
        if (idx >= 0) {
          const existing = prev[idx];
          if ((existing.receiveIds || []).includes(txId)) return prev;
          const updated: FactoryStockItem = {
            ...existing,
            qty: (Number(existing.qty) || 0) + data.qty,
            totalStock: (Number(existing.totalStock) || 0) + data.qty,
            totalCuttingReceived: (Number(existing.totalCuttingReceived) || 0) + data.qty,
            balance: (Number(existing.balance) || 0) + data.qty,
            receiveIds: [...(existing.receiveIds || []), txId],
            updatedAt: now
          };
          return prev.map((s, i) => i === idx ? updated : s);
        }
        return [...prev, {
          id: stockItemId,
          article: articleName,
          articleName,
          size: sizeName,
          qty: data.qty,
          totalStock: data.qty,
          totalCuttingReceived: data.qty,
          totalDelivered: 0,
          balance: data.qty,
          rate: 0,
          receiveIds: [txId],
          deliveryIds: [],
          updatedAt: now
        } as FactoryStockItem].sort((a, b) => a.article.localeCompare(b.article) || a.size.localeCompare(b.size));
      });

      setArticleStock(prev => {
        const idx = prev.findIndex(a => normalizeStockDocumentId(a.articleName) === articleId || a.id === articleId);
        if (idx >= 0) {
          const existing = prev[idx];
          if ((existing.cuttingHistory || []).some(h => h.receiveId === txId)) return prev;
          const updated: ArticleStockItem = {
            ...existing,
            totalReceived: (Number(existing.totalReceived) || 0) + data.qty,
            totalAvailable: (Number(existing.totalAvailable) || 0) + data.qty,
            cuttingHistory: [...(existing.cuttingHistory || []), receivedHistoryEntry]
          };
          return prev.map((a, i) => i === idx ? updated : a);
        }
        return [...prev, {
          id: articleId,
          articleName,
          totalReceived: data.qty,
          totalAvailable: data.qty,
          totalDelivered: 0,
          cuttingHistory: [receivedHistoryEntry],
          deliveryHistory: []
        } as ArticleStockItem].sort((a, b) => a.articleName.localeCompare(b.articleName));
      });

      setStockLedger(prev => {
        if (prev.some(l => l.id === stkId || l.referenceId === txId)) return prev;
        const nextLedger: StockLedgerEntry[] = [{
          id: stkId,
          productId: 'prod-' + articleName.toLowerCase().replace(/\s+/g, '-'),
          productName: articleName,
          orderId: data.orderId || '',
          orderNo: data.orderNo || targetOrder?.orderNo || '',
          type: 'in',
          qty: data.qty,
          date: data.date,
          referenceId: txId,
          notes: `Cutting received from ${data.cutterName}${data.billNo ? ` (Bill #${data.billNo})` : ''}`,
          createdAt: now
        }, ...prev];
        saveLocal(STORAGE_KEYS.STOCK_LEDGER, nextLedger);
        return nextLedger;
      });
    }

    if (data.orderId) {
      setCuttings(prev => {
        if (prev.some(c => c.id === txId)) return prev;
        const nextCuttings: Cutting[] = [{
          id: txId,
          orderId: data.orderId!,
          orderNo: data.orderNo || targetOrder?.orderNo || '',
          orderItemId: '',
          gloveType: articleName,
          size: sizeName,
          color: '',
          date: data.date,
          cuttingType: data.cutterType === 'cutting_man' ? 'cutting_man' : 'cutter_maker',
          personId: data.cutterId,
          personName: data.cutterName,
          qty: data.qty,
          rate: Number(data.rate) || 0,
          totalAmount: data.qty * (Number(data.rate) || 0),
          status: data.type === 'GIVE' ? 'Given' : 'Received',
          receivedDate: data.type === 'RECEIVE' ? data.date : '',
          notes: data.notes || '',
          createdAt: now
        }, ...prev];
        saveLocal(STORAGE_KEYS.CUTTINGS, nextCuttings);
        return nextCuttings;
      });

      setOrderDispatchHistory(prev => {
        if (prev.some(h => h.id === txId)) return prev;
        const nextHist: OrderDispatchHistory[] = [{
          id: txId,
          orderId: data.orderId!,
          orderNo: data.orderNo || targetOrder?.orderNo || '',
          date: data.date,
          actionType: data.type === 'GIVE' ? 'cutting_given' : 'stock_received',
          quantity: data.qty,
          personName: data.cutterName,
          article: articleName,
          notes: data.notes || '',
          createdAt: now
        }, ...prev];
        saveLocal(STORAGE_KEYS.ORDER_HISTORY, nextHist);
        return nextHist;
      });

      const nextOrders = orders.map(ord => {
        if (ord.id === data.orderId && nextOrderItems) {
          return {
            ...ord,
            status: ord.status === 'Pending' ? 'Cutting-Given' : ord.status,
            items: nextOrderItems,
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
      .sort((a, b) => safeStringCompare(a.date, b.date) ||
        safeStringCompare(a.createdAt, b.createdAt) || safeStringCompare(a.id, b.id));
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
    ].sort((a, b) => safeStringCompare(b.date, a.date)));
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
      .sort((a, b) => safeStringCompare(a.date, b.date) ||
        safeStringCompare(a.createdAt, b.createdAt) || safeStringCompare(a.id, b.id));
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

    await markCuttingIdsDeleted([id]);
    setCuttingEntries(previous => [
      ...previous.filter(entry => entry.cutterId !== current.cutterId),
      ...balancedEntries
    ].sort((a, b) => safeStringCompare(b.date, a.date)));
    setCutters(previous => {
      const next = previous.map(cutter => cutter.id === current.cutterId ? {
        ...cutter,
        totalGiven,
        totalReceived,
        pendingBalance: Math.max(0, totalGiven - totalReceived)
      } : cutter);
      saveLocal(STORAGE_KEYS.CUTTERS, next);
      return next;
    });
  };

  const updateCuttingEntry = async (
    id: string,
    updates: Partial<CuttingEntry>
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
        date: updates.date || current.date,
        remarks: updates.remarks || current.remarks || '',
        pairs: Number(updates.pairs) || Number(current.pairs),
        rate: Number(updates.rate) || Number(current.rate)
      });
      return;
    }

    if (!db) throw new Error('Firestore is not available. The entry was not updated.');

    const oldPairs = Math.abs(Number(current.pairs ?? (current as any).totalQty ?? (current as any).qty ?? 0));
    const newPairs = updates.pairs !== undefined ? Math.abs(Number(updates.pairs)) : oldPairs;
    const oldRate = Number(current.rate) || 0;
    const newRate = updates.rate !== undefined ? Number(updates.rate) : oldRate;
    const oldArticle = (current.articleTitle || current.article || '').trim();
    const newArticle = (updates.articleTitle || updates.article || oldArticle).trim();
    const oldSize = (current.sizeName || current.size || 'Standard').trim();
    const newSize = (updates.sizeName || updates.size || oldSize).trim();
    const oldOrderId = current.orderId || '';
    const newOrderId = updates.orderId !== undefined ? (updates.orderId || '') : oldOrderId;
    const oldCutterId = current.cutterId;
    const newCutterId = updates.cutterId || oldCutterId;
    const targetOrder = newOrderId ? orders.find(o => o.id === newOrderId) : undefined;
    const newOrderNo = newOrderId
      ? (updates.orderNo || targetOrder?.orderNo || current.orderNo || '')
      : '';
    const newCustomerName = newOrderId
      ? (updates.customerName || targetOrder?.customerName || current.customerName || 'Stock - No Order')
      : (updates.customerName || 'Stock - No Order');

    const updated: CuttingEntry = {
      ...current,
      ...updates,
      id,
      cutterId: newCutterId,
      cutterName: updates.cutterName || (cutters.find(c => c.id === newCutterId)?.name || current.cutterName || ''),
      orderId: newOrderId,
      orderNo: newOrderNo,
      customerName: newCustomerName,
      customerOrder: newOrderNo ? `${newCustomerName} - ${newOrderNo}` : newCustomerName,
      article: newArticle,
      articleTitle: newArticle,
      size: newSize,
      sizeName: newSize,
      date: updates.date || current.date,
      average: updates.average !== undefined ? updates.average : (current.average || ''),
      remarks: updates.remarks !== undefined ? updates.remarks : (current.remarks || ''),
      billNo: updates.billNo !== undefined ? updates.billNo : (current.billNo || ''),
      pairs: newPairs,
      totalQty: newPairs,
      rate: newRate,
      lotTotal: newPairs * newRate,
      totalBalance: newPairs * newRate,
      editedAt: new Date().toISOString(),
      editedBy: 'User'
    };

    const batch = writeBatch(db);

    // 1. Stock Move Logic (if RECEIVE entry)
    if (current.type === 'RECEIVE') {
      const oldStockId = `${normalizeStockDocumentId(oldArticle)}__${normalizeStockDocumentId(oldSize)}`;
      const newStockId = `${normalizeStockDocumentId(newArticle)}__${normalizeStockDocumentId(newSize)}`;
      const oldArticleId = normalizeStockDocumentId(oldArticle);
      const newArticleId = normalizeStockDocumentId(newArticle);

      if (oldStockId === newStockId) {
        const delta = newPairs - oldPairs;
        if (delta !== 0) {
          if (stockManagement.some(s => s.id === oldStockId)) {
            batch.update(doc(db, 'stock_management', oldStockId), {
              qty: increment(delta),
              totalStock: increment(delta),
              totalCuttingReceived: increment(delta),
              balance: increment(delta),
              updatedAt: new Date().toISOString()
            });
          } else {
            batch.set(doc(db, 'stock_management', oldStockId), {
              article: newArticle,
              articleName: newArticle,
              size: newSize,
              qty: increment(delta),
              totalStock: increment(delta),
              totalCuttingReceived: increment(delta),
              balance: increment(delta),
              receiveIds: arrayUnion(id),
              updatedAt: new Date().toISOString()
            }, { merge: true });
          }
          const existingOldArt = articleStock.find(a => normalizeStockDocumentId(a.articleName) === oldArticleId);
          if (existingOldArt) {
            const nextHist = (existingOldArt.cuttingHistory || []).map(h =>
              h.receiveId === id
                ? {
                    ...h,
                    date: updated.date,
                    pairs: newPairs,
                    source: updated.cutterName || h.source,
                    customerName: newCustomerName,
                    orderNo: newOrderNo,
                    orderId: newOrderId,
                    size: newSize
                  }
                : h
            );
            batch.update(doc(db, 'article_stock', oldArticleId), {
              totalReceived: increment(delta),
              totalAvailable: increment(delta),
              cuttingHistory: nextHist
            });
          }
        }
      } else {
        if (stockManagement.some(s => s.id === oldStockId)) {
          batch.update(doc(db, 'stock_management', oldStockId), {
            qty: increment(-oldPairs),
            totalStock: increment(-oldPairs),
            totalCuttingReceived: increment(-oldPairs),
            balance: increment(-oldPairs),
            receiveIds: (stockManagement.find(s => s.id === oldStockId)?.receiveIds || []).filter(rId => rId !== id),
            updatedAt: new Date().toISOString()
          });
        }
        const existingOldArt = articleStock.find(a => normalizeStockDocumentId(a.articleName) === oldArticleId);
        if (existingOldArt) {
          batch.update(doc(db, 'article_stock', oldArticleId), {
            totalReceived: increment(-oldPairs),
            totalAvailable: increment(-oldPairs),
            cuttingHistory: (existingOldArt.cuttingHistory || []).filter(h => h.receiveId !== id)
          });
        }

        batch.set(doc(db, 'stock_management', newStockId), {
          article: newArticle,
          articleName: newArticle,
          size: newSize,
          qty: increment(newPairs),
          totalStock: increment(newPairs),
          totalCuttingReceived: increment(newPairs),
          balance: increment(newPairs),
          receiveIds: arrayUnion(id),
          updatedAt: new Date().toISOString()
        }, { merge: true });
        batch.set(doc(db, 'article_stock', newArticleId), {
          articleName: newArticle,
          totalReceived: increment(newPairs),
          totalAvailable: increment(newPairs),
          cuttingHistory: arrayUnion({
            date: updated.date,
            pairs: newPairs,
            receiveId: id,
            source: updated.cutterName || 'Cutting Master',
            customerName: newCustomerName,
            orderNo: newOrderNo,
            orderId: newOrderId,
            size: newSize
          })
        }, { merge: true });
      }
    }

    // 2. Order Move & Sync Logic (if Order, Article, Quantity, or Date changed)
    if (oldOrderId !== newOrderId || oldPairs !== newPairs || oldArticle !== newArticle || updated.date !== current.date) {
      if (oldOrderId && oldOrderId !== newOrderId) {
        const oldOrd = orders.find(o => o.id === oldOrderId);
        if (oldOrd) {
          const updatedItems = oldOrd.items.map(itm => {
            if (itm.title.toLowerCase() === oldArticle.toLowerCase() || itm.gloveType.toLowerCase() === oldArticle.toLowerCase()) {
              return {
                ...itm,
                cuttingGivenQty: current.type === 'GIVE' ? Math.max(0, itm.cuttingGivenQty - oldPairs) : itm.cuttingGivenQty,
                stockReceivedQty: current.type === 'RECEIVE' ? Math.max(0, itm.stockReceivedQty - oldPairs) : itm.stockReceivedQty
              };
            }
            return itm;
          });
          batch.update(doc(db, 'customer_orders', oldOrderId), { items: updatedItems, updatedAt: new Date().toISOString() });
          batch.delete(doc(db, 'customer_orders', oldOrderId, 'order_history', id));
          batch.delete(doc(db, 'order_dispatch_history', id));
        }
      }
      if (newOrderId && targetOrder) {
        const isSameOrder = oldOrderId === newOrderId;
        const qtyDelta = isSameOrder ? (newPairs - oldPairs) : newPairs;
        const updatedItems = targetOrder.items.map(itm => {
          const matchesNew = itm.title.toLowerCase() === newArticle.toLowerCase() || itm.gloveType.toLowerCase() === newArticle.toLowerCase();
          const matchesOld = isSameOrder && (itm.title.toLowerCase() === oldArticle.toLowerCase() || itm.gloveType.toLowerCase() === oldArticle.toLowerCase());
          if (isSameOrder && oldArticle.toLowerCase() !== newArticle.toLowerCase()) {
            let nextGiven = itm.cuttingGivenQty;
            let nextRcvd = itm.stockReceivedQty;
            if (matchesOld) {
              if (current.type === 'GIVE') nextGiven = Math.max(0, nextGiven - oldPairs);
              if (current.type === 'RECEIVE') nextRcvd = Math.max(0, nextRcvd - oldPairs);
            }
            if (matchesNew) {
              if (current.type === 'GIVE') nextGiven += newPairs;
              if (current.type === 'RECEIVE') nextRcvd += newPairs;
            }
            return { ...itm, cuttingGivenQty: nextGiven, stockReceivedQty: nextRcvd };
          }
          if (matchesNew) {
            return {
              ...itm,
              cuttingGivenQty: current.type === 'GIVE' ? Math.max(0, itm.cuttingGivenQty + qtyDelta) : itm.cuttingGivenQty,
              stockReceivedQty: current.type === 'RECEIVE' ? Math.max(0, itm.stockReceivedQty + qtyDelta) : itm.stockReceivedQty
            };
          }
          return itm;
        });
        batch.update(doc(db, 'customer_orders', newOrderId), { items: updatedItems, updatedAt: new Date().toISOString() });
        batch.set(doc(db, 'customer_orders', newOrderId, 'order_history', id), stripUndefined({
          date: updated.date,
          actionType: current.type === 'GIVE' ? 'cutting_given' : 'stock_received',
          quantity: newPairs,
          personName: updated.cutterName || 'Cutting Master',
          article: newArticle,
          notes: updated.remarks || '',
          createdAt: new Date().toISOString()
        }), { merge: true });
      }
    }

    // 3. Cutter Ledger Balances Recalculation
    const cuttersToBalance = new Set([oldCutterId, newCutterId]);
    for (const cId of cuttersToBalance) {
      const cutterEntriesList = [
        ...cuttingEntries.filter(e => e.id !== id && e.cutterId === cId),
        ...(newCutterId === cId ? [updated] : [])
      ].sort((a, b) => safeStringCompare(a.date, b.date) || safeStringCompare(a.createdAt, b.createdAt) || safeStringCompare(a.id, b.id));

      let cBal = 0;
      cutterEntriesList.forEach(e => {
        cBal += e.lotTotal;
        const eRef = doc(db, 'cuttingEntries', e.id);
        batch.set(eRef, stripUndefined({ ...e, runningBalance: cBal }), { merge: true });
      });

      const totalGiven = cutterEntriesList.filter(e => e.type === 'GIVE').reduce((s, e) => s + e.pairs, 0);
      const totalReceived = cutterEntriesList.filter(e => e.type === 'RECEIVE' || e.type === 'RETURN').reduce((s, e) => s + e.pairs, 0);
      batch.set(doc(db, 'cutters', cId), {
        totalGiven,
        totalReceived,
        pendingBalance: Math.max(0, totalGiven - totalReceived),
        updatedAt: new Date().toISOString()
      }, { merge: true });
    }

    // 4. Update cuttingEntries and cutting_transactions
    batch.set(doc(db, 'cuttingEntries', id), stripUndefined(updated), { merge: true });
    batch.set(doc(db, 'cutting_transactions', id), stripUndefined({
      ...updated,
      qty: newPairs,
      totalQty: newPairs
    }), { merge: true });

    await batch.commit();

    // Local state updates
    setCuttingEntries(prev => prev.map(e => e.id === id ? updated : e));
    setCuttingTransactions(prev => prev.map(t => t.id === id ? ({ ...t, ...updated, type: t.type, qty: newPairs, totalQty: newPairs } as any) : t));
    
    if (oldArticle !== newArticle || oldOrderId !== newOrderId) {
      showToast(`Entry moved from ${current.customerName || 'Direct'} / ${oldArticle} to ${newCustomerName} / ${newArticle}`);
    } else {
      showToast('Cutting entry updated successfully.');
    }
  };

  const deleteCuttingEntry = async (id: string): Promise<void> => {
    if (!id || !id.trim()) throw new Error('Invalid cutting entry ID.');
    if (!db) throw new Error('Firestore is not available. The entry was not deleted.');

    let current: any =
      cuttingEntries.find(entry => entry.id === id) ||
      cuttingTransactions.find(tx => tx.id === id);

    if (!current) {
      const [entrySnap, txSnap] = await Promise.all([
        getDoc(doc(db, 'cuttingEntries', id)),
        getDoc(doc(db, 'cutting_transactions', id))
      ]);
      if (entrySnap.exists()) {
        current = { ...entrySnap.data(), id: entrySnap.id };
      } else if (txSnap.exists()) {
        current = { ...txSnap.data(), id: txSnap.id };
      }
    }

    if (current?.type === 'RETURN') {
      await deleteCuttingReturn(id);
      return;
    }

    const allIdsToDelete = new Set<string>([id]);
    cuttingEntries.forEach(e => {
      if (e.parentCuttingId === id) allIdsToDelete.add(e.id);
    });
    cuttingTransactions.forEach(t => {
      if ((t as any).parentCuttingId === id) allIdsToDelete.add(t.id);
    });

    const targetSignature = current ? getCuttingSignature(current) : '';

    // Scan Firestore cuttingEntries & cutting_transactions to find all related/duplicate docs
    // so deleting 1 deduped row NEVER leaves a duplicate doc behind to resurrect 1s later.
    const [allCuttingEntriesSnap, allCuttingTxSnap] = await Promise.all([
      getDocs(collection(db, 'cuttingEntries')),
      getDocs(collection(db, 'cutting_transactions'))
    ]);
    const existingCuttingEntryDocIds = new Set<string>();
    allCuttingEntriesSnap.docs.forEach(d => {
      existingCuttingEntryDocIds.add(d.id);
      const data = d.data();
      if (data.parentCuttingId === id) allIdsToDelete.add(d.id);
      if (targetSignature && getCuttingSignature(data) === targetSignature) {
        allIdsToDelete.add(d.id);
      }
    });
    allCuttingTxSnap.docs.forEach(d => {
      const data = d.data();
      if (data.parentCuttingId === id) allIdsToDelete.add(d.id);
      if (targetSignature && getCuttingSignature(data) === targetSignature) {
        allIdsToDelete.add(d.id);
      }
    });

    // Persist deleted IDs blocklist immediately in Firestore + localStorage
    await markCuttingIdsDeleted(allIdsToDelete);

    const articleName = (current?.articleTitle || current?.article || '').trim();
    const sizeName = (current?.sizeName || current?.size || 'Standard').trim();
    const pairs = Math.abs(Number(current?.pairs ?? current?.totalQty ?? current?.qty ?? 0));
    const entryType = current?.type || 'RECEIVE';
    const orderIdToClean = current?.orderId || orders.find(o =>
      (current?.orderNo && o.orderNo === current.orderNo) ||
      (o.customerName && current?.customerName && o.customerName.toLowerCase().trim() === current.customerName.toLowerCase().trim())
    )?.id || '';

    const batch = writeBatch(db);
    const now = new Date().toISOString();

    // 1. Stock Reversal (Hard delete from stock_management, article_stock & stock_ledger — no negative rows)
    const removedStockIds = new Set<string>();
    const updatedStockMgmtMap = new Map<string, Partial<FactoryStockItem>>();
    const updatedArticleStockMap = new Map<string, Partial<ArticleStockItem>>();
    const deletedLedgerIds = new Set<string>();

    if (entryType === 'RECEIVE') {
      const stockDocId = articleName ? `${normalizeStockDocumentId(articleName)}__${normalizeStockDocumentId(sizeName)}` : '';
      const articleDocId = articleName ? normalizeStockDocumentId(articleName) : '';

      const [stockSnap, articleSnap, ledgerSnap] = await Promise.all([
        getDocs(collection(db, 'stock_management')),
        getDocs(collection(db, 'article_stock')),
        getDocs(collection(db, 'stock_ledger'))
      ]);

      stockSnap.docs.forEach(d => {
        const data = d.data();
        const existingReceiveIds: string[] = Array.isArray(data.receiveIds) ? data.receiveIds : [];
        const hasAnyId = existingReceiveIds.some(rId => allIdsToDelete.has(rId));
        const matchesIdFallback = !hasAnyId && stockDocId && d.id === stockDocId && existingReceiveIds.length === 0;
        if (hasAnyId || matchesIdFallback) {
          const nextReceiveIds = existingReceiveIds.filter(rId => !allIdsToDelete.has(rId));
          const decQty = pairs;
          const nextQty = Math.max(0, (Number(data.qty) || 0) - decQty);
          const nextTotalStock = Math.max(0, (Number(data.totalStock) || 0) - decQty);
          const nextCuttingReceived = Math.max(0, (Number(data.totalCuttingReceived) || 0) - decQty);
          const nextDelivered = Number(data.totalDelivered) || 0;
          const nextBalance = Math.max(0, (Number(data.balance) || 0) - decQty);
          if (nextReceiveIds.length === 0 && nextDelivered === 0 && nextCuttingReceived === 0) {
            batch.delete(doc(db, 'stock_management', d.id));
            removedStockIds.add(d.id);
          } else {
            const patch = {
              qty: nextQty,
              totalStock: nextTotalStock,
              totalCuttingReceived: nextCuttingReceived,
              balance: nextBalance,
              receiveIds: nextReceiveIds,
              updatedAt: now
            };
            batch.update(doc(db, 'stock_management', d.id), patch);
            updatedStockMgmtMap.set(d.id, patch);
          }
        }
      });

      articleSnap.docs.forEach(d => {
        const data = d.data();
        const hist: any[] = Array.isArray(data.cuttingHistory) ? data.cuttingHistory : [];
        const matchedHist = hist.filter(h => allIdsToDelete.has(h?.receiveId || ''));
        const matchesDocFallback = matchedHist.length === 0 && articleDocId && d.id === articleDocId;
        if (matchedHist.length > 0 || (matchesDocFallback && hist.length === 0 && Number(data.totalReceived) > 0)) {
          const removedHistPairs = matchedHist.reduce((sum, h) => sum + Math.abs(Number(h?.pairs) || 0), 0);
          const decQty = removedHistPairs > 0 ? removedHistPairs : pairs;
          const nextHist = hist.filter(h => !allIdsToDelete.has(h?.receiveId || ''));
          const nextReceived = Math.max(0, (Number(data.totalReceived) || 0) - decQty);
          const nextAvailable = Math.max(0, (Number(data.totalAvailable) || 0) - decQty);
          const patch = {
            totalReceived: nextReceived,
            totalAvailable: nextAvailable,
            cuttingHistory: nextHist
          };
          batch.update(doc(db, 'article_stock', d.id), patch);
          updatedArticleStockMap.set(d.id, patch);
        }
      });

      ledgerSnap.docs.forEach(d => {
        const data = d.data();
        const refId = String(data?.referenceId || '');
        const strippedId = d.id.replace(/^stk-/, '');
        if (allIdsToDelete.has(d.id) || allIdsToDelete.has(strippedId) || (refId && allIdsToDelete.has(refId))) {
          batch.delete(doc(db, 'stock_ledger', d.id));
          deletedLedgerIds.add(d.id);
        }
      });
    }

    // 2. Customer Order Progress & History Cleanup (with doc existence checks)
    const deletedDispatchHistoryIds = new Set<string>(allIdsToDelete);
    const dispatchSnap = await getDocs(collection(db, 'order_dispatch_history'));
    dispatchSnap.docs.forEach(d => {
      const data = d.data();
      const cuttingId = String(data?.cuttingId || '');
      const legacyMatch = !cuttingId && orderIdToClean && data.orderId === orderIdToClean &&
        data.date === current?.date &&
        Number(data.quantity) === pairs &&
        String(data.article || '').trim().toLowerCase() === articleName.toLowerCase() &&
        String(data.personName || '').trim().toLowerCase() === String(current?.cutterName || '').trim().toLowerCase();
      if (allIdsToDelete.has(d.id) || (cuttingId && allIdsToDelete.has(cuttingId)) || legacyMatch) {
        batch.delete(doc(db, 'order_dispatch_history', d.id));
        deletedDispatchHistoryIds.add(d.id);
      }
    });

    if (orderIdToClean) {
      const [orderDocSnap, subHistorySnap] = await Promise.all([
        getDoc(doc(db, 'customer_orders', orderIdToClean)),
        getDocs(collection(db, 'customer_orders', orderIdToClean, 'order_history'))
      ]);
      subHistorySnap.docs.forEach(d => {
        const data = d.data();
        const cuttingId = String(data?.cuttingId || '');
        const legacyMatch = !cuttingId && current &&
          data.date === current.date &&
          Number(data.quantity) === pairs &&
          String(data.article || '').trim().toLowerCase() === articleName.toLowerCase() &&
          String(data.personName || '').trim().toLowerCase() === String(current.cutterName || '').trim().toLowerCase();
        if (allIdsToDelete.has(d.id) || (cuttingId && allIdsToDelete.has(cuttingId)) || legacyMatch) {
          batch.delete(doc(db, 'customer_orders', orderIdToClean, 'order_history', d.id));
        }
      });

      if (orderDocSnap.exists()) {
        const remoteItems: OrderItem[] = Array.isArray(orderDocSnap.data().items) ? orderDocSnap.data().items : [];
        const updatedItems = remoteItems.map(itm => {
          if (
            (itm.title || '').toLowerCase() === articleName.toLowerCase() ||
            (itm.gloveType || '').toLowerCase() === articleName.toLowerCase() ||
            (itm.article || '').toLowerCase() === articleName.toLowerCase()
          ) {
            return {
              ...itm,
              cuttingGivenQty: entryType === 'GIVE' ? Math.max(0, (Number(itm.cuttingGivenQty) || 0) - pairs) : (Number(itm.cuttingGivenQty) || 0),
              stockReceivedQty: entryType === 'RECEIVE' ? Math.max(0, (Number(itm.stockReceivedQty) || 0) - pairs) : (Number(itm.stockReceivedQty) || 0)
            };
          }
          return itm;
        });
        batch.update(doc(db, 'customer_orders', orderIdToClean), { items: updatedItems, updatedAt: now });
      }
    }

    // 3. Delete from cuttings, cuttingEntries, and cutting_transactions
    for (const delId of allIdsToDelete) {
      batch.delete(doc(db, 'cuttings', delId));
      batch.delete(doc(db, 'cuttingEntries', delId));
      batch.delete(doc(db, 'cutting_transactions', delId));
    }

    // 4. Recalculate cutter ledger running balances safely (only update existing docs!)
    const targetCutterId = current?.cutterId || '';
    const remaining = cuttingEntries.filter(entry => !allIdsToDelete.has(entry.id) && (!targetCutterId || entry.cutterId === targetCutterId));
    let balance = 0;
    const balanced = remaining
      .filter(entry => targetCutterId && entry.cutterId === targetCutterId)
      .sort((a, b) => safeStringCompare(a.date, b.date) || safeStringCompare(a.createdAt, b.createdAt) || safeStringCompare(a.id, b.id))
      .map(entry => {
        balance += entry.lotTotal;
        return { ...entry, runningBalance: balance };
      });
    balanced.forEach(entry => {
      if (existingCuttingEntryDocIds.has(entry.id)) {
        batch.update(doc(db, 'cuttingEntries', entry.id), { runningBalance: entry.runningBalance });
      }
    });

    const totalGiven = balanced.filter(entry => entry.type === 'GIVE').reduce((sum, entry) => sum + entry.pairs, 0);
    const totalReceived = balanced.filter(entry => entry.type === 'RECEIVE' || entry.type === 'RETURN').reduce((sum, entry) => sum + entry.pairs, 0);
    if (targetCutterId) {
      const cutterSnap = await getDoc(doc(db, 'cutters', targetCutterId));
      if (cutterSnap.exists()) {
        batch.update(doc(db, 'cutters', targetCutterId), {
          totalGiven,
          totalReceived,
          pendingBalance: Math.max(0, totalGiven - totalReceived),
          updatedAt: now
        });
      }
    }

    await batch.commit();

    // 5. Immediately update ALL React states AND localStorage caches so Ctrl+R never resurrects deleted rows
    setCuttingEntries(prev => prev.filter(e => !allIdsToDelete.has(e.id)));
    setCuttingTransactions(prev => {
      const next = prev.filter(t => !allIdsToDelete.has(t.id));
      saveLocal(STORAGE_KEYS.CUTTING_TXS, next);
      return next;
    });
    setCuttings(prev => {
      const next = prev.filter(c => !allIdsToDelete.has(c.id));
      saveLocal(STORAGE_KEYS.CUTTINGS, next);
      return next;
    });
    setOrderDispatchHistory(prev => {
      const next = prev.filter(h => !deletedDispatchHistoryIds.has(h.id) && !allIdsToDelete.has((h as any).cuttingId || ''));
      saveLocal(STORAGE_KEYS.ORDER_HISTORY, next);
      return next;
    });
    if (entryType === 'RECEIVE') {
      setStockLedger(prev => {
        const next = prev.filter(l =>
          !deletedLedgerIds.has(l.id) &&
          !allIdsToDelete.has(l.id) &&
          !allIdsToDelete.has(l.id.replace(/^stk-/, '')) &&
          !allIdsToDelete.has(l.referenceId || '')
        );
        saveLocal(STORAGE_KEYS.STOCK_LEDGER, next);
        return next;
      });
      setStockManagement(prev =>
        prev
          .filter(s => !removedStockIds.has(s.id))
          .map(s => updatedStockMgmtMap.has(s.id) ? { ...s, ...updatedStockMgmtMap.get(s.id)! } : s)
      );
      setArticleStock(prev =>
        prev.map(a => updatedArticleStockMap.has(a.id) ? { ...a, ...updatedArticleStockMap.get(a.id)! } : a)
      );
    }
    if (orderIdToClean) {
      setOrders(prev => {
        const next = prev.map(ord => {
          if (ord.id !== orderIdToClean) return ord;
          const updatedItems = ord.items.map(itm => {
            if (
              (itm.title || '').toLowerCase() === articleName.toLowerCase() ||
              (itm.gloveType || '').toLowerCase() === articleName.toLowerCase() ||
              (itm.article || '').toLowerCase() === articleName.toLowerCase()
            ) {
              return {
                ...itm,
                cuttingGivenQty: entryType === 'GIVE' ? Math.max(0, (Number(itm.cuttingGivenQty) || 0) - pairs) : (Number(itm.cuttingGivenQty) || 0),
                stockReceivedQty: entryType === 'RECEIVE' ? Math.max(0, (Number(itm.stockReceivedQty) || 0) - pairs) : (Number(itm.stockReceivedQty) || 0)
              };
            }
            return itm;
          });
          return { ...ord, items: updatedItems, updatedAt: now };
        });
        saveLocal(STORAGE_KEYS.ORDERS, next);
        return next;
      });
    }
    if (targetCutterId) {
      setCutters(prev => {
        const next = prev.map(c => c.id === targetCutterId ? {
          ...c,
          totalGiven,
          totalReceived,
          pendingBalance: Math.max(0, totalGiven - totalReceived)
        } : c);
        saveLocal(STORAGE_KEYS.CUTTERS, next);
        return next;
      });
    }
  };

  const returnCutting = async (data: {
    originalEntryId: string;
    quantity: number;
    reason: 'Damaged' | 'Wrong Size' | 'Quality' | string;
    date: string;
    remarks?: string;
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
      remarks: data.remarks || `Return Cutting - ${articleName} - ${data.quantity} pairs`,
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
      safeStringCompare(b.date, a.date) || safeStringCompare(b.createdAt, a.createdAt)
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

    const norm = articleName.toLowerCase();
    if (db) {
      void deleteDoc(doc(db, 'deleted_products', norm)).catch(() => {});
    }
    setDeletedProductsList(prev => {
      const next = prev.filter(d => d.name !== norm);
      saveLocal('gferp_deleted_products_v1', next);
      return next;
    });

    const createdAt = new Date().toISOString();
    const articleRef = await addDoc(collection(db, 'articles_master'), { articleName, sizes, createdAt });
    await updateDoc(articleRef, { id: articleRef.id });
    const created = { id: articleRef.id, articleName, articleCode: data.articleCode || '', sizes, createdAt };
    setArticlesMaster(previous => [...previous, created].sort((a, b) => a.articleName.localeCompare(b.articleName)));
    return created;
  };

  const deliverFromStock = async (data: {
    stockId?: string;
    orderId: string;
    customerName: string;
    quantity: number;
    date: string;
    article?: string;
    size?: string;
    billNo?: string;
    gatePassNo?: string;
    rate?: number;
    amount?: number;
    vehicleNo?: string;
    driverName?: string;
    biltyNo?: string;
    status?: 'Delivered' | 'Partial Delivered' | 'Pending';
    notes?: string;
  }): Promise<void> => {
    const order = orders.find(item => item.id === data.orderId);
    if (!order) throw new Error('The selected customer order no longer exists.');
    if (!Number.isFinite(data.quantity) || data.quantity <= 0 || !data.date || !data.customerName.trim()) {
      throw new Error('Enter a valid delivery quantity, date, and customer.');
    }

    const articleName = (typeof data.article === 'string' ? data.article.trim() : '') || (order.items?.[0]?.title || order.items?.[0]?.gloveType || '1202');
    const rawSize = (typeof data.size === 'string' ? data.size.trim() : '') || (order.items?.[0]?.size || '10');
    const sizeName = (rawSize === '10000' || rawSize === '10,000') ? '10' : rawSize;

    // Idempotency check: prevent duplicate deliveries created within 4 seconds for same order, bill, article, size, quantity
    const isDuplicate = (deliveryHistory || []).some(d =>
      (d.orderId === data.orderId || d.customerOrderId === data.orderId) &&
      d.article?.toLowerCase() === articleName.toLowerCase() &&
      d.size === sizeName &&
      d.quantity === data.quantity &&
      (d.billNo === data.billNo?.trim() || d.gatePassNo === data.gatePassNo?.trim()) &&
      Date.now() - new Date(d.createdAt || 0).getTime() < 4000
    );
    if (isDuplicate) {
      console.warn('Duplicate delivery detected within 4s, aborting duplicate creation.');
      return;
    }

    let stockItem = data.stockId ? stockManagement.find(item => item.id === data.stockId) : undefined;
    if (!stockItem) {
      stockItem = stockManagement.find(item => 
        (item.article || item.articleName || '').trim().toLowerCase() === articleName.toLowerCase() &&
        (item.size || '').trim().toLowerCase() === sizeName.toLowerCase()
      );
    }
    if (!stockItem) {
      stockItem = stockManagement.find(item => 
        (item.article || item.articleName || '').trim().toLowerCase() === articleName.toLowerCase()
      );
    }

    // Auto-generate sequential unique Gate Pass number if not provided
    const existingGatePassNumbers = (deliveryHistory || [])
      .map(d => {
        const match = (d.gatePassNo || '').match(/^GP-(\d+)$/i);
        return match ? parseInt(match[1], 10) : 0;
      })
      .filter(n => !isNaN(n) && n > 0);
    const maxGp = existingGatePassNumbers.length > 0 ? Math.max(...existingGatePassNumbers) : 0;
    const assignedGatePassNo = data.gatePassNo?.trim() || `GP-${String(maxGp + 1).padStart(3, '0')}`;

    // Auto-generate Bill number if not provided
    const assignedBillNo = data.billNo?.trim() || `Bill No. ${(deliveryHistory || []).length + 19}`;

    const matchingOrderItem = order.items?.find(i => 
      (i.title || i.gloveType || i.article || '').trim().toLowerCase() === articleName.toLowerCase()
    );
    const finalRate = data.rate !== undefined && data.rate !== null && (data.rate as any) !== ''
      ? Number(data.rate)
      : (matchingOrderItem?.rate !== undefined ? Number(matchingOrderItem.rate) : 0);
    const finalAmount = data.rate !== undefined && data.rate !== null && (data.rate as any) !== ''
      ? data.quantity * Number(data.rate)
      : (Number(data.amount) || (data.quantity * finalRate));
    const assignedVehicleNo = typeof data.vehicleNo === 'string' ? data.vehicleNo.trim() : '';
    const assignedDriverName = typeof data.driverName === 'string' ? data.driverName.trim() : '';
    const assignedBiltyNo = typeof data.biltyNo === 'string' ? data.biltyNo.trim() : '';

    const stockItemId = stockItem?.id || `${normalizeStockDocumentId(articleName)}__${normalizeStockDocumentId(sizeName)}`;
    const articleId = normalizeStockDocumentId(articleName);
    const deliveryId = `del-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const dispatchHistoryId = `disp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const orderHistoryId = `ordhist-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const now = new Date().toISOString();

    const delivery: DeliveryHistoryEntry = {
      id: deliveryId,
      orderId: order.id,
      customerOrderId: order.id,
      orderNo: order.orderNo,
      linkedStockId: stockItemId,
      stockId: stockItemId,
      dispatchHistoryId: dispatchHistoryId,
      orderHistoryId: orderHistoryId,
      date: data.date,
      deliveryDate: data.date,
      billNo: assignedBillNo,
      gatePassNo: assignedGatePassNo,
      customerName: data.customerName.trim(),
      partyName: data.customerName.trim(),
      article: articleName,
      size: sizeName,
      quantity: data.quantity,
      rate: finalRate,
      amount: finalAmount,
      vehicleNo: assignedVehicleNo,
      driverName: assignedDriverName,
      biltyNo: assignedBiltyNo,
      createdAt: now
    };

    const articleDelivery = {
      date: data.date,
      orderNo: order.orderNo,
      customerName: data.customerName.trim(),
      pairs: data.quantity,
      remainingAfter: (stockItem?.balance || 0) - data.quantity,
      deliveryId,
      billNo: assignedBillNo,
      gatePassNo: assignedGatePassNo,
      rate: finalRate,
      amount: finalAmount,
      vehicleNo: assignedVehicleNo,
      driverName: assignedDriverName,
      biltyNo: assignedBiltyNo
    };

    const currentTotalDelivered = order.totalDelivered || 0;
    const newTotalDelivered = currentTotalDelivered + data.quantity;
    const totalOrderPairs = order.totalPairs || order.totalQty || 0;
    const newRemainingPairs = Math.max(0, totalOrderPairs - newTotalDelivered);
    const updatedStatus = newRemainingPairs === 0 ? 'Completed' : (newTotalDelivered > 0 ? 'Partial-Billed' : order.status);

    if (db) {
      try {
        const stockRef = doc(db, 'stock_management', stockItemId);
        const articleRef = doc(db, 'article_stock', articleId);
        const deliveryRef = doc(db, 'stock_delivery_history', deliveryId);
        const dispatchHistoryRef = doc(db, 'order_dispatch_history', dispatchHistoryId);
        const orderHistoryRef = doc(db, 'customer_orders', order.id, 'order_history', orderHistoryId);
        const orderDocRef = doc(db, 'customer_orders', order.id);

        const batch = writeBatch(db);
        batch.set(deliveryRef, delivery);
        batch.set(dispatchHistoryRef, {
          id: dispatchHistoryId,
          orderId: order.id,
          orderNo: order.orderNo,
          date: data.date,
          actionType: 'dispatched_to_customer',
          quantity: data.quantity,
          article: articleName,
          billNo: assignedBillNo,
          gatePassNo: assignedGatePassNo,
          notes: `Stock delivery · ${sizeName} · Gate Pass: ${assignedGatePassNo} · Bill: ${assignedBillNo}`,
          createdAt: now
        });
        batch.set(orderHistoryRef, {
          id: orderHistoryId,
          date: data.date,
          actionType: 'dispatched_to_customer',
          quantity: data.quantity,
          article: articleName,
          size: sizeName,
          billNo: assignedBillNo,
          gatePassNo: assignedGatePassNo,
          notes: `Delivered · GP: ${assignedGatePassNo} · Bill: ${assignedBillNo}`,
          createdAt: now
        });
        batch.set(orderDocRef, {
          id: order.id,
          orderNo: order.orderNo,
          customerName: order.customerName,
          totalDelivered: increment(data.quantity),
          remaining: newRemainingPairs,
          status: updatedStatus,
          updatedAt: now
        }, { merge: true });
        batch.set(stockRef, {
          id: stockItemId,
          article: articleName,
          articleName,
          size: sizeName,
          totalStock: increment(0),
          totalDelivered: increment(data.quantity),
          balance: increment(-data.quantity),
          deliveryIds: arrayUnion(deliveryId),
          updatedAt: now
        }, { merge: true });
        batch.set(articleRef, {
          id: articleId,
          articleName,
          totalDelivered: increment(data.quantity),
          totalAvailable: increment(-data.quantity),
          deliveryHistory: arrayUnion(articleDelivery),
          lastUpdated: now
        }, { merge: true });

        await batch.commit();
      } catch (err) {
        console.warn('Firestore delivery write notice:', err);
      }
    }

    const nextDeliveries = [delivery, ...deliveryHistory.filter(d => d.id !== delivery.id)];
    setDeliveryHistory(nextDeliveries);
    saveLocal(STORAGE_KEYS.STOCK_OUT, nextDeliveries);
    setOrderDispatchHistory(prev => [{
      id: dispatchHistoryId,
      orderId: order.id,
      orderNo: order.orderNo,
      date: data.date,
      actionType: 'dispatched_to_customer',
      quantity: data.quantity,
      article: articleName,
      billNo: assignedBillNo,
      gatePassNo: assignedGatePassNo,
      notes: `Stock delivery · ${sizeName} · Gate Pass: ${assignedGatePassNo} · Bill: ${assignedBillNo}`,
      createdAt: now
    }, ...prev]);
    setOrders(prev => prev.map(o => {
      if (o.id === order.id) {
        return {
          ...o,
          totalDelivered: newTotalDelivered,
          remaining: newRemainingPairs,
          status: updatedStatus,
          updatedAt: now
        };
      }
      return o;
    }));
    setStockManagement(prev => {
      const idx = prev.findIndex(s => s.id === stockItemId);
      if (idx >= 0) {
        const updated = {
          ...prev[idx],
          totalDelivered: (prev[idx].totalDelivered || 0) + data.quantity,
          balance: Math.max(0, (prev[idx].balance || 0) - data.quantity),
          deliveryIds: [...(prev[idx].deliveryIds || []), deliveryId]
        };
        return prev.map((s, i) => i === idx ? updated : s);
      }
      return prev;
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

    await unmarkDeletedArticle(articleName);

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
    updates: Partial<DeliveryHistoryEntry>
  ): Promise<void> => {
    const current = deliveryHistory.find(entry => entry.id === id);
    if (!current) throw new Error('The stock delivery no longer exists.');
    if (!db) throw new Error('Firestore is not available. The delivery was not updated.');

    const qty = updates.quantity !== undefined ? updates.quantity : current.quantity;
    const dateVal = updates.date || current.date;
    const custName = updates.customerName !== undefined ? updates.customerName : current.customerName;

    const stockRef = current.linkedStockId ? doc(db, 'stock_management', current.linkedStockId) : null;
    const articleRef = doc(db, 'article_stock', normalizeStockDocumentId(current.article));
    const deliveryRef = doc(db, 'stock_delivery_history', id);
    const dispatchHistoryRef = current.dispatchHistoryId
      ? doc(db, 'order_dispatch_history', current.dispatchHistoryId)
      : null;
    const orderHistoryRef = current.orderHistoryId && current.orderId
      ? doc(db, 'customer_orders', current.orderId, 'order_history', current.orderHistoryId)
      : null;
    const now = new Date().toISOString();

    const rateVal = updates.rate !== undefined ? Number(updates.rate) : current.rate;
    const amountVal = updates.amount !== undefined ? Number(updates.amount) : (qty * (rateVal || 0));

    const updatedDelivery: DeliveryHistoryEntry = {
      ...current,
      ...updates,
      id,
      date: dateVal,
      deliveryDate: dateVal,
      quantity: qty,
      customerName: custName,
      partyName: custName,
      vehicleNo: updates.vehicleNo !== undefined ? updates.vehicleNo : (current.vehicleNo || ''),
      driverName: updates.driverName !== undefined ? updates.driverName : (current.driverName || ''),
      biltyNo: updates.biltyNo !== undefined ? updates.biltyNo : (current.biltyNo || ''),
      billNo: updates.billNo !== undefined ? updates.billNo : (current.billNo || ''),
      gatePassNo: updates.gatePassNo !== undefined ? updates.gatePassNo : (current.gatePassNo || ''),
      rate: rateVal,
      amount: amountVal
    };

    const oldQuantity = Number(current.quantity) || 0;
    const qtyDelta = qty - oldQuantity;

    if (stockRef) {
      await updateDoc(stockRef, {
        totalDelivered: increment(qtyDelta),
        balance: increment(-qtyDelta),
        updatedAt: now
      }).catch(e => console.warn('stock_management update:', e));
    }

    await updateDoc(articleRef, {
      totalAvailable: increment(-qtyDelta),
      totalDelivered: increment(qtyDelta)
    }).catch(e => console.warn('article_stock update:', e));

    await updateDoc(deliveryRef, updatedDelivery as any).catch(e => console.warn('delivery update:', e));

    if (dispatchHistoryRef) {
      await updateDoc(dispatchHistoryRef, {
        date: dateVal,
        quantity: qty,
        customerName: custName
      }).catch(() => {});
    }

    if (orderHistoryRef) {
      await updateDoc(orderHistoryRef, {
        date: dateVal,
        quantity: qty,
        customerName: custName
      }).catch(() => {});
    }

    if (current.orderId && qtyDelta !== 0) {
      await updateDoc(doc(db, 'customer_orders', current.orderId), {
        dispatchedPairs: increment(qtyDelta),
        updatedAt: now
      }).catch(e => console.warn('customer_orders dispatch update:', e));
    }

    const nextUpdatedDeliveries = deliveryHistory.map(d => d.id === id ? updatedDelivery : d);
    setDeliveryHistory(nextUpdatedDeliveries);
    saveLocal(STORAGE_KEYS.STOCK_OUT, nextUpdatedDeliveries);
  };

  const deleteStockInEntry = async (id: string): Promise<void> => {
    await markCuttingIdsDeleted([id]);
    // 1. Delete or unlink from cuttingEntries / cutting_transactions if exists
    await deleteCuttingEntry(id);

    // 2. Remove any leftover entry from article_stock collections if it came only from direct stock receipt
    if (db) {
      try {
        const articleDocs = await getDocs(collection(db, 'article_stock'));
        for (const snap of articleDocs.docs) {
          const data = snap.data();
          const history = data.cuttingHistory || [];
          const idx = history.findIndex((h: any, i: number) => h.receiveId === id || `art-hist-${i}-${h.date}` === id || h.id === id);
          if (idx >= 0) {
            const removedItem = history[idx];
            const removedQty = Number(removedItem?.pairs) || 0;
            const updatedHistory = history.filter((_: any, i: number) => i !== idx);
            await updateDoc(doc(db, 'article_stock', snap.id), {
              cuttingHistory: updatedHistory,
              totalReceived: increment(-removedQty),
              totalAvailable: increment(-removedQty)
            });
          }
        }
      } catch (err) {
        console.warn('Could not clean up article_stock cuttingHistory:', err);
      }
    }

    // 3. Update local states
    setCuttingEntries(prev => prev.filter(e => e.id !== id));
    setCuttingTransactions(prev => {
      const next = prev.filter(t => t.id !== id);
      saveLocal(STORAGE_KEYS.CUTTING_TXS, next);
      return next;
    });
    setArticleStock(prev => prev.map(stock => ({
      ...stock,
      cuttingHistory: (stock.cuttingHistory || []).filter((h, i) => h.receiveId !== id && `art-hist-${i}-${h.date}` !== id && (h as any).id !== id)
    })));
  };

  const updateArticleName = async (oldName: string, newName: string): Promise<void> => {
    const oldNorm = oldName.trim().toLowerCase();
    const newTrimmed = newName.trim();
    if (!newTrimmed || oldNorm === newTrimmed.toLowerCase()) return;
    if (!db) throw new Error('Firestore is not available.');

    const batch = writeBatch(db);

    // Update articlesMaster
    articlesMaster.forEach(art => {
      if (art.articleName.trim().toLowerCase() === oldNorm) {
        batch.update(doc(db, 'articles_master', art.id), { articleName: newTrimmed });
      }
    });

    // Update cuttingEntries
    cuttingEntries.forEach(entry => {
      const art = (entry.articleTitle || entry.article || '').trim().toLowerCase();
      if (art === oldNorm) {
        batch.update(doc(db, 'cuttingEntries', entry.id), { article: newTrimmed, articleTitle: newTrimmed });
      }
    });

    // Update stockManagement
    stockManagement.forEach(stk => {
      const art = (stk.article || stk.articleName || '').trim().toLowerCase();
      if (art === oldNorm) {
        batch.update(doc(db, 'stock_management', stk.id), { article: newTrimmed, articleName: newTrimmed });
      }
    });

    // Update deliveryHistory
    deliveryHistory.forEach(del => {
      const art = (del.article || '').trim().toLowerCase();
      if (art === oldNorm) {
        batch.update(doc(db, 'stock_delivery_history', del.id), { article: newTrimmed });
      }
    });

    await batch.commit();

    // Update local state
    setArticlesMaster(prev => prev.map(a => a.articleName.trim().toLowerCase() === oldNorm ? { ...a, articleName: newTrimmed } : a));
    setCuttingEntries(prev => prev.map(e => (e.articleTitle || e.article || '').trim().toLowerCase() === oldNorm ? { ...e, article: newTrimmed, articleTitle: newTrimmed } : e));
    setCuttingTransactions(prev => prev.map(t => (t.articleTitle || t.article || '').trim().toLowerCase() === oldNorm ? { ...t, article: newTrimmed, articleTitle: newTrimmed } : t));
    setStockManagement(prev => prev.map(s => (s.article || s.articleName || '').trim().toLowerCase() === oldNorm ? { ...s, article: newTrimmed, articleName: newTrimmed } : s));
    setDeliveryHistory(prev => prev.map(d => (d.article || '').trim().toLowerCase() === oldNorm ? { ...d, article: newTrimmed } : d));
  };

  const deleteWholeArticle = async (articleName: string): Promise<void> => {
    const rawTrimmed = articleName.trim();
    const norm = rawTrimmed.toLowerCase();
    if (!norm) return;

    // 1. Add to deleted_products blocklist IMMEDIATELY in Firestore & LocalStorage
    const blockItem: DeletedProductItem = {
      id: norm,
      name: norm,
      displayName: rawTrimmed,
      deletedAt: new Date().toISOString()
    };

    if (db) {
      try {
        await setDoc(doc(db, 'deleted_products', norm), blockItem);
      } catch (err) {
        console.error('Error adding to deleted_products in Firestore:', err);
      }
    }

    setDeletedProductsList(prev => {
      if (prev.some(d => d.name === norm)) return prev;
      const updated = [blockItem, ...prev];
      saveLocal('gferp_deleted_products_v1', updated);
      return updated;
    });

    // 2. Perform backend deletions across all stock & article collections
    if (db) {
      const deletePromises: Promise<any>[] = [];

      // A. stock_management
      try {
        const snap = await getDocs(collection(db, 'stock_management'));
        snap.docs.forEach(d => {
          const data = d.data();
          const art = String(data.article || data.articleName || '').trim().toLowerCase();
          if (art === norm || d.id.toLowerCase().startsWith(`${normalizeStockDocumentId(norm)}__`)) {
            deletePromises.push(deleteDoc(doc(db, 'stock_management', d.id)));
          }
        });
      } catch (err) {
        console.error('Error fetching stock_management for deletion:', err);
      }

      // B. article_stock
      try {
        const normDocId = normalizeStockDocumentId(rawTrimmed);
        deletePromises.push(deleteDoc(doc(db, 'article_stock', normDocId)));
        const snap = await getDocs(collection(db, 'article_stock'));
        snap.docs.forEach(d => {
          const data = d.data();
          const art = String(data.articleName || '').trim().toLowerCase();
          if (art === norm || d.id.toLowerCase() === normDocId) {
            deletePromises.push(deleteDoc(doc(db, 'article_stock', d.id)));
          }
        });
      } catch (err) {
        console.error('Error fetching article_stock for deletion:', err);
      }

      // C. articles_master
      try {
        const snap = await getDocs(collection(db, 'articles_master'));
        snap.docs.forEach(d => {
          const data = d.data();
          const art = String(data.articleName || data.name || '').trim().toLowerCase();
          if (art === norm) {
            deletePromises.push(deleteDoc(doc(db, 'articles_master', d.id)));
          }
        });
      } catch (err) {
        console.error('Error fetching articles_master for deletion:', err);
      }

      // D. legacy articles & article_master
      try {
        const snap1 = await getDocs(collection(db, 'articles'));
        snap1.docs.forEach(d => {
          const data = d.data();
          const art = String(data.articleName || data.name || '').trim().toLowerCase();
          if (art === norm) {
            deletePromises.push(deleteDoc(doc(db, 'articles', d.id)));
          }
        });
      } catch (err) { /* ignore */ }

      try {
        const snap2 = await getDocs(collection(db, 'article_master'));
        snap2.docs.forEach(d => {
          const data = d.data();
          const art = String(data.articleName || data.article_name || data.name || '').trim().toLowerCase();
          if (art === norm) {
            deletePromises.push(deleteDoc(doc(db, 'article_master', d.id)));
          }
        });
      } catch (err) { /* ignore */ }

      // E. products
      try {
        const snapProds = await getDocs(collection(db, 'products'));
        snapProds.docs.forEach(d => {
          const data = d.data();
          const art = String(data.gloveName || '').trim().toLowerCase();
          if (art === norm) {
            deletePromises.push(deleteDoc(doc(db, 'products', d.id)));
          }
        });
      } catch (err) { /* ignore */ }

      // Wait for all deletions to settle
      await Promise.allSettled(deletePromises);
    }

    // 3. Update all local React states
    setArticlesMaster(prev => prev.filter(a => a.articleName.trim().toLowerCase() !== norm));
    setArticleCatalog(prev => prev.filter(a => a.articleName.trim().toLowerCase() !== norm));
    setLegacyArticleMaster(prev => prev.filter(a => a.articleName.trim().toLowerCase() !== norm));
    setArticleStock(prev => prev.filter(a => (a.articleName || '').trim().toLowerCase() !== norm));
    setStockManagement(prev => prev.filter(s => (s.article || s.articleName || '').trim().toLowerCase() !== norm));
    setProducts(prev => {
      const nextProds = prev.filter(p => (p.gloveName || '').trim().toLowerCase() !== norm);
      saveLocal(STORAGE_KEYS.PRODUCTS, nextProds);
      return nextProds;
    });

    showToast(`${rawTrimmed} deleted permanently.`);
  };

  const restoreArticle = async (articleName: string): Promise<void> => {
    const rawTrimmed = articleName.trim();
    const norm = rawTrimmed.toLowerCase();
    if (!norm) return;

    if (db) {
      try {
        await deleteDoc(doc(db, 'deleted_products', norm));
      } catch (err) {
        console.error('Error removing from deleted_products in Firestore:', err);
      }
    }

    setDeletedProductsList(prev => {
      const next = prev.filter(d => d.name !== norm);
      saveLocal('gferp_deleted_products_v1', next);
      return next;
    });

    // Recreate clean entry in articles_master and products with 0 stock
    try {
      if (db) {
        const articleRef = await addDoc(collection(db, 'articles_master'), {
          articleName: rawTrimmed,
          sizes: [],
          createdAt: new Date().toISOString()
        });
        await updateDoc(articleRef, { id: articleRef.id });

        const prodRef = await addDoc(collection(db, 'products'), {
          gloveName: rawTrimmed,
          size: 'L',
          color: 'Yellow',
          leatherType: 'Goatskin Leather',
          purchasePrice: 280,
          salePrice: 420,
          lowStockLimit: 40,
          currentStock: 0,
          createdAt: new Date().toISOString()
        });
        await updateDoc(prodRef, { id: prodRef.id });
      } else {
        setArticlesMaster(prev => [...prev, {
          id: `local_${Date.now()}`,
          articleName: rawTrimmed,
          sizes: [],
          createdAt: new Date().toISOString()
        }].sort((a, b) => a.articleName.localeCompare(b.articleName)));
      }
    } catch (err) {
      console.error('Error restoring article master entry:', err);
    }

    showToast(`Article "${rawTrimmed}" restored successfully.`);
  };

  const deleteStockDelivery = async (
    id: string,
    fallbackMeta?: { article?: string; quantity?: number; orderId?: string }
  ): Promise<void> => {
    const current = deliveryHistory.find(entry => entry.id === id);

    // Always record ID in blocklist so deleted/orphaned rows never reappear after Ctrl+R
    await markDeliveriesDeleted([id]);

    // Resolve article/size/quantity either from deliveryHistory, articleStock.deliveryHistory, or fallbackMeta
    let articleName = (current?.article || fallbackMeta?.article || '').trim();
    let sizeName = (current?.size || 'Standard').trim();
    let quantity = Number(current?.quantity ?? fallbackMeta?.quantity ?? 0) || 0;
    const orderId = current?.orderId || fallbackMeta?.orderId || '';
    const dispatchHistoryId = current?.dispatchHistoryId;
    const orderHistoryId = current?.orderHistoryId;

    if (!current && articleStock.length > 0) {
      for (const artItem of articleStock) {
        const matchedHist = (artItem.deliveryHistory || []).find((h, idx) =>
          h.deliveryId === id || `art-del-${idx}-${h.date}` === id
        );
        if (matchedHist) {
          articleName = articleName || artItem.articleName;
          quantity = quantity || Number(matchedHist.pairs) || 0;
          break;
        }
      }
    }

    const linkedStockId = current?.linkedStockId || (
      articleName ? `${normalizeStockDocumentId(articleName)}__${normalizeStockDocumentId(sizeName)}` : ''
    );
    const now = new Date().toISOString();

    if (db) {
      try {
        const stockRef = linkedStockId ? doc(db, 'stock_management', linkedStockId) : null;
        const articleRef = articleName ? doc(db, 'article_stock', normalizeStockDocumentId(articleName)) : null;
        const deliveryRef = doc(db, 'stock_delivery_history', id);
        const orderRef = orderId ? doc(db, 'customer_orders', orderId) : null;

        await runTransaction(db, async transaction => {
          // Execute ALL reads BEFORE any writes, and check exists() before updating!
          const [stockSnapshot, articleSnapshot, orderSnapshot] = await Promise.all([
            stockRef ? transaction.get(stockRef) : Promise.resolve(null),
            articleRef ? transaction.get(articleRef) : Promise.resolve(null),
            orderRef ? transaction.get(orderRef) : Promise.resolve(null)
          ]);

          if (stockSnapshot && stockSnapshot.exists() && stockRef) {
            const stockData = stockSnapshot.data();
            transaction.update(stockRef, {
              totalDelivered: increment(-quantity),
              balance: increment(quantity),
              deliveryIds: (Array.isArray(stockData.deliveryIds) ? stockData.deliveryIds : [])
                .filter((deliveryId: string) => deliveryId !== id),
              updatedAt: now
            });
          }

          if (articleSnapshot && articleSnapshot.exists() && articleRef) {
            const articleData = articleSnapshot.data();
            transaction.update(articleRef, {
              totalAvailable: increment(quantity),
              totalDelivered: increment(-quantity),
              deliveryHistory: (Array.isArray(articleData.deliveryHistory) ? articleData.deliveryHistory : [])
                .filter((entry: { deliveryId?: string; date?: string }, idx: number) =>
                  entry.deliveryId !== id && `art-del-${idx}-${entry.date}` !== id
                )
            });
          }

          transaction.delete(deliveryRef);

          if (dispatchHistoryId) {
            transaction.delete(doc(db!, 'order_dispatch_history', dispatchHistoryId));
          }
          if (orderHistoryId && orderId) {
            transaction.delete(doc(db!, 'customer_orders', orderId, 'order_history', orderHistoryId));
          }
          // CRITICAL: Only update parent customer order if it STILL exists (handles orphaned deliveries!)
          if (orderSnapshot && orderSnapshot.exists() && orderRef && quantity > 0) {
            transaction.update(orderRef, {
              dispatchedPairs: increment(-quantity),
              totalDelivered: increment(-quantity),
              updatedAt: now
            });
          }
        });

        // Also clean up any stray article_stock/stock_ledger references if articleName wasn't exact
        const [stockLedgerSnap, dispatchSnap] = await Promise.all([
          getDocs(collection(db, 'stock_ledger')),
          getDocs(collection(db, 'order_dispatch_history'))
        ]);
        const extraBatch = writeBatch(db);
        let hasExtraDeletes = false;
        stockLedgerSnap.docs.forEach(sl => {
          if (sl.data()?.referenceId === id || sl.id === id) {
            extraBatch.delete(doc(db!, 'stock_ledger', sl.id));
            hasExtraDeletes = true;
          }
        });
        dispatchSnap.docs.forEach(dh => {
          if (dh.id === id || dh.id === dispatchHistoryId) {
            extraBatch.delete(doc(db!, 'order_dispatch_history', dh.id));
            hasExtraDeletes = true;
          }
        });
        if (hasExtraDeletes) await extraBatch.commit();
      } catch (err) {
        console.error('Firestore deleteStockDelivery transaction notice:', err);
      }
    }

    const nextDeliveries = deliveryHistory.filter(d => d.id !== id);
    setDeliveryHistory(nextDeliveries);
    saveLocal(STORAGE_KEYS.STOCK_OUT, nextDeliveries);

    if (dispatchHistoryId) {
      const nextDispatch = orderDispatchHistory.filter(h => h.id !== dispatchHistoryId && h.id !== id);
      setOrderDispatchHistory(nextDispatch);
      saveLocal(STORAGE_KEYS.ORDER_HISTORY, nextDispatch);
    }

    setArticleStock(prev => prev.map(art => {
      const hasMatch = (art.deliveryHistory || []).some((h, idx) =>
        h.deliveryId === id || `art-del-${idx}-${h.date}` === id
      );
      if (!hasMatch) return art;
      const filteredHist = (art.deliveryHistory || []).filter((h, idx) =>
        h.deliveryId !== id && `art-del-${idx}-${h.date}` !== id
      );
      return {
        ...art,
        totalAvailable: (Number(art.totalAvailable) || 0) + quantity,
        totalDelivered: Math.max(0, (Number(art.totalDelivered) || 0) - quantity),
        deliveryHistory: filteredHist
      };
    }));

    setStockManagement(prev => prev.map(s => {
      if (s.id !== linkedStockId && !(s.deliveryIds || []).includes(id)) return s;
      return {
        ...s,
        totalDelivered: Math.max(0, (Number(s.totalDelivered) || 0) - quantity),
        balance: (Number(s.balance) || 0) + quantity,
        deliveryIds: (s.deliveryIds || []).filter(dId => dId !== id)
      };
    }));

    console.log(`Deleted Stock Out delivery ID: ${id}, returned ${quantity} pairs for ${articleName || 'article'}`);
    showToast('Delivery deleted, Stock returned', 'success');
  };

  const clearAllStockOutData = async (): Promise<void> => {
    const allDelIds = new Set<string>(deliveryHistory.map(d => d.id));
    articleStock.forEach(a => {
      (a.deliveryHistory || []).forEach(h => { if (h.deliveryId) allDelIds.add(h.deliveryId); });
    });

    if (db) {
      try {
        const [deliveriesSnap, dispatchSnap, stockMgmtSnap, articleStockSnap, ordersSnap, stockLedgerSnap] = await Promise.all([
          getDocs(collection(db, 'stock_delivery_history')),
          getDocs(collection(db, 'order_dispatch_history')),
          getDocs(collection(db, 'stock_management')),
          getDocs(collection(db, 'article_stock')),
          getDocs(collection(db, 'customer_orders')),
          getDocs(collection(db, 'stock_ledger'))
        ]);

        deliveriesSnap.docs.forEach(d => allDelIds.add(d.id));
        await markDeliveriesDeleted(allDelIds);

        const ops: Array<(batch: ReturnType<typeof writeBatch>) => void> = [];
        const now = new Date().toISOString();

        deliveriesSnap.docs.forEach(d => {
          ops.push(b => b.delete(doc(db!, 'stock_delivery_history', d.id)));
        });

        dispatchSnap.docs.forEach(d => {
          if (d.data()?.actionType === 'dispatched_to_customer') {
            ops.push(b => b.delete(doc(db!, 'order_dispatch_history', d.id)));
          }
        });

        stockLedgerSnap.docs.forEach(d => {
          const data = d.data();
          if (data?.type === 'sale' || data?.type === 'out' || allDelIds.has(String(data?.referenceId || ''))) {
            ops.push(b => b.delete(doc(db!, 'stock_ledger', d.id)));
          }
        });

        articleStockSnap.docs.forEach(d => {
          const data = d.data();
          const totalReceived = Number(data.totalReceived) || 0;
          ops.push(b => b.update(doc(db!, 'article_stock', d.id), {
            deliveryHistory: [],
            totalDelivered: 0,
            totalAvailable: totalReceived,
            lastUpdated: now
          }));
        });

        stockMgmtSnap.docs.forEach(d => {
          const data = d.data();
          const baseStock = Number(data.totalCuttingReceived ?? data.qty ?? data.totalStock ?? 0) || 0;
          ops.push(b => b.update(doc(db!, 'stock_management', d.id), {
            deliveryIds: [],
            totalDelivered: 0,
            balance: baseStock,
            updatedAt: now
          }));
        });

        for (const oDoc of ordersSnap.docs) {
          ops.push(b => b.update(doc(db!, 'customer_orders', oDoc.id), {
            dispatchedPairs: 0,
            totalDelivered: 0,
            updatedAt: now
          }));
          const subSnap = await getDocs(collection(db, 'customer_orders', oDoc.id, 'order_history'));
          subSnap.docs.forEach(sub => {
            if (sub.data()?.actionType === 'dispatched_to_customer') {
              ops.push(b => b.delete(doc(db!, 'customer_orders', oDoc.id, 'order_history', sub.id)));
            }
          });
        }

        for (let i = 0; i < ops.length; i += 450) {
          const batch = writeBatch(db);
          ops.slice(i, i + 450).forEach(fn => fn(batch));
          await batch.commit();
        }
      } catch (err) {
        console.error('Error clearing all stock out data:', err);
      }
    } else {
      await markDeliveriesDeleted(allDelIds);
    }

    // Clear all Stock Out keys from localStorage
    localStorage.removeItem(STORAGE_KEYS.STOCK_OUT);
    saveLocal(STORAGE_KEYS.STOCK_OUT, []);
    const remainingDispatch = orderDispatchHistory.filter(h => h.actionType !== 'dispatched_to_customer');
    saveLocal(STORAGE_KEYS.ORDER_HISTORY, remainingDispatch);
    const remainingLedger = stockLedger.filter(s => s.type !== 'sale' && s.type !== 'out' && !allDelIds.has(s.referenceId || ''));
    saveLocal(STORAGE_KEYS.STOCK_LEDGER, remainingLedger);

    setDeliveryHistory([]);
    setOrderDispatchHistory(remainingDispatch);
    setStockLedger(remainingLedger);
    setArticleStock(prev => prev.map(a => ({
      ...a,
      deliveryHistory: [],
      totalDelivered: 0,
      totalAvailable: Number(a.totalReceived) || 0
    })));
    setStockManagement(prev => prev.map(s => ({
      ...s,
      deliveryIds: [],
      totalDelivered: 0,
      balance: Number(s.totalCuttingReceived ?? s.qty ?? s.totalStock ?? 0) || 0
    })));
    setOrders(prev => prev.map(o => ({ ...o, totalDelivered: 0 })));

    console.log(`Cleared all Stock Out data (${allDelIds.size} records removed).`);
    showToast('All Stock Out data cleared. Refreshing...', 'info');
    if (typeof window !== 'undefined') {
      setTimeout(() => window.location.reload(), 250);
    }
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

  const getCuttingLedgerByCutter = (cutterId: string): CuttingEntry[] => {
    if (!cutterId) {
      console.log('Cutting ledger data for cutter:', cutterId, []);
      return [];
    }
    try {
      const entries = (cuttingEntries || []).filter(entry =>
        entry && entry.cutterId === cutterId && !entry.isDeleted && !deletedCuttingIdSet.has(entry.id)
      );
      const savedIds = new Set(entries.map(entry => entry.id));
      const legacyEntries = (cuttingTransactions || [])
        .filter(tx => tx && tx.cutterId === cutterId && !tx.isDeleted && !deletedCuttingIdSet.has(tx.id) && !savedIds.has(tx.id))
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
          pairs: tx.qty,
          totalQty: tx.totalQty || tx.qty,
          rate: tx.rate || 0,
          lotTotal: tx.totalBalance || tx.lotTotal || tx.qty * (tx.rate || 0),
          totalBalance: tx.totalBalance || tx.lotTotal || tx.qty * (tx.rate || 0),
          customerOrder: tx.customerOrder || tx.orderNo || 'Direct Cutting',
          runningBalance: 0,
          billNo: tx.billNo || '',
          isExtraCutting: Boolean(tx.isExtraCutting),
          extraCuttingQty: tx.extraCuttingQty !== undefined ? Number(tx.extraCuttingQty) : (tx.isExtraCutting ? -Math.abs(tx.qty) : 0),
          createdAt: tx.createdAt
        } satisfies CuttingEntry));

      const combined = [...entries, ...legacyEntries].sort((a, b) =>
        safeStringCompare(a.date, b.date) ||
        safeStringCompare(a.createdAt, b.createdAt) ||
        safeStringCompare(a.id, b.id)
      );

      let runningBalance = 0;
      const result = combined.map(entry => {
        const pairs = Number(entry.pairs ?? entry.totalQty) || 0;
        const rate = Number(entry.rate) || 0;
        const lotTotal = Number(entry.totalBalance) || Number(entry.lotTotal) || pairs * rate;
        runningBalance += lotTotal;
        return { ...entry, pairs, rate, lotTotal, totalBalance: lotTotal, runningBalance };
      });

      return result || [];
    } catch (err) {
      console.error('Error in getCuttingLedgerByCutter:', err);
      return [];
    }
  };

  const getStockInHistory = (articleName: string): StockInHistoryItem[] => {
    if (!articleName) return [];
    const target = articleName.trim().toLowerCase();
    const items: StockInHistoryItem[] = [];
    const seenIds = new Set<string>();

    // 1. From cuttingEntries (Single Source of Truth - deduplicated by cuttingId)
    (cuttingEntries || []).forEach(entry => {
      if (entry.isDeleted || deletedCuttingIdSet.has(entry.id)) return;
      const art = (entry.article || entry.articleTitle || '').trim().toLowerCase();
      const pairsVal = Number(entry.pairs ?? entry.totalQty ?? 0);
      if (art === target && pairsVal > 0 && (entry.type === 'RECEIVE' || !entry.type)) {
        if (!seenIds.has(entry.id)) {
          seenIds.add(entry.id);
          const { timeFormatted, fullFormatted } = formatStockInDateTime(entry.date, entry.createdAt);
          const cutter = entry.cutterName ? `From Cutting Master (${entry.cutterName})` : 'From Cutting Master';
          const linkedOrder = entry.orderId ? orders.find(o => o.id === entry.orderId) : undefined;
          const resolvedCustomer = entry.customerName?.trim() || linkedOrder?.customerName || 'Stock - No Order';
          const resolvedOrderNo = entry.orderNo?.trim() || linkedOrder?.orderNo || '-';
          items.push({
            id: entry.id,
            date: entry.date,
            time: timeFormatted,
            formattedDateTime: fullFormatted,
            source: cutter,
            cutterName: entry.cutterName || 'Cutting Master',
            customerName: resolvedCustomer,
            orderNo: resolvedOrderNo,
            orderId: entry.orderId || '',
            article: entry.articleTitle || entry.article || articleName,
            quantity: Math.abs(pairsVal),
            rate: Number(entry.rate) || 0,
            size: entry.sizeName || entry.size || 'Standard',
            billNo: entry.billNo || '',
            notes: entry.remarks || '',
            rawEntry: entry
          });
        }
      }
    });

    // 2. From legacy cutting transactions (only if id not already seen)
    (cuttingTransactions || []).forEach(tx => {
      if (tx.isDeleted || deletedCuttingIdSet.has(tx.id)) return;
      const art = (tx.article || tx.articleTitle || '').trim().toLowerCase();
      const qtyVal = Number(tx.qty ?? tx.totalQty ?? 0);
      if (art === target && tx.type === 'RECEIVE' && qtyVal > 0) {
        if (!seenIds.has(tx.id)) {
          seenIds.add(tx.id);
          const { timeFormatted, fullFormatted } = formatStockInDateTime(tx.date, tx.createdAt);
          const cutter = tx.cutterName ? `From Cutting Master (${tx.cutterName})` : 'From Cutting Master';
          const linkedOrder = tx.orderId ? orders.find(o => o.id === tx.orderId) : undefined;
          const resolvedCustomer = tx.customerName?.trim() || linkedOrder?.customerName || 'Stock - No Order';
          const resolvedOrderNo = tx.orderNo?.trim() || linkedOrder?.orderNo || '-';
          items.push({
            id: tx.id,
            date: tx.date,
            time: timeFormatted,
            formattedDateTime: fullFormatted,
            source: cutter,
            cutterName: tx.cutterName || 'Cutting Master',
            customerName: resolvedCustomer,
            orderNo: resolvedOrderNo,
            orderId: tx.orderId || '',
            article: tx.articleTitle || tx.article || articleName,
            quantity: Math.abs(qtyVal),
            rate: Number(tx.rate) || 0,
            size: tx.sizeName || tx.size || 'Standard',
            billNo: tx.billNo || '',
            notes: tx.remarks || tx.notes || '',
            rawEntry: tx
          });
        }
      }
    });

    // 3. From articleStock.cuttingHistory (only if receiveId not already seen)
    (articleStock || []).forEach(stock => {
      if ((stock.articleName || '').trim().toLowerCase() === target) {
        (stock.cuttingHistory || []).forEach((hist, index) => {
          const recId = hist.receiveId || `art-hist-${index}-${hist.date}`;
          if (deletedCuttingIdSet.has(recId)) return;
          if (!seenIds.has(recId) && Number(hist.pairs || 0) > 0) {
            seenIds.add(recId);
            const { timeFormatted, fullFormatted } = formatStockInDateTime(hist.date);
            const sourceName = hist.source?.toLowerCase().includes('cutting')
              ? hist.source
              : `From Cutting Master (${hist.source || 'General'})`;
            const rawCutter = hist.cutterName || hist.source || 'Stock Entry';
            const cleanCutter = rawCutter.replace(/^From Cutting Master\s*\(/i, '').replace(/\)$/, '').trim() || 'Stock Entry';
            const linkedOrder = hist.orderId ? orders.find(o => o.id === hist.orderId) : undefined;
            items.push({
              id: recId,
              date: hist.date,
              time: timeFormatted,
              formattedDateTime: fullFormatted,
              source: sourceName,
              cutterName: cleanCutter,
              customerName: hist.customerName?.trim() || linkedOrder?.customerName || 'Stock - No Order',
              orderNo: hist.orderNo?.trim() || linkedOrder?.orderNo || '-',
              orderId: hist.orderId || '',
              article: hist.article || stock.articleName || articleName,
              quantity: Math.abs(Number(hist.pairs || 0)),
              rate: 0,
              size: hist.size || 'Standard',
              rawEntry: hist
            });
          }
        });
      }
    });

    // Sort newest date on top
    return items.sort((a, b) => safeStringCompare(b.date, a.date) || safeStringCompare(b.id, a.id));
  };

  const getStockOutHistory = (articleName: string): StockOutHistoryItem[] => {
    if (!articleName) return [];
    const target = articleName.trim().toLowerCase();
    const items: StockOutHistoryItem[] = [];
    const seenIds = new Set<string>();

    // 1. From deliveryHistory
    (deliveryHistory || []).forEach(entry => {
      if (deletedDeliveryIdSet.has(entry.id)) return;
      if (entry.orderId && deletedOrderIdSet.has(entry.orderId)) return;
      if (entry.customerOrderId && deletedOrderIdSet.has(entry.customerOrderId)) return;
      const art = (entry.article || '').trim().toLowerCase();
      if (art === target) {
        if (!seenIds.has(entry.id)) {
          seenIds.add(entry.id);
          const orderLabel = entry.orderNo
            ? `Order #${entry.orderNo}${entry.customerName ? ` - ${entry.customerName}` : ''}`
            : (entry.customerName || 'Direct Delivery');
          items.push({
            id: entry.id,
            date: entry.date,
            orderName: orderLabel,
            orderNo: entry.orderNo || '',
            customerName: entry.customerName || '',
            quantity: Math.abs(Number(entry.quantity || 0)),
            destination: entry.customerName ? `Delivered to ${entry.customerName}` : 'Customer Dispatched',
            size: entry.size || '',
            rawEntry: entry
          });
        }
      }
    });

    // 2. From articleStock.deliveryHistory
    (articleStock || []).forEach(stock => {
      if ((stock.articleName || '').trim().toLowerCase() === target) {
        (stock.deliveryHistory || []).forEach((hist, index) => {
          const delId = hist.deliveryId || `art-del-${index}-${hist.date}`;
          if (deletedDeliveryIdSet.has(delId)) return;
          if ((hist as any).orderId && deletedOrderIdSet.has((hist as any).orderId)) return;
          if (!seenIds.has(delId)) {
            seenIds.add(delId);
            const orderLabel = hist.orderNo
              ? `Order #${hist.orderNo}${hist.customerName ? ` - ${hist.customerName}` : ''}`
              : (hist.customerName || 'Direct Delivery');
            items.push({
              id: delId,
              date: hist.date,
              orderName: orderLabel,
              orderNo: hist.orderNo || '',
              customerName: hist.customerName || '',
              quantity: Math.abs(Number(hist.pairs || 0)),
              destination: hist.customerName ? `Delivered to ${hist.customerName}` : 'Customer Dispatched',
              size: '',
              rawEntry: hist
            });
          }
        });
      }
    });

    // Sort newest date on top
    return items.sort((a, b) => safeStringCompare(b.date, a.date) || safeStringCompare(b.id, a.id));
  };

  const getDistinctArticles = (): DistinctArticleStock[] => {
    interface ArticleTracker {
      displayName: string;
      sizes: Set<string>;
      sampleRate: number;
      lastUsedDate: string;
      lastOrderNo: string;
      lastCustomerName: string;
      lastUsedSource: string;
    }

    const articleMap = new Map<string, ArticleTracker>();

    const cleanArticleCandidate = (rawName?: string): string => {
      if (!rawName) return '';
      const trimmed = String(rawName).trim();
      if (!trimmed) return '';
      // Skip comma-joined legacy display strings or UI placeholders
      if (trimmed.includes(',') || /^size matrix$/i.test(trimmed)) return '';
      return trimmed;
    };

    const recordArticle = (
      rawName?: string,
      rawSize?: string,
      rate?: number,
      usage?: { date?: string; orderNo?: string; customerName?: string; source?: string },
      bypassDeletedCheck = false
    ) => {
      const clean = cleanArticleCandidate(rawName);
      if (!clean) return;
      const key = clean.toLowerCase();
      if (!bypassDeletedCheck && deletedProductNames.has(key)) return;
      if (!articleMap.has(key)) {
        articleMap.set(key, {
          displayName: clean,
          sizes: new Set(),
          sampleRate: rate || 0,
          lastUsedDate: '',
          lastOrderNo: '',
          lastCustomerName: '',
          lastUsedSource: ''
        });
      }
      const entry = articleMap.get(key)!;
      if (rawSize && String(rawSize).trim()) entry.sizes.add(String(rawSize).trim());
      if (rate && !entry.sampleRate) entry.sampleRate = rate;

      if (usage && (usage.orderNo || usage.customerName || usage.date)) {
        const candidateDate = String(usage.date || '');
        const hasMoreDetails = Boolean(usage.orderNo || usage.customerName);
        const existingHasDetails = Boolean(entry.lastOrderNo || entry.lastCustomerName);
        if (
          (candidateDate && candidateDate > entry.lastUsedDate && (hasMoreDetails || !existingHasDetails)) ||
          (!entry.lastUsedDate && hasMoreDetails) ||
          (candidateDate === entry.lastUsedDate && hasMoreDetails && !existingHasDetails)
        ) {
          entry.lastUsedDate = candidateDate || entry.lastUsedDate;
          if (usage.orderNo) entry.lastOrderNo = usage.orderNo;
          if (usage.customerName) entry.lastCustomerName = usage.customerName;
          if (usage.source) entry.lastUsedSource = usage.source;
        }
      }
    };

    // Build Article Master Directory from ALL sources ever used/created (never filtering out stock === 0)
    // 1. Master catalogs & Products
    [...(articlesMaster || []), ...(articleCatalog || []), ...(legacyArticleMaster || [])].forEach(a => {
      recordArticle(a.articleName, undefined, undefined, { date: a.createdAt, source: 'Master Catalog' });
    });
    (products || []).forEach(p => {
      recordArticle(p.gloveName, p.size, Number(p.salePrice || p.purchasePrice) || 0, {
        date: p.updatedAt || p.createdAt,
        source: 'Product Catalog'
      });
    });

    // 2. Customer Orders (all items + cuttingArticleSizes)
    (orders || []).forEach(order => {
      if (deletedOrderIdSet.has(order.id)) return;
      const ordDate = order.orderDate || order.createdAt || '';
      (order.items || []).forEach(item => {
        const art = item.title || item.gloveType || item.article;
        const sizeLabel = item.customSizes && item.customSizes.length > 0
          ? item.customSizes.map(cs => cs.size).filter(Boolean).join('/')
          : item.size;
        recordArticle(art, sizeLabel, Number(item.rate) || 0, {
          date: ordDate,
          orderNo: order.orderNo || '',
          customerName: order.customerName || '',
          source: 'Customer Order'
        });
      });
      (order.cuttingArticleSizes || []).forEach(cas => {
        recordArticle(cas.article, cas.size, undefined, {
          date: ordDate,
          orderNo: order.orderNo || '',
          customerName: order.customerName || '',
          source: 'Customer Order'
        });
      });
    });

    // 3. Finished Goods Stock & Article Stock (including zero-balance and delivery history entries)
    (stockManagement || []).forEach(s => {
      const art = s.articleName || s.article;
      recordArticle(art, s.size, Number(s.rate) || 0, {
        date: s.updatedAt,
        source: 'Stock Management'
      });
    });
    (articleStock || []).forEach(a => {
      recordArticle(a.articleName);
      (a.cuttingHistory || []).forEach(h => {
        if (h.receiveId && deletedCuttingIdSet.has(h.receiveId)) return;
        const linkedOrd = h.orderId ? orders.find(o => o.id === h.orderId) : undefined;
        recordArticle(h.article || a.articleName, h.size, undefined, {
          date: h.date,
          orderNo: h.orderNo || linkedOrd?.orderNo || '',
          customerName: h.customerName || linkedOrd?.customerName || '',
          source: 'Stock Receipt'
        });
      });
      (a.deliveryHistory || []).forEach(h => {
        if (h.deliveryId && deletedDeliveryIdSet.has(h.deliveryId)) return;
        recordArticle(a.articleName, undefined, undefined, {
          date: h.date,
          orderNo: h.orderNo || '',
          customerName: h.customerName || '',
          source: 'Stock Out'
        });
      });
    });

    // 4. Cutting Entries, Cutting Transactions & Cuttings (ALL types & quantities, including 0)
    (cuttingEntries || []).forEach(e => {
      if (e.isDeleted || deletedCuttingIdSet.has(e.id)) return;
      if (e.orderId && deletedOrderIdSet.has(e.orderId)) return;
      const linkedOrd = e.orderId ? orders.find(o => o.id === e.orderId) : undefined;
      recordArticle(e.articleTitle || e.article, e.sizeName || e.size, Number(e.rate) || 0, {
        date: e.date || e.createdAt,
        orderNo: e.orderNo || linkedOrd?.orderNo || '',
        customerName: e.customerName || linkedOrd?.customerName || '',
        source: `Cutting (${e.type || 'ENTRY'})`
      });
    });
    (cuttingTransactions || []).forEach(tx => {
      if (tx.isDeleted || deletedCuttingIdSet.has(tx.id)) return;
      if (tx.orderId && deletedOrderIdSet.has(tx.orderId)) return;
      const linkedOrd = tx.orderId ? orders.find(o => o.id === tx.orderId) : undefined;
      recordArticle(tx.articleTitle || tx.article, tx.sizeName || tx.size, Number(tx.rate) || 0, {
        date: tx.date || tx.createdAt,
        orderNo: tx.orderNo || linkedOrd?.orderNo || '',
        customerName: tx.customerName || linkedOrd?.customerName || '',
        source: `Cutting (${tx.type || 'TX'})`
      });
    });
    (cuttings || []).forEach(c => {
      if (deletedCuttingIdSet.has(c.id)) return;
      if (c.orderId && deletedOrderIdSet.has(c.orderId)) return;
      const linkedOrd = c.orderId ? orders.find(o => o.id === c.orderId) : undefined;
      recordArticle(c.gloveType, c.size, Number(c.rate) || 0, {
        date: c.receivedDate || c.date || c.createdAt,
        orderNo: c.orderNo || linkedOrd?.orderNo || '',
        customerName: linkedOrd?.customerName || '',
        source: 'Cutting'
      });
    });

    // 5. Stitching Orders & Stitching History
    (stitchingOrders || []).forEach(s => {
      if (s.orderId && deletedOrderIdSet.has(s.orderId)) return;
      const linkedOrd = s.orderId ? orders.find(o => o.id === s.orderId) : undefined;
      recordArticle(s.article, s.size, Number(s.rate) || 0, {
        date: s.issueDate || s.createdAt,
        orderNo: s.orderNo || linkedOrd?.orderNo || '',
        customerName: s.customerName || linkedOrd?.customerName || '',
        source: 'Stitching'
      });
    });
    (stitchingHistory || []).forEach(h => {
      recordArticle(h.article, undefined, Number((h as { rate?: number }).rate) || 0, {
        date: h.date || h.createdAt,
        orderNo: h.orderNo || '',
        customerName: h.customerName || '',
        source: 'Stitching History'
      });
    });

    // 6. Stock Ledger & Stock Out Deliveries
    (stockLedger || []).forEach(l => {
      if (l.orderId && deletedOrderIdSet.has(l.orderId)) return;
      if (l.referenceId && deletedCuttingIdSet.has(l.referenceId)) return;
      const linkedOrd = l.orderId ? orders.find(o => o.id === l.orderId) : undefined;
      recordArticle(l.productName, undefined, undefined, {
        date: l.date || l.createdAt,
        orderNo: l.orderNo || linkedOrd?.orderNo || '',
        customerName: linkedOrd?.customerName || '',
        source: l.type === 'out' ? 'Stock Out' : 'Stock In'
      });
    });
    (deliveryHistory || []).forEach(d => {
      if (deletedDeliveryIdSet.has(d.id)) return;
      if (d.orderId && deletedOrderIdSet.has(d.orderId)) return;
      if (d.customerOrderId && deletedOrderIdSet.has(d.customerOrderId)) return;
      const linkedOrd = (d.orderId || d.customerOrderId)
        ? orders.find(o => o.id === (d.orderId || d.customerOrderId))
        : undefined;
      recordArticle(d.article, d.size, Number(d.rate) || 0, {
        date: d.deliveryDate || d.date || d.createdAt,
        orderNo: d.orderNo || linkedOrd?.orderNo || '',
        customerName: d.customerName || d.partyName || linkedOrd?.customerName || '',
        source: 'Stock Out Delivery'
      });
    });

    const result: DistinctArticleStock[] = [];

    articleMap.forEach(({ displayName, sizes, sampleRate, lastOrderNo, lastCustomerName, lastUsedSource }) => {
      const inHistory = getStockInHistory(displayName);
      const outHistory = getStockOutHistory(displayName);

      const totalIn = inHistory.reduce((sum, item) => sum + item.quantity, 0);
      const totalOut = outHistory.reduce((sum, item) => sum + item.quantity, 0);
      const availableStock = totalIn - totalOut;

      let unitRate = sampleRate || 0;
      if (!unitRate) {
        const matchingStock = stockManagement.find(s => (s.article || s.articleName || '').trim().toLowerCase() === displayName.toLowerCase());
        if (matchingStock && matchingStock.rate) unitRate = Number(matchingStock.rate);
      }
      if (!unitRate) {
        const matchingProduct = products.find(p => p.gloveName.trim().toLowerCase() === displayName.toLowerCase());
        if (matchingProduct) unitRate = matchingProduct.salePrice || matchingProduct.purchasePrice || 0;
      }
      if (!unitRate) unitRate = 450;

      const stockValue = availableStock * unitRate;

      const latestOutOrderNo = outHistory[0]?.orderNo || '';
      const latestOutCustomer = outHistory[0]?.customerName || '';
      const latestInOrderNo = inHistory[0]?.orderNo && inHistory[0]?.orderNo !== '-' ? inHistory[0]?.orderNo : '';
      const latestInCustomer = inHistory[0]?.customerName && !inHistory[0]?.customerName.toLowerCase().includes('stock')
        ? inHistory[0]?.customerName
        : '';

      result.push({
        articleName: displayName,
        totalIn,
        totalOut,
        availableStock,
        unitRate,
        stockValue,
        sizes: Array.from(sizes).filter(Boolean),
        lastReceivedDate: inHistory[0]?.date,
        lastDeliveredDate: outHistory[0]?.date,
        lastOrderNo: lastOrderNo || latestOutOrderNo || latestInOrderNo || undefined,
        lastCustomerName: lastCustomerName || latestOutCustomer || latestInCustomer || undefined,
        lastUsedSource: lastUsedSource || undefined
      });
    });

    // Strict alphabetical sort (A-Z) with zero-balance articles kept inline
    return result.sort((a, b) => a.articleName.localeCompare(b.articleName, undefined, { sensitivity: 'base' }));
  };

  const getCompanyStats = (): CompanyOrderStats[] => {
    const nameMap = new Map<string, string>();

    orders.forEach(o => {
      const name = (o.customerName || '').trim();
      if (name) nameMap.set(name.toLowerCase(), name);
    });

    parties.filter(p => p.type === 'customer').forEach(p => {
      const name = (p.name || '').trim();
      if (name && !nameMap.has(name.toLowerCase())) nameMap.set(name.toLowerCase(), name);
    });

    orderCompanies.forEach(c => {
      const name = (c.name || '').trim();
      if (name && !nameMap.has(name.toLowerCase())) nameMap.set(name.toLowerCase(), name);
    });

    const companyRecordsByNorm = new Map<string, OrderCompany>();
    orderCompanies.forEach(c => {
      const norm = (c.normalizedName || c.name || '').trim().toLowerCase();
      if (norm) companyRecordsByNorm.set(norm, c);
    });

    const partiesByNorm = new Map<string, Party>();
    parties.filter(p => p.type === 'customer').forEach(p => {
      const norm = (p.name || '').trim().toLowerCase();
      if (norm) partiesByNorm.set(norm, p);
    });

    const result: CompanyOrderStats[] = Array.from(nameMap.entries()).map(([norm, displayName]) => {
      const existingComp = companyRecordsByNorm.get(norm);
      const party = partiesByNorm.get(norm);

      const comp: OrderCompany = existingComp || {
        id: `comp-${norm}`,
        name: displayName,
        normalizedName: norm,
        contactPerson: party?.name || displayName,
        phone: party?.phone || '',
        address: party?.address || '',
        notes: '',
        status: 'active',
        isCompleted: false,
        createdAt: new Date().toISOString()
      };

      const allOrders = orders
        .filter(o => (o.customerName || '').trim().toLowerCase() === norm)
        .sort((a, b) => safeStringCompare(b.orderDate || b.createdAt, a.orderDate || a.createdAt));

      const activeOrders = allOrders.filter(o => o.status !== 'Completed');
      const completedOrders = allOrders.filter(o => o.status === 'Completed');

      const totalPairsLifetime = allOrders.reduce((sum, o) => {
        return sum + (Number(o.originalTotalPairs) || Number(o.totalPairs) || Number(o.totalQty) || 0);
      }, 0);

      const compDeliveries = (deliveryHistory || []).filter(d => {
        if (d.article && d.article.includes(',')) return false;
        const custMatch = (d.customerName || '').trim().toLowerCase() === norm;
        const ordMatch = allOrders.some(o => o.id === d.orderId || o.id === d.customerOrderId || (o.orderNo && o.orderNo === d.orderNo));
        return custMatch || ordMatch;
      });

      const totalDeliveredPairs = compDeliveries.reduce((sum, d) => sum + (Number(d.quantity) || 0), 0);
      const totalRemainingPairs = Math.max(0, totalPairsLifetime - totalDeliveredPairs);
      const lastOrderDate = allOrders[0]?.orderDate || allOrders[0]?.createdAt || '';
      const isCompleted = comp.isCompleted === true || (allOrders.length > 0 && activeOrders.length === 0 && totalRemainingPairs === 0);

      return {
        company: comp,
        name: comp.name || displayName,
        normalizedName: norm,
        totalOrdersCount: allOrders.length,
        activeOrdersCount: activeOrders.length,
        completedOrdersCount: completedOrders.length,
        totalPairsLifetime,
        totalDeliveredPairs,
        totalRemainingPairs,
        lastOrderDate,
        isCompleted,
        activeOrders,
        completedOrders,
        allOrders
      };
    });

    return result.sort((a, b) => {
      if (a.isCompleted !== b.isCompleted) return a.isCompleted ? 1 : -1;
      return safeStringCompare(b.lastOrderDate, a.lastOrderDate) || a.name.localeCompare(b.name);
    });
  };

  const upsertOrderCompany = async (company: Partial<OrderCompany> & { name: string }): Promise<void> => {
    const rawName = company.name.trim();
    const norm = rawName.toLowerCase();
    if (!norm) return;

    const existing = orderCompanies.find(c => (c.normalizedName || c.name || '').trim().toLowerCase() === norm);
    const id = existing?.id || company.id || `comp-${norm}`;

    const updated: OrderCompany = {
      ...(existing || {}),
      ...company,
      id,
      name: rawName,
      normalizedName: norm,
      createdAt: existing?.createdAt || company.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    if (db) {
      try {
        await setDoc(doc(db, 'order_companies', id), updated);
      } catch (err) {
        console.error('Error saving order_company to Firestore:', err);
      }
    }

    setOrderCompanies(prev => {
      const idx = prev.findIndex(c => (c.normalizedName || c.name || '').trim().toLowerCase() === norm);
      let list = [...prev];
      if (idx >= 0) {
        list[idx] = updated;
      } else {
        list.push(updated);
      }
      saveLocal(STORAGE_KEYS.ORDER_COMPANIES, list);
      return list;
    });

    showToast(`Company "${rawName}" saved.`);
  };

  const updateCompanyAndSyncOrders = async (oldName: string, updates: Partial<OrderCompany>): Promise<void> => {
    const oldNorm = oldName.trim().toLowerCase();
    const newName = (updates.name || oldName).trim();
    const newNorm = newName.toLowerCase();

    await upsertOrderCompany({
      ...updates,
      name: newName,
      normalizedName: newNorm
    });

    if (newNorm !== oldNorm) {
      const matchingOrders = orders.filter(o => (o.customerName || '').trim().toLowerCase() === oldNorm);
      if (db && matchingOrders.length > 0) {
        try {
          const batch = writeBatch(db);
          matchingOrders.forEach(o => {
            batch.update(doc(db, 'customer_orders', o.id), { customerName: newName, updatedAt: new Date().toISOString() });
          });
          await batch.commit();
        } catch (err) {
          console.error('Error syncing order company names to Firestore:', err);
        }
      }

      setOrders(prev => prev.map(o => {
        if ((o.customerName || '').trim().toLowerCase() === oldNorm) {
          return { ...o, customerName: newName, updatedAt: new Date().toISOString() };
        }
        return o;
      }));

      setDeliveryHistory(prev => prev.map(d => {
        if ((d.customerName || '').trim().toLowerCase() === oldNorm) {
          return { ...d, customerName: newName };
        }
        return d;
      }));
    }

    showToast(`Company details updated.`);
  };

  const toggleCompanyComplete = async (companyName: string, isCompleted: boolean): Promise<void> => {
    const norm = companyName.trim().toLowerCase();
    const existing = orderCompanies.find(c => (c.normalizedName || c.name || '').trim().toLowerCase() === norm);
    const id = existing?.id || `comp-${norm}`;

    const updated: OrderCompany = {
      ...(existing || {
        id,
        name: companyName,
        normalizedName: norm,
        createdAt: new Date().toISOString()
      }),
      isCompleted,
      status: isCompleted ? 'completed' : 'active',
      updatedAt: new Date().toISOString()
    };

    if (db) {
      try {
        await setDoc(doc(db, 'order_companies', id), updated);
      } catch (err) {
        console.error('Error toggling company completion in Firestore:', err);
      }
    }

    setOrderCompanies(prev => {
      const idx = prev.findIndex(c => (c.normalizedName || c.name || '').trim().toLowerCase() === norm);
      let list = [...prev];
      if (idx >= 0) {
        list[idx] = updated;
      } else {
        list.push(updated);
      }
      saveLocal(STORAGE_KEYS.ORDER_COMPANIES, list);
      return list;
    });

    showToast(isCompleted ? `Marked "${companyName}" as Completed.` : `Restored "${companyName}" to Active.`);
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
        .sort((a, b) => safeStringCompare(b.date, a.date))[0];
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
      const latestReceipt = remainingReceipts.sort((a, b) => safeStringCompare(b.date, a.date))[0];
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
        selectedCompanyName,
        setSelectedCompanyName,
        parties,
        staff,
        products: products.filter(p => !deletedProductNames.has((p.gloveName || '').trim().toLowerCase())),
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
        stockManagement: stockManagement.filter(s => !deletedProductNames.has((s.article || s.articleName || '').trim().toLowerCase())),
        articleStock: articleStock.filter(a => !deletedProductNames.has((a.articleName || '').trim().toLowerCase())),
        deliveryHistory,
        articlesMaster: [...new Map(
          [...articlesMaster, ...articleCatalog, ...legacyArticleMaster]
            .map(article => [article.articleName.trim().toLocaleLowerCase(), article] as const)
        ).values()]
          .filter(a => !deletedProductNames.has(a.articleName.trim().toLowerCase()))
          .sort((a, b) => a.articleName.localeCompare(b.articleName)),
        invoices,
        partyTransactions,
        staffLedger,
        purchases,
        rawMaterials,
        expenses,
        cashbook,
        attendance,
        settings,
        deletedProductsList,
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
        deleteStockInEntry,
        updateArticleName,
        deleteWholeArticle,
        restoreArticle,
        updateStockDelivery,
        deleteStockDelivery,
        clearAllStockOutData,
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
        clearAllFactoryData,
        getCuttingLedgerByCutter,
        getStockInHistory,
        getStockOutHistory,
        getDistinctArticles,
        getCompanyStats,
        updateCompanyAndSyncOrders,
        toggleCompanyComplete,
        upsertOrderCompany
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
