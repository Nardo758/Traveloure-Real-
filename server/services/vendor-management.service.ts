import { db } from "../db";
import { 
  vendorContracts, 
  type VendorContract, 
  type InsertVendorContract 
} from "@shared/schema";
import { eq, and, gte, lte, desc } from "drizzle-orm";
import { createChildLogger, databaseQueryDuration } from "../infrastructure";

export interface PaymentMilestone {
  name: string;
  amount: number;
  dueDate: string;
  status: "pending" | "paid" | "completed" | "overdue";
  paidDate?: string;
}

export interface ContractStats {
  totalContracts: number;
  activeContracts: number;
  totalValue: number;
  totalPaid: number;
  totalRemaining: number;
  completedPayments: number;
  pendingPayments: number;
  upcomingDeadlines: number;
}

export interface CommunicationEntry {
  date: string;
  type: "email" | "phone" | "meeting" | "message" | "other";
  subject: string;
  summary: string;
  attachments?: { name: string; url: string }[];
}

const logger = createChildLogger("vendor-management-service");

export class VendorManagementService {
  async getContracts(tripId: string): Promise<VendorContract[]> {
    const start = Date.now();
    const result = await db.select().from(vendorContracts)
      .where(eq(vendorContracts.tripId, tripId))
      .orderBy(desc(vendorContracts.createdAt));
    databaseQueryDuration.labels("select", "vendor_contracts").observe((Date.now() - start) / 1000);
    return result;
  }

  async getContract(id: string): Promise<VendorContract | undefined> {
    const results = await db.select().from(vendorContracts).where(eq(vendorContracts.id, id));
    return results[0];
  }

  async createContract(data: InsertVendorContract): Promise<VendorContract> {
    const remainingBalance = parseFloat(String(data.totalAmount)) - parseFloat(String(data.paidAmount || 0));
    
    const results = await db.insert(vendorContracts).values({
      ...data,
      remainingBalance: String(remainingBalance),
    }).returning();
    return results[0];
  }

  async updateContract(id: string, updates: Partial<InsertVendorContract>): Promise<VendorContract | undefined> {
    const current = await this.getContract(id);
    if (!current) return undefined;

    const totalAmount = parseFloat(String(updates.totalAmount ?? current.totalAmount));
    const paidAmount = parseFloat(String(updates.paidAmount ?? current.paidAmount));
    const remainingBalance = totalAmount - paidAmount;

    const results = await db.update(vendorContracts)
      .set({ 
        ...updates, 
        remainingBalance: String(remainingBalance),
        updatedAt: new Date() 
      })
      .where(eq(vendorContracts.id, id))
      .returning();
    return results[0];
  }

  async deleteContract(id: string): Promise<void> {
    await db.delete(vendorContracts).where(eq(vendorContracts.id, id));
  }

  async recordPayment(
    id: string, 
    amount: number, 
    milestoneName?: string
  ): Promise<VendorContract | undefined> {
    const contract = await this.getContract(id);
    if (!contract) return undefined;

    const currentPaid = parseFloat(String(contract.paidAmount || 0));
    const newPaid = currentPaid + amount;
    const totalAmount = parseFloat(String(contract.totalAmount));
    
    let paymentSchedule = (contract.paymentSchedule as PaymentMilestone[]) || [];
    
    if (milestoneName) {
      paymentSchedule = paymentSchedule.map(m => {
        if (m.name === milestoneName) {
          return { ...m, status: "paid" as const, paidDate: new Date().toISOString() };
        }
        return m;
      });
    }

    let contractStatus = contract.contractStatus;
    if (newPaid >= totalAmount) {
      contractStatus = "completed";
    } else if (newPaid > 0 && contract.contractStatus === "signed") {
      contractStatus = "active";
    }

    return this.updateContract(id, {
      paidAmount: String(newPaid),
      paymentSchedule,
      contractStatus,
    });
  }

  async addPaymentMilestone(
    id: string, 
    milestone: PaymentMilestone
  ): Promise<VendorContract | undefined> {
    const contract = await this.getContract(id);
    if (!contract) return undefined;

    const schedule = (contract.paymentSchedule as PaymentMilestone[]) || [];
    schedule.push(milestone);

    return this.updateContract(id, { paymentSchedule: schedule });
  }

  async logCommunication(
    id: string, 
    entry: CommunicationEntry
  ): Promise<VendorContract | undefined> {
    const contract = await this.getContract(id);
    if (!contract) return undefined;

    const log = (contract.communicationLog as CommunicationEntry[]) || [];
    log.unshift({ ...entry, date: entry.date || new Date().toISOString() });

    return this.updateContract(id, { 
      communicationLog: log,
      lastContactDate: new Date(),
    });
  }

  async getContractStats(tripId: string): Promise<ContractStats> {
    const contracts = await this.getContracts(tripId);
    const now = new Date();
    const oneWeekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    let totalValue = 0;
    let paidAmount = 0;
    let pendingPayments = 0;
    let completedPayments = 0;
    let upcomingDeadlines = 0;
    let activeContracts = 0;

    for (const c of contracts) {
      totalValue += parseFloat(String(c.totalAmount || 0));
      paidAmount += parseFloat(String(c.paidAmount || 0));
      if (c.status === "active" || c.status === "in_progress") {
        activeContracts++;
      }

      const schedule = (c.paymentSchedule as PaymentMilestone[]) || [];
      for (const m of schedule) {
        if (m.status === "pending") {
          pendingPayments++;
          const dueDate = new Date(m.dueDate);
          if (dueDate <= oneWeekFromNow) {
            upcomingDeadlines++;
          }
        } else if (m.status === "paid" || m.status === "completed") {
          completedPayments++;
        }
      }
    }

    const totalRemaining = totalValue - paidAmount;

    return {
      totalContracts: contracts.length,
      activeContracts,
      totalValue,
      totalPaid: paidAmount,
      totalRemaining,
      completedPayments,
      pendingPayments,
      upcomingDeadlines,
    };
  }

  async getUpcomingPayments(tripId: string, daysAhead: number = 30): Promise<{
    contract: VendorContract;
    milestone: PaymentMilestone;
  }[]> {
    const contracts = await this.getContracts(tripId);
    const now = new Date();
    const futureDate = new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000);
    const results: { contract: VendorContract; milestone: PaymentMilestone }[] = [];

    for (const c of contracts) {
      const schedule = (c.paymentSchedule as PaymentMilestone[]) || [];
      for (const m of schedule) {
        if (m.status === "pending") {
          const dueDate = new Date(m.dueDate);
          if (dueDate <= futureDate) {
            results.push({ contract: c, milestone: m });
          }
        }
      }
    }

    return results.sort((a, b) => 
      new Date(a.milestone.dueDate).getTime() - new Date(b.milestone.dueDate).getTime()
    );
  }

  async getOverduePayments(tripId: string): Promise<{
    contract: VendorContract;
    milestone: PaymentMilestone;
    daysOverdue: number;
  }[]> {
    const contracts = await this.getContracts(tripId);
    const now = new Date();
    const results: { contract: VendorContract; milestone: PaymentMilestone; daysOverdue: number }[] = [];

    for (const c of contracts) {
      const schedule = (c.paymentSchedule as PaymentMilestone[]) || [];
      for (const m of schedule) {
        if (m.status === "pending" || m.status === "overdue") {
          const dueDate = new Date(m.dueDate);
          if (dueDate < now) {
            const daysOverdue = Math.floor((now.getTime() - dueDate.getTime()) / (24 * 60 * 60 * 1000));
            results.push({ contract: c, milestone: { ...m, status: "overdue" }, daysOverdue });
          }
        }
      }
    }

    return results.sort((a, b) => b.daysOverdue - a.daysOverdue);
  }

  async setFollowUpReminder(id: string, date: Date): Promise<VendorContract | undefined> {
    return this.updateContract(id, { nextFollowUpDate: date });
  }

  async uploadContractDocument(
    contractId: string,
    documentType: "contract" | "signed" | "attachment",
    fileName: string,
    fileBuffer: Buffer,
    mimeType: string
  ): Promise<{ url: string; documentType: string; fileName: string }> {
    const contract = await this.getContract(contractId);
    if (!contract) throw new Error("Contract not found");

    const timestamp = Date.now();
    const sanitizedFileName = fileName.replace(/[^a-z0-9.-]/gi, "_").substring(0, 100);
    const storagePath = `vendor-documents/${contractId}/${timestamp}-${sanitizedFileName}`;

    // Store in Replit object storage (or can be extended to S3)
    const storage = require("../storage");
    const url = await storage.uploadBuffer(storagePath, fileBuffer, mimeType);

    // Update contract with document URL
    const attachment = { name: fileName, url, uploadedAt: new Date().toISOString(), type: documentType };
    const currentAttachments = ((contract.attachments as any) || []) as Array<any>;
    currentAttachments.push(attachment);

    if (documentType === "contract") {
      await this.updateContract(contractId, { contractDocumentUrl: url });
    } else if (documentType === "signed") {
      await this.updateContract(contractId, { signedDocumentUrl: url });
    }

    await this.updateContract(contractId, { attachments: currentAttachments });

    return { url, documentType, fileName };
  }

  async sendBulkVendorEmail(
    tripId: string,
    contractIds: string[],
    subject: string,
    body: string,
    options?: { includeCalendarInvite?: boolean; eventDate?: Date }
  ): Promise<{ sent: number; failed: number; failureReasons: string[] }> {
    const contracts = await Promise.all(contractIds.map(id => this.getContract(id)));
    const validContracts = contracts.filter((c): c is VendorContract => c !== undefined && c.tripId === tripId);

    let sent = 0;
    let failed = 0;
    const failureReasons: string[] = [];

    // Get email service
    const { emailService } = await import("./email.service");

    for (const contract of validContracts) {
      try {
        const vendorEmail = contract.vendorEmail;
        if (!vendorEmail) {
          failureReasons.push(`Contract ${contract.id}: No email address on file`);
          failed++;
          continue;
        }

        const emailPayload: any = {
          to: vendorEmail,
          subject,
          body,
          fromName: "Traveloure Coordination",
          tags: [`trip-${tripId}`, `vendor-${contract.id}`],
        };

        // Add calendar invite if requested
        if (options?.includeCalendarInvite && options.eventDate) {
          emailPayload.icsContent = this.generateCalendarInvite(
            contract.vendorName || "Vendor",
            subject,
            options.eventDate
          );
        }

        // Send email (non-blocking)
        emailService.sendEmail(emailPayload).catch(err => {
          logger.warn(`Failed to send email to vendor ${contract.vendorEmail}:`, err.message);
        });

        // Log communication
        await this.logCommunication(contract.id, {
          type: "email",
          subject,
          summary: `Bulk email sent${options?.includeCalendarInvite ? " with calendar invite" : ""}`,
          date: new Date().toISOString(),
        });

        sent++;
      } catch (err: any) {
        failureReasons.push(`Contract ${contract.id}: ${err.message}`);
        failed++;
      }
    }

    return { sent, failed, failureReasons };
  }

  async generateContactSheet(
    tripId: string,
    format: "json" | "csv" | "pdf" = "json"
  ): Promise<string | Buffer> {
    const contracts = await this.getContracts(tripId);

    const contactData = contracts.map(c => ({
      vendorName: c.vendorName,
      vendorType: c.vendorType,
      vendorEmail: c.vendorEmail,
      vendorPhone: c.vendorPhone,
      vendorAddress: c.vendorAddress,
      contactPerson: c.contactPerson,
      website: c.website,
      contractStatus: c.contractStatus,
      eventDate: c.eventDate,
      notes: c.notes,
    }));

    if (format === "json") {
      return JSON.stringify(contactData, null, 2);
    }

    if (format === "csv") {
      const headers = [
        "Vendor Name",
        "Type",
        "Email",
        "Phone",
        "Address",
        "Contact Person",
        "Website",
        "Status",
        "Event Date",
        "Notes",
      ];

      const rows = contactData.map(c => [
        c.vendorName || "",
        c.vendorType || "",
        c.vendorEmail || "",
        c.vendorPhone || "",
        c.vendorAddress || "",
        c.contactPerson || "",
        c.website || "",
        c.contractStatus || "",
        c.eventDate || "",
        (c.notes || "").replace(/"/g, '""'), // Escape quotes
      ]);

      const csvContent = [
        headers.map(h => `"${h}"`).join(","),
        ...rows.map(r => r.map(f => `"${f}"`).join(",")),
      ].join("\n");

      return Buffer.from(csvContent, "utf-8");
    }

    if (format === "pdf") {
      const PDFDocument = require("pdfkit");
      const doc = new PDFDocument();
      let buffers: Buffer[] = [];

      doc.on("data", (chunk: Buffer) => buffers.push(chunk));

      doc.fontSize(20).text("Vendor Contact Sheet", { align: "center" });
      doc.fontSize(12).text(`Generated: ${new Date().toLocaleDateString()}`, { align: "center" });
      doc.moveDown();

      for (const contact of contactData) {
        doc.fontSize(12).font("Helvetica-Bold").text(contact.vendorName || "Unknown Vendor");
        doc.fontSize(10).font("Helvetica");
        if (contact.vendorType) doc.text(`Type: ${contact.vendorType}`);
        if (contact.vendorEmail) doc.text(`Email: ${contact.vendorEmail}`);
        if (contact.vendorPhone) doc.text(`Phone: ${contact.vendorPhone}`);
        if (contact.contactPerson) doc.text(`Contact: ${contact.contactPerson}`);
        if (contact.website) doc.text(`Website: ${contact.website}`);
        if (contact.contractStatus) doc.text(`Status: ${contact.contractStatus}`);
        doc.moveDown();
      }

      doc.end();

      return new Promise((resolve, reject) => {
        doc.on("finish", () => {
          resolve(Buffer.concat(buffers));
        });
        doc.on("error", reject);
      });
    }

    throw new Error(`Unsupported format: ${format}`);
  }

  private generateCalendarInvite(
    vendorName: string,
    eventTitle: string,
    eventDate: Date
  ): string {
    const uid = `vendor-${Date.now()}@traveloure.com`;
    const dtstamp = new Date().toISOString().replace(/[:-]/g, "").split(".")[0] + "Z";
    const dtstart = eventDate.toISOString().replace(/[:-]/g, "").split(".")[0] + "Z";
    const dtend = new Date(eventDate.getTime() + 2 * 60 * 60 * 1000)
      .toISOString()
      .replace(/[:-]/g, "")
      .split(".")[0] + "Z";

    return `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Traveloure//Vendor Coordination//EN
CALSCALE:GREGORIAN
METHOD:REQUEST
BEGIN:VEVENT
UID:${uid}
DTSTAMP:${dtstamp}
DTSTART:${dtstart}
DTEND:${dtend}
SUMMARY:${eventTitle}
DESCRIPTION:Vendor coordination event for ${vendorName}
STATUS:CONFIRMED
END:VEVENT
END:VCALENDAR`;
  }
}

export const vendorManagementService = new VendorManagementService();
