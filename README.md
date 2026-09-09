# CareBridge

**Global Healthcare. Trusted Care. Smarter Costs.**

CareBridge is a Phase 1 healthcare platform for US patients seeking affordable specialist consultations through a trusted global provider network.

## Phase 1 MVP

- Patient application
- Doctor application
- Admin console
- Specialist discovery
- Transparent consultation cost comparison
- Appointment booking
- Secure medical information intake
- Video consultation
- Clinician notes and consultation summary
- Prescriptions/recommendations
- Follow-up care
- Messaging and notifications

Phase 2 (international treatment coordination) and Phase 3 (full medical travel/long-term care) are intentionally parked.

## Repository structure

```text
carebridge/
├── apps/
│   ├── patient/
│   ├── doctor/
│   └── admin/
├── services/
│   ├── api/
│   ├── worker/
│   └── notifications/
├── packages/
│   ├── ui/
│   ├── types/
│   ├── validation/
│   ├── api-client/
│   └── config/
├── database/
├── docs/
└── infrastructure/
```

## Current status

**v0.2 — Engineering Foundation**

The repository is being established incrementally. Real patient data must not be used in development. Healthcare/privacy/licensing/payment requirements must be validated before live use.
