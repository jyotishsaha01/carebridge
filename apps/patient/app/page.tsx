"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { ApiError, getCurrentUser, getDoctors, getSpecialties, type ApiDoctor } from "../lib/api";
import { doctors as demoDoctors, specialties as demoSpecialties } from "../data";
import SpecialistDialog from "./specialist-dialog";

const HERO_IMAGES = Array.from({ length: 10 }, (_, index) => `/images/hero/care-${String(index + 1).padStart(2, "0")}.jpg`);
const ALLOW_DEMO_CATALOG = process.env.NODE_ENV !== "production";

export default function Home() {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [query, setQuery] = useState("");
  const [specialty, setSpecialty] = useState("All specialties");
  const [doctorList, setDoctorList] = useState<ApiDoctor[]>([]);
  const [specialtyList, setSpecialtyList] = useState<string[]>(ALLOW_DEMO_CATALOG ? demoSpecialties : []);
  const [selectedDoctor, setSelectedDoctor] = useState<ApiDoctor | null>(null);
  const [apiState, setApiState] = useState<"loading" | "connected" | "fallback" | "error">("loading");
  const [retry, setRetry] = useState(0);
  const [activeHeroImage, setActiveHeroImage] = useState(0);

  useEffect(() => {
    let active = true;
    const refresh = () => { void getCurrentUser().then(({ user }) => { if (active) setSignedIn(user.role === "PATIENT"); }).catch((cause) => { if (active) setSignedIn(cause instanceof ApiError && [401, 403].includes(cause.status) ? false : null); }); };
    refresh();
    window.addEventListener("carebridge:session-expired", refresh);
    return () => { active = false; window.removeEventListener("carebridge:session-expired", refresh); };
  }, []);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        setActiveHeroImage((current) => (current + 1) % HERO_IMAGES.length);
      }
    }, 3000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let active = true;
    getSpecialties().then((specialtiesResponse) => {
      if (!active) return;
      setSpecialtyList(specialtiesResponse.map((item) => item.name));
    }).catch(() => { /* Discovery reports its own actionable connection state. */ });
    return () => { active = false; };
  }, [retry]);

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      setApiState("loading");
      getDoctors({ specialty, q: query.trim() }).then((result) => {
        if (active) { setDoctorList(result); setApiState("connected"); }
      }).catch(() => {
        if (!active) return;
        setDoctorList(ALLOW_DEMO_CATALOG ? demoDoctors as ApiDoctor[] : []);
        setApiState(ALLOW_DEMO_CATALOG ? "fallback" : "error");
      });
    }, 250);
    return () => { active = false; window.clearTimeout(timer); };
  }, [query, specialty, retry]);

  const filteredDoctors = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return doctorList.filter((doctor) => {
      const matchesSpecialty = specialty === "All specialties" || doctor.specialty === specialty;
      const matchesQuery = !normalized || [doctor.name, doctor.specialty, doctor.expertise.join(" "), doctor.location].join(" ").toLowerCase().includes(normalized);
      return matchesSpecialty && matchesQuery;
    });
  }, [doctorList, query, specialty]);

  function scrollToSpecialists(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    document.getElementById("specialists")?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }

  return (
    <main className="site-shell">
      <header className="topbar">
        <a className="brand" href={signedIn ? "/dashboard" : "#top"} aria-label={signedIn ? "CareBridge patient dashboard" : "CareBridge home"}>
          <span className="brand-mark" aria-hidden="true"><i /><i /></span>
          <span>CareBridge</span>
        </a>
        <nav className="nav-links" aria-label="Primary navigation">
          <a className="nav-primary" href="#specialists">Find a specialist</a>
          <a href="#how-it-works">How it works</a>
          <a href="/compare">Compare costs</a>
          <a className="nav-login" href={signedIn === false ? "/login" : "/dashboard"}>{signedIn === true ? "Dashboard" : signedIn === false ? "Sign in" : "My account"}</a>
        </nav>
      </header>

      <section id="top" className="hero" aria-labelledby="hero-title">
        <div className="hero-background" aria-hidden="true">
          {HERO_IMAGES.map((src, index) => (
            <Image className={`hero-photo${activeHeroImage === index ? " active" : ""}`} src={src} alt="" fill sizes="100vw" quality={78} priority={index === 0} key={src} />
          ))}
        </div>
        <div className="hero-copy">
          <div className="eyebrow hero-eyebrow"><span className="eyebrow-rule" /> CARE THAT CROSSES BORDERS</div>
          <h1 id="hero-title">CareBridge<span>.</span></h1>
          <h2>Specialist care, made more human.</h2>
          <p>Meet trusted clinicians online, understand your options, and know the cost before you choose.</p>

          <form className="hero-search" role="search" onSubmit={scrollToSpecialists}>
            <label className="hero-search-query">
              <span>What kind of care are you looking for?</span>
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Try skin, joints, or a doctor" aria-label="Search doctors or specialties" />
            </label>
            <label className="hero-search-specialty">
              <span>Specialty</span>
              <select value={specialty} onChange={(event) => setSpecialty(event.target.value)} aria-label="Filter by specialty">
                <option>All specialties</option>
                {specialtyList.map((item) => <option key={item}>{item}</option>)}
              </select>
            </label>
            <button className="button primary search-submit" type="submit">Explore care <span aria-hidden="true">→</span></button>
          </form>

          <div className="hero-proof" aria-label="CareBridge commitments">
            <span><b aria-hidden="true">✓</b> Verified clinicians</span>
            <span><b aria-hidden="true">✓</b> Upfront estimates</span>
            <span><b aria-hidden="true">✓</b> Secure records</span>
          </div>
        </div>
        <a className="hero-scroll" href="#specialists"><span aria-hidden="true">↓</span> Explore the network</a>
      </section>

      <section className="trust-strip" aria-label="CareBridge highlights">
        <div><span className="trust-number">{specialtyList.length || "—"}</span><span>specialties to explore</span></div>
        <div><span className="trust-symbol" aria-hidden="true">01</span><span>Care led by specialists</span></div>
        <div><span className="trust-symbol" aria-hidden="true">02</span><span>Clear costs before booking</span></div>
        <div><span className="trust-symbol" aria-hidden="true">03</span><span>Your care, in one place</span></div>
      </section>

      <section id="specialists" className="content-section">
        <div className="section-heading">
          <div><div className="eyebrow">A BETTER PLACE TO BEGIN</div><h2>Find care that fits your life.</h2></div>
          <p>Explore experienced clinicians by specialty, name, or area of expertise. Start with a question; we’ll help you find the right next step.</p>
        </div>
        <div className="search-row">
          <label className="search-box"><span aria-hidden="true">⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search doctors or specialties" aria-label="Search doctors or specialties" /></label>
          <select value={specialty} onChange={(event) => setSpecialty(event.target.value)} aria-label="Filter by specialty"><option>All specialties</option>{specialtyList.map((item) => <option key={item}>{item}</option>)}</select>
        </div>
        {apiState === "loading" && <p className="empty-state" role="status">Finding specialists…</p>}
        {apiState === "fallback" && <div className="empty-state" role="status">Preview catalog · These are synthetic demo specialists. Booking is unavailable while the service is offline.</div>}
        {apiState === "error" && <div className="empty-state" role="alert">We couldn’t load specialists. Please check your connection. <button className="button ghost" onClick={() => setRetry((value) => value + 1)}>Try again</button></div>}
        <div className="doctor-grid" aria-live="polite" aria-busy={apiState === "loading"}>
          {filteredDoctors.map((doctor) => (
            <article className="doctor-card" key={doctor.id}>
              <div className="doctor-card-top"><div className="avatar" aria-hidden="true">{doctor.initials}</div>{doctor.isNew && <span className="verified">New specialist</span>}{doctor.verified && <span className="verified"><span aria-hidden="true">✓</span> {apiState === "fallback" ? "Demo profile" : "Verified"}</span>}</div>
              <h3>{doctor.name}</h3><p className="doctor-specialty">{doctor.specialty}</p>
              <div className="rating"><span aria-label={`${doctor.rating} out of 5 stars`}>★ {doctor.rating}</span><span className="rating-divider">/</span>{doctor.experience} years experience</div>
              <div className="expertise-row">{doctor.expertise.slice(0, 3).map((item) => <span key={item}>{item}</span>)}</div>
              <div className="doctor-meta"><span>{doctor.location}</span><span>Consultations in English</span></div>
              <div className="doctor-price"><div><span>Consultation</span><strong>${doctor.price}</strong></div><div className="us-compare"><span>US estimate</span><strong>{doctor.usLow && doctor.usHigh ? `$${doctor.usLow}–$${doctor.usHigh}` : "See profile"}</strong></div></div>
              <button className="button dark full" onClick={() => setSelectedDoctor(doctor)}>View specialist <span aria-hidden="true">→</span></button>
            </article>
          ))}
        </div>
        {!filteredDoctors.length && (apiState === "connected" || apiState === "fallback") && <div className="empty-state">No specialists match that search. Try a broader term or choose another specialty.</div>}
      </section>

      <section id="smart-cost" className="smart-section">
        <div className="smart-copy"><div className="eyebrow">COST, MADE CLEAR</div><h2>Know what care may cost <span>before you decide.</span></h2><p>Compare a CareBridge consultation with an illustrative US self-pay range. See the assumptions up front, with no promise of guaranteed savings.</p><a className="text-link" href="#specialists">Explore specialists <span aria-hidden="true">→</span></a></div>
        <div className="comparison-card" aria-label="Illustrative consultation price comparison"><div><span>CareBridge consultation</span><strong>$25</strong></div><div className="comparison-separator" aria-hidden="true">/</div><div><span>Comparable US estimate</span><strong>$150–$350</strong></div><p>Example estimate only. Actual prices depend on provider, location, specialty, and insurance.</p></div>
      </section>

      <section id="how-it-works" className="content-section compact">
        <div className="section-heading"><div><div className="eyebrow">A CLEARER CARE JOURNEY</div><h2>Good care keeps going.</h2></div><p>From the first conversation to the next step, your care stays connected.</p></div>
        <div className="steps"><article><b>01</b><h3>Choose your specialist</h3><p>Browse clinicians, compare estimates, and see available times.</p></article><article><b>02</b><h3>Share what matters</h3><p>Complete your intake and securely share relevant records.</p></article><article><b>03</b><h3>Meet online</h3><p>Talk with your clinician from wherever you are.</p></article><article><b>04</b><h3>Stay connected</h3><p>Keep your summary, care plan, and follow-up in one place.</p></article></div>
      </section>

      <footer className="footer"><div><a className="brand footer-brand" href="#top"><span className="brand-mark" aria-hidden="true"><i /><i /></span><span>CareBridge</span></a><span>Global healthcare. Trusted care. Smarter costs.</span></div><small>{ALLOW_DEMO_CATALOG ? "Development environment · Synthetic data only" : "CareBridge · Specialist consultations"}</small></footer>

      {selectedDoctor && <SpecialistDialog doctor={selectedDoctor} live={apiState === "connected"} onClose={() => setSelectedDoctor(null)} />}
    </main>
  );
}
