export type ApiDoctor = {
  id: string;
  name: string;
  initials: string;
  specialty: string;
  location: string;
  rating: number;
  experience: number;
  price: number;
  usLow: number | null;
  usHigh: number | null;
  expertise: string[];
  bio: string;
  verified: boolean;
};

export type ApiSlot = {
  id: string;
  startsAt: string;
  endsAt: string;
  timezone: string;
};

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, { ...init, cache: "no-store" });
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { error?: string } | null;
    throw new Error(body?.error ?? `CareBridge API request failed: ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export function getSpecialties() {
  return apiFetch<Array<{ id: string; name: string }>>("/v1/specialties");
}

export function getDoctors(params: { specialty?: string; q?: string } = {}) {
  const search = new URLSearchParams();
  if (params.specialty && params.specialty !== "All specialties") search.set("specialty", params.specialty);
  if (params.q) search.set("q", params.q);
  const suffix = search.toString() ? `?${search.toString()}` : "";
  return apiFetch<ApiDoctor[]>(`/v1/doctors${suffix}`);
}

export function getDoctor(slug: string) {
  return apiFetch<ApiDoctor & { costComparison: {
    patientCountry: string;
    comparableLowUsd: number;
    comparableHighUsd: number;
    sourceLabel: string;
    disclaimer: string;
  } | null }>(`/v1/doctors/${slug}`);
}

export function getAvailability(slug: string, from: Date, to: Date) {
  const search = new URLSearchParams({ from: from.toISOString(), to: to.toISOString() });
  return apiFetch<ApiSlot[]>(`/v1/doctors/${slug}/availability?${search.toString()}`);
}

export function bookAppointment(doctorSlug: string, scheduledAt: string) {
  return apiFetch<{ id: string; scheduledAt: string; durationMin: number; status: string }>("/v1/appointments", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-demo-patient-email": "demo-patient@demo.carebridge.local",
    },
    body: JSON.stringify({ doctorSlug, scheduledAt, durationMin: 30 }),
  });
}
