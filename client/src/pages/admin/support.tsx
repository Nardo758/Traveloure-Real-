/** Ops gap 7 (ledger `2026-10-22-support-intake-queue`): the admin Support inbox page. Admin-only for now. */
import React from "react";
import { AdminLayout } from "@/components/admin-layout";
import { SupportInbox } from "@/components/admin/SupportInbox";
import { SUPPORT_COPY } from "@/lib/support-inbox";

export default function AdminSupport() {
  return (
    <AdminLayout title={SUPPORT_COPY.pageTitle}>
      <div className="p-6">
        <SupportInbox />
      </div>
    </AdminLayout>
  );
}
