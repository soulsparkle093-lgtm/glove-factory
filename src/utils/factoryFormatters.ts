export const formatCurrency = (amount: number, currency: string = 'Rs.'): string => {
  const isNegative = amount < 0;
  const abs = Math.abs(amount);
  const formatted = new Intl.NumberFormat('en-IN', {
    maximumFractionDigits: 2,
    minimumFractionDigits: 0
  }).format(abs);

  return `${isNegative ? '-' : ''}${currency} ${formatted}`;
};

export const toComparableString = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  if (value instanceof Date) {
    return isNaN(value.getTime()) ? '' : value.toISOString();
  }
  if (typeof value === 'object') {
    const obj = value as { toDate?: () => Date; toMillis?: () => number; seconds?: number };
    if (typeof obj.toDate === 'function') {
      try {
        const d = obj.toDate();
        return isNaN(d.getTime()) ? '' : d.toISOString();
      } catch {
        // fallback
      }
    }
    if (typeof obj.toMillis === 'function') {
      try {
        const d = new Date(obj.toMillis());
        return isNaN(d.getTime()) ? '' : d.toISOString();
      } catch {
        // fallback
      }
    }
    if (typeof obj.seconds === 'number') {
      const d = new Date(obj.seconds * 1000);
      return isNaN(d.getTime()) ? '' : d.toISOString();
    }
  }
  return String(value);
};

export const safeStringCompare = (a: unknown, b: unknown): number => {
  return toComparableString(a).localeCompare(toComparableString(b));
};

export const formatDate = (dateString?: unknown): string => {
  if (!dateString) return '';
  const dateStr = toComparableString(dateString);
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  } catch {
    return String(dateStr);
  }
};

export const formatStockInDateTime = (dateString?: string, createdAt?: unknown): { dateFormatted: string; timeFormatted: string; fullFormatted: string } => {
  const dStr = dateString || toComparableString(createdAt) || new Date().toISOString().slice(0, 10);
  let d = new Date(dStr.includes('T') ? dStr : `${dStr}T12:00:00`);
  if (isNaN(d.getTime())) {
    d = new Date();
  }

  const weekday = d.toLocaleDateString('en-GB', { weekday: 'short' });
  const day = d.getDate();
  const month = d.toLocaleDateString('en-GB', { month: 'short' });
  const year2 = String(d.getFullYear()).slice(-2);
  const dateFormatted = `${weekday}, ${day} ${month} ${year2}`;

  let timeFormatted = '';
  if (createdAt) {
    const cStr = toComparableString(createdAt);
    const cDate = new Date(cStr);
    if (!isNaN(cDate.getTime()) && cStr.includes('T')) {
      timeFormatted = cDate.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      });
    }
  }

  const fullFormatted = timeFormatted 
    ? `${dateFormatted} • ${timeFormatted}`
    : dateFormatted;

  return { dateFormatted, timeFormatted, fullFormatted };
};

export const getOrderStatusBadge = (status: string) => {
  switch (status) {
    case 'Pending':
      return {
        bg: 'bg-slate-100 text-slate-800 border-slate-200',
        label: 'Pending',
        color: 'slate'
      };
    case 'Cutting-Given':
      return {
        bg: 'bg-amber-100 text-amber-900 border-amber-300',
        label: 'Cutting Given',
        color: 'amber'
      };
    case 'In-Production':
      return {
        bg: 'bg-blue-100 text-blue-900 border-blue-300',
        label: 'In Production',
        color: 'blue'
      };
    case 'Stock-Ready':
      return {
        bg: 'bg-emerald-100 text-emerald-900 border-emerald-300',
        label: 'Stock Ready',
        color: 'emerald'
      };
    case 'Partial-Billed':
      return {
        bg: 'bg-purple-100 text-purple-900 border-purple-300',
        label: 'Partial Billed',
        color: 'purple'
      };
    case 'Completed':
      return {
        bg: 'bg-teal-100 text-teal-900 border-teal-300',
        label: 'Completed',
        color: 'teal'
      };
    default:
      return {
        bg: 'bg-slate-100 text-slate-800 border-slate-200',
        label: status,
        color: 'slate'
      };
  }
};
