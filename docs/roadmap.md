# Roadmap: usability & utility

Planned improvements, in build order. Each item has an ID so commits and tests can refer to it. When an item ships, remove it from here and update [user-journeys.md](user-journeys.md) and [business-rules.md](business-rules.md).

Priority: **P1** a user can bypass a rule, get stuck, or end up with wrong data · **P2** a real task is missing or awkward · **P3** polish.

Finished work is removed from this file. What shipped is described in [user-journeys.md](user-journeys.md) and [business-rules.md](business-rules.md), and git history has the details (phases 1–4 merged on 2026-09-25).

## Next: check with users

Run short task-based sessions with the seed accounts: book, reschedule, cancel then rebook, run a demo day, mark and submit, review. Record task success, errors and time taken. Turn what you find into new roadmap items.

## Proposed: notifications and calendar (needs a decision)

Feedback (2026-10-02): a subscribed feed is awkward, but per-demo calendar entries plus emails plus push could flood people with the same reminder. Proposal, one channel per purpose:

| Purpose | In-app | Push (if the device opted in) | Email | Calendar |
|---|---|---|---|---|
| Something to keep (booked, moved, cancelled, marks released) | yes | yes | yes | the booking emails carry an `.ics` invite (same UID, rising `SEQUENCE`; `METHOD:CANCEL` on cancel), so the calendar entry updates itself and no separate "add to calendar" step is needed |
| 24 h reminder | yes | — | yes (opt-out) | the calendar's own alert covers it |
| 1 h reminder | yes | yes | only when the student has no push device | — |
| Staff housekeeping (requests, returns) | yes | yes | daily digest instead of one email each | — |

Needs: outbox emails with attachments, and an opt-in for the invites. Until then *Add to calendar* (Google, Outlook, `.ics`) is offered on each booking and calendar sync shows as *coming soon*.

## Coming soon (shown disabled in the UI)

- Calendar sync (above).
- Google Meet links created automatically for online venues.
- More course timezones (only Pakistan time today).

## Open issues

- **Intermittent e2e timeout.** Once, the instructor test timed out on a page load after the service worker arrived (it passed on rerun). Watch for it; if it recurs, suspect `waitForLoadState("networkidle")` in `tests/e2e/helpers.ts` together with SW registration.
- **E2E now runs on a production build** (`next build && next start`, see `playwright.config.ts`). Under `next dev`, Fast Refresh from on-demand compiling sometimes dropped the page refresh after an action in multi-browser tests. `/dev/mail` is enabled there through `ENABLE_DEV_MAIL=1`.
