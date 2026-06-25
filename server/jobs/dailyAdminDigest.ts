import { db } from "../db";
import { localExpertForms, users, adminNotifications } from "../../shared/schema";
import { eq, and, ne } from "drizzle-orm";
import { sendEmail } from "../services/email.service";

async function getPayoutGapExperts() {
  return await db
    .select({
      expertId: localExpertForms.id,
      firstName: users.firstName,
      lastName: users.lastName,
      email: users.email,
      destination: localExpertForms.destination,
      approvalDate: localExpertForms.updatedAt,
      stripeConnectStatus: localExpertForms.stripeConnectStatus,
    })
    .from(localExpertForms)
    .innerJoin(users, eq(localExpertForms.userId, users.id))
    .where(
      and(
        eq(localExpertForms.status, "approved"),
        ne(localExpertForms.stripeConnectStatus, "complete")
      )
    );
}

async function getUnreadNotifications() {
  return await db
    .select()
    .from(adminNotifications)
    .where(eq(adminNotifications.isRead, false))
    .orderBy(adminNotifications.createdAt);
}

export async function runDailyAdminDigest() {
  try {
    const [payoutGap, unreadNotifs] = await Promise.all([
      getPayoutGapExperts(),
      getUnreadNotifications(),
    ]);

    // Only send if there is something to report
    if (payoutGap.length === 0 && unreadNotifs.length === 0) {
      console.log("[DIGEST] Nothing to report — skipping email");
      return;
    }

    const adminEmail = process.env.ADMIN_EMAIL;
    if (!adminEmail) {
      console.warn(
        "[DIGEST] ADMIN_EMAIL not set in secrets — skipping email send"
      );
      return;
    }

    const dashboardUrl =
      process.env.ADMIN_DASHBOARD_URL ||
      process.env.REPLIT_DOMAINS?.split(",")[0]?.trim()
        ? `https://${process.env.REPLIT_DOMAINS?.split(",")[0]?.trim()}/admin`
        : "https://traveloure.replit.app/admin";

    // Build plain-text body
    let textBody = "TRAVELOURE — Daily Admin Digest\n";
    textBody += new Date().toUTCString() + "\n";
    textBody += "================================\n\n";

    if (payoutGap.length > 0) {
      textBody += `PAYOUT GAP — ${payoutGap.length} expert(s) approved but not payable:\n`;
      payoutGap.forEach((e) => {
        textBody += `  • ${[e.firstName, e.lastName].filter(Boolean).join(" ") || e.email} (${e.email}) — Connect: ${e.stripeConnectStatus}\n`;
      });
      textBody += "\n";
    }

    if (unreadNotifs.length > 0) {
      textBody += `UNASSIGNED LEADS — ${unreadNotifs.length} unread alert(s):\n`;
      unreadNotifs.forEach((n) => {
        textBody += `  • ${n.destination} — ${n.reason} (${new Date(n.createdAt!).toLocaleDateString()})\n`;
      });
      textBody += "\n";
    }

    textBody += "================================\n";
    textBody += `View dashboard: ${dashboardUrl}`;

    // Build HTML body
    const payoutRows = payoutGap
      .map(
        (e) =>
          `<tr><td style="padding:4px 8px">${[e.firstName, e.lastName].filter(Boolean).join(" ") || e.email}</td><td style="padding:4px 8px">${e.email}</td><td style="padding:4px 8px">${e.stripeConnectStatus}</td></tr>`
      )
      .join("");

    const notifRows = unreadNotifs
      .map(
        (n) =>
          `<tr><td style="padding:4px 8px">${n.destination ?? "—"}</td><td style="padding:4px 8px">${n.reason ?? "—"}</td><td style="padding:4px 8px">${new Date(n.createdAt!).toLocaleDateString()}</td></tr>`
      )
      .join("");

    const htmlBody = `
<div style="font-family:sans-serif;max-width:600px;margin:0 auto">
  <h2 style="color:#1A1A18">Traveloure — Daily Admin Digest</h2>
  <p style="color:#7A7A72;font-size:13px">${new Date().toUTCString()}</p>

  ${
    payoutGap.length > 0
      ? `<h3 style="color:#E85D55">⚠️ Payout Gap — ${payoutGap.length} expert(s) not yet payable</h3>
         <table style="border-collapse:collapse;width:100%;font-size:13px">
           <thead><tr style="background:#F3F3EE">
             <th style="padding:4px 8px;text-align:left">Name</th>
             <th style="padding:4px 8px;text-align:left">Email</th>
             <th style="padding:4px 8px;text-align:left">Connect status</th>
           </tr></thead>
           <tbody>${payoutRows}</tbody>
         </table>`
      : ""
  }

  ${
    unreadNotifs.length > 0
      ? `<h3 style="color:#E85D55">🔔 Unassigned Leads — ${unreadNotifs.length} unread alert(s)</h3>
         <table style="border-collapse:collapse;width:100%;font-size:13px">
           <thead><tr style="background:#F3F3EE">
             <th style="padding:4px 8px;text-align:left">Destination</th>
             <th style="padding:4px 8px;text-align:left">Reason</th>
             <th style="padding:4px 8px;text-align:left">Date</th>
           </tr></thead>
           <tbody>${notifRows}</tbody>
         </table>`
      : ""
  }

  <p style="margin-top:24px">
    <a href="${dashboardUrl}" style="background:#E85D55;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;font-size:13px;font-weight:600">
      Open Dashboard →
    </a>
  </p>
</div>`;

    const result = await sendEmail({
      to: adminEmail,
      subject: `Traveloure Daily Digest — ${payoutGap.length} payout gap, ${unreadNotifs.length} unread leads`,
      html: htmlBody,
      text: textBody,
    });

    if (!result.ok) {
      console.error("[DIGEST] Send failed:", result.error);
    } else {
      console.log(
        `[DIGEST] Sent to ${adminEmail} — id=${result.id} — ${payoutGap.length} payout gap, ${unreadNotifs.length} unread leads`
      );
    }
  } catch (err) {
    console.error("[DIGEST ERROR]", err);
  }
}
