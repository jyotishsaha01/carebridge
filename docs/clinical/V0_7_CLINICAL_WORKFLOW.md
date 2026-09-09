# CareBridge v0.7 — Clinical workflow foundation

## Scope

This increment models the post-consultation clinical record without introducing real patient data or production identity credentials.

## Flow

Patient booking → medical intake → consultation → clinical assessment → prescription → consultation summary → follow-up.

## Core records

- Consultation: lifecycle/status for a booked clinical encounter.
- ClinicalNote: assessment, findings, recommendations and clinician note content.
- Prescription: issued prescription tied to a consultation.
- PrescriptionItem: medication/dose/instructions metadata.
- FollowUp: recommended follow-up timing and status.

## Security boundary

Production clinical records require authenticated users, server-side authorization, audit logging, encryption, retention policy and approved healthcare/privacy architecture. Local/demo environments use synthetic data only.

## Next implementation

Add doctor workspace APIs and UI for consultation completion, notes, prescriptions and follow-up, with patient read-only consultation summary access.
