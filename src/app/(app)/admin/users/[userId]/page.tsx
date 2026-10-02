import Link from "next/link";
import { format, formatDistanceToNowStrict } from "date-fns";
import { sendAccessEmailAction, setAdminAction, setDisabledAction, updateUserAction } from "@/app/actions/admin";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { fmt } from "@/lib/time";
import { requireAdminUser } from "@/server/auth/session";
import { load } from "@/server/page-utils";
import { adminGetUser } from "@/server/services/admin";
import { AuditSentence } from "../../audit-text";

export const metadata = { title: "User" };

const when = (d: Date) => format(d, "d MMM yyyy, HH:mm");

export default async function AdminUserPage({ params }: PageProps<"/admin/users/[userId]">) {
  const { userId } = await params;
  const admin = await requireAdminUser();
  const d = await load(adminGetUser(admin, userId));
  const { user } = d;
  const self = user.id === admin.id;
  const disabled = user.status === "DISABLED";

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PageHeader
        title={user.name}
        description={user.email}
        back={{ href: "/admin/users", label: "Users" }}
        actions={
          <>
            {user.isAdmin && <StatusBadge status="ADMIN" label="Admin" tone="info" />}
            <StatusBadge status={user.status} />
          </>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Account</CardTitle>
          <CardDescription>
            Joined {when(user.createdAt)}
            {user.status === "ACTIVE" &&
              (d.sessions.lastSignIn ? ` · last signed in ${formatDistanceToNowStrict(d.sessions.lastSignIn, { addSuffix: true })}` : " · not signed in on any device")}
            {d.invite && user.status === "INVITED" && ` · invite sent ${formatDistanceToNowStrict(d.invite.sentAt, { addSuffix: true })}${d.invite.expired ? " (expired)" : ""}`}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <ActionForm action={updateUserAction} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <input type="hidden" name="userId" value={user.id} />
            <div className="space-y-1">
              <Label htmlFor="name">Name</Label>
              <Input id="name" name="name" defaultValue={user.name} required maxLength={120} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" defaultValue={user.email} required readOnly={user.status !== "INVITED"} aria-describedby="email-hint" />
            </div>
            <SubmitButton variant="outline">Save</SubmitButton>
            <p id="email-hint" className="text-xs text-muted-foreground sm:col-span-3">
              {user.status === "INVITED"
                ? "Fixing a typo in the email sends a new invite to the corrected address."
                : "The email can't be changed here once the account is active (it's how they sign in)."}
            </p>
          </ActionForm>

          <div className="flex flex-wrap gap-2 border-t pt-4">
            {!disabled && (
              <ActionForm action={sendAccessEmailAction} compact>
                <input type="hidden" name="userId" value={user.id} />
                <SubmitButton variant="outline" size="sm">
                  {user.status === "INVITED" ? "Resend invite" : "Send password reset"}
                </SubmitButton>
              </ActionForm>
            )}
            {!self && (
              <ActionForm
                action={setAdminAction}
                compact
                confirm={user.isAdmin ? `Remove admin rights from ${user.name}?` : `Make ${user.name} an admin? They'll be able to manage every user and course.`}
                confirmLabel={user.isAdmin ? "Remove admin" : "Make admin"}
              >
                <input type="hidden" name="userId" value={user.id} />
                <input type="hidden" name="isAdmin" value={user.isAdmin ? "false" : "true"} />
                <SubmitButton variant="outline" size="sm">
                  {user.isAdmin ? "Remove admin" : "Make admin"}
                </SubmitButton>
              </ActionForm>
            )}
            {!self && (
              <ActionForm
                action={setDisabledAction}
                compact
                className="flex flex-wrap items-center gap-2"
                confirm={disabled ? undefined : `Disable ${user.name}? They'll be signed out everywhere and can't sign in until re-enabled.`}
                confirmLabel="Disable account"
              >
                <input type="hidden" name="userId" value={user.id} />
                <input type="hidden" name="disabled" value={disabled ? "false" : "true"} />
                {!disabled && d.bookings.length > 0 && (
                  <label className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <input type="checkbox" name="releaseBookings" defaultChecked /> also release their {d.bookings.length} upcoming booking{d.bookings.length === 1 ? "" : "s"}
                  </label>
                )}
                <SubmitButton variant={disabled ? "outline" : "destructive"} size="sm">
                  {disabled ? "Enable account" : "Disable account"}
                </SubmitButton>
              </ActionForm>
            )}
          </div>
          {!disabled && d.hostingUpcoming > 0 && (
            <p className="text-xs text-muted-foreground">
              Hosts {d.hostingUpcoming} upcoming slot{d.hostingUpcoming === 1 ? "" : "s"}. Before disabling, ask the course staff to hand them to another host.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Courses</CardTitle>
        </CardHeader>
        <CardContent>
          {user.enrollments.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Not in any course.{user.isAdmin ? " Admins manage courses without joining them." : " Course staff add people from a course's People page."}
            </p>
          ) : (
            <ul className="divide-y text-sm">
              {user.enrollments.map((e) => (
                <li key={e.id} className="flex items-center justify-between gap-3 py-2">
                  <Link href={`/courses/${e.course.id}/manage`} className="hover:underline">
                    {e.course.code} — {e.course.title} <span className="text-muted-foreground">({e.course.term})</span>
                  </Link>
                  <span className="flex gap-1">
                    {e.course.archived && <StatusBadge status="ARCHIVED" label="Archived" />}
                    <StatusBadge status={e.role} />
                  </span>
                </li>
              ))}
            </ul>
          )}
          {d.bookings.length > 0 && (
            <div className="mt-4 border-t pt-3">
              <p className="mb-1 text-sm font-medium">Upcoming demos</p>
              <ul className="space-y-1 text-sm text-muted-foreground">
                {d.bookings.map((b) => (
                  <li key={b.id}>
                    {fmt(b.slot.startsAt, b.assignment.course.timezone, "EEE d MMM, HH:mm")} · {b.assignment.course.code} {b.assignment.title}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">History</CardTitle>
          <CardDescription>Changes made to this account, and what they&apos;ve changed recently.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6 text-sm md:grid-cols-2">
          <HistoryList title="Done to this account" entries={d.history.map((e) => ({ ...e, entityName: user.name }))} />
          <HistoryList title={`Done by ${user.name.split(" ")[0]}`} entries={d.actions.map((e) => ({ ...e, actor: { name: user.name }, entityName: null }))} />
        </CardContent>
      </Card>
    </div>
  );
}

function HistoryList({
  title,
  entries,
}: {
  title: string;
  entries: { id: string; createdAt: Date; action: string; entityType: string; entityId: string; entityName: string | null; actor: { name: string } | null }[];
}) {
  return (
    <div>
      <p className="mb-2 font-medium">{title}</p>
      {entries.length === 0 ? (
        <p className="text-muted-foreground">Nothing yet.</p>
      ) : (
        <ul className="space-y-1.5">
          {entries.map((e) => (
            <li key={e.id}>
              <AuditSentence entry={e} /> <span className="text-xs text-muted-foreground">· {when(e.createdAt)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
