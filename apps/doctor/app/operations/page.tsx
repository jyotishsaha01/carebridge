"use client";

import { useCallback, useEffect, useState } from "react";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
type Slot = { id: string; startsAt: string; endsAt: string; status: string };

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

export default function OperationsPage() {
  const [slots, setSlots] = useState<Slot[]>([]);
  const [start, setStart] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [removingId, setRemovingId] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const response = await fetch(`${API}/v1/doctor/availability`, {
        credentials: "include",
        cache: "no-store",
      });
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          throw new Error("Sign in with a doctor account to manage availability.");
        }
        throw new Error("Availability could not be loaded. Please retry.");
      }
      const data = await response.json();
      setSlots(Array.isArray(data) ? data : []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Availability could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function add() {
    setError("");
    setNotice("");
    if (!start) {
      setError("Choose a start date and time for the consultation slot.");
      return;
    }
    const startsAt = new Date(start);
    const endsAt = new Date(startsAt.getTime() + 30 * 60 * 1000);
    if (Number.isNaN(startsAt.getTime()) || startsAt <= new Date()) {
      setError("Choose a valid start time in the future.");
      return;
    }

    setSaving(true);
    try {
      const response = await fetch(`${API}/v1/doctor/availability`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString() }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(
          response.status === 409
            ? (payload?.error ?? "This slot overlaps existing availability.")
            : (payload?.error ?? "Unable to create the slot. Please retry."),
        );
      }
      setStart("");
      setNotice("30-minute availability slot added.");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to create the slot.");
    } finally {
      setSaving(false);
    }
  }

  async function remove(slot: Slot) {
    setError("");
    setNotice("");
    setRemovingId(slot.id);
    try {
      const response = await fetch(`${API}/v1/doctor/availability/${encodeURIComponent(slot.id)}`, {
        method: "DELETE",
        credentials: "include",
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error ?? "Only available slots can be removed.");
      }
      setNotice("Availability slot removed.");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to remove this slot.");
    } finally {
      setRemovingId("");
    }
  }

  const sortedSlots = [...slots].sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());

  return (
    <main style={{ minHeight: "100vh", background: "#f6f9fc", color: "#142235", padding: "clamp(20px, 5vw, 48px)", fontFamily: "Inter,system-ui,sans-serif" }}>
      <div style={{ maxWidth: 960, margin: "auto" }}>
        <a href="/dashboard" style={{ color: "#1672b8", textDecoration: "none" }}>← Doctor dashboard</a>
        <p style={{ color: "#64788d", marginTop: 24, fontSize: 12, fontWeight: 800, letterSpacing: ".12em" }}>CAREBRIDGE · PROVIDER OPERATIONS</p>
        <h1 style={{ marginBottom: 8 }}>Availability</h1>
        <p style={{ color: "#64788d" }}>Add future 30-minute consultation slots and manage existing availability.</p>

        <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 260px), 1fr))", gap: 16, alignItems: "end", marginTop: 24, padding: 22, background: "white", border: "1px solid #dfe8f0", borderRadius: 20 }}>
          <label style={{ display: "grid", gap: 8, fontWeight: 700 }}>
            Slot start date and time
            <input type="datetime-local" value={start} onChange={(event) => setStart(event.target.value)} style={{ width: "100%", boxSizing: "border-box", padding: 12, border: "1px solid #cbd9e5", borderRadius: 10, font: "inherit" }} />
          </label>
          <div style={{ color: "#64788d", fontSize: 14 }}>Each slot is 30 minutes. Times are converted to UTC before saving.</div>
          <button type="button" onClick={() => void add()} disabled={saving} style={{ padding: "12px 18px", borderRadius: 12, border: 0, background: saving ? "#8bb9d8" : "#1672b8", color: "white", fontWeight: 800, cursor: saving ? "wait" : "pointer" }}>{saving ? "Adding slot…" : "Add availability"}</button>
        </section>

        {error && <div role="alert" style={{ marginTop: 16, padding: 14, borderRadius: 12, background: "#fff1f1", border: "1px solid #f2c5c5", color: "#a52222" }}>{error}</div>}
        {notice && <div role="status" style={{ marginTop: 16, padding: 14, borderRadius: 12, background: "#edf7f3", border: "1px solid #c8e8d9", color: "#17653f" }}>{notice}</div>}

        <section style={{ marginTop: 24, padding: 22, background: "white", border: "1px solid #dfe8f0", borderRadius: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
            <h2 style={{ margin: 0 }}>Your scheduled slots</h2>
            <button type="button" onClick={() => void load()} disabled={loading} style={{ padding: "9px 12px", borderRadius: 10, border: "1px solid #dfe8f0", background: "white" }}>{loading ? "Loading…" : "Refresh"}</button>
          </div>
          {loading ? (
            <p role="status" style={{ color: "#64788d", marginTop: 20 }}>Loading availability…</p>
          ) : sortedSlots.length === 0 ? (
            <div style={{ marginTop: 18, padding: 24, textAlign: "center", borderRadius: 14, background: "#f8fafc", color: "#64788d" }}>
              <strong style={{ color: "#142235" }}>No availability slots yet</strong>
              <p>Add a future time above so patients can see when you are available.</p>
            </div>
          ) : (
            <div style={{ display: "grid", gap: 10, marginTop: 18 }}>
              {sortedSlots.map((slot) => (
                <article key={slot.id} style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 14, padding: 16, border: "1px solid #e2e8f0", borderRadius: 14 }}>
                  <div>
                    <strong>{formatDate(slot.startsAt)}</strong>
                    <div style={{ marginTop: 5, color: "#64788d", fontSize: 13 }}>Ends {formatDate(slot.endsAt)}</div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <span style={{ padding: "6px 9px", borderRadius: 99, background: slot.status === "AVAILABLE" ? "#edf7f3" : "#edf2f7", color: slot.status === "AVAILABLE" ? "#17653f" : "#52677c", fontSize: 12, fontWeight: 800 }}>{slot.status}</span>
                    <button type="button" onClick={() => void remove(slot)} disabled={slot.status !== "AVAILABLE" || removingId === slot.id} style={{ padding: "9px 12px", borderRadius: 9, border: "1px solid #e5c6c6", background: "white", color: "#a52222", cursor: slot.status !== "AVAILABLE" || removingId === slot.id ? "not-allowed" : "pointer" }}>{removingId === slot.id ? "Removing…" : slot.status === "AVAILABLE" ? "Remove" : "Reserved"}</button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
