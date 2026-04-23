import { Category, PaymentMethod, Project } from '../types';

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

export const PROJECTS: Project[] = [
  { id: 'p1', name: 'General — Operating' },
  { id: 'p2', name: 'Henderson Group — Retainer' },
  { id: 'p3', name: 'Q2 Trade Show' },
  { id: 'p4', name: 'Internal — Ops' },
];

export const PAYMENT_METHODS: PaymentMethod[] = [
  { id: 'pm1', label: 'Visa •• 4821',       type: 'card' },
  { id: 'pm2', label: 'Amex •• 1003',       type: 'card' },
  { id: 'pm3', label: 'Cash',               type: 'cash' },
  { id: 'pm4', label: 'ACH — Chase Business', type: 'ach' },
];
