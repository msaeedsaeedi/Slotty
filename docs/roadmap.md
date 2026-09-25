# Roadmap: usability & utility

Planned improvements, in build order. Each item has an ID so commits and tests can refer to it. When an item ships, remove it from here and update [user-journeys.md](user-journeys.md) and [business-rules.md](business-rules.md).

Priority: **P1** a user can bypass a rule, get stuck, or end up with wrong data · **P2** a real task is missing or awkward · **P3** polish.

Finished work is removed from this file. What shipped is described in [user-journeys.md](user-journeys.md) and [business-rules.md](business-rules.md), and git history has the details (phases 1–4 merged on 2026-09-25).

## Next: check with users

Run short task-based sessions with the seed accounts: book, reschedule, cancel then rebook, run a demo day, mark and submit, review. Record task success, errors and time taken. Turn what you find into new roadmap items.

## Open issues

- **E2E `tests/e2e/support.spec.ts` is marked `fixme`.** Everything works up to the staff move: request sent, staff move, request auto-resolved. The last check fails because once a request is answered, the "Need help with your booking?" panel is collapsed, so the "Handled" badge is hidden. The panel now stays open for 7 days after a staff reply, which should fix this. Re-run the test and remove `fixme`.
- **Intermittent e2e timeout.** Once, the instructor test timed out on a page load after the service worker arrived (it passed on rerun). Watch for it; if it recurs, suspect `waitForLoadState("networkidle")` in `tests/e2e/helpers.ts` together with SW registration.
- **E2E now runs on a production build** (`next build && next start`, see `playwright.config.ts`). Under `next dev`, Fast Refresh from on-demand compiling sometimes dropped the page refresh after an action in multi-browser tests. `/dev/mail` is enabled there through `ENABLE_DEV_MAIL=1`.
