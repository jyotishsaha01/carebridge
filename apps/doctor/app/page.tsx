"use client";

import { useEffect, useMemo, useState } from "react";

type Appointment = {
  id: string;
  scheduledAt: string;
  status: string;
  patient: { id: string; firstName: string | null; lastName: string | null; country: string };
  medicalIntake: {
    status: string;
    reasonForVisit: string | null;
    symptoms: string | null;
    allergies: string | null;
    medications: string | null;
  } | null;
  consultation: { id: string; status: string; startedAt: string | null; endedAt: string | null; summary: string | null } | null;
};

const demoAppointments: Appointment[] = [
  {
    id: "demo-appointment-1",
    scheduledAt: new Date(Date.now() + 86400000).toISOString(),
    status: "BOOKED",
    patient: { id: "demo-patient", firstName: "Demo", lastName: "Patient", country: "US" },
    medicalIntake: {
      status: "COMPLETED",
      reasonForVisit: "Knee pain and mobility concerns",
      symptoms: "Pain after walking and climbing stairs.",
      allergies: "None reported",
      medications: "Ibuprofen as needed",
    },
    consultation: null,
  },
];

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

function patientName(appointment: Appointment) {
  return [appointment.patient.firstName, appointment.patient.lastName].filter(Boolean).join(" ") || "Patient";
}

export default function DoctorPage() {
  const [appointments, setAppointments] = useState<Appointment[]>(demoAppointments);
  const [selectedId, setSelectedId] = useState(demoAppointments[0].id);
  const [summary, setSummary] = useState("");
  const [assessment, setAssessment] = useState("");
  const [findings, setFindings] = useState("");
  const [recommendations, setRecommendations] = useState("");
  const [message, setMessage] = useState("Demo data shown. Connect the local API to load real seeded appointments.");

  const selected = useMemo(
    () => appointments.find((appointment) => appointment.id === selectedId) ?? appointments[0],
    [appointments, selectedId],
  );

  useEffect(() => {
    let cancelled = false;
    fetch(`${API_URL}/v1/doctor/appointments`)
      .then((response) => {
        if (!response.ok) throw new Error("API unavailable");
        return response.json() as Promise<Appointment[]>;
      })
      .then((data) => {
        if (!cancelled && data.length > 0) {
          setAppointments(data);
          setSelectedId(data[0].id);
          setMessage("Connected to the CareBridge API.");
        }
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, []);

  async function changeConsultation(status: "IN_PROGRESS" | "COMPLETED") {
    if (!selected || selected.id.startsWith("demo-")) {
      setMessage("Start the local API with demo data to persist this action.");
      return;
    }
    const response = await fetch(`${API_URL}/v1/doctor/appointments/${selected.id}/consultation`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status, summary: summary || null }),
    });
    if (!response.ok) {
      setMessage("Unable to save consultation state.");
      return;
    }
    const consultation = await response.json();
    setAppointments((current) => current.map((item) => item.id === selected.id ? { ...item, consultation } : item));
    setMessage(status === "IN_PROGRESS" ? "Consultation started." : "Consultation completed.");
  }

  async function saveNote() {
    if (!selected?.consultation?.id) {
      setMessage("Start the consultation before saving clinical notes.");
      return;
    }
    const response = await fetch(`${API_URL}/v1/doctor/consultations/${selected.consultation.id}/note`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ assessment, findings, recommendations, privateNotes: null }),
    });
    setMessage(response.ok ? "Clinical note saved." : "Unable to save clinical note.");
  }

  if (!selected) return null;

  return (
    <div className="shell">
      <header className="topbar">
        <div>
          <div className="brand">CareBridge</div>
          <div className="role">Doctor Workspace</div>
        </div>
        <div className="role">Dr. Anil Sharma · Orthopedics</div>
      </header>

      <main className="content">
        <div className="eyebrow">Clinical workspace</div>
        <h1>Today&apos;s care</h1>
        <p className="subtitle">Review intake, run the consultation, and complete the clinical record.</p>

        <div className="grid">
          <section className="card">
            <h2>Appointment queue</h2>
            <div className="queue">
              {appointments.map((appointment) => (
                <button
                  key={appointment.id}
                  className={`queueItem ${appointment.id === selected.id ? "active" : ""}`}
                  onClick={() => setSelectedId(appointment.id)}
                >
                  <div className="row">
                    <span className="patient">{patientName(appointment)}</span>
                    <span className="badge">{appointment.consultation?.status ?? appointment.status}</span>
                  </div>
                  <div className="meta">
                    {new Date(appointment.scheduledAt).toLocaleString()} · {appointment.patient.country}
                  </div>
                </button>
              ))}
            </div>
          </section>

          <section className="card detail">
            <h2>{patientName(selected)}</h2>
            <div className="meta">Appointment {selected.id}</div>

            <div className="section">
              <span className="label">Medical intake</span>
              {selected.medicalIntake ? (
                <div className="note">
                  <strong>{selected.medicalIntake.reasonForVisit || "Reason not provided"}</strong><br />
                  Symptoms: {selected.medicalIntake.symptoms || "Not provided"}<br />
                  Allergies: {selected.medicalIntake.allergies || "Not provided"}<br />
                  Medications: {selected.medicalIntake.medications || "Not provided"}
                </div>
              ) : <div className="note">Medical intake has not been completed.</div>}
            </div>

            <div className="section">
              <label className="label" htmlFor="summary">Consultation summary</label>
              <textarea id="summary" value={summary} onChange={(event) => setSummary(event.target.value)} placeholder="Summary for the patient record" />
            </div>

            <div className="actions">
              <button className="button" onClick={() => changeConsultation("IN_PROGRESS")}>Start consultation</button>
              <button className="button secondary" onClick={() => changeConsultation("COMPLETED")}>Complete consultation</button>
            </div>

            <div className="section">
              <h2>Clinical assessment</h2>
              <label className="label" htmlFor="assessment">Assessment</label>
              <textarea id="assessment" value={assessment} onChange={(event) => setAssessment(event.target.value)} />
              <label className="label" htmlFor="findings">Findings</label>
              <textarea id="findings" value={findings} onChange={(event) => setFindings(event.target.value)} />
              <label className="label" htmlFor="recommendations">Recommendations</label>
              <textarea id="recommendations" value={recommendations} onChange={(event) => setRecommendations(event.target.value)} />
              <div className="actions">
                <button className="button" onClick={saveNote}>Save clinical note</button>
              </div>
            </div>

            <div className="section">
              <h2>Next steps</h2>
              <div className="actions">
                <button className="button secondary" onClick={() => setMessage("Prescription workspace is the next integrated action.")}>Prescription</button>
                <button className="button secondary" onClick={() => setMessage("Follow-up workspace is the next integrated action.")}>Follow-up</button>
              </div>
            </div>

            <div className="note">{message}</div>
          </section>
        </div>
      </main>
    </div>
  );
}
