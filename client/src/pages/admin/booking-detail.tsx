/**
 * /admin/bookings/:kind/:id — PAY-1 §4 (ledger `2026-10-15-pay1-payment-checks`).
 *
 * One booking across the three booking tables: traveler, service, the Stripe PaymentIntent, and a
 * timeline built from stored facts only. A row held at `needs_review` gets the Resolve form — the only
 * way out of that state. Cancelling moves status only; a refund is the exception-refund rail's.
 */
import { useState } from "react";
import { Link, useParams } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AdminLayout } from "@/components/admin-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface TimelineEntry {
  at: string;
  label: string;
  source: string;
  detail?: string | null;
}

interface AdminBookingDetail {
  kind: "service" | "legacy" | "liteapi";
  id: string;
  status: string | null;
  traveler: { id: string | null; name: string | null; email: string | null };
  service: { id: string | null; name: string | null };
  amount: { total: string | null; currency: string | null };
  paymentIntentId: string | null;
  hasPaymentIntent: boolean;
  paidThrough: "stripe" | "nuitee";
  needsReview: Record<string, unknown> | null;
  canResolve: boolean;
  timeline: TimelineEntry[];
  auditWarning?: string;
}

const PI_PATTERN = /^pi_[A-Za-z0-9]+$/;

export default function AdminBookingDetailPage() {
  const params = useParams<{ kind?: string; id?: string }>();
  const kind = params.kind ?? "";
  const id = params.id ?? "";
  const url = `/api/admin/bookings/${kind}/${id}`;
  const { toast } = useToast();
  const { data, isLoading, error } = useQuery<AdminBookingDetail>({ queryKey: [url], enabled: !!kind && !!id });

  const [outcome, setOutcome] = useState<"confirmed" | "cancelled">("confirmed");
  const [reason, setReason] = useState("");
  const [paymentIntentId, setPaymentIntentId] = useState("");

  const resolve = useMutation({
    mutationFn: async () => {
      const body: Record<string, string> = { outcome, reason: reason.trim() };
      if (paymentIntentId.trim()) body.paymentIntentId = paymentIntentId.trim();
      const res = await apiRequest("POST", `${url}/resolve`, body);
      return res.json();
    },
    onSuccess: (r: { status: string }) => {
      toast({ title: `Booking marked ${r.status}` });
      setReason("");
      setPaymentIntentId("");
      queryClient.invalidateQueries({ queryKey: [url] });
    },
    onError: (e: Error) => {
      const text = e.message.replace(/^\d+:\s*/, "");
      let message = text;
      try { message = JSON.parse(text).message ?? text; } catch { /* plain text */ }
      toast({ title: "Not resolved", description: message, variant: "destructive" });
    },
  });

  const piInvalid = paymentIntentId.trim() !== "" && !PI_PATTERN.test(paymentIntentId.trim());
  const needsPi = outcome === "confirmed" && data?.paidThrough === "stripe" && !data?.hasPaymentIntent;
  const canSubmit = reason.trim().length > 0 && !piInvalid && !(needsPi && !paymentIntentId.trim());

  return (
    <AdminLayout title="Booking">
      <div className="space-y-6 p-6" data-testid="admin-booking-detail">
        <Link href="/admin/reconciliation" className="text-sm text-blue-600 hover:underline">← Reconciliation</Link>
        {isLoading && <p className="text-sm text-gray-500">Loading…</p>}
        {error && <p className="text-sm text-red-600" data-testid="admin-booking-error">{(error as Error).message}</p>}
        {data && (
          <>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-3">
                  <span className="font-mono text-base">{data.id}</span>
                  <Badge variant={data.status === "needs_review" ? "destructive" : "secondary"} data-testid="admin-booking-status">
                    {data.status ?? "no status"}
                  </Badge>
                  <Badge variant="outline">{data.kind}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3 text-sm sm:grid-cols-2">
                <div>
                  <div className="text-xs uppercase text-gray-500">Traveler</div>
                  <div>{data.traveler.name ?? "—"}</div>
                  <div className="text-gray-500">{data.traveler.email ?? ""}</div>
                </div>
                <div>
                  <div className="text-xs uppercase text-gray-500">Service</div>
                  <div>{data.service.name ?? data.service.id ?? "—"}</div>
                </div>
                <div>
                  <div className="text-xs uppercase text-gray-500">Amount</div>
                  <div>{data.amount.total ? `${data.amount.total}${data.amount.currency ? ` ${data.amount.currency}` : ""}` : "—"}</div>
                </div>
                <div data-testid="admin-booking-payment">
                  <div className="text-xs uppercase text-gray-500">Payment</div>
                  {data.paidThrough === "nuitee" ? (
                    <div>Paid through Nuitée — no Stripe payment on this booking.</div>
                  ) : data.hasPaymentIntent ? (
                    <div>
                      <a className="font-mono text-blue-600 hover:underline" target="_blank" rel="noopener noreferrer" href={`https://dashboard.stripe.com/payments/${data.paymentIntentId}`}>
                        {data.paymentIntentId}
                      </a>
                      {data.kind === "service" && (
                        <div>
                          <Link href="/admin/reconciliation" className="text-blue-600 hover:underline" data-testid="admin-booking-refund-rail">
                            Exception refund →
                          </Link>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div data-testid="admin-booking-no-pi">No PaymentIntent is recorded. Refund manually in Stripe.</div>
                  )}
                </div>
                {data.needsReview && (
                  <div className="sm:col-span-2" data-testid="admin-booking-needs-review">
                    <div className="text-xs uppercase text-gray-500">Held for review</div>
                    <pre className="whitespace-pre-wrap rounded bg-gray-50 p-2 text-xs">{JSON.stringify(data.needsReview, null, 2)}</pre>
                  </div>
                )}
              </CardContent>
            </Card>

            {data.canResolve && (
              <Card data-testid="admin-booking-resolve">
                <CardHeader><CardTitle>Resolve</CardTitle></CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div className="flex gap-4">
                    <label className="flex items-center gap-2">
                      <input type="radio" checked={outcome === "confirmed"} onChange={() => setOutcome("confirmed")} data-testid="resolve-confirmed" />
                      Confirmed
                    </label>
                    <label className="flex items-center gap-2">
                      <input type="radio" checked={outcome === "cancelled"} onChange={() => setOutcome("cancelled")} data-testid="resolve-cancelled" />
                      Canceled (status only — no refund is issued)
                    </label>
                  </div>
                  {outcome === "confirmed" && data.paidThrough === "stripe" && !data.hasPaymentIntent && (
                    <div>
                      <label className="block text-xs uppercase text-gray-500" htmlFor="resolve-pi">PaymentIntent (required)</label>
                      <input id="resolve-pi" className="w-full rounded border px-2 py-1 font-mono" placeholder="pi_…" value={paymentIntentId} onChange={(e) => setPaymentIntentId(e.target.value)} data-testid="resolve-payment-intent" />
                      {piInvalid && <p className="text-xs text-red-600">Must look like pi_ followed by letters and digits.</p>}
                    </div>
                  )}
                  <div>
                    <label className="block text-xs uppercase text-gray-500" htmlFor="resolve-reason">Reason (required)</label>
                    <textarea id="resolve-reason" className="w-full rounded border px-2 py-1" maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} data-testid="resolve-reason" />
                  </div>
                  <Button disabled={!canSubmit || resolve.isPending} onClick={() => resolve.mutate()} data-testid="resolve-submit">
                    {resolve.isPending ? "Saving…" : "Resolve"}
                  </Button>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader><CardTitle>Timeline</CardTitle></CardHeader>
              <CardContent>
                {data.timeline.length === 0 ? (
                  <p className="text-sm text-gray-500">Nothing recorded.</p>
                ) : (
                  <ol className="space-y-2 text-sm" data-testid="admin-booking-timeline">
                    {data.timeline.map((t, i) => (
                      <li key={`${t.at}-${i}`} className="flex gap-3">
                        <span className="w-44 shrink-0 font-mono text-xs text-gray-500">{new Date(t.at).toLocaleString()}</span>
                        <span>
                          {t.label}
                          {t.detail ? <span className="text-gray-500"> — {t.detail}</span> : null}
                          <span className="ml-2 text-xs text-gray-400">{t.source}</span>
                        </span>
                      </li>
                    ))}
                  </ol>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </AdminLayout>
  );
}
