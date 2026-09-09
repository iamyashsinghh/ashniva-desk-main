# incidents

**Owns:** The urgent incident workflow — something is broken right now. Emergency production fixes behind a senior's written approval, the append-only timeline, links to the tickets, tasks and releases involved, and the client summary somebody writes and somebody publishes.

**Entities:** incidents, incident_timeline_entries, incident_links

**Endpoints:** GET|POST /incidents · GET|PATCH /incidents/:id · POST /incidents/:id/{request-emergency-fix,approve-emergency-fix,resolve,close,links,notes,publish-client-summary}

**Rules:**

- **Internal only.** An incident names what broke, who was affected and which release did it.
  There is no portal counterpart and no mapper that could build one.
- **The client summary is the one exception, and it is a person's decision twice over.** Saving it
  stores a draft that reaches nobody; publishing is a separate call that sets
  `clientSummaryPublishedAt`, writes a timeline entry and audits the exact wording.
- **The emergency-fix gate lives in `emergency-fix.service.ts`.** Requested once per incident,
  decided only by `incident:approve-emergency-fix`, and a reason is required for either answer.
- **The timeline is append-only.** `NOTE` is the only kind a person writes; every other entry is
  written by the service when the thing it names actually happened, so a timeline cannot claim a
  state change the incident never made.
