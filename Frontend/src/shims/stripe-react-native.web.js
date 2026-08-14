// Web build stub for @stripe/stripe-react-native.
// That package imports React Native internals (codegenNativeCommands/Component)
// that don't exist on web, so Metro can't bundle it for the web target.
// Wired in via metro.config.js resolver.resolveRequest for platform === 'web'.

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
