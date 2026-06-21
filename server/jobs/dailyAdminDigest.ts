import { db } from "../db";
import { localExpertForms, users, adminNotifications } from "../../shared/schema";
import { eq, and, ne } from "drizzle-orm";

async function getPayoutGapExperts() {
  return await db
    .select({
      expertId: localExpertForms.id,
      name: users.name,
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

    // Build plain text digest
    let body = "TRAVELOURE — Daily Admin Digest\n";
    body += new Date().toUTCString() + "\n";
    body += "================================\n\n";

    if (payoutGap.length > 0) {
      body += `PAYOUT GAP — ${payoutGap.length} `;
      body += `expert(s) approved but not payable:\n`;
      payoutGap.forEach((e) => {
        body += `  • ${e.name} (${e.email}) `;
        body += `— Connect: ${e.stripeConnectStatus}\n`;
      });
      body += "\n";
    }

    if (unreadNotifs.length > 0) {
      body += `UNASSIGNED LEADS — `;
      body += `${unreadNotifs.length} unread alert(s):\n`;
      unreadNotifs.forEach((n) => {
        body += `  • ${n.destination} `;
        body += `— ${n.reason} `;
        body += `(${new Date(n.createdAt!).toLocaleDateString()})\n`;
      });
      body += "\n";
    }

    body += "================================\n";
    body += "View dashboard: ";
    body +=
      process.env.ADMIN_DASHBOARD_URL ||
      "https://traveloure-platform.replit.app/admin";

    console.log("[DIGEST] Sending to:", adminEmail);
    console.log("[DIGEST] Body:\n", body);

    // TODO: Replace console.log with your email provider when ready:
    // SendGrid: @sendgrid/mail
    // Resend: resend
    // Nodemailer: nodemailer
    // For now logs the digest to server console

    console.log("[DIGEST] Done.");
  } catch (err) {
    console.error("[DIGEST ERROR]", err);
  }
}
