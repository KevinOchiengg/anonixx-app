/**
 * PaymentSheet.jsx
 *
 * Unified payment entry point. Reads the user's detected region from Redux
 * (set on app boot by detectLocation in AppNavigator) and renders the correct
 * payment sheet:
 *
 *   Kenya (region === 'kenya')        → MpesaPaymentSheet   (KES, Safaricom STK push)
 *   Everyone else (region === 'international') → InternationalPaymentSheet (USD, Stripe + PayPal)
 *
 * Routing is fully automatic — no user override.
 *
 * Usage (drop-in replacement for MpesaPaymentSheet):
 *   import PaymentSheet from '../../components/payments/PaymentSheet'
 *   <PaymentSheet visible={sheetVisible} onClose={() => setSheetVisible(false)} />
 */

import React from 'react';
import { useSelector } from 'react-redux';
import { selectRegion, selectLocationReady } from '../../store/slices/locationSlice';
import MpesaPaymentSheet from './MpesaPaymentSheet';
import InternationalPaymentSheet from './InternationalPaymentSheet';

export default function PaymentSheet({ visible, onClose }) {
  const region = useSelector(selectRegion);
  const ready  = useSelector(selectLocationReady);

  // While geolocation is still detecting (sub-second usually), don't render
  // the sheet even if visible — avoids flashing the wrong sheet.
  // The 'international' fallback is set as default, so in practice
  // this guard only matters on very first launch before AsyncStorage warms up.
  if (!ready && !visible) return null;

  if (region === 'kenya') {
    return <MpesaPaymentSheet visible={visible} onClose={onClose} />;
  }

  return <InternationalPaymentSheet visible={visible} onClose={onClose} />;
}
