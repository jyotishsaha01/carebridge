# Patient care requests

Care requests are coordination records submitted by a patient and managed by administrators. They are separate from appointments, consultations, clinical care plans and payments.

| Stage | Coordination meaning |
| --- | --- |
| Requested | The patient submitted the request. |
| Reviewing | The operations team is reviewing the request. |
| Approved | The operations team accepted the request for coordination. This is not clinical approval. |
| Scheduled | The team recorded that arrangements have been made. Appointment booking remains a separate action. |
| Completed | Coordination for the request has been marked complete. |
| Cancelled | The request was cancelled or declined. |

Open request totals include Requested, Reviewing, Approved and Scheduled. Administrators can correct a stage or reopen a request. Every actual change is audited with its previous and saved values. The admin editor requires **Save status** and sends the loaded version; a concurrent change returns a conflict rather than overwriting another administrator's work. Refresh the request before retrying a stale edit.

The patient sees the saved stage in the Care hub. The tracker refreshes through authenticated notifications, on returning to the page, or using its refresh button. Notification preferences and delivery availability can affect live notifications; they do not undo a committed request or stage change. Requests and their successful audit records commit together. A notification failure is logged and separately audited.

Care requests currently have no doctor assignment. Changing a request stage does not give a doctor access to that patient, add work to a doctor's appointment queue, create a prescription or clinical plan, book a consultation, or collect payment. Doctors continue to use the existing authorized appointment and clinical workflows. Patients can read only their own requests; administration endpoints require the admin role.

The admin command center cards open operational details. Bounded lists state their limits; network totals can exceed the records displayed in a sample. Unread alerts count the signed-in administrator's inbox.
