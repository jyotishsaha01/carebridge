"use client";

import Link from "next/link";

const steps = [
  ["01", "Specialist consultation", "Start with a licensed specialist and receive a clinical assessment."],
  ["02", "Treatment plan", "Compare recommended next steps, estimated ranges and required records."],
  ["03", "Care coordination", "Coordinate eligible hospital, operation or specialist services when needed."],
  ["04", "Recovery & follow-up", "Keep prescriptions, follow-ups and care documents together in one journey."],
];

export default function CareJourneyPage() {
  return (
    <main className="page-shell" style={{ maxWidth: 1100, margin: "0 auto", padding: "48px 24px" }}>
      <Link href="/dashboard" style={{ textDecoration: "none" }}>← Back to dashboard</Link>
      <div style={{ marginTop: 48, maxWidth: 760 }}>
        <p style={{ letterSpacing: ".12em", textTransform: "uppercase", opacity: .65 }}>CareBridge Care Journey</p>
        <h1 style={{ fontSize: "clamp(42px, 7vw, 76px)", lineHeight: .98, margin: "14px 0" }}>From one consultation to a complete care plan.</h1>
        <p style={{ fontSize: 20, lineHeight: 1.6, opacity: .78 }}>Your consultation is the beginning. If more treatment is needed, CareBridge can help organize the next steps without forcing you to commit to treatment upfront.</p>
      </div>
      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 18, marginTop: 52 }}>
        {steps.map(([number, title, description]) => (
          <article key={number} style={{ border: "1px solid rgba(0,0,0,.09)", borderRadius: 24, padding: 24, minHeight: 220, boxShadow: "0 18px 50px rgba(0,0,0,.06)" }}>
            <div style={{ fontSize: 13, opacity: .5 }}>{number}</div>
            <h2 style={{ marginTop: 42, marginBottom: 10 }}>{title}</h2>
            <p style={{ lineHeight: 1.55, opacity: .7 }}>{description}</p>
          </article>
        ))}
      </section>
      <section style={{ marginTop: 36, padding: 28, borderRadius: 24, background: "rgba(20,110,90,.07)" }}>
        <strong>Important:</strong> treatment availability, medical necessity, pricing and medication fulfillment depend on the patient&apos;s location, provider, clinical assessment and applicable law. CareBridge does not replace a local emergency service.
      </section>
    </main>
  );
}
