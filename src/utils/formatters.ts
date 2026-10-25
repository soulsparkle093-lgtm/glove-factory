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

export const formatDateTime = (dateString?: string): string => {
  if (!dateString) return '';
  try {
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return dateString;
    return d.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch {
    return dateString;
  }
};

export const generateWhatsAppReminder = (
  partyName: string, 
  balance: number, 
  businessName: string, 
  currency: string = 'Rs.'
): string => {
  const absBalance = Math.abs(balance);
  const formattedAmount = `${currency} ${new Intl.NumberFormat('en-IN').format(absBalance)}`;

  if (balance > 0) {
    // Customer owes us
    return `Assalam-o-Alaikum / Dear ${partyName},\nThis is a polite reminder from ${businessName} that your outstanding balance is ${formattedAmount}. Kindly arrange the payment at your earliest convenience.\nThank you!`;
  } else if (balance < 0) {
    // We owe supplier
    return `Dear ${partyName},\nGreetings from ${businessName}. As per our ledger records, our payable balance to you is ${formattedAmount}. Please verify.\nThank you!`;
  } else {
    return `Dear ${partyName},\nGreetings from ${businessName}. Your account balance is completely cleared. Thank you for your business!`;
  }
};

export const openWhatsApp = (phone: string, text: string) => {
  // Clean phone number (remove dashes, spaces)
  let cleanPhone = phone.replace(/[^0-9]/g, '');
  // If starts with 03..., replace with 923...
  if (cleanPhone.startsWith('0')) {
    cleanPhone = '92' + cleanPhone.substring(1);
  }
  const encodedText = encodeURIComponent(text);
  const url = `https://wa.me/${cleanPhone}?text=${encodedText}`;
  window.open(url, '_blank');
};
