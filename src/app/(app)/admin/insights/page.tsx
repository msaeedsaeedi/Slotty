import { format } from "date-fns";
import { EmptyState } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FLOW_STEPS, type Flow } from "@/domain/analytics";
import { analyticsEnabled } from "@/server/analytics-config";
import { requireAdminUser } from "@/server/auth/session";
import { clientErrors, funnels, performance, RANGES, surveys, usageOverview, VITAL_GOOD, workflowMetrics, type RangeDays } from "@/server/services/insights";
import { FilterTabs, query } from "../filter-tabs";

export const metadata = { title: "Insights" };

const TABS = [
  ["overview", "Usage"],
  ["workflow", "Booking & marking"],
  ["funnels", "Funnels"],
  ["performance", "Speed"],
  ["errors", "Errors"],
  ["surveys", "Surveys"],
] as const;
type Tab = (typeof TABS)[number][0];

const FLOW_LABEL: Record<Flow, string> = { booking: "Book a demo (students)", reschedule: "Move a demo (students)", marking: "Submit marks (staff)" };
const STEP_LABEL = { view: "Saw the picker / sheet", submit: "Pressed submit", done: "Succeeded", error: "Got an error" } as const;

const pct = (n: number, of: number) => (of > 0 ? `${Math.round((n / of) * 100)}%` : "–");
const hours = (h: number | null | undefined) => (h == null ? "–" : h < 1 ? `${Math.round(h * 60)} min` : h < 48 ? `${h.toFixed(1)} h` : `${(h / 24).toFixed(1)} days`);
const vital = (metric: string, v: number) => (metric === "CLS" ? v.toFixed(2) : v >= 1000 ? `${(v / 1000).toFixed(2)} s` : `${Math.round(v)} ms`);

/** A proportional bar behind a number, so a column of counts reads at a glance. */
function Bar({ value, max, label }: { value: number; max: number; label?: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-24 shrink-0 overflow-hidden rounded-full bg-muted" aria-hidden>
        <div className="h-full rounded-full bg-primary/70" style={{ width: `${max > 0 ? Math.max(2, (value / max) * 100) : 0}%` }} />
      </div>
      <span className="tabular-nums">{label ?? value}</span>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <Card className="gap-1 p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-2xl font-semibold tabular-nums">{value}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </Card>
  );
}

export default async function InsightsPage({ searchParams }: PageProps<"/admin/insights">) {
  const sp = await searchParams;
  const tab: Tab = TABS.find(([t]) => t === sp.tab)?.[0] ?? "overview";
  const days: RangeDays = RANGES.find((d) => String(d) === sp.days) ?? 30;
  const user = await requireAdminUser();
  const href = (p: { tab?: string; days?: string }) => query("/admin/insights", { tab: p.tab ?? (tab === "overview" ? undefined : tab), days: p.days ?? (days === 30 ? undefined : String(days)) });

  return (
    <div className="space-y-4">
      {!analyticsEnabled() && tab !== "workflow" && tab !== "surveys" && (
        <p role="status" className="rounded-lg border bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">
          Usage analytics is off on this server (ANALYTICS_SECRET isn&apos;t set), so no new page or speed data is being recorded.
        </p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <FilterTabs label="Report" current={tab} options={TABS} hrefFor={(v) => href({ tab: v === "overview" ? "" : v })} />
        <FilterTabs label="Period" current={String(days)} options={RANGES.map((d) => [String(d), `${d} days`] as const)} hrefFor={(v) => href({ days: v === "30" ? "" : v })} />
      </div>
      {tab === "overview" && <Overview user={user} days={days} />}
      {tab === "workflow" && <Workflow user={user} days={days} />}
      {tab === "funnels" && <Funnels user={user} days={days} />}
      {tab === "performance" && <Performance user={user} days={days} />}
      {tab === "errors" && <Errors user={user} days={days} />}
      {tab === "surveys" && <Surveys user={user} days={days} />}
      <p className="text-xs text-muted-foreground">
        People are counted by a pseudonymous code; anyone who turned usage data off isn&apos;t counted. Raw events are kept 90 days, daily totals 13
        months.
      </p>
    </div>
  );
}

type Props = { user: Awaited<ReturnType<typeof requireAdminUser>>; days: RangeDays };

async function Overview({ user, days }: Props) {
  const o = await usageOverview(user, days);
  const maxDaily = Math.max(0, ...o.daily.map((d) => d.visitors));
  const maxViews = Math.max(0, ...o.pages.map((p) => p.views));
  return (
    <div className="space-y-4">
      <section aria-label="Totals" className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Active this week" value={o.activeWeek.reduce((a, r) => a + r.visitors, 0)} sub={o.activeWeek.map((r) => `${r.visitors} ${r.role}`).join(" · ") || "nobody yet"} />
        <Stat label={`People, ${days} days`} value={o.totals.visitors} />
        <Stat label={`Visits, ${days} days`} value={o.totals.sessions} sub="browser tabs" />
        <Stat label={`Page views, ${days} days`} value={o.totals.views} />
      </section>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">People per day</CardTitle>
        </CardHeader>
        <CardContent>
          {o.daily.length === 0 ? (
            <p className="text-sm text-muted-foreground">No visits recorded in this period.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {o.daily.map((d) => (
                <li key={d.day.toISOString()} className="flex items-center gap-3">
                  <span className="w-24 shrink-0 text-xs tabular-nums text-muted-foreground">{format(d.day, "EEE d MMM")}</span>
                  <Bar value={d.visitors} max={maxDaily} />
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Pages</CardTitle>
          <CardDescription>Most visited first; the bottom of the list shows what hardly anyone opens.</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Page</TableHead>
                <TableHead>Views</TableHead>
                <TableHead>People</TableHead>
                <TableHead>Roles</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {o.pages.map((p) => (
                <TableRow key={p.path}>
                  <TableCell className="font-mono text-xs">{p.path}</TableCell>
                  <TableCell>
                    <Bar value={p.views} max={maxViews} />
                  </TableCell>
                  <TableCell className="tabular-nums">{p.visitors}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{p.roles.join(", ")}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Features</CardTitle>
          </CardHeader>
          <CardContent>
            {o.features.length === 0 ? (
              <p className="text-sm text-muted-foreground">None used in this period.</p>
            ) : (
              <ul className="divide-y text-sm">
                {o.features.map((f) => (
                  <li key={`${f.feature}-${f.role}`} className="flex justify-between gap-2 py-1.5">
                    <span>
                      {f.feature.replaceAll("_", " ")} <span className="text-muted-foreground">({f.role})</span>
                    </span>
                    <span className="tabular-nums">
                      {f.uses} by {f.visitors}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Last 13 months</CardTitle>
            <CardDescription>From the daily totals.</CardDescription>
          </CardHeader>
          <CardContent>
            {o.trend.length === 0 ? (
              <p className="text-sm text-muted-foreground">The first daily totals appear the day after events arrive.</p>
            ) : (
              <ul className="divide-y text-sm">
                {o.trend.map((m) => (
                  <li key={m.month.toISOString()} className="flex justify-between gap-2 py-1.5">
                    <span>{format(m.month, "MMM yyyy")}</span>
                    <span className="tabular-nums text-muted-foreground">
                      {m.views ?? 0} views · {m.avgDaily ?? 0} people a day
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

async function Workflow({ user, days }: Props) {
  const w = await workflowMetrics(user, days);
  const c = w.changes;
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">From bookings, requests and marks themselves, so everyone is counted (usage data settings don&apos;t apply).</p>
      <section aria-label="Booking" className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Bookings made" value={w.bookings.created} sub={`${w.staffPlacements} placed by staff`} />
        <Stat label="Reschedules" value={c.reschedules} sub={`${pct(c.reschedules, w.bookings.created)} of bookings`} />
        <Stat label="Cancelled by student" value={c.cancellations} sub={`${c.quickRebooks} rebooked within 30 min`} />
        <Stat label="Cancelled by staff" value={c.staffCancels} />
        <Stat label="No-shows" value={w.bookings.noShows} sub={`${pct(w.bookings.noShows, w.bookings.demos)} of ${w.bookings.demos} demos held`} />
        <Stat label="Waitlist joins" value={w.waitlist.joined} sub={`${pct(w.waitlist.booked, w.waitlist.joined)} then booked`} />
        <Stat
          label="Booking-change requests"
          value={w.bookingRequests.total}
          sub={`${w.bookingRequests.declined} declined · ${w.bookingRequests.open} open · answered in ${hours(w.bookingRequests.medianHours)} (median)`}
        />
        <Stat label="Mark queries" value={w.markQueries.total} sub={`${w.markQueries.open} open · answered in ${hours(w.markQueries.medianHours)}`} />
      </section>
      <section aria-label="Marking" className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Marks submitted" value={w.marking.submitted ?? 0} />
        <Stat label="Demo → marks submitted" value={hours(w.marking.medianHours)} sub={`median · 90% within ${hours(w.marking.p90Hours)}`} />
        <Stat label="Marks unlocked to edit" value={w.marking.unlocks} sub={`${pct(w.marking.unlocks, w.marking.submitted ?? 0)} of submissions`} />
        <Stat label="Unusual marks" value={w.marking.early + w.marking.noBooking} sub={`${w.marking.early} before the demo · ${w.marking.noBooking} without a booking`} />
      </section>
      <p className="text-xs text-muted-foreground">
        A reschedule is a student moving their own booking. &ldquo;Rebooked within 30 min&rdquo; is a cancellation followed by a new booking
        shortly after, which often means the reschedule option wasn&apos;t found.
      </p>
    </div>
  );
}

async function Funnels({ user, days }: Props) {
  const rows = await funnels(user, days);
  const all = rows.filter((r) => r.device === "all");
  if (all.every((r) => r.counts.view + r.counts.submit === 0)) return <EmptyState title="No funnel steps recorded in this period" />;
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {all.map((f) => {
        const devices = rows.filter((r) => r.flow === f.flow && r.device !== "all");
        return (
          <Card key={f.flow}>
            <CardHeader>
              <CardTitle className="text-base">{FLOW_LABEL[f.flow]}</CardTitle>
              <CardDescription>Visits reaching each step</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <ul className="space-y-1.5">
                {FLOW_STEPS.map((step) => (
                  <li key={step} className="flex items-center justify-between gap-2">
                    <span>{STEP_LABEL[step]}</span>
                    <Bar value={f.counts[step]} max={Math.max(f.counts.view, f.counts.submit)} label={`${f.counts[step]} (${pct(f.counts[step], f.counts.view || f.counts.submit)})`} />
                  </li>
                ))}
              </ul>
              {devices.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  Success by device: {devices.map((d) => `${d.device} ${pct(d.counts.done, d.counts.view || d.counts.submit)}`).join(" · ")}
                </p>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

async function Performance({ user, days }: Props) {
  const p = await performance(user, days);
  if (p.byDevice.length === 0) return <EmptyState title="No speed measurements in this period" />;
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Core Web Vitals (75th percentile)</CardTitle>
          <CardDescription>
            Three in four page loads are at least this fast. Good is under {vital("LCP", VITAL_GOOD.LCP)} to show the page (LCP), under{" "}
            {vital("INP", VITAL_GOOD.INP)} to react to a tap (INP) and under {VITAL_GOOD.CLS} layout shift (CLS).
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Metric</TableHead>
                <TableHead>Device</TableHead>
                <TableHead>p75</TableHead>
                <TableHead>Rated good</TableHead>
                <TableHead>Samples</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {p.byDevice.map((r) => (
                <TableRow key={`${r.metric}-${r.device}`}>
                  <TableCell className="font-medium">{r.metric}</TableCell>
                  <TableCell>{r.device}</TableCell>
                  <TableCell className={r.p75 > VITAL_GOOD[r.metric] ? "font-medium text-amber-700 dark:text-amber-400" : undefined}>
                    {vital(r.metric, r.p75)}
                    {r.p75 > VITAL_GOOD[r.metric] && " (slow)"}
                  </TableCell>
                  <TableCell className="tabular-nums">{pct(r.good, r.samples)}</TableCell>
                  <TableCell className="tabular-nums">{r.samples}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      {p.slowRoutes.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Slowest pages to show (LCP p75, 5+ samples)</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y text-sm">
              {p.slowRoutes.map((r) => (
                <li key={`${r.path}-${r.device}`} className="flex justify-between gap-2 py-1.5">
                  <span className="font-mono text-xs">
                    {r.path} <span className="font-sans text-muted-foreground">({r.device})</span>
                  </span>
                  <span className="tabular-nums">{vital("LCP", r.p75)}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

async function Errors({ user, days }: Props) {
  const rows = await clientErrors(user, days);
  if (rows.length === 0) return <EmptyState title="No errors reported in this period" />;
  return (
    <Card className="p-0">
      <ul className="divide-y text-sm">
        {rows.map((e) => (
          <li key={`${e.kind}-${e.message}`} className="space-y-1 px-4 py-3">
            <p className="font-mono text-xs break-words">{e.message || "(no message)"}</p>
            <p className="text-xs text-muted-foreground">
              {e.count} time{e.count === 1 ? "" : "s"} in {e.sessions} visit{e.sessions === 1 ? "" : "s"} · {e.kind} · last {format(e.lastSeen, "d MMM, HH:mm")} ·{" "}
              {e.paths.join(", ")} · version {e.versions.join(", ")}
            </p>
          </li>
        ))}
      </ul>
    </Card>
  );
}

async function Surveys({ user, days }: Props) {
  const rows = await surveys(user, days);
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {rows.map((s) => {
        const max = Math.max(0, ...s.distribution);
        return (
          <Card key={s.prompt}>
            <CardHeader>
              <CardTitle className="text-base">{s.question}</CardTitle>
              <CardDescription>
                {s.average == null ? "No answers yet" : `Average ${s.average.toFixed(1)} of 5`} · asked {s.shown} · answered {s.answered} · dismissed {s.dismissed}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-1 text-sm">
                {s.distribution.map((n, i) => (
                  <li key={i} className="flex items-center gap-3">
                    <span className="w-28 shrink-0 text-xs text-muted-foreground">
                      {i + 1} · {["Very hard", "Hard", "OK", "Easy", "Very easy"][i]}
                    </span>
                    <Bar value={n} max={max} />
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
