/**
 * paymentConstants.js
 *
 * Single source of truth for coin package definitions across all payment methods.
 *
 * KES_PACKAGES — used for M-Pesa (Kenya users)
 * USD_PACKAGES — used for Stripe / PayPal (international users)
 *
 * USD prices are hardcoded approximations (KES ÷ ~130).
 * Once the backend /payments/packages endpoint is live with live FX,
 * fetch packages from there and ignore these static values.
 */

export const KES_PACKAGES = [
  {
    id:       'starter',
    coins:    55,
    amount:   50,
    currency: 'KES',
    label:    'Starter',
    tag:      null,
    tagColor: null,
  },
  {
    id:       'popular',
    coins:    120,
    amount:   100,
    currency: 'KES',
    label:    'Popular',
    tag:      'Best Value',
    tagColor: '#a855f7',
  },
  {
    id:       'value',
    coins:    350,
    amount:   250,
    currency: 'KES',
    label:    'Value',
    tag:      '+40% bonus',
    tagColor: '#22c55e',
  },
  {
    id:       'power',
    coins:    800,
    amount:   500,
    currency: 'KES',
    label:    'Power',
    tag:      '+60% bonus',
    tagColor: '#FF634A',
  },
];

export const USD_PACKAGES = [
  {
    id:       'starter',
    coins:    55,
    amount:   0.50,
    currency: 'USD',
    label:    'Starter',
    tag:      null,
    tagColor: null,
  },
  {
    id:       'popular',
    coins:    120,
    amount:   0.99,
    currency: 'USD',
    label:    'Popular',
    tag:      'Best Value',
    tagColor: '#a855f7',
  },
  {
    id:       'value',
    coins:    350,
    amount:   2.49,
    currency: 'USD',
    label:    'Value',
    tag:      '+40% bonus',
    tagColor: '#22c55e',
  },
  {
    id:       'power',
    coins:    800,
    amount:   4.99,
    currency: 'USD',
    label:    'Power',
    tag:      '+60% bonus',
    tagColor: '#FF634A',
  },
];

/** Returns the right package list based on region */
export function getPackagesForRegion(region) {
  return region === 'kenya' ? KES_PACKAGES : USD_PACKAGES;
}

/** Formats price for display: 'KES 100' or '$0.99' */
export function formatPrice(pkg) {
  if (pkg.currency === 'KES') return `KES ${pkg.amount}`;
  return `$${pkg.amount.toFixed(2)}`;
}
