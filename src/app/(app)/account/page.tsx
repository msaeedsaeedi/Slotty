import { CalendarSync, Video } from "lucide-react";
import { changePasswordAction, setEmailPreferencesAction, setTimeFormatAction, signOutOthersAction, updateProfileAction } from "@/app/actions/account";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { PageHeader } from "@/components/page-header";
import { PushToggle } from "@/components/pwa";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DEFAULT_TIMEZONE, fmtTime, SUPPORTED_TIMEZONES } from "@/lib/time";
import { requireUser } from "@/server/auth/session";
import { vapidPublicKey } from "@/server/push-config";
import { getAccount } from "@/server/services/accounts";
import { myRoleKinds } from "@/server/services/courses";
import { countPushDevices } from "@/server/services/push";
import { PasswordFields } from "../../(auth)/password-fields";

export const metadata = { title: "Account" };

/**
 * Settings, trimmed to the user's roles: students see demo reminders, staff see
 * their morning agenda, admins see neither (they don't take or run demos).
 */
export default async function AccountPage() {
  const user = await requireUser();
  const [account, pushDevices, roles] = await Promise.all([getAccount(user), countPushDevices(user), myRoleKinds(user)]);
  const otherSessions = Math.max(0, account._count.sessions - 1);
  const student = !user.isAdmin && roles.student;
  const staff = !user.isAdmin && roles.staff;
  const sample = new Date(Date.UTC(2026, 0, 1, 9, 30)); // 14:30 in Pakistan

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader title="Account" description={`${account.email}${user.isAdmin ? " · Administrator" : ""}`} />

      <Card>
        <CardHeader>
          <CardTitle>Your name</CardTitle>
          <CardDescription>{user.isAdmin ? "Shown in the audit log and on emails you trigger." : "Shown to course staff and on demo schedules."}</CardDescription>
        </CardHeader>
        <CardContent>
          <ActionForm action={updateProfileAction} className="flex flex-wrap items-end gap-2">
            <div className="min-w-0 flex-1 space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input id="name" name="name" defaultValue={account.name} required maxLength={120} autoComplete="name" />
            </div>
            <SubmitButton>Save</SubmitButton>
          </ActionForm>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Time</CardTitle>
          <CardDescription>
            Times are shown in {SUPPORTED_TIMEZONES.find((t) => t.id === DEFAULT_TIMEZONE)?.label}. Other timezones are coming.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ActionForm action={setTimeFormatAction} className="flex flex-wrap items-center gap-4 text-sm">
            <fieldset className="flex flex-wrap gap-4">
              <legend className="sr-only">Clock</legend>
              <label className="flex items-center gap-2">
                <input type="radio" name="timeFormat" value="H12" defaultChecked={account.timeFormat === "H12"} /> 12-hour ({fmtTime(sample, DEFAULT_TIMEZONE, "12h")})
              </label>
              <label className="flex items-center gap-2">
                <input type="radio" name="timeFormat" value="H24" defaultChecked={account.timeFormat === "H24"} /> 24-hour ({fmtTime(sample, DEFAULT_TIMEZONE, "24h")})
              </label>
            </fieldset>
            <SubmitButton variant="outline" size="sm">
              Save
            </SubmitButton>
          </ActionForm>
        </CardContent>
      </Card>

      {(student || staff) && (
        <Card>
          <CardHeader>
            <CardTitle>Email</CardTitle>
            <CardDescription>
              {student && "Booking confirmations, changes made by staff and released marks are always emailed. "}
              Everything also appears under Notifications.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ActionForm action={setEmailPreferencesAction} className="space-y-3 text-sm">
              {student && (
                <label className="flex items-center gap-2">
                  <input type="hidden" name="emailRemindersShown" value="1" />
                  <input type="checkbox" name="emailReminders" defaultChecked={account.emailReminders} /> Reminders before my demos (a day before and an hour before)
                </label>
              )}
              {staff && (
                <label className="flex items-center gap-2">
                  <input type="hidden" name="emailAgendaShown" value="1" />
                  <input type="checkbox" name="emailAgenda" defaultChecked={account.emailAgenda} /> Morning agenda of the demos I&apos;m running that day
                </label>
              )}
              <SubmitButton variant="outline" size="sm">
                Save
              </SubmitButton>
            </ActionForm>
          </CardContent>
        </Card>
      )}

      {(student || staff) && (
        <Card>
          <CardHeader>
            <CardTitle>Notifications on this device</CardTitle>
            <CardDescription>
              {student ? "Reminders and booking changes" : "New requests and changes to your demos"} as phone or desktop notifications, even when Slotty
              isn&apos;t open.
              {pushDevices > 0 && ` On for ${pushDevices} device${pushDevices === 1 ? "" : "s"}.`} Signing out of a device turns them off there.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <PushToggle publicKey={vapidPublicKey()} />
          </CardContent>
        </Card>
      )}

      {(student || staff) && (
        <Card aria-disabled className="opacity-80">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarSync className="size-4" /> Calendar sync <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-normal text-muted-foreground">Coming soon</span>
            </CardTitle>
            <CardDescription>
              Your demos will appear in Google or Outlook Calendar and update themselves when a booking changes.
              {student && " Until then, use “Add to calendar” on any booked demo."}
            </CardDescription>
          </CardHeader>
          {staff && (
            <CardContent className="flex items-center gap-2 text-sm text-muted-foreground">
              <Video className="size-4" /> Automatic Google Meet links for online venues are coming too.
            </CardContent>
          )}
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Password</CardTitle>
          <CardDescription>Changing your password signs you out on your other devices.</CardDescription>
        </CardHeader>
        <CardContent>
          <ActionForm action={changePasswordAction} resetOnSuccess className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="current">Current password</Label>
              <Input id="current" name="current" type="password" autoComplete="current-password" required />
            </div>
            <PasswordFields />
            <SubmitButton>Change password</SubmitButton>
          </ActionForm>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Devices</CardTitle>
          <CardDescription>
            {otherSessions === 0 ? "You're only signed in here." : `You're signed in on ${otherSessions} other device${otherSessions === 1 ? "" : "s"} or browser${otherSessions === 1 ? "" : "s"}.`}
          </CardDescription>
        </CardHeader>
        {otherSessions > 0 && (
          <CardContent>
            <ActionForm action={signOutOthersAction} compact confirm="Sign out everywhere except this browser?">
              <SubmitButton variant="outline" size="sm">
                Sign out other devices
              </SubmitButton>
            </ActionForm>
          </CardContent>
        )}
      </Card>
    </div>
  );
}
