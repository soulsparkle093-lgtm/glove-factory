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

// All demo/sample data from previous project deleted. Clean empty initial arrays as requested.
export const initialParties: Party[] = [];
export const initialStaff: Staff[] = [];
export const initialProducts: Product[] = [];
export const initialOrders: CustomerOrder[] = [];
export const initialCuttings: Cutting[] = [];
export const initialStockLedger: StockLedgerEntry[] = [];
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
