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
  Expense, 
  CashbookEntry, 
  RawMaterialStock 
} from '../types/factory';

export interface FactorySettings {
  factoryName: string;
  tagline: string;
  ownerName: string;
  phone: string;
  email: string;
  address: string;
  city: string;
  currency: string;
  orderPrefix: string;
  invoicePrefix: string;
  cuttingPrefix: string;
}

export const defaultFactorySettings: FactorySettings = {
  factoryName: "Gloves Factory ERP - Auto System",
  tagline: "Industrial & Safety Leather Gloves Manufacturing ERP",
  ownerName: "Muhammad Aslam",
  phone: "+92 321 8654321",
  email: "orders@glovesfactory.pk",
  address: "Plot 45-B, Small Industrial Estate, Defence Road",
  city: "Sialkot, Pakistan",
  currency: "Rs.",
  orderPrefix: "ORD-",
  invoicePrefix: "INV-",
  cuttingPrefix: "CUT-"
};

// Initial customer and cutter data
export const initialParties: Party[] = [
  {
    id: 'party-bestway',
    type: 'customer',
    name: 'BESTWAY',
    phone: '+92 300 9876543',
    address: 'Sialkot',
    openingBalance: 0,
    currentBalance: 0,
    createdAt: '2026-11-01T08:00:00.000Z',
    updatedAt: '2026-11-01T08:00:00.000Z'
  }
];

export const initialStaff: Staff[] = [
  {
    id: 'cutter-tariq',
    name: 'Tariq Mehmood',
    role: 'cutter',
    phone: '+92 301 2345678',
    perPairRate: 12,
    currentBalance: 0,
    createdAt: '2026-11-01T08:00:00.000Z',
    updatedAt: '2026-11-01T08:00:00.000Z'
  }
];

export const initialProducts: Product[] = [];

export const initialOrders: CustomerOrder[] = [
  {
    id: 'ord-003-bestway',
    orderNo: 'ORD-003',
    customerName: 'BESTWAY',
    customerPhone: '+92 300 9876543',
    orderDate: '2026-11-01',
    deliveryDate: '2026-11-20',
    totalPairs: 6000,
    originalTotalPairs: 6000,
    totalQty: 6000,
    status: 'In-Production',
    cuttingArticleSizes: [
      { article: '1202', size: '10' }
    ],
    items: [
      {
        id: 'item-ord-003-1',
        title: '1202',
        gloveType: '1202',
        size: '10',
        color: 'Natural White',
        leatherType: 'Cowhide Grain Leather',
        sizes: { small: 0, medium: 0, large: 0, xl: 0, xxl: 0 },
        customSizes: [{ id: 'cs-1', size: '10', quantity: 6000 }],
        totalPairs: 6000,
        originalQty: 6000,
        qty: 6000,
        rate: 235,
        amount: 1410000,
        cuttingGivenQty: 6000,
        stockReceivedQty: 6000,
        billedQty: 0,
        pendingQty: 6000
      }
    ],
    createdAt: '2026-11-01T08:00:00.000Z'
  }
];

export const initialCuttings: Cutting[] = [
  {
    id: 'cut-ord-003-1',
    orderId: 'ord-003-bestway',
    orderNo: 'ORD-003',
    orderItemId: 'item-ord-003-1',
    gloveType: '1202',
    size: '10',
    color: 'Natural White',
    date: '2026-11-02',
    cuttingType: 'cutting_man',
    personId: 'cutter-tariq',
    personName: 'Tariq Mehmood',
    qty: 6000,
    rate: 12,
    totalAmount: 72000,
    status: 'Received',
    receivedDate: '2026-11-04',
    notes: 'Cutting lot completed for BESTWAY Order #ORD-003',
    createdAt: '2026-11-02T09:00:00.000Z'
  }
];

export const initialStockLedger: StockLedgerEntry[] = [
  {
    id: 'stock-led-1',
    productId: 'prod-1202',
    productName: '1202 - Size 10',
    type: 'cutting_received',
    date: '2026-11-04',
    qty: 6000,
    referenceId: 'cut-ord-003-1',
    orderId: 'ord-003-bestway',
    orderNo: 'ORD-003',
    notes: 'Finished cutting received to stock',
    createdAt: '2026-11-04T12:00:00.000Z'
  }
];

export const initialInvoices: SaleInvoice[] = [];
export const initialPartyTransactions: PartyTransaction[] = [];
export const initialStaffLedger: StaffLedgerEntry[] = [];
export const initialPurchases: Purchase[] = [];
export const initialRawMaterials: RawMaterialStock[] = [];
export const initialExpenses: Expense[] = [];
export const initialCashbook: CashbookEntry[] = [];

// Helpful template presets for 1-click onboarding if user wants to seed factory glove items:
export const GLOVE_TEMPLATE_PRESETS: Omit<Product, 'id' | 'createdAt' | 'currentStock'>[] = [
  {
    gloveName: "Heavy Duty Driver Leather Gloves",
    size: "L",
    color: "Yellow",
    leatherType: "Goatskin Leather",
    purchasePrice: 280,
    salePrice: 420,
    lowStockLimit: 50
  },
  {
    gloveName: "TIG/MIG Welding Kevlar Gloves 14 Inch",
    size: "XL",
    color: "Grey / Red",
    leatherType: "Cowhide Split Leather",
    purchasePrice: 380,
    salePrice: 560,
    lowStockLimit: 40
  },
  {
    gloveName: "Mechanics Tactical Goatskin Gloves",
    size: "M",
    color: "Black",
    leatherType: "Sheep Nappa",
    purchasePrice: 320,
    salePrice: 480,
    lowStockLimit: 30
  },
  {
    gloveName: "Winter Thermal Leather Work Gloves",
    size: "L",
    color: "Brown",
    leatherType: "Buffalo Grain",
    purchasePrice: 450,
    salePrice: 680,
    lowStockLimit: 25
  }
];
