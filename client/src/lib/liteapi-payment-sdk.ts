/**
 * liteapi-payment-sdk.ts — S1-d-3b (ledger `2026-10-11-s1-d3b-stay-book-ui`). Nuitée is merchant of record
 * (S1-d-3 ruling 2): their Payment SDK takes the card on our page; our server only ever sends the transaction id.
 * This module is the ONE place the SDK is loaded and mounted. No card field is ours, and nothing here reads one.
 *
 * Stated limit: the script URL and the constructor's option names are from LiteAPI's Payment SDK docs, not read
 * from this environment (no network); the d-3b sandbox book-and-cancel e2e is what proves them.
 */
export const LITEAPI_PAYMENT_SDK_URL = "https://payment-wrapper.liteapi.travel/dist/liteAPIPayment.js?v=a1";

let loading: Promise<void> | null = null;

export function loadPaymentSdk(): Promise<void> {
  if ((window as any).LiteAPIPayment) return Promise.resolve();
  if (loading) return loading;
  loading = new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = LITEAPI_PAYMENT_SDK_URL;
    s.async = true;
    s.onload = () => ((window as any).LiteAPIPayment ? resolve() : reject(new Error("payment_sdk_missing")));
    s.onerror = () => {
      loading = null;
      reject(new Error("payment_sdk_unreachable"));
    };
    document.head.appendChild(s);
  });
  return loading;
}

export async function mountPaymentSdk(input: {
  publicKey: "sandbox" | "live";
  secretKey: string;
  targetSelector: string;
  returnUrl: string;
  businessName: string;
}): Promise<void> {
  await loadPaymentSdk();
  const Ctor = (window as any).LiteAPIPayment;
  const sdk = new Ctor({
    publicKey: input.publicKey,
    appearance: { theme: "flat" },
    options: { business: { name: input.businessName } },
    targetElement: input.targetSelector,
    secretKey: input.secretKey,
    returnUrl: input.returnUrl,
  });
  sdk.handlePayment();
}
