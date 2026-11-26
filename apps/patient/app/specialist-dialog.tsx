"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ApiError, bookAppointment, getAvailability, type ApiDoctor, type ApiSlot } from "../lib/api";

export default function SpecialistDialog({ doctor, live, onClose }: { doctor: ApiDoctor; live: boolean; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  const [slots, setSlots] = useState<ApiSlot[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<ApiSlot | null>(null);
  const [loading, setLoading] = useState(live);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [signInRequired, setSignInRequired] = useState(false);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const element = dialog.current;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    element?.showModal();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { element?.close(); document.body.style.overflow = previousOverflow; previousFocus?.focus(); };
  }, []);

  useEffect(() => {
    if (!live) return;
    let active = true;
    const from = new Date();
    const to = new Date(from.getTime() + 14 * 24 * 60 * 60 * 1000);
    getAvailability(doctor.id, from, to).then((result) => {
      if (active) setSlots(result.filter((slot) => new Date(slot.startsAt) > new Date()));
    }).catch((cause) => {
      if (active) setError(cause instanceof Error ? cause.message : "Unable to load availability. Please try again.");
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [doctor.id, live, retry]);

  function refresh() {
    setLoading(true);
    setSelectedSlot(null);
    setSlots([]);
    setError("");
    setRetry((value) => value + 1);
  }

  async function reserve() {
    if (!selectedSlot || busy) return;
    setBusy(true);
    setError("");
    try {
      const appointment = await bookAppointment(doctor.id, selectedSlot.startsAt);
      router.push(`/appointments/${encodeURIComponent(appointment.id)}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "We couldn’t reserve that time. Please try again.");
      setSignInRequired(cause instanceof ApiError && cause.status === 401);
      if (cause instanceof ApiError && cause.status === 409) {
        setSlots((current) => current.filter((slot) => slot.id !== selectedSlot.id));
        setSelectedSlot(null);
      }
    } finally { setBusy(false); }
  }

  return <dialog ref={dialog} className="modal" aria-labelledby="doctor-modal-title" aria-describedby="doctor-modal-description" onCancel={onClose} onKeyDown={(event) => {
    if (event.key !== "Tab") return;
    const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>("button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled)"));
    const first = controls[0]; const last = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }} onClick={(event) => { if (event.target === event.currentTarget) { const rect = event.currentTarget.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) onClose(); } }}>
    <button className="modal-close" onClick={onClose} aria-label="Close specialist details">×</button>
    <div className="doctor-card-top"><div className="avatar avatar-large" aria-hidden="true">{doctor.initials}</div>{doctor.verified && <span className="verified">{live ? "Verified" : "Demo profile"}</span>}</div>
    <h2 id="doctor-modal-title">{doctor.name}</h2>
    <p className="doctor-specialty">{doctor.specialty}</p>
    <p id="doctor-modal-description">{doctor.bio}</p>
    <div className="modal-price"><div><span>CareBridge consultation</span><strong>${doctor.price}</strong></div><div><span>Comparable US estimate</span><strong>{doctor.usLow && doctor.usHigh ? `$${doctor.usLow}–$${doctor.usHigh}` : "Not available"}</strong></div></div>
    <p className="microcopy">Illustrative comparison only. Actual costs depend on provider, location, specialty, and insurance.</p>
    {loading ? <p className="empty-state" role="status">Loading consultation times…</p> : !live ? <p className="empty-state">This is a preview profile. Booking is unavailable while the service is offline.</p> : slots.length ? <div><h3>Choose a consultation time</h3><p className="microcopy">Times shown in {Intl.DateTimeFormat().resolvedOptions().timeZone}.</p><div className="slot-list">{slots.slice(0, 8).map((slot) => <button className={`button ${selectedSlot?.id === slot.id ? "primary" : "ghost"}`} aria-pressed={selectedSlot?.id === slot.id} key={slot.id} disabled={busy} onClick={() => setSelectedSlot(slot)}>{new Date(slot.startsAt).toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</button>)}</div></div> : !error && <p className="empty-state">No consultation times are available in the next two weeks. Please check back soon.</p>}
    {error && <p className="booking-error" role="alert">{error}</p>}
    {signInRequired ? <Link className="button primary" href="/login">Sign in to reserve a time</Link> : <button className="button primary full" disabled={!selectedSlot || busy || !live || loading} onClick={() => void reserve()}>{busy ? "Reserving…" : "Reserve a time"}</button>}
    {live && <button className="button ghost full" style={{ marginTop: 10 }} disabled={loading || busy} onClick={refresh}>Refresh availability</button>}
    <p className="microcopy">Your reservation and payment status will be shown in your appointment.</p>
  </dialog>;
}
