"use client";

import { useMemo, useState } from "react";

const options = {
  General: "General consultation",
  Specialist: "Specialist consultation",
  FollowUp: "Follow-up consultation",
} as const;
const currencies = ["USD", "INR", "EUR", "GBP", "AUD", "CAD"] as const;

export default function ComparePage() {
  const [type, setType] = useState<keyof typeof options>("General");
  const [currency, setCurrency] = useState<(typeof currencies)[number]>("USD");
  const [local, setLocal] = useState("");
  const [care, setCare] = useState("");
  const label = useMemo(() => options[type], [type]);
  const localValue = local === "" ? null : Number(local);
  const careValue = care === "" ? null : Number(care);
  const valid = localValue !== null && careValue !== null &&
    Number.isFinite(localValue) && Number.isFinite(careValue) &&
    localValue >= 0 && careValue >= 0;
  const difference = valid ? localValue! - careValue! : null;
  const pct = valid && localValue! > 0 ? Math.round((difference! / localValue!) * 100) : null;
  const money = new Intl.NumberFormat("en", { style: "currency", currency, maximumFractionDigits: 2 });

  return (
    <main style={{ maxWidth: 1050, margin: "auto", padding: "50px 24px", fontFamily: "Inter,system-ui,sans-serif", color: "#172334" }}>
      <p style={{ fontSize: 12, fontWeight: 800, letterSpacing: ".12em", color: "#64748b" }}>CAREBRIDGE · COST TRANSPARENCY</p>
      <h1 style={{ fontSize: 44, margin: "8px 0" }}>Compare costs with clear assumptions.</h1>
      <p style={{ fontSize: 18, color: "#64748b", maxWidth: 720 }}>
        Enter two estimates in the same currency to calculate a scenario difference. CareBridge has not connected a verified, live international benchmark source on this page.
      </p>

      <section aria-labelledby="scenario-title" style={{ marginTop: 30, padding: 28, borderRadius: 28, background: "#f8fafc", border: "1px solid #e2e8f0" }}>
        <h2 id="scenario-title" style={{ marginTop: 0 }}>Build your comparison</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 16 }}>
          <label style={{ display: "grid", gap: 8, fontWeight: 700 }}>
            Consultation type
            <select value={type} onChange={e => setType(e.target.value as keyof typeof options)} style={{ padding: 13, borderRadius: 12, border: "1px solid #cbd5e1", background: "white" }}>
              {Object.entries(options).map(([key, value]) => <option key={key} value={key}>{value}</option>)}
            </select>
          </label>
          <label style={{ display: "grid", gap: 8, fontWeight: 700 }}>
            Currency for both estimates
            <select value={currency} onChange={e => setCurrency(e.target.value as (typeof currencies)[number]} style={{ padding: 13, borderRadius: 12, border: "1px solid #cbd5e1", background: "white" }}>
              {currencies.map(code => <option key={code} value={code}>{code}</option>)}
            </select>
          </label>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: 18, marginTop: 20 }}>
          <label style={{ display: "grid", gap: 8, padding: 22, borderRadius: 22, background: "white", border: "1px solid #e2e8f0", fontWeight: 700 }}>
            Your local benchmark estimate ({currency})
            <input type="number" min="0" step="any" inputMode="decimal" value={local} onChange={e => setLocal(e.target.value)} placeholder="Enter local estimate" style={{ width: "100%", boxSizing: "border-box", padding: 13, borderRadius: 12, border: "1px solid #cbd5e1" }} />
            <small style={{ color: "#64748b", fontWeight: 400 }}>Use a quote or source you trust. Source and date are not verified by this calculator.</small>
          </label>
          <label style={{ display: "grid", gap: 8, padding: 22, borderRadius: 22, background: "white", border: "1px solid #e2e8f0", fontWeight: 700 }}>
            CareBridge consultation estimate ({currency})
            <input type="number" min="0" step="any" inputMode="decimal" value={care} onChange={e => setCare(e.target.value)} placeholder="Enter CareBridge quote" style={{ width: "100%", boxSizing: "border-box", padding: 13, borderRadius: 12, border: "1px solid #cbd5e1" }} />
            <small style={{ color: "#64748b", fontWeight: 400 }}>Enter the actual quote you received; no default price is assumed.</small>
          </label>
        </div>

        <div aria-live="polite" style={{ marginTop: 22, padding: 22, borderRadius: 22, background: "white", border: "1px solid #e2e8f0" }}>
          <small style={{ color: "#64748b" }}>Scenario result · {label}</small>
          {valid && difference !== null ? (
            <>
              <div style={{ fontSize: 32, fontWeight: 850, marginTop: 7 }}>{money.format(Math.abs(difference))}</div>
              <p style={{ marginBottom: 0 }}>
                {difference > 0 ? "The CareBridge estimate is lower by this amount." : difference < 0 ? "The CareBridge estimate is higher by this amount." : "Both estimates are equal."}
                {pct !== null && difference !== 0 ? ` Difference: ${Math.abs(pct)}% of the local estimate.` : ""}
              </p>
            </>
          ) : <p style={{ color: "#64748b", marginBottom: 0 }}>Enter both non-negative estimates in the same currency to calculate the difference.</p>}
        </div>
      </section>

      <aside style={{ marginTop: 16, padding: 16, borderRadius: 14, background: "#fff7ed", color: "#7c2d12" }}>
        <strong>Estimate only, not verified savings.</strong> This tool uses the numbers you enter. It does not fetch live market prices or exchange rates, and it does not account for travel, taxes, tests, medicines, treatment complexity, insurance, or follow-up costs. Confirm like-for-like inclusions and the final provider quote before making a decision.
      </aside>
    </main>
  );
}
