export type PartyType = 'customer' | 'supplier' | 'cutter_maker' | 'buyer';

export interface Party {
  id: string;
  name: string;
  phone: string;
  address?: string;
  type: PartyType;
  openingBalance: number;
  currentBalance: number; // Auto: > 0 means Receivable (Maine Lene), < 0 means Payable (Maine Dene)
  createdAt: string;
  updatedAt: string;
}

export interface Staff {
  id: string;
  name: string;
  phone?: string;
  role: 'cutter' | 'stitcher' | 'finisher';
  perPairRate: number; // Rate in Rs. per pair cut / stitched
  currentBalance: number; // Unpaid accumulated wages
  createdAt: string;
  updatedAt?: string;
}

export interface Product {
  id: string;
  gloveName: string; // e.g. "Driver Leather Gloves", "Welding Leather Gloves"
  size: string; // S, M, L, XL, XXL, 10", 14", 16"
  color: string; // Yellow, Grey, Natural, Black
  leatherType: string; // Goatskin, Cow Split, Sheep Nappa
  purchasePrice: number; // Cost of manufacturing / pair
  salePrice: number; // Selling rate per pair
  currentStock: number; // AUTO CALCULATED: sum(in) - sum(out) from stock_ledger
  lowStockLimit: number;
  imageUrl?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface SizeMatrix {
  small: number;
  medium: number;
  large: number;
  xl: number;
  xxl: number;
}

export interface OrderItem {
  id: string;
  productId?: string;
  title: string; // Custom Glove Name
  gloveType: string; // Mirror of title
  size?: string; // Optional display string e.g. "S: 10, M: 20..."
  color?: string; // Optional
  leatherType?: string;
  sizes: SizeMatrix; // Size Matrix: S, M, L, XL, XXL
  totalPairs: number; // Sum of S+M+L+XL+XXL
  originalQty: number; // IMMUTABLE original quantity - NEVER subtracts
  qty: number; // Total ordered pairs for compatibility
  rate?: number; // Optional
  amount?: number; // Optional
  cuttingGivenQty: number; // Auto: pairs given for cutting
  stockReceivedQty: number; // Auto: pairs finished & received into stock
  billedQty: number; // Auto: pairs billed on sale invoice
  pendingQty: number; // Auto: qty - billedQty
}

export type OrderStatus = 
  | 'Pending' 
  | 'Cutting-Given' 
  | 'In-Production' 
  | 'Stock-Ready' 
  | 'Partial-Billed' 
  | 'Completed';

export interface CustomerOrder {
  id: string;
  orderNo: string; // ORD-001
  customerId?: string;
  customerName: string;
  customerPhone?: string;
  orderDate: string;
  deliveryDate: string;
  totalPairs: number; // Sum of all glove items total pairs
  originalTotalPairs?: number; // Sum of originalQty (Immutable)
  totalQty: number; // Compatibility mirror
  totalAmount?: number;
  status: OrderStatus;
  items: OrderItem[];
  cuttingArticleSizes?: Array<{ article: string; size: string }>;
  notes?: string;
  createdAt: string;
  createdBy?: string;
  updatedAt?: string;
}

export type CutterCategory = 'cutting_man' | 'cutting_maker' | 'product';
export type CuttingType = 'cutting_man' | 'cutter_maker';

export interface Cutter {
  id: string;
  name: string;
  khataName?: string;
  phone?: string;
  perPairRate?: number;
  cutterType: CutterCategory;
  totalGiven: number;
  totalReceived: number;
  pendingBalance: number;
  lastTransactionDate?: string;
  createdAt: string;
  updatedAt?: string;
  isActive?: boolean;
  status?: 'active' | 'deactive';
  deactivatedAt?: unknown;
  deactivatedReason?: string;
}

export interface CuttingTransaction {
  id: string;
  cutterId: string;
  cutterName: string;
  cutterType: CutterCategory;
  type: 'GIVE' | 'RECEIVE';
  date: string;
  qty: number;
  totalQty?: number;
  rate?: number;
  lotTotal?: number;
  article: string;
  articleTitle?: string;
  size?: string;
  sizeName?: string;
  average?: string;
  remarks?: string;
  totalBalance?: number;
  customerOrder?: string;
  orderId?: string;
  orderNo?: string;
  customerName?: string;
  sizes?: SizeMatrix;
  billNo?: string;
  factoryName?: string;
  addToStock?: boolean;
  notes?: string;
  createdAt: string;
}

export interface CuttingEntry {
  id: string;
  cutterId: string;
  cutterName: string;
  type: 'GIVE' | 'RECEIVE';
  date: string;
  customerName: string;
  article: string;
  articleTitle?: string;
  size: string;
  sizeName?: string;
  average?: string;
  remarks?: string;
  pairs: number;
  quantity?: number;
  totalQty?: number;
  rate: number;
  boxRate?: number;
  lotTotal: number;
  totalBalance?: number;
  customerOrder?: string;
  orderId?: string;
  orderNo?: string;
  runningBalance: number;
  billNo: string;
  createdAt: string;
  editedAt?: unknown;
  editedBy?: string;
}

export interface OrderDispatchHistory {
  id: string;
  orderId: string;
  orderNo?: string;
  date: string;
  actionType: 'cutting_given' | 'stock_received' | 'dispatched_to_customer';
  quantity: number;
  personName?: string;
  notes?: string;
  remainingBalance?: number;
  article?: string;
  sizes?: SizeMatrix;
  createdAt: string;
}

export interface Cutting {
  id: string;
  orderId: string;
  orderNo: string;
  orderItemId: string;
  gloveType: string;
  size: string;
  color: string;
  date: string;
  cuttingType: CuttingType; // 'cutting_man' = internal factory worker, 'cutter_maker' = outside contractor
  personId: string; // staffId if cutting_man, partyId if cutter_maker
  personName: string; // Auto filled
  qty: number; // pairs given for cutting
  rate: number; // cutting wage rate per pair
  totalAmount: number; // qty * rate
  status: 'Given' | 'Received';
  receivedDate?: string;
  notes?: string;
  createdAt: string;
}

export type StitchingOrderStatus =
  | 'Pending'
  | 'In Progress'
  | 'Completed'
  | 'Received'
  | 'Returned'
  | 'Cancelled'
  | 'Customer Stock Created'
  | 'Stock Received'
  | 'Ready for Stitching'
  | 'Packing';

export type StitcherCategory = 'factory_worker' | 'outside_contractor' | 'stitching_maker' | 'product';

export interface Stitcher {
  id: string;
  name: string;
  phone?: string;
  city?: string;
  perPairRate?: number;
  stitcherType?: StitcherCategory;
  isActive: boolean;
  createdAt: string;
  updatedAt?: string;
}

export interface StitchingOrder {
  id: string;
  orderId: string;
  orderNo: string;
  orderItemId: string;
  article: string;
  customerName: string;
  stitcherId: string;
  stitcherName: string;
  stitcherPhone?: string;
  size?: string;
  qty: number;
  receivedQuantity?: number;
  lossQuantity?: number;
  receivedDate?: string;
  sizes: Pick<SizeMatrix, 'small' | 'medium' | 'large' | 'xl'>;
  issueDate: string;
  dueDate: string;
  rate: number;
  totalAmount: number;
  advancePaid: number;
  remainingBalance: number;
  status: StitchingOrderStatus;
  remarks?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface StitcherKhataTransaction {
  id: string;
  stitcherId: string;
  stitcherName: string;
  orderId?: string;
  stitchingOrderId?: string;
  type: 'WORK' | 'ADVANCE' | 'PAYMENT_RETURN';
  date: string;
  amount: number;
  qty?: number;
  rate?: number;
  description: string;
  createdAt: string;
}

export interface StitchingHistoryEntry {
  id: string;
  stitchingOrderId: string;
  orderId: string;
  orderNo: string;
  stitcherId: string;
  stitcherName: string;
  customerName: string;
  article: string;
  size?: string;
  type: 'ISSUE' | 'RECEIVE' | 'STATUS';
  date: string;
  quantity: number;
  lossQuantity?: number;
  rate: number;
  amount: number;
  status?: StitchingOrderStatus;
  remarks?: string;
  createdAt: string;
  updatedAt?: string;
}

export type StockLedgerType = 
  | 'in' 
  | 'out' 
  | 'purchase' 
  | 'sale' 
  | 'cutting_received';

export interface StockLedgerEntry {
  id: string;
  productId: string;
  productName: string;
  orderId?: string;
  orderNo?: string;
  type: StockLedgerType;
  qty: number;
  date: string;
  referenceId: string; // Cutting ID or Invoice ID
  notes?: string;
  createdAt: string;
}

export interface SaleInvoiceItem {
  productId: string;
  gloveType: string;
  size: string;
  color: string;
  qty: number;
  rate: number;
  amount: number;
}

export interface SaleInvoice {
  id: string;
  invoiceNo: string; // INV-001
  orderId: string; // Linked customer order
  orderNo: string;
  customerId: string;
  customerName: string;
  date: string;
  items: SaleInvoiceItem[];
  subtotal: number;
  discount: number;
  grandTotal: number;
  paidAmount: number;
  remaining: number; // Auto: grandTotal - paidAmount
  paymentStatus: 'paid' | 'partial' | 'unpaid';
  paymentMode: 'cash' | 'bank' | 'credit';
  notes?: string;
  createdAt: string;
}

export interface PartyTransaction {
  id: string;
  partyId: string;
  partyName: string;
  type: 'credit' | 'debit'; // credit = we owe them / payable, debit = they owe us / receivable
  amount: number;
  date: string;
  description: string;
  referenceType: 'order' | 'cutting' | 'sale_invoice' | 'purchase' | 'cash_payment';
  referenceId?: string;
  createdAt: string;
}

export interface StaffLedgerEntry {
  id: string;
  staffId: string;
  staffName: string;
  type: 'credit' | 'debit'; // credit = wage earned (payable to worker), debit = wage paid out
  amount: number;
  qty?: number;
  date: string;
  description: string;
  cuttingId?: string;
  createdAt: string;
}

export interface Purchase {
  id: string;
  supplierId: string;
  supplierName: string;
  date: string;
  material: string; // e.g. "Goatskin Raw Leather (Grade A)"
  qty: number;
  unit: string; // sqft, skins, kg, rolls
  rate: number;
  total: number;
  paid: number;
  remaining: number;
  paymentMode: 'cash' | 'bank' | 'credit';
  notes?: string;
  createdAt: string;
}

export interface RawMaterialStock {
  id: string;
  material: string;
  unit: string;
  currentStock: number;
  lastPurchaseRate: number;
  updatedAt: string;
}

export interface Expense {
  id: string;
  title: string;
  category: string;
  amount: number;
  date: string;
  paymentMode: 'cash' | 'bank';
  notes?: string;
  createdAt: string;
}

export interface CashbookEntry {
  id: string;
  type: 'in' | 'out'; // in = cash received (green), out = cash spent (red)
  amount: number;
  date: string;
  category: string;
  paymentMode: 'cash' | 'bank';
  description: string;
  referenceId?: string;
  createdAt: string;
}

export interface StaffAttendance {
  id: string;
  staffId: string;
  staffName: string;
  date: string;
  status: 'present' | 'absent' | 'half_day' | 'leave';
  pairsCut?: number;
  notes?: string;
}

export type FactoryModule = 
  | 'dashboard' 
  | 'orders' 
  | 'order_detail'
  | 'cuttings' 
  | 'stitching'
  | 'stock' 
  | 'sales' 
  | 'purchase' 
  | 'khata' 
  | 'staff' 
  | 'expense' 
  | 'cashbook' 
  | 'reports' 
  | 'settings';
