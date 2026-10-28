// Web stub for @stripe/stripe-react-native, which can't bundle for web (see metro.config.js).

function StripeProvider({ children }) {
  return children ?? null;
}

const unsupported = async () => ({
  error: { message: 'Stripe payments are not available on web in this build.' },
});

function useStripe() {
  return new Proxy(
    {},
    {
      get: (_target, prop) => (prop === 'then' ? undefined : unsupported),
    }
  );
}

module.exports = new Proxy(
  { StripeProvider, useStripe },
  {
    get: (target, prop) => (prop in target ? target[prop] : unsupported),
  }
);
