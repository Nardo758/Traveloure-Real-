import type { CartChange } from "./cart-item-change.service";
import { getAppBaseUrl } from "./email.service";

const escape = (value: string) => value.replace(/[&<>"']/g, character =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);

/** No guessed checkout total, invented reservation, or unsubscribe condition. */
export function buildCartItemChangeEmail(change: CartChange) {
  const url = new URL("/cart", getAppBaseUrl());
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) {
    throw new Error("Cart email origin is invalid");
  }
  const facts = [
    ...(change.reasons.some(reason => reason.startsWith("price_"))
      ? [`Published unit price: ${change.previous.currency} ${change.previous.price} → ${change.current.currency} ${change.current.price}. This is not your checkout total.`] : []),
    ...(change.reasons.includes("availability_loss") ? ["This item is no longer available in its selected context."] : []),
  ];
  return {
    subject: "An item in your saved cart changed",
    html: `<p>${escape(change.title)}</p>${facts.map(fact => `<p>${escape(fact)}</p>`).join("")}<p><a href="${escape(url.href)}">Review your saved cart</a> before booking.</p>`,
    text: `${change.title}\n${facts.join("\n")}\nReview your saved cart before booking: ${url.href}`,
  };
}
