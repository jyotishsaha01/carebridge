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

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

async function apiFetch<T>(path: string): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, { cache: "no-store" });
  if (!response.ok) throw new Error(`CareBridge API request failed: ${response.status}`);
  return response.json() as Promise<T>;
}

export function getSpecialties() {
  return apiFetch<Array<{ id: string; name: string }>>("/v1/specialties");
}

export function getDoctors(params: { specialty?: string; q?: string } = {}) {
  const search = new URLSearchParams();
  if (params.specialty) search.set("specialty", params.specialty);
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
