# UAT checklist

User acceptance testing: the business confirming Ashniva Desk does what it is supposed to do,
on staging, before it goes to customers.

This is not a repeat of the automated tests. Those prove the code does what it was written to do.
This proves the product does what the business needs — which is a different question, and only a
person who does the job can answer it.

Run it on the staging environment prepared by `staging-checklist.md`.

---

## How to run it

- **Who:** somebody who actually does the job. A director for the director's screens, a support
  executive for support's, a real client contact for the portal. Not a developer.
- **How:** the tester follows the scenario in their own words and says whether it worked. They do
  not read the code and are not told where the buttons are.
- **Recording:** for each scenario, one of **pass**, **pass with a note**, or **fail**. A fail
  needs: what you did, what you expected, what happened, and the request id if an error was shown.
- **Blockers:** any Sev-1 or Sev-2 fail blocks the release. Everything else is a ticket.

---

## 1. Signing in and getting around

| | Scenario | Pass |
| --- | --- | --- |
| 1.1 | Sign in with your own account. You land somewhere useful, not a blank page | ☐ |
| 1.2 | The wrong password is refused, and does not say whether the email exists | ☐ |
| 1.3 | The navigation shows only what your role should see | ☐ |
| 1.4 | Sign out, then use the back button — you are not still signed in | ☐ |
| 1.5 | Leave the tab open for an hour and come back; you are still working, without signing in again | ☐ |

## 2. Raising and resolving a ticket

| | Scenario | Pass |
| --- | --- | --- |
| 2.1 | As a client, raise a ticket describing a real problem in your own words | ☐ |
| 2.2 | As support, you can see it, and it reached the right queue or person | ☐ |
| 2.3 | The priority and SLA shown match what you were promised commercially | ☐ |
| 2.4 | Reply to the client; they see the reply and nothing internal | ☐ |
| 2.5 | Add an internal note; the client cannot see it — check from the client's own login | ☐ |
| 2.6 | Convert it to a task, assign it, and the assignee is told | ☐ |
| 2.7 | Resolve it; the client is told and can confirm or reopen | ☐ |

## 3. Work as the people doing it experience it

| | Scenario | Pass |
| --- | --- | --- |
| 3.1 | A developer sees their own work and can tell what is due | ☐ |
| 3.2 | Start, log time against, and submit a task the way you actually would | ☐ |
| 3.3 | A reviewer can reject with a reason, and the developer sees the reason | ☐ |
| 3.4 | The daily report matches what the person actually did that day | ☐ |
| 3.5 | You cannot do things your role should not allow — and the refusal is understandable | ☐ |

## 4. Contracts, hours and money

| | Scenario | Pass |
| --- | --- | --- |
| 4.1 | A contract's purchased and remaining hours are right, and the arithmetic matches your own | ☐ |
| 4.2 | Logging work reduces the remaining hours as expected | ☐ |
| 4.3 | An invoice's figures, tax and totals are correct to the rupee | ☐ |
| 4.4 | The invoice PDF is something you would send a client without editing it | ☐ |
| 4.5 | A client sees their invoices and no other client's | ☐ |

## 5. The client portal

Run this with a real client contact, not an internal person pretending.

| | Scenario | Pass |
| --- | --- | --- |
| 5.1 | The words on screen make sense to somebody who does not work here | ☐ |
| 5.2 | Nothing internal is visible: estimates, costs, internal notes, other clients | ☐ |
| 5.3 | Raising a ticket, following it and answering a question all work without help | ☐ |
| 5.4 | An approval request is clear about what is being approved and what happens next | ☐ |
| 5.5 | Attachments upload and download | ☐ |

## 6. Notifications and messages

| | Scenario | Pass |
| --- | --- | --- |
| 6.1 | The things you need to know about produce a notification; the things you do not, do not | ☐ |
| 6.2 | Quiet hours are respected | ☐ |
| 6.3 | The email wording is something you are happy to have sent in your name | ☐ |
| 6.4 | Nothing arrives twice for one event | ☐ |
| 6.5 | The unread badge is right, and clears when you read it | ☐ |

## 7. Reports

| | Scenario | Pass |
| --- | --- | --- |
| 7.1 | The numbers match what you would count by hand for a small sample | ☐ |
| 7.2 | Filters and date ranges do what they say | ☐ |
| 7.3 | An export opens in Excel and has the columns you need | ☐ |

## 8. Living with it

| | Scenario | Pass |
| --- | --- | --- |
| 8.1 | It is usable on the screen you actually work on, including a laptop at 1366px | ☐ |
| 8.2 | It works in the browsers your team and your clients use | ☐ |
| 8.3 | Nothing takes so long that you would go and do something else | ☐ |
| 8.4 | Error messages tell you what to do, not what went wrong internally | ☐ |
| 8.5 | Branding — name, logo, colours — is right everywhere it appears, including in email | ☐ |

## 9. Deliberately awkward

Testers find what automated tests do not by being unreasonable.

| | Scenario | Pass |
| --- | --- | --- |
| 9.1 | Submit a form twice quickly. One thing happens, not two | ☐ |
| 9.2 | Use the back button in the middle of something | ☐ |
| 9.3 | Paste a very long description, and one with emoji and a non-Latin script | ☐ |
| 9.4 | Upload something odd: an empty file, a 20 MB file, a file whose extension lies | ☐ |
| 9.5 | Open the same record in two tabs and edit it in both | ☐ |
| 9.6 | Turn the network off mid-action and back on | ☐ |

---

## Sign-off

| | |
| --- | --- |
| Version tested | |
| Environment | staging |
| Dates | |
| Testers (name and role) | |
| Scenarios passed / total | |
| Blocking issues | |
| Non-blocking issues (ticket numbers) | |

> I have tested the scenarios above and accept this version for release to production.

| | |
| --- | --- |
| Name | |
| Role | |
| Date | |

Unsigned UAT is not UAT. If nobody will put their name to it, the question is why — and the answer
is usually a real problem.
