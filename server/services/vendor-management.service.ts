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
  status: "pending" | "paid" | "overdue";
  paidDate?: string;
}

export interface ContractStats {
  totalContracts: number;
  totalValue: number;
  paidAmount: number;
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
    let upcomingDeadlines = 0;

    for (const c of contracts) {
      totalValue += parseFloat(String(c.totalAmount || 0));
      paidAmount += parseFloat(String(c.paidAmount || 0));

      const schedule = (c.paymentSchedule as PaymentMilestone[]) || [];
      for (const m of schedule) {
        if (m.status === "pending") {
          pendingPayments++;
          const dueDate = new Date(m.dueDate);
          if (dueDate <= oneWeekFromNow) {
            upcomingDeadlines++;
          }
        }
      }
    }

    return {
      totalContracts: contracts.length,
      totalValue,
      paidAmount,
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
}

export const vendorManagementService = new VendorManagementService();
