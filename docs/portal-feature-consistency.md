# Portal feature consistency

Each portal uses authenticated, account-bound requests. A successful mutation updates the interface from its saved response. A subsequent refresh failure is reported separately and does not turn that successful save into an apparent failure. Refreshes preserve unsaved drafts; older responses cannot replace newer results.

## Operational controls

- Admin and doctor metrics open the relevant records or queue filter. Patient dashboard totals count the full owned data set; recent previews remain bounded.
- Patient appointment history is available at `/appointments`, with upcoming/all filters and twenty-record pages. The API is `GET /v1/patient/appointments?view=all&limit=20&offset=0`, scoped to the signed-in patient.
- Support settings require Save and send only changed settings plus the loaded `expectedUpdatedAt` version. Stale edits return 409. Changing status alone preserves the SLA; a real priority change recalculates it.
- Support submissions and replies reuse identical retries within thirty seconds. Saved tickets/messages and their audits commit together. Failed notification delivery is logged and audited separately.
- Admin support links can open a specific ticket beyond the queue preview. Conversations show the newest 200 messages in chronological order, and the newest 50 attachment records; attachment downloads remain authenticated.
- Care-plan progress requires Save on the detailed plan page. The Care hub task toggle applies its confirmed response immediately. Task edits support `expectedStatus` and `expectedUpdatedAt` and reject stale versions.
- Doctor queue and clinical-record refreshes preserve edited fields and refresh fields that were not edited. Unsaved entries remain tied to the selected appointment and must be saved before completion.
- Profile saves apply canonical server values. Notification preferences use the server's persisted type-to-boolean object, and unavailable settings do not default to enabled.

## Validation

Browser regressions cover detail navigation, preferences, explicit saves, retained drafts, service outages, stale conflicts, clinical refresh, support attachments, and successful mutations followed by failed refreshes. API tests inject audit and notification failures to verify rollback and commit boundaries. The synthetic cross-role UAT additionally exercises support deduplication, SLA preservation, task ownership/conflicts, appointment pagination, and availability creation/removal on SQLite and PostgreSQL.

These interface changes preserve the existing separation between coordination stages, appointment booking, clinical decisions, provider verification, and payment processing. Production hosting and external provider configuration remain governed by the deployment runbook.
