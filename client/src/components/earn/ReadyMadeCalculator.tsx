// LW-1g (ledger `2026-10-16-lw1g-earn-calculator`): the /earn Ready-Made Trip calculator. The expert types their own
// price and their own sales guess; both boxes start empty, nothing is suggested, and nothing is stored or sent.
// The rate is given by the page from the fee resolver (never typed here); every word and number comes from
// lib/ready-made-calculator.ts. The page decides whether to mount it at all (a usable rate, and Ready-Made Trips on
// sale in the launch market).
import React, { useState } from "react";
import {
  RM_CALC_ESTIMATE_LABEL,
  RM_CALC_HEADING,
  RM_CALC_PRICE_LABEL,
  RM_CALC_SALES_LABEL,
  readyMadeEstimate,
  rmExampleLine,
} from "@/lib/ready-made-calculator";

export function ReadyMadeCalculator({
  rate,
  initialPrice = "",
  initialSales = "",
  showExample = false,
}: {
  rate: number;
  /** The page passes the `earn_ready_made_example_enabled` setting; false (the default) hides the example line. */
  showExample?: boolean;
  /** For the render tests only; the page never passes these, so both boxes start empty. */
  initialPrice?: string;
  initialSales?: string;
}) {
  const [price, setPrice] = useState(initialPrice);
  const [sales, setSales] = useState(initialSales);
  const { keepLine, monthLine } = readyMadeEstimate(price, sales, rate);
  const exampleLine = showExample ? rmExampleLine(rate) : null;
  return (
    <section className="rounded-xl border bg-card p-5 sm:p-6" data-testid="earn-ready-made-calculator">
      <h2 className="text-lg font-semibold text-foreground">{RM_CALC_HEADING}</h2>
      {exampleLine && <p className="mt-2 text-sm text-muted-foreground" data-testid="earn-rm-example">{exampleLine}</p>}
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className="grid gap-1.5 text-sm">
          <span className="font-medium">{RM_CALC_PRICE_LABEL}</span>
          <input
            type="text"
            inputMode="decimal"
            autoComplete="off"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            data-testid="earn-rm-price"
          />
        </label>
        <label className="grid gap-1.5 text-sm">
          <span className="font-medium">{RM_CALC_SALES_LABEL}</span>
          <input
            type="text"
            inputMode="numeric"
            autoComplete="off"
            value={sales}
            onChange={(e) => setSales(e.target.value)}
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            data-testid="earn-rm-sales"
          />
        </label>
      </div>
      <div className="mt-4 space-y-1" aria-live="polite">
        {keepLine && <p className="text-base font-semibold" data-testid="earn-rm-keep">{keepLine}</p>}
        {monthLine && <p className="text-base font-semibold" data-testid="earn-rm-month">{monthLine}</p>}
      </div>
      <p className="mt-3 text-xs text-muted-foreground" data-testid="earn-rm-estimate-label">{RM_CALC_ESTIMATE_LABEL}</p>
    </section>
  );
}
