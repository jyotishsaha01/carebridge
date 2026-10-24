"use client";

import { useState } from "react";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const steps = ["Professional profile", "Credentials", "Review & submit"];

export default function DoctorOnboarding() {
  const [step, setStep] = useState(0);
  const [license, setLicense] = useState("");
  const [jurisdiction, setJurisdiction] = useState("");
  const [doc, setDoc] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  function continueToNextStep() {
    setError("");
    if (step === 1) {
      if (license.trim().length < 2) {
        setError("Enter a valid medical license or registration number.");
        return;
      }
      if (jurisdiction.trim().length < 2) {
        setError("Enter the country, state, or jurisdiction that issued the license.");
        return;
      }
      if (doc.trim().length > 200) {
        setError("The document reference must be 200 characters or fewer.");
        return;
      }
    }
    setStep((current) => Math.min(current + 1, steps.length - 1));
  }

  async function submit() {
    if (submitting) return;
    setError("");
    if (license.trim().length < 2 || jurisdiction.trim().length < 2) {
      setStep(1);
      setError("A medical license number and issuing jurisdiction are required.");
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch(`${API}/v1/doctor/credentials`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          type: "Medical license",
          licenseNumber: license.trim(),
          jurisdiction: jurisdiction.trim(),
          // This is a document reference only, not an uploaded file.
          documentName: doc.trim() || undefined,
        }),
      });
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          throw new Error("Sign in with a doctor account to submit credentials.");
        }
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.message ?? payload?.error ?? "Unable to submit credential. Please try again.");
      }
      setSubmitted(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Submission failed.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main style={{ minHeight: "100vh", background: "#f6f9fc", padding: "48px 24px", fontFamily: "Inter,system-ui,sans-serif", color: "#142235" }}>
      <div style={{ maxWidth: 820, margin: "auto" }}>
        <p style={{ color: "#5f7891", fontWeight: 800, letterSpacing: ".12em", fontSize: 12, textTransform: "uppercase" }}>CareBridge · Doctor verification</p>
        <h1 style={{ fontSize: 40, margin: "8px 0" }}>Join the CareBridge clinical network</h1>
        <p style={{ color: "#64788d", fontSize: 17 }}>Submit your professional credential for admin review before providing care.</p>
        <div aria-label="Onboarding progress" style={{ display: "flex", gap: 8, margin: "28px 0" }}>
          {steps.map((label, index) => (
            <div key={label} aria-current={index === step ? "step" : undefined} style={{ flex: 1, padding: 13, borderRadius: 12, background: index <= step ? "#e7f4fb" : "#edf2f7", fontWeight: 700, color: index <= step ? "#1672b8" : "#718398" }}>
              {index + 1}. {label}
            </div>
          ))}
        </div>
        {submitted ? (
          <section style={{ background: "white", border: "1px solid #dfe8f0", borderRadius: 24, padding: 30 }}>
            <h2>Application submitted</h2>
            <p style={{ color: "#64788d" }}>Your credential details have been stored for admin review. A document file has not been uploaded through this form.</p>
            <b style={{ display: "inline-block", padding: "8px 12px", borderRadius: 999, background: "#fff7ed", color: "#9a5b11" }}>PENDING REVIEW</b>
          </section>
        ) : (
          <section style={{ background: "white", border: "1px solid #dfe8f0", borderRadius: 24, padding: 30 }}>
            {step === 0 && (
              <div style={{ padding: 18, borderRadius: 16, background: "#f8fafc" }}>
                <h2>Professional profile</h2>
                <p style={{ color: "#64788d" }}>Your existing CareBridge doctor profile will be used during verification. Confirm that your profile details are current before continuing.</p>
              </div>
            )}
            {step === 1 && (
              <div style={{ display: "grid", gap: 16 }}>
                <label style={{ display: "grid", gap: 7, fontWeight: 700 }}>
                  Medical license number
                  <input required minLength={2} maxLength={120} autoComplete="off" value={license} onChange={(event) => setLicense(event.target.value)} placeholder="License / registration number" style={{ padding: 13, border: "1px solid #cbd9e5", borderRadius: 12 }} />
                </label>
                <label style={{ display: "grid", gap: 7, fontWeight: 700 }}>
                  License jurisdiction
                  <input required minLength={2} maxLength={120} value={jurisdiction} onChange={(event) => setJurisdiction(event.target.value)} placeholder="Country / state / jurisdiction" style={{ padding: 13, border: "1px solid #cbd9e5", borderRadius: 12 }} />
                </label>
                <label style={{ display: "grid", gap: 7, fontWeight: 700 }}>
                  Credential document reference (optional)
                  <input maxLength={200} value={doc} onChange={(event) => setDoc(event.target.value)} placeholder="Reference or filename only — no file upload" style={{ padding: 13, border: "1px solid #cbd9e5", borderRadius: 12 }} />
                  <span style={{ fontSize: 12, color: "#64788d", fontWeight: 400 }}>Do not enter sensitive document contents. Secure file upload is not available in this form yet.</span>
                </label>
              </div>
            )}
            {step === 2 && (
              <div style={{ padding: 18, borderRadius: 16, background: "#f8fafc" }}>
                <h2>Review before submission</h2>
                <p><strong>License number:</strong> {license.trim() || "Not provided"}</p>
                <p><strong>Jurisdiction:</strong> {jurisdiction.trim() || "Not provided"}</p>
                <p><strong>Document reference:</strong> {doc.trim() || "Not provided"}</p>
                <p style={{ color: "#64788d" }}>Submitting creates a pending credential record for admin review. It does not verify the license automatically.</p>
              </div>
            )}
            {error && <p role="alert" style={{ color: "#b42318", marginTop: 16 }}>{error}</p>}
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 28 }}>
              <button disabled={step === 0 || submitting} onClick={() => { setError(""); setStep((current) => Math.max(0, current - 1)); }} style={{ padding: "11px 16px", borderRadius: 12, border: "1px solid #cbd9e5", background: "white" }}>Back</button>
              {step < 2 ? (
                <button onClick={continueToNextStep} style={{ padding: "11px 16px", borderRadius: 12, border: 0, background: "#1672b8", color: "white", fontWeight: 800 }}>Continue</button>
              ) : (
                <button disabled={submitting || !license.trim() || !jurisdiction.trim()} onClick={() => void submit()} style={{ padding: "11px 16px", borderRadius: 12, border: 0, background: "#1672b8", color: "white", fontWeight: 800, opacity: submitting ? 0.7 : 1 }}>
                  {submitting ? "Submitting…" : "Submit for verification"}
                </button>
              )}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
