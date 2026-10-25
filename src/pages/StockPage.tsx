import React, { useState } from 'react';
import { 
  Boxes, 
  Search, 
  Plus, 
  AlertTriangle, 
  TrendingUp, 
  History, 
  Layers, 
  Tag, 
  Trash2, 
  Edit, 
  X,
  Sparkles 
} from 'lucide-react';
import { useFactory } from '../context/FactoryContext';
import { formatCurrency, formatDate } from '../utils/factoryFormatters';
import { Product } from '../types/factory';

export const StockPage: React.FC = () => {
  const { 
    products, 
    stockLedger, 
    addProduct, 
    updateProduct, 
    deleteProduct, 
    loadFactoryPresets, 
    settings 
  } = useFactory();

  const [activeTab, setActiveTab] = useState<'products' | 'ledger'>('products');
  const [search, setSearch] = useState('');
  const [isAddProductOpen, setIsAddProductOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  // Form states
  const [gloveName, setGloveName] = useState('');
  const [size, setSize] = useState('L');
  const [color, setColor] = useState('Yellow');
  const [leatherType, setLeatherType] = useState('Goatskin Leather');
  const [purchasePrice, setPurchasePrice] = useState('300');
  const [salePrice, setSalePrice] = useState('450');
  const [lowStockLimit, setLowStockLimit] = useState('40');

  // Calculations
  const totalStockPairs = products.reduce((s, p) => s + p.currentStock, 0);
  const totalStockCost = products.reduce((s, p) => s + (p.currentStock * p.purchasePrice), 0);
  const totalStockRetail = products.reduce((s, p) => s + (p.currentStock * p.salePrice), 0);
  const lowStockCount = products.filter(p => p.currentStock <= p.lowStockLimit).length;

  const filteredProducts = products.filter(p => {
    if (search.trim()) {
      const q = search.toLowerCase();
      return p.gloveName.toLowerCase().includes(q) || 
             p.color.toLowerCase().includes(q) || 
             p.leatherType.toLowerCase().includes(q);
    }
    return true;
  });

  const filteredLedger = stockLedger.filter(s => {
    if (search.trim()) {
      const q = search.toLowerCase();
      return s.productName.toLowerCase().includes(q) || 
             (s.orderNo && s.orderNo.toLowerCase().includes(q));
    }
    return true;
  });

  const handleOpenAdd = () => {
    setEditingProduct(null);
    setGloveName('');
    setSize('L');
    setColor('Yellow');
    setLeatherType('Goatskin Leather');
    setPurchasePrice('300');
    setSalePrice('450');
    setLowStockLimit('40');
    setIsAddProductOpen(true);
  };

  const handleOpenEdit = (p: Product) => {
    setEditingProduct(p);
    setGloveName(p.gloveName);
    setSize(p.size);
    setColor(p.color);
    setLeatherType(p.leatherType);
    setPurchasePrice(p.purchasePrice.toString());
    setSalePrice(p.salePrice.toString());
    setLowStockLimit(p.lowStockLimit.toString());
    setIsAddProductOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!gloveName.trim()) return;

    if (editingProduct) {
      updateProduct(editingProduct.id, {
        gloveName,
        size,
        color,
        leatherType,
        purchasePrice: parseFloat(purchasePrice) || 0,
        salePrice: parseFloat(salePrice) || 0,
        lowStockLimit: parseFloat(lowStockLimit) || 0
      });
    } else {
      addProduct({
        gloveName,
        size,
        color,
        leatherType,
        purchasePrice: parseFloat(purchasePrice) || 0,
        salePrice: parseFloat(salePrice) || 0,
        lowStockLimit: parseFloat(lowStockLimit) || 0
      });
    }

    setIsAddProductOpen(false);
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Top Metrics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl p-5 border border-blue-100 shadow-xs">
          <span className="text-xs font-bold uppercase tracking-wider text-blue-700">Finished Goods in Hand</span>
          <div className="text-2xl font-black text-slate-900 mt-1">{totalStockPairs} <span className="text-xs font-normal text-slate-500">pairs</span></div>
          <p className="text-xs text-slate-500 mt-1">Across {products.length} distinct glove types</p>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-600">Inventory Cost Value</span>
          <div className="text-2xl font-black text-slate-800 mt-1">{formatCurrency(totalStockCost, settings.currency)}</div>
          <p className="text-xs text-slate-500 mt-1">At manufacturing cost</p>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-emerald-100 shadow-xs">
          <span className="text-xs font-bold uppercase tracking-wider text-emerald-700">Retail / Sale Value</span>
          <div className="text-2xl font-black text-emerald-600 mt-1">{formatCurrency(totalStockRetail, settings.currency)}</div>
          <p className="text-xs text-slate-500 mt-1">Expected wholesale revenue</p>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-rose-100 shadow-xs">
          <span className="text-xs font-bold uppercase tracking-wider text-rose-700">Low Stock Attention</span>
          <div className="text-2xl font-black text-rose-600 mt-1">{lowStockCount} Models</div>
          <p className="text-xs text-slate-500 mt-1">Below minimum threshold</p>
        </div>
      </div>

      {/* Main Stock Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        {/* Header and Tabs */}
        <div className="p-4 sm:p-5 border-b border-slate-200 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="font-bold text-slate-900 text-lg">Inventory & Automated Stock Ledger</h3>
              <p className="text-xs text-slate-500">
                Stock is never manually edited. It automatically updates when cutting is received (+) or sale invoice is billed (-).
              </p>
            </div>

            <div className="flex items-center gap-2">
              {products.length === 0 && (
                <button
                  onClick={loadFactoryPresets}
                  className="px-3.5 py-2 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center gap-1.5 transition"
                >
                  <Sparkles className="w-3.5 h-3.5 text-blue-600" />
                  <span>Load Factory Presets</span>
                </button>
              )}

              <button
                onClick={handleOpenAdd}
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-sm transition active:scale-95"
              >
                <Plus className="w-4 h-4" />
                <span>+ Add Glove Model</span>
              </button>
            </div>
          </div>

          {/* Tab Selector & Search */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl w-fit">
              <button
                onClick={() => setActiveTab('products')}
                className={`px-4 py-1.5 rounded-lg text-xs font-bold transition ${
                  activeTab === 'products'
                    ? 'bg-white text-blue-700 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Finished Gloves Catalog ({products.length})
              </button>
              <button
                onClick={() => setActiveTab('ledger')}
                className={`px-4 py-1.5 rounded-lg text-xs font-bold transition ${
                  activeTab === 'ledger'
                    ? 'bg-white text-blue-700 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Automated Stock Ledger ({stockLedger.length})
              </button>
            </div>

            <div className="relative w-full sm:w-72">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Search gloves, leather, size..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 text-xs rounded-xl border border-slate-300"
              />
            </div>
          </div>
        </div>

        {/* TAB 1: PRODUCTS LIST */}
        {activeTab === 'products' && (
          <div className="overflow-x-auto">
            {filteredProducts.length === 0 ? (
              <div className="py-16 text-center text-slate-400 text-sm">
                <Boxes className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                <p>No glove products defined yet.</p>
                <button
                  onClick={handleOpenAdd}
                  className="mt-3 text-xs font-bold text-blue-600 hover:underline"
                >
                  + Add your first leather glove model
                </button>
              </div>
            ) : (
              <table className="w-full text-left text-xs sm:text-sm">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                  <tr>
                    <th className="py-3 px-4">Glove Model</th>
                    <th className="py-3 px-4">Size & Color</th>
                    <th className="py-3 px-4">Leather Type</th>
                    <th className="py-3 px-4 text-center">Current Stock</th>
                    <th className="py-3 px-4 text-right">Cost Rate</th>
                    <th className="py-3 px-4 text-right">Selling Rate</th>
                    <th className="py-3 px-4 text-center">Alert Limit</th>
                    <th className="py-3 px-4 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredProducts.map(p => {
                    const isLow = p.currentStock < p.lowStockLimit;
                    const isZero = p.currentStock === 0;

                    return (
                      <tr key={p.id} className="hover:bg-slate-50/70 transition">
                        <td className="py-3.5 px-4 font-bold text-slate-900">
                          {p.gloveName}
                        </td>
                        <td className="py-3.5 px-4">
                          <span className="font-semibold bg-slate-100 px-2 py-0.5 rounded text-slate-700 text-xs mr-2">
                            {p.size}
                          </span>
                          <span className="text-slate-600">{p.color}</span>
                        </td>
                        <td className="py-3.5 px-4 text-slate-600 font-medium">
                          {p.leatherType}
                        </td>
                        <td className="py-3.5 px-4 text-center">
                          <span className={`px-3 py-1 rounded-full text-xs font-black inline-flex items-center gap-1 ${
                            isZero 
                              ? 'bg-rose-100 text-rose-700 border border-rose-300' 
                              : isLow 
                                ? 'bg-amber-100 text-amber-800 border border-amber-300' 
                                : 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                          }`}>
                            {isLow && <AlertTriangle className="w-3 h-3" />}
                            {p.currentStock} pairs
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-right text-slate-600">
                          {formatCurrency(p.purchasePrice, settings.currency)}
                        </td>
                        <td className="py-3.5 px-4 text-right font-black text-blue-700">
                          {formatCurrency(p.salePrice, settings.currency)}
                        </td>
                        <td className="py-3.5 px-4 text-center text-slate-400 font-semibold">
                          {p.lowStockLimit} pairs
                        </td>
                        <td className="py-3.5 px-4 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <button
                              onClick={() => handleOpenEdit(p)}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition"
                              title="Edit Model"
                            >
                              <Edit className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => deleteProduct(p.id)}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition"
                              title="Delete Model"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* TAB 2: AUDIT STOCK LEDGER */}
        {activeTab === 'ledger' && (
          <div className="overflow-x-auto">
            {filteredLedger.length === 0 ? (
              <div className="py-16 text-center text-slate-400 text-sm">
                <History className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                <p>No stock ledger movements logged yet. Stock moves automatically on cutting receipt and sales delivery.</p>
              </div>
            ) : (
              <table className="w-full text-left text-xs sm:text-sm">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                  <tr>
                    <th className="py-3 px-4">Date</th>
                    <th className="py-3 px-4">Glove Type & Spec</th>
                    <th className="py-3 px-4">Movement Type</th>
                    <th className="py-3 px-4 text-center">Quantity</th>
                    <th className="py-3 px-4">Order / Reference</th>
                    <th className="py-3 px-4">Audit Description</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredLedger.map(entry => (
                    <tr key={entry.id} className="hover:bg-slate-50/70 transition">
                      <td className="py-3 px-4 text-slate-600 whitespace-nowrap">
                        {formatDate(entry.date)}
                      </td>
                      <td className="py-3 px-4 font-bold text-slate-900">
                        {entry.productName}
                      </td>
                      <td className="py-3 px-4">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          entry.type === 'cutting_received' || entry.type === 'in'
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-rose-100 text-rose-800'
                        }`}>
                          {entry.type === 'cutting_received' ? 'Stock In (Cutting Received)' : 'Stock Out (Sale Delivery)'}
                        </span>
                      </td>
                      <td className={`py-3 px-4 text-center font-black ${
                        entry.type === 'cutting_received' || entry.type === 'in' ? 'text-emerald-600' : 'text-rose-600'
                      }`}>
                        {entry.type === 'cutting_received' || entry.type === 'in' ? `+${entry.qty}` : `-${entry.qty}`} pairs
                      </td>
                      <td className="py-3 px-4 font-mono font-bold text-blue-700">
                        {entry.orderNo ? `#${entry.orderNo}` : '-'}
                      </td>
                      <td className="py-3 px-4 text-slate-500">
                        {entry.notes}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>

      {/* Add / Edit Product Modal */}
      {isAddProductOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-6 py-4 bg-blue-600 text-white flex items-center justify-between">
              <h3 className="font-bold text-lg">
                {editingProduct ? 'Edit Glove Model' : 'Add New Glove Model'}
              </h3>
              <button
                onClick={() => setIsAddProductOpen(false)}
                className="p-1 rounded-lg hover:bg-white/20 text-white transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Glove Name / Model *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Heavy Duty Driver Gloves"
                  value={gloveName}
                  onChange={e => setGloveName(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-semibold rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Standard Size
                  </label>
                  <select
                    value={size}
                    onChange={e => setSize(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 bg-white"
                  >
                    <option value="S">S (Small)</option>
                    <option value="M">M (Medium)</option>
                    <option value="L">L (Large)</option>
                    <option value="XL">XL (Extra Large)</option>
                    <option value="XXL">XXL</option>
                    <option value="10 inch">10 Inch</option>
                    <option value="14 inch">14 Inch</option>
                    <option value="16 inch">16 Inch</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Color
                  </label>
                  <input
                    type="text"
                    value={color}
                    onChange={e => setColor(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Leather Type
                </label>
                <select
                  value={leatherType}
                  onChange={e => setLeatherType(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 bg-white"
                >
                  <option value="Goatskin Leather">Goatskin Leather</option>
                  <option value="Cowhide Split Leather">Cowhide Split Leather</option>
                  <option value="Sheep Nappa">Sheep Nappa</option>
                  <option value="Buffalo Grain">Buffalo Grain</option>
                  <option value="Deerskin">Deerskin</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Est. Manufacturing Cost ({settings.currency})
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={purchasePrice}
                    onChange={e => setPurchasePrice(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-semibold rounded-xl border border-slate-300"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Sale Rate / Pair ({settings.currency}) *
                  </label>
                  <input
                    type="number"
                    required
                    min="0"
                    step="any"
                    value={salePrice}
                    onChange={e => setSalePrice(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-black text-blue-700 rounded-xl border border-slate-300"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Low Stock Alert Level
                </label>
                <input
                  type="number"
                  min="0"
                  value={lowStockLimit}
                  onChange={e => setLowStockLimit(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-bold text-rose-700 rounded-xl border border-slate-300"
                />
              </div>

              <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsAddProductOpen(false)}
                  className="px-4 py-2 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-100 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl text-sm font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-sm transition active:scale-95"
                >
                  {editingProduct ? 'Update Model' : 'Save Glove Model'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
