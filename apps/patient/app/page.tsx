"use client";

import { useMemo, useState } from "react";
import { doctors, specialties, type Doctor } from "../data";

export default function Home() {
  const [query, setQuery] = useState("");
  const [specialty, setSpecialty] = useState("All specialties");
  const [selectedDoctor, setSelectedDoctor] = useState<Doctor | null>(null);

  const filteredDoctors = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return doctors.filter((doctor) => {
      const matchesSpecialty = specialty === "All specialties" || doctor.specialty === specialty;
      const matchesQuery = !normalized || [doctor.name, doctor.specialty, doctor.expertise.join(" "), doctor.location].join(" ").toLowerCase().includes(normalized);
      return matchesSpecialty && matchesQuery;
    });
  }, [query, specialty]);

  return (
    <main className="site-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="CareBridge home">
          <span className="brand-mark">C</span>
          <span>CareBridge</span>
        </a>
        <nav className="nav-links" aria-label="Primary navigation">
          <a href="#specialists">Find Specialists</a>
          <a href="#how-it-works">How It Works</a>
          <a href="#smart-cost">Smart Cost</a>
          <a className="nav-login" href="#login">Sign in</a>
        </nav>
      </header>

      <section id="top" className="hero">
        <div className="hero-copy">
          <div className="eyebrow">GLOBAL HEALTHCARE · TRUSTED CARE · SMARTER COSTS</div>
          <h1>Expert medical care, <span>without the premium price.</span></h1>
          <p>Connect with qualified specialists through convenient virtual consultations. Understand the cost difference before you book.</p>
          <div className="hero-actions">
            <a className="button primary" href="#specialists">Find a Specialist</a>
            <a className="button ghost" href="#how-it-works">See how it works</a>
          </div>
          <div className="trust-row" aria-label="Trust highlights">
            <span>✓ Qualified specialists</span><span>✓ Secure records</span><span>✓ Transparent pricing</span>
          </div>
        </div>
        <div className="hero-card" aria-label="Smart Cost example">
          <div className="floating-dot dot-one" />
          <div className="floating-dot dot-two" />
          <div className="hero-card-top"><span>CAREBRIDGE SMART COST</span><span className="live-pill">LIVE DEMO</span></div>
          <div className="specialist-mini">
            <div className="avatar avatar-large">AS</div>
            <div><strong>Dr. Anil Sharma</strong><span>Orthopedic Specialist</span></div>
          </div>
          <div className="price-grid">
            <div><span>CareBridge</span><strong>$25</strong></div>
            <div><span>Comparable US estimate</span><strong>$150–$350</strong></div>
          </div>
          <div className="savings"><span>Estimated difference</span><strong>$125–$325</strong></div>
          <p className="microcopy">Illustrative estimate. Actual comparable pricing varies by provider, location, specialty and insurance.</p>
        </div>
      </section>

      <section id="specialists" className="content-section">
        <div className="section-heading">
          <div><div className="eyebrow">SPECIALIST NETWORK</div><h2>Find care that fits your needs.</h2></div>
          <p>Search by specialty, doctor or area of expertise.</p>
        </div>
        <div className="search-row">
          <label className="search-box"><span>⌕</span><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search doctors or specialties" aria-label="Search doctors or specialties" /></label>
          <select value={specialty} onChange={(e) => setSpecialty(e.target.value)} aria-label="Filter by specialty">
            <option>All specialties</option>{specialties.map((item) => <option key={item}>{item}</option>)}
          </select>
        </div>
        <div className="doctor-grid">
          {filteredDoctors.map((doctor) => (
            <article className="doctor-card" key={doctor.id}>
              <div className="doctor-card-top"><div className="avatar">{doctor.initials}</div><span className="verified">✓ Verified</span></div>
              <h3>{doctor.name}</h3><p className="doctor-specialty">{doctor.specialty}</p>
              <div className="rating">★ {doctor.rating} <span>·</span> {doctor.experience} years experience</div>
              <div className="expertise-row">{doctor.expertise.slice(0, 3).map((item) => <span key={item}>{item}</span>)}</div>
              <div className="doctor-meta"><span>📍 {doctor.location}</span><span>🗣 English</span></div>
              <div className="doctor-price"><div><span>Consultation</span><strong>${doctor.price}</strong></div><div className="us-compare"><span>US estimate</span><strong>${doctor.usLow}–${doctor.usHigh}</strong></div></div>
              <button className="button dark full" onClick={() => setSelectedDoctor(doctor)}>View specialist</button>
            </article>
          ))}
        </div>
        {!filteredDoctors.length && <div className="empty-state">No specialists match your search. Try a broader term or specialty.</div>}
      </section>

      <section id="smart-cost" className="smart-section">
        <div><div className="eyebrow">SMART COST</div><h2>Don't just hear that healthcare can cost less. <span>See the difference.</span></h2><p>Every consultation can show an estimated comparable US self-pay range so patients can make a more informed decision before booking.</p></div>
        <div className="comparison-card"><div><span>Your CareBridge price</span><strong>$25</strong></div><div className="arrow">→</div><div><span>Comparable US estimate</span><strong>$150–$350</strong></div><div className="comparison-badge">Estimated difference<br /><strong>$125–$325</strong></div></div>
      </section>

      <section id="how-it-works" className="content-section compact">
        <div className="section-heading"><div><div className="eyebrow">HOW IT WORKS</div><h2>One simple consultation journey.</h2></div></div>
        <div className="steps"><div><b>01</b><h3>Choose a specialist</h3><p>Browse qualified providers and compare pricing.</p></div><div><b>02</b><h3>Share your information</h3><p>Provide relevant history and upload supporting records.</p></div><div><b>03</b><h3>Meet by video</h3><p>Complete your consultation and receive the doctor's next steps.</p></div><div><b>04</b><h3>Stay connected</h3><p>Keep your summary, prescription and follow-up in one place.</p></div></div>
      </section>

      <footer className="footer"><div><strong>CareBridge</strong><span>Global Healthcare. Trusted Care. Smarter Costs.</span></div><small>Demo product environment · Synthetic data only</small></footer>

      {selectedDoctor && (
        <div className="modal-backdrop" onClick={() => setSelectedDoctor(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={`${selectedDoctor.name} specialist profile`}>
            <button className="modal-close" onClick={() => setSelectedDoctor(null)} aria-label="Close">×</button>
            <div className="doctor-card-top"><div className="avatar avatar-large">{selectedDoctor.initials}</div><span className="verified">✓ Verified</span></div>
            <h2>{selectedDoctor.name}</h2><p className="doctor-specialty">{selectedDoctor.specialty}</p>
            <p>{selectedDoctor.bio}</p>
            <div className="modal-price"><div><span>CareBridge consultation</span><strong>${selectedDoctor.price}</strong></div><div><span>Comparable US estimate</span><strong>${selectedDoctor.usLow}–${selectedDoctor.usHigh}</strong></div></div>
            <p className="microcopy">Demo profile for product development. Booking and payment are not connected yet.</p>
            <button className="button primary full" onClick={() => setSelectedDoctor(null)}>Continue to booking (coming next)</button>
          </div>
        </div>
      )}
    </main>
  );
}
