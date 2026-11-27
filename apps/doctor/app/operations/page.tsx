"use client";

import Link from "next/link";
import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { apiFetch, jsonRequest } from "../../lib/request";

type Slot = { id: string; startsAt: string; endsAt: string; status: string };
export default function OperationsPage() {
  const [slots, setSlots] = useState<Slot[]>([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [startsAt, setStartsAt] = useState("");
  const [duration, setDuration] = useState("30");
  const [filter, setFilter] = useState("ALL");
  const mutation = useRef(false);
  const lifetime = useRef<AbortController | null>(null);
  const activeLoad = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    const view=lifetime.current;
    if (!view || view.signal.aborted || mutation.current) return;
    activeLoad.current?.abort();
    const controller=new AbortController();activeLoad.current=controller;
    const signal=AbortSignal.any([view.signal,controller.signal]);
    setLoading(true);setError("");
    try { const rows=await apiFetch<Slot[]>("/v1/doctor/availability?from="+encodeURIComponent(new Date().toISOString()),{signal});if(!signal.aborted){setSlots(rows);setLoaded(true);} }
    catch (cause) { if(!signal.aborted)setError(cause instanceof Error ? cause.message : "Unable to load availability."); }
    finally { if(!signal.aborted)setLoading(false);if(activeLoad.current===controller)activeLoad.current=null; }
  },[]);
  useEffect(() => {
    const view=new AbortController();lifetime.current=view;
    const timer=window.setTimeout(()=>{const requested=new URLSearchParams(window.location.search).get("status");if(requested==="AVAILABLE")setFilter(requested);void load();},0);
    return ()=>{window.clearTimeout(timer);view.abort();activeLoad.current?.abort();lifetime.current=null;};
  },[load]);

  async function add(event: FormEvent) {
    event.preventDefault(); if (mutation.current) return;
    const signal=lifetime.current?.signal;if(!signal||signal.aborted)return;
    const start = new Date(startsAt);
    if (!Number.isFinite(start.getTime()) || start.getTime() <= Date.now()) { setError("Choose a start time in the future."); return; }
    mutation.current=true;activeLoad.current?.abort();setLoading(false);setBusy(true);setError("");setMessage("");
    try {
      const slot=await apiFetch<Slot>("/v1/doctor/availability",{...jsonRequest("POST",{startsAt:start.toISOString(),endsAt:new Date(start.getTime()+Number(duration)*60_000).toISOString()}),signal});
      if(signal.aborted)return;
      setSlots(current=>[...current.filter(item=>item.id!==slot.id),slot]);
      setStartsAt("");setMessage("Availability added. Patients can book this slot when your profile is active and verified.");
    } catch (cause) { if(!signal.aborted)setError(cause instanceof Error ? cause.message : "Unable to create availability."); }
    finally { mutation.current=false;if(!signal.aborted)setBusy(false); }
  }
  async function remove(id: string) {
    if (mutation.current) return;
    const signal=lifetime.current?.signal;if(!signal||signal.aborted)return;
    mutation.current=true;activeLoad.current?.abort();setLoading(false);setBusy(true);setError("");setMessage("");
    try {
      await apiFetch(`/v1/doctor/availability/${encodeURIComponent(id)}`,{method:"DELETE",signal});
      if(signal.aborted)return;
      setSlots(current=>current.filter(slot=>slot.id!==id));setMessage("Availability removed. The slot is no longer offered for booking.");
    } catch (cause) { if(!signal.aborted)setError(cause instanceof Error ? cause.message : "Unable to remove availability."); }
    finally { mutation.current=false;if(!signal.aborted)setBusy(false); }
  }
  const visible=slots.filter(slot=>filter==="ALL"||slot.status===filter).sort((a,b)=>new Date(a.startsAt).getTime()-new Date(b.startsAt).getTime());
  return <main style={{maxWidth:960,margin:"auto",padding:"36px 24px"}}><Link href="/dashboard">← Dashboard</Link><p>CareBridge · Provider operations</p><h1>Availability</h1><p>Create consultation slots in your local time zone. Booked slots cannot be removed. Showing up to 200 upcoming slots; past availability is excluded.</p>
    {error&&<p role="alert" className="note">{error}</p>}{message&&<p role="status">{message}</p>}
    <form onSubmit={event=>void add(event)} className="card" style={{display:"grid",gap:14,margin:"24px 0"}}><label>Start date and time<input disabled={busy} type="datetime-local" required value={startsAt} onChange={event=>setStartsAt(event.target.value)}/></label><label>Duration<select disabled={busy} value={duration} onChange={event=>setDuration(event.target.value)} style={{display:"block",padding:10,marginTop:6}}><option value="15">15 minutes</option><option value="30">30 minutes</option><option value="45">45 minutes</option><option value="60">60 minutes</option></select></label><button type="submit" disabled={busy||loading||!loaded} className="button">{busy?"Saving…":"Add consultation slot"}</button></form>
    <section id="scheduled-slots" style={{scrollMarginTop:24}} aria-label="Scheduled availability"><div className="row" style={{flexWrap:"wrap"}}><h2>Your scheduled slots</h2><label>Show slots <select aria-label="Filter availability" disabled={busy} value={filter} onChange={event=>setFilter(event.target.value)}><option value="ALL">All slots</option><option value="AVAILABLE">Available</option><option value="BOOKED">Booked</option></select></label><button disabled={loading||busy} onClick={()=>void load()}>{loading?"Refreshing…":"Refresh availability"}</button></div>
    {loading&&<p role="status">Loading availability…</p>}
    {!loading&&!error&&loaded&&!visible.length&&<p>{filter==="ALL"?"No availability yet. Add your first consultation slot above.":"No slots match this filter."}</p>}
    <div style={{display:"grid",gap:12}}>{visible.map(slot=><article key={slot.id} className="card row" style={{flexWrap:"wrap"}}><div><span>{new Date(slot.startsAt).toLocaleString()} – {new Date(slot.endsAt).toLocaleTimeString([],{hour:"numeric",minute:"2-digit"})}</span><p className="meta">{slot.status} · Slot {slot.id}</p></div><button disabled={busy||loading||slot.status!=="AVAILABLE"} aria-label={`Remove slot ${slot.id}`} onClick={()=>void remove(slot.id)}>{slot.status==="AVAILABLE"?"Remove":slot.status}</button></article>)}</div></section>
  </main>;
}
