import { Category, PaymentMethod } from '../types';

export const CATEGORIES: Category[] = [
  { name: 'Meals & Entertainment', code: '6200' },
  { name: 'Travel',                code: '6210' },
  { name: 'Vehicle & Fuel',        code: '6220' },
  { name: 'Office Supplies',       code: '6300' },
  { name: 'Shipping',              code: '6310' },
  { name: 'Utilities',             code: '6400' },
  { name: 'Professional Services', code: '6500' },
  { name: 'Software & Subscriptions', code: '6600' },
  { name: 'Marketing',             code: '6700' },
  { name: 'Rent & Facilities',     code: '6800' },
  { name: 'Other',                 code: '6999' },
];

// Payment methods are intentionally generic — a receipt records which
// instrument was used, not a specific card number. This keeps the picker
// short and stable across users.
export const PAYMENT_METHODS: PaymentMethod[] = [
  { id: 'pm-visa',     label: 'Visa',          type: 'card' },
  { id: 'pm-mc',       label: 'Mastercard',    type: 'card' },
  { id: 'pm-amex',     label: 'Amex',          type: 'card' },
  { id: 'pm-ach',      label: 'Bank Transfer', type: 'ach'  },
  { id: 'pm-cash',     label: 'Cash',          type: 'cash' },
  { id: 'pm-other',    label: 'Other',         type: 'cash' },
];
