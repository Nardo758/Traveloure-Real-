/**
 * GUEST INVITE EMAIL — the message body, and nothing else (ledger `2026-09-04-invite-mailer`).
 *
 * PURE by design: no DB, no network, no env, no clock. It lives beside `email.service.ts` rather
 * than inside it because that module reaches the platform-flags table (and therefore `server/db.ts`)
 * at import time, which would make this builder unloadable — and unprovable — without a database.
 * The enqueue wrapper that carries this payload to the outbox is
 * `enqueueGuestInviteEmail` in `email-outbox.service.ts`; there is no other caller and no second
 * mail path (§18 rule 1).
 */

import { escHtml, stripCrLf } from "../utils/email-escape";


// Ledger 2026-09-04-invite-mailer. The guest-invite system was wired end to end EXCEPT that no
// email was ever sent — the host had to copy each per-guest link by hand. This is the message
// body; the send decision, the claim and the outbox enqueue live in
// server/services/guest-invite-send.service.ts.
//
// REDACTION IS THE PARAMETER LIST (the redactExperienceForGuest posture, applied to email).
// The public token endpoint hands a guest a deliberately narrow view of the parent experience —
// title / location / date only, never budget, preferences, stepData or mapData — and this
// builder is bound by the same rule. It CANNOT leak what it is not given: there is no budget
// field, no preferences field, no price field, and no way to name another guest. A future field
// added to `user_experiences` is invisible here until someone deliberately adds a parameter for
// it, which is the §19 allowlist posture applied to an outbound surface.
//
// The link is passed IN rather than derived here: `buildInviteLink` in the send service is the
// ONE place an invite URL is shaped (§18 rule 1), and the organizer list endpoint renders the
// same string.

/** Template placeholders an organizer may use in an `invite_templates.message_body`. */
export const INVITE_TEMPLATE_VARIABLES = [
  "guest_name",
  "event_name",
  "event_date",
  "invite_link",
] as const;

export interface GuestInviteEmailParams {
  /** The guest's own name, as the host typed it on the invite row. */
  guestName?: string | null;
  /** `user_experiences.title` — the occasion's name. */
  eventTitle?: string | null;
  /** `user_experiences.location`. */
  eventLocation?: string | null;
  /** `user_experiences.event_date`, already rendered as a human string by the caller (or null). */
  eventDate?: string | null;
  /** The guest's OWN token link. Never another guest's. */
  inviteLink: string;
  /**
   * An `invite_templates` row the organizer selected, or null for the default wording.
   * Only the two authored fields are read; the row's ids and ownership are the caller's business.
   */
  template?: { subject?: string | null; messageBody: string } | null;
}

/**
 * Substitute the four supported placeholders in one pass.
 *
 * `String.replace` does not rescan replacement text, so a value that itself contains
 * `{{invite_link}}` (a guest name, say) is inserted literally and never expanded — the
 * substitution cannot cascade. Unknown `{{...}}` tokens are left exactly as authored rather than
 * blanked: a host who typed `{{venue}}` gets their own words back, not a silent deletion (§13).
 */
function applyInviteTemplateVars(
  body: string,
  values: Record<(typeof INVITE_TEMPLATE_VARIABLES)[number], string>,
): string {
  return body.replace(/\{\{(guest_name|event_name|event_date|invite_link)\}\}/g, (_m, key: string) =>
    values[key as (typeof INVITE_TEMPLATE_VARIABLES)[number]],
  );
}

/** Render an escaped, newline-preserving block of host-authored prose. */
function paragraphsFromTemplate(escapedBody: string): string {
  return escapedBody
    .split(/\n{2,}/)
    .map((block) => `<p style="color: #374151; white-space: pre-line;">${block}</p>`)
    .join("\n");
}

/**
 * Build the guest-invite email. Pure — no DB, no network, no env beyond the caller's link.
 *
 * The message says only that the guest is invited and where to open their own page. It makes NO
 * claim about delivery, opening or attendance, and it carries no money.
 */
export function buildGuestInviteEmailPayload(params: GuestInviteEmailParams): {
  subject: string;
  html: string;
  text: string;
} {
  const eventName = params.eventTitle?.trim() || "an upcoming occasion";
  const greetingName = params.guestName?.trim() || null;
  const greeting = greetingName ? `Hi ${escHtml(greetingName)},` : "Hi,";
  const link = params.inviteLink;

  // The "where and when" line omits a fragment it has no value for rather than inventing one
  // ("TBD", "Date to be confirmed") — those are claims only the host can make (§13).
  const whereWhen = [params.eventLocation?.trim(), params.eventDate?.trim()].filter(Boolean) as string[];

  const button = `
      <a href="${escHtml(link)}"
         style="display: inline-block; background: #FF385C; color: #ffffff; text-decoration: none;
                padding: 12px 24px; border-radius: 6px; font-weight: 600; margin-top: 8px;">
        View your invitation
      </a>`;

  const footer = `
      <p style="color: #9CA3AF; font-size: 12px; margin-top: 32px;">
        You're receiving this because ${escHtml(eventName)} was planned on Traveloure and you were added to the guest list.<br>
        Your invitation page: <a href="${escHtml(link)}" style="color: #FF385C;">${escHtml(link)}</a>
      </p>`;

  if (params.template) {
    // ORGANIZER-AUTHORED BODY. Escaped first, then substituted, so neither the template nor any
    // value it interpolates can inject markup. The button and footer are still appended: the
    // guest must always have a working link even if the host's template forgot the placeholder.
    const escapedValues = {
      guest_name: escHtml(greetingName ?? "there"),
      event_name: escHtml(eventName),
      event_date: escHtml(params.eventDate?.trim() ?? ""),
      invite_link: escHtml(link),
    };
    const plainValues = {
      guest_name: greetingName ?? "there",
      event_name: eventName,
      event_date: params.eventDate?.trim() ?? "",
      invite_link: link,
    };

    const htmlBody = applyInviteTemplateVars(escHtml(params.template.messageBody), escapedValues);
    const textBody = applyInviteTemplateVars(params.template.messageBody, plainValues);

    const subjectSource = params.template.subject?.trim()
      ? applyInviteTemplateVars(params.template.subject, plainValues)
      : `You're invited — ${eventName}`;

    return {
      subject: stripCrLf(subjectSource),
      html: `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
      ${paragraphsFromTemplate(htmlBody)}
      ${button}
      ${footer}
    </div>
  `,
      text: [textBody, "", `View your invitation: ${link}`].join("\n"),
    };
  }

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
      <h2 style="color: #FF385C; margin-bottom: 8px;">You're invited</h2>
      <p style="color: #374151;">${greeting}</p>
      <p style="color: #374151;">
        You're invited to <strong>${escHtml(eventName)}</strong>${whereWhen.length ? ` — ${escHtml(whereWhen.join(" · "))}` : ""}.
      </p>
      <p style="color: #374151;">
        Open your invitation page to RSVP and tell us the city you're travelling from — we'll put
        your travel options together from there.
      </p>
      ${button}
      ${footer}
    </div>
  `;

  const text = [
    `You're invited to ${eventName}${whereWhen.length ? ` — ${whereWhen.join(" · ")}` : ""}`,
    "",
    greetingName ? `Hi ${greetingName},` : "Hi,",
    "",
    "Open your invitation page to RSVP and tell us the city you're travelling from —",
    "we'll put your travel options together from there.",
    "",
    `View your invitation: ${link}`,
  ].join("\n");

  return {
    subject: `You're invited — ${stripCrLf(eventName)}`,
    html,
    text,
  };
}

