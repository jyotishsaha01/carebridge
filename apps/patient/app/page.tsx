"use client";

import { useEffect, useMemo, useState } from "react";
import { bookAppointment, getAvailability, getDoctors, getSpecialties, type ApiDoctor, type ApiSlot } from "../lib/api";
import { doctors as demoDoctors, specialties as demoSpecialties, type Doctor } from "../data";

export default function Home() {
  const [query, setQuery] = useState("");
  const [specialty, setSpecialty] = useState("All specialties");
  const [doctorList, setDoctorList] = useState<ApiDoctor[]>(demoDoctors as ApiDoctor[]);
  const [specialtyList, setSpecialtyList] = useState<string[]>(demoSpecialties);
  const [selectedDoctor, setSelectedDoctor] = useState<ApiDoctor | null>(null);
  const [slots, setSlots] = useState<ApiSlot[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<ApiSlot | null>(null);
  const [bookingState, setBookingState] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [apiState, setApiState] = useState<"loading" | "connected" | "fallback">("loading");

  useEffect(() => {
    let active = true;
    Promise.all([getDoctors(), getSpecialties()])
      .then(([doctorsResponse, specialtiesResponse]) => {
        if (!active) return;
        setDoctorList(doctorsResponse);
        setSpecialtyList(specialtiesResponse.map((item) => item.name));
        setApiState("connected");
      })
      .catch(() => {
        if (active) setApiState("fallback");
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    getDoctors({ specialty, q: query })
      .then((result) => { if (active) { setDoctorList(result); setApiState("connected"); } })
      .catch(() => { if (active) setApiState("fallback"); });
    return () => { active = false; };
  }, [query, specialty]);

  const filteredDoctors = useMemo(() => {
    if (apiState === "connected") return doctorList;
    const normalized = query.trim().toLowerCase();
    return doctorList.filter((doctor) => {
      const matchesSpecialty = specialty === "All specialties" || doctor.specialty === specialty;
      const matchesQuery = !normalized || [doctor.name, doctor.specialty, doctor.expertise.join(" "), doctor.location].join(" ").toLowerCase().includes(normalized);
      return matchesSpecialty && matchesQuery;
    });
  }, [apiState, doctorList, query, specialty]);

  async function openDoctor(doctor: ApiDoctor) {
    setSelectedDoctor(doctor);
    setSelectedSlot(null);
    setBookingState("idle");
    const from = new Date();
    const to = new Date(from.getTime() + 14 * 24 * 60 * 60 * 1000);
    try {
      setSlots(await getAvailability(doctor.id, from, to));
    } catch {
      setSlots([]);
    }
  }

  async function reserveSlot() {
    if (!selectedDoctor || !selectedSlot) return;
    setBookingState("loading");
    try {
      await bookAppointment(selectedDoctor.id, selectedSlot.startsAt);
      setBookingState("success");
    } catch {
      setBookingState("error");
    }
  }

  return (
    <main className="site-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="CareBridge home"><span className="brand-mark">C</span><span>CareBridge</span></a>
        <nav className="nav-links" aria-label="Primary navigation"><a href="#specialists">Find Specialists</a><a href="#how-it-works">How It Works</a><a href="#smart-cost">Smart Cost</a><a className="nav-login" href="#login">Sign in</a></nav>
      </header>

      <section id="top" className="hero">
        <div className="hero-copy">
          <div className="eyebrow">GLOBAL HEALTHCARE · TRUSTED CARE · SMARTER COSTS</div>
          <h1>Expert medical care, <span>without the premium price.</span></h1>
          <p>Connect with qualified specialists through convenient virtual consultations. Understand the cost difference before you book.</p>
          <div className="hero-actions"><a className="button primary" href="#specialists">Find a Specialist</a><a className="button ghost" href="#how-it-works">See how it works</a></div>
          <div className="trust-row"><span>✓ Qualified specialists</span><span>✓ Secure records</span><span>✓ Transparent pricing</span></div>
        </div>
        <div className="hero-card" aria-label="Smart Cost example">
          <div className="floating-dot dot-one" /><div className="floating-dot dot-two" />
          <div className="hero-card-top"><span>CAREBRIDGE SMART COST</span><span className="live-pill">DEMO BENCHMARK</span></div>
          <div className="specialist-mini"><div className="avatar avatar-large">AS</div><div><strong>Dr. Anil Sharma</strong><span>Orthopedic Specialist</span></div></div>
          <div className="price-grid"><div><span>CareBridge</span><strong>$25</strong></div><div><span>Comparable US estimate</span><strong>$150–$350</strong></div></div>
          <div className="savings"><span>Estimated difference</span><strong>$125–$325</strong></div>
          <p className="microcopy">Illustrative estimate. Actual comparable pricing varies by provider, location, specialty and insurance.</p>
        </div>
      </section>

      <section id="specialists" className="content-section">
        <div className="section-heading"><div><div className="eyebrow">SPECIALIST NETWORK</div><h2>Find care that fits your needs.</h2></div><p>Search by specialty, doctor or area of expertise.</p></div>
        <div className="search-row"><label className="search-box"><span>⌕</span><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search doctors or specialties" aria-label="Search doctors or specialties" /></label><select value={specialty} onChange={(e) => setSpecialty(e.target.value)} aria-label="Filter by specialty"><option>All specialties</option>{specialtyList.map((item) => <option key={item}>{item}</option>)}</select></div>
        {apiState === "fallback" && <div className="empty-state">API is offline, so the page is showing synthetic demo data. Start PostgreSQL and the CareBridge API to use live discovery and booking.</div>}
        <div className="doctor-grid">
          {filteredDoctors.map((doctor) => <article className="doctor-card" key={doctor.id}>
            <div className="doctor-card-top"><div className="avatar">{doctor.initials}</div><span className="verified">✓ Verified</span></div>
            <h3>{doctor.name}</h3><p className="doctor-specialty">{doctor.specialty}</p><div className="rating">★ {doctor.rating} <span>·</span> {doctor.experience} years experience</div>
            <div className="expertise-row">{doctor.expertise.slice(0, 3).map((item) => <span key={item}>{item}</span>)}</div>
            <div className="doctor-meta"><span>📍 {doctor.location}</span><span>🗣 English</span></div>
            <div className="doctor-price"><div><span>Consultation</span><strong>${doctor.price}</strong></div><div className="us-compare"><span>US estimate</span><strong>{doctor.usLow && doctor.usHigh ? `$${doctor.usLow}–$${doctor.usHigh}` : "See profile"}</strong></div></div>
            <button className="button dark full" onClick={() => openDoctor(doctor)}>View specialist</button>
          </article>)}
        </div>
        {!filteredDoctors.length && <div className="empty-state">No specialists match your search. Try a broader term or specialty.</div>}
      </section>

      <section id="smart-cost" className="smart-section"><div><div className="eyebrow">SMART COST</div><h2>Don't just hear that healthcare can cost less. <span>See the difference.</span></h2><p>Every consultation can show an estimated comparable US self-pay range so patients can make a more informed decision before booking.</p></div><div className="comparison-card"><div><span>Your CareBridge price</span><strong>$25</strong></div><div className="arrow">→</div><div><span>Comparable US estimate</span><strong>$150–$350</strong></div><div className="comparison-badge">Estimated difference<br /><strong>$125–$325</strong></div></div></section>

      <section id="how-it-works" className="content-section compact"><div className="section-heading"><div><div className="eyebrow">HOW IT WORKS</div><h2>One simple consultation journey.</h2></div></div><div className="steps"><div><b>01</b><h3>Choose a specialist</h3><p>Browse qualified providers and compare pricing.</p></div><div><b>02</b><h3>Share your information</h3><p>Provide relevant history and upload supporting records.</p></div><div><b>03</b><h3>Meet by video</h3><p>Complete your consultation and receive the doctor's next steps.</p></div><div><b>04</b><h3>Stay connected</h3><p>Keep your summary, prescription and follow-up in one place.</p></div></div></section>
      <footer className="footer"><div><strong>CareBridge</strong><span>Global Healthcare. Trusted Care. Smarter Costs.</span></div><small>Demo product environment · Synthetic data only</small></footer>

      {selectedDoctor && <div className="modal-backdrop" onClick={() => setSelectedDoctor(null)}><div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={`${selectedDoctor.name} specialist profile`}>
        <button className="modal-close" onClick={() => setSelectedDoctor(null)} aria-label="Close">×</button>
        <div className="doctor-card-top"><div className="avatar avatar-large">{selectedDoctor.initials}</div><span className="verified">✓ Verified</span></div>
        <h2>{selectedDoctor.name}</h2><p className="doctor-specialty">{selectedDoctor.specialty}</p><p>{selectedDoctor.bio}</p>
        <div className="modal-price"><div><span>CareBridge consultation</span><strong>${selectedDoctor.price}</strong></div><div><span>Comparable US estimate</span><strong>{selectedDoctor.usLow && selectedDoctor.usHigh ? `$${selectedDoctor.usLow}–$${selectedDoctor.usHigh}` : "Not available"}</strong></div></div>
        <p className="microcopy">{apiState === "connected" ? "Live availability from the local CareBridge API." : "Demo profile. Start the API for live availability."}</p>
        {slots.length > 0 ? <div><h3>Choose a consultation time</h3><div className="expertise-row">{slots.slice(0, 8).map((slot) => <button className={`button ${selectedSlot?.id === slot.id ? "primary" : "ghost"}`} key={slot.id} onClick={() => setSelectedSlot(slot)}>{new Date(slot.startsAt).toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</button>)}</div></div> : <div className="empty-state">No live slots are available. Run the database seed to create local demo availability.</div>}
        {bookingState === "success" ? <div className="empty-state">Appointment reserved in the local demo environment. Payment and real authentication come next.</div> : <button className="button primary full" disabled={!selectedSlot || bookingState === "loading" || apiState !== "connected"} onClick={reserveSlot}>{bookingState === "loading" ? "Reserving…" : "Reserve selected time"}</button>}
        {bookingState === "error" && <p className="microcopy">The slot could not be reserved. Refresh availability and try again.</p>}
        <p className="microcopy">Booking is a local development flow only; it does not charge the patient.</p>
      </div></div>}
    </main>
  );
}
