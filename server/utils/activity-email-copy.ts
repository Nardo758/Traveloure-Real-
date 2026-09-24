/**
 * Earner activity emails — the ONE pure builder (ledger `2026-09-24-earner-email-notifications`).
 *
 * Decision-maker, Sep 24 2026: "if experts have made it this far to set up their accounts, they
 * should be able to see notifications … via email". The events below had an in-app notice or none
 * at all, and no email. Every one of them is built here so the wording, the escaping and the link
 * have one home (§18 rule 1). Pure: no DB, no env — the caller passes the absolute URL.
 *
 * §13: the email says what happened and links to where it can be read; it never quotes a message
 * body, a price or a rating the earner has not been shown in the app, and it never claims more
 * than the event (a quote REQUEST is not a booking; a cancellation is not a refund notice).
 */
import { escHtml } from "./email-escape";

export type ActivityEmailKind =
  | "new_message"
  | "advisor_invite"
  | "quote_request"
  | "booking_cancelled"
  | "review_received";

export interface ActivityEmailInput {
  kind: ActivityEmailKind;
  /** Display name of the person who acted (sender, traveler). Omitted ⇒ "A traveler". */
  actorName?: string | null;
  /** What it is about: a plan label or a listing name. Omitted ⇒ said without it. */
  subject?: string | null;
  /** Absolute URL of the page where the earner acts on it. */
  url: string;
}

export interface ActivityEmail {
  subject: string;
  html: string;
  text: string;
}

function clean(v: string | null | undefined): string | null {
  const t = typeof v === "string" ? v.trim() : "";
  return t ? t.slice(0, 120) : null;
}

export function buildActivityEmail(input: ActivityEmailInput): ActivityEmail {
  const who = clean(input.actorName) ?? "A traveler";
  const about = clean(input.subject);
  let subject: string;
  let line: string;
  let cta: string;
  switch (input.kind) {
    case "new_message":
      subject = `New message from ${who}`;
      line = `${who} sent you a message on Traveloure.`;
      cta = "Read and reply";
      break;
    case "advisor_invite":
      subject = about ? `You've been invited to advise on ${about}` : "You've been invited to advise on a trip";
      line = `${who} invited you to help with ${about ?? "their trip"}. Accept it in your Inbox to get started — you can see the plan once you do.`;
      cta = "Open your Inbox";
      break;
    case "quote_request":
      subject = about ? `Quote requested: ${about}` : "A traveler asked you for a quote";
      line = `${who} asked you for a quote${about ? ` for ${about}` : ""}. Nothing is booked until you send a price and they accept it.`;
      cta = "Send a quote";
      break;
    case "booking_cancelled":
      subject = about ? `Booking cancelled: ${about}` : "A booking was cancelled";
      line = `${who} cancelled their booking${about ? ` for ${about}` : ""}.`;
      cta = "See the booking";
      break;
    case "review_received":
      subject = about ? `New review for ${about}` : "You received a new review";
      // Reviews are born `pending` (moderated): say it was left, never that it is live.
      line = `${who} left a review${about ? ` for ${about}` : ""}. It appears on your listing once it has been checked.`;
      cta = "See your listings";
      break;
  }
  const html =
    `<p>${escHtml(line)}</p>` +
    `<p><a href="${escHtml(input.url)}">${escHtml(cta)}</a></p>` +
    `<p style="color:#6b7280;font-size:12px">You can turn these emails off in your notification settings.</p>`;
  const text = `${line}\n\n${cta}: ${input.url}\n\nYou can turn these emails off in your notification settings.`;
  return { subject, html, text };
}
