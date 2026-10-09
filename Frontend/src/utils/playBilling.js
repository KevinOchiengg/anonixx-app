import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { API_BASE_URL } from '../config/api';

// Google Play requires Play Billing for coins and subscriptions on Android.
export const USE_PLAY_BILLING = Platform.OS === 'android';

export const COIN_PACKS = [
  { id: 'starter', sku: 'com.anonixx.coins.starter', coins: 3 },
  { id: 'popular', sku: 'com.anonixx.coins.popular', coins: 6 },
];
export const PREMIUM_SKU = 'com.anonixx.premium.monthly';

let lib = null;
function iap() {
  if (!lib) lib = require('react-native-iap');
  return lib;
}

async function post(path, body) {
  const token = await AsyncStorage.getItem('token');
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(typeof data.detail === 'string' ? data.detail : 'Purchase could not be verified.');
  return data;
}

function purchaseOnce(sku, type, request) {
  const { purchaseUpdatedListener, purchaseErrorListener, requestPurchase } = iap();
  return new Promise((resolve, reject) => {
    let done = false;
    let upd = null;
    let err = null;
    const settle = (e, p) => {
      if (done) return;
      done = true;
      upd?.remove();
      err?.remove();
      if (e) reject(e); else resolve(p);
    };
    upd = purchaseUpdatedListener((p) => {
      if (p.productId === sku || (p.ids || []).includes(sku)) settle(null, p);
    });
    err = purchaseErrorListener((e) => settle(e));
    requestPurchase({ request, type }).catch((e) => settle(e));
  });
}

export function isCancelled(e) {
  return e?.code === 'user-cancelled' || /cancel/i.test(e?.message || '');
}

export async function fetchCoinPrices() {
  const { initConnection, fetchProducts } = iap();
  await initConnection();
  const products = await fetchProducts({ skus: COIN_PACKS.map((p) => p.sku), type: 'in-app' });
  const prices = {};
  (products || []).forEach((p) => { prices[p.id] = p.displayPrice; });
  return prices;
}

export async function buyCoins(sku) {
  const { initConnection, finishTransaction } = iap();
  await initConnection();
  const purchase = await purchaseOnce(sku, 'in-app', { google: { skus: [sku] } });
  await post('/api/v1/coins/buy/iap/verify', {
    platform: 'android',
    product_id: sku,
    purchase_token: purchase.purchaseToken,
    transaction_id: purchase.id,
  });
  await finishTransaction({ purchase, isConsumable: true });
}

// Credits any coin purchase that was paid for but never finished (app killed, offline).
export async function recoverCoinPurchases() {
  const { initConnection, getAvailablePurchases, finishTransaction } = iap();
  await initConnection();
  const owned = await getAvailablePurchases();
  let credited = 0;
  for (const purchase of owned || []) {
    const pack = COIN_PACKS.find((p) => p.sku === purchase.productId);
    if (!pack) continue;
    try {
      await post('/api/v1/coins/buy/iap/verify', {
        platform: 'android',
        product_id: pack.sku,
        purchase_token: purchase.purchaseToken,
        transaction_id: purchase.id,
      });
      await finishTransaction({ purchase, isConsumable: true });
      credited += 1;
    } catch { /* retried next time */ }
  }
  return credited;
}

export async function fetchPremiumPrice() {
  const { initConnection, fetchProducts } = iap();
  await initConnection();
  const products = await fetchProducts({ skus: [PREMIUM_SKU], type: 'subs' });
  return products?.[0]?.displayPrice || null;
}

export async function buyPremium() {
  const { initConnection, fetchProducts, finishTransaction } = iap();
  await initConnection();
  const products = await fetchProducts({ skus: [PREMIUM_SKU], type: 'subs' });
  const offerToken = products?.[0]?.subscriptionOffers?.[0]?.offerTokenAndroid;
  if (!offerToken) throw new Error('Premium is not available right now.');
  const purchase = await purchaseOnce(PREMIUM_SKU, 'subs', {
    google: { skus: [PREMIUM_SKU], subscriptionOffers: [{ sku: PREMIUM_SKU, offerToken }] },
  });
  await post('/api/v1/premium/iap/verify', { product_id: PREMIUM_SKU, purchase_token: purchase.purchaseToken });
  await finishTransaction({ purchase, isConsumable: false });
}

// Renewals are not pushed to the server, so re-verify whenever the user opens Premium.
export async function syncPremium() {
  const { initConnection, getAvailablePurchases, finishTransaction } = iap();
  await initConnection();
  const owned = await getAvailablePurchases();
  const sub = (owned || []).find((p) => p.productId === PREMIUM_SKU);
  if (!sub) return false;
  await post('/api/v1/premium/iap/verify', { product_id: PREMIUM_SKU, purchase_token: sub.purchaseToken });
  await finishTransaction({ purchase: sub, isConsumable: false }).catch(() => {});
  return true;
}
