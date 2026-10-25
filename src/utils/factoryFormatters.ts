export const formatCurrency = (amount: number, currency: string = 'Rs.'): string => {
  const isNegative = amount < 0;
  const abs = Math.abs(amount);
  const formatted = new Intl.NumberFormat('en-IN', {
    maximumFractionDigits: 2,
    minimumFractionDigits: 0
  }).format(abs);

  return `${isNegative ? '-' : ''}${currency} ${formatted}`;
};

export const formatDate = (dateString?: string): string => {
  if (!dateString) return '';
  try {
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return dateString;
    return d.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  } catch {
    return dateString;
  }
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
