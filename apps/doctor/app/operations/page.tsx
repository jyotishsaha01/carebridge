"use client";

import Link from "next/link";
import { type FormEvent, useEffect, useState } from "react";
import { apiFetch, jsonRequest } from "../../lib/request";

type Slot = { id: string; startsAt: string; endsAt: string; status: string };
export default function OperationsPage() {
  const [slots, setSlots] = useState<Slot[]>([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [startsAt, setStartsAt] = useState("");
  const [duration, setDuration] = useState("30");
  async function load() {
    setError("");
    try { setSlots(await apiFetch<Slot[]>("/v1/doctor/availability")); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to load availability."); }
    finally { setLoading(false); }
  }
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, []);
  async function add(event: FormEvent) {
    event.preventDefault(); if (busy) return;
    const start = new Date(startsAt);
    if (!Number.isFinite(start.getTime()) || start.getTime() <= Date.now()) { setError("Choose a start time in the future."); return; }
    setBusy(true); setError(""); setMessage("");
    try {
      await apiFetch("/v1/doctor/availability", jsonRequest("POST", { startsAt: start.toISOString(), endsAt: new Date(start.getTime() + Number(duration) * 60_000).toISOString() }));
      setStartsAt(""); setMessage("Availability added."); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to create availability."); }
    finally { setBusy(false); }
  }
  async function remove(id: string) {
    if (busy) return;
    setBusy(true); setError(""); setMessage("");
    try { await apiFetch(`/v1/doctor/availability/${encodeURIComponent(id)}`, { method: "DELETE" }); setMessage("Availability removed."); await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to remove availability."); }
    finally { setBusy(false); }
  }
  return <main style={{ maxWidth: 960, margin: "auto", padding: "36px 24px" }}><Link href="/dashboard">← Dashboard</Link><p>CareBridge · Provider operations</p><h1>Availability</h1><p>Create consultation slots in your local time zone. Booked slots cannot be removed.</p>
    {error && <p role="alert" className="note">{error}</p>}{message && <p role="status">{message}</p>}
    <form onSubmit={event => void add(event)} className="card" style={{ display: "grid", gap: 14, margin: "24px 0" }}><label>Start date and time<input type="datetime-local" required value={startsAt} onChange={event => setStartsAt(event.target.value)}/></label><label>Duration<select value={duration} onChange={event => setDuration(event.target.value)} style={{ display: "block", padding: 10, marginTop: 6 }}><option value="15">15 minutes</option><option value="30">30 minutes</option><option value="45">45 minutes</option><option value="60">60 minutes</option></select></label><button type="submit" disabled={busy || loading} className="button">{busy ? "Saving…" : "Add consultation slot"}</button></form>
    <div className="row"><h2>Your scheduled slots</h2><button disabled={loading||busy} onClick={()=>{setLoading(true);void load();}}>Refresh</button></div>
    {loading ? <p role="status">Loading availability…</p> : !slots.length ? <p>No availability yet. Add your first consultation slot above.</p> : <div style={{ display: "grid", gap: 12 }}>{[...slots].sort((a,b)=>new Date(a.startsAt).getTime()-new Date(b.startsAt).getTime()).map(slot => <div key={slot.id} className="card row" style={{ flexWrap: "wrap" }}><span>{new Date(slot.startsAt).toLocaleString()} – {new Date(slot.endsAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span><button disabled={busy || slot.status !== "AVAILABLE"} onClick={() => void remove(slot.id)}>{slot.status === "AVAILABLE" ? "Remove" : slot.status}</button></div>)}</div>}
  </main>;
}
