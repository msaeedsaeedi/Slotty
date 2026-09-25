import { changePasswordAction, rotateCalendarAction, setEmailPreferencesAction, signOutOthersAction, updateProfileAction } from "@/app/actions/account";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { requireUser } from "@/server/auth/session";
import { getAccount } from "@/server/services/accounts";
import { calendarFeedUrl } from "@/server/services/calendar";
import { PasswordFields } from "../../(auth)/password-fields";

export const metadata = { title: "Account" };

export default async function AccountPage() {
  const user = await requireUser();
  const account = await getAccount(user);
  const otherSessions = Math.max(0, account._count.sessions - 1);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader title="Account" description={account.email} />

      <Card>
        <CardHeader>
          <CardTitle>Your name</CardTitle>
          <CardDescription>Shown to course staff and on demo schedules.</CardDescription>
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
          <CardTitle>Email</CardTitle>
          <CardDescription>
            Booking confirmations, changes by staff and released marks are always emailed. Everything also appears under Notifications.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ActionForm action={setEmailPreferencesAction} className="space-y-3 text-sm">
            <label className="flex items-center gap-2">
              <input type="checkbox" name="emailReminders" defaultChecked={account.emailReminders} /> Demo reminders (24 hours and 1 hour before)
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" name="emailAgenda" defaultChecked={account.emailAgenda} /> Morning agenda of the demos I&apos;m running (staff)
            </label>
            <SubmitButton variant="outline">Save preferences</SubmitButton>
          </ActionForm>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Calendar</CardTitle>
          <CardDescription>
            Subscribe from Google Calendar, Outlook or Apple Calendar to see your demos (and the demos you host) automatically. Keep this link private
            — anyone with it can see your schedule.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {account.calendarToken && (
            <Input readOnly value={calendarFeedUrl(account.calendarToken)} aria-label="Calendar subscription link" className="font-mono text-xs" />
          )}
          <ActionForm
            action={rotateCalendarAction}
            compact
            confirm={account.calendarToken ? "Create a new link? Calendars using the old link will stop updating." : undefined}
          >
            <SubmitButton variant="outline" size="sm">
              {account.calendarToken ? "Replace link" : "Create calendar link"}
            </SubmitButton>
          </ActionForm>
        </CardContent>
      </Card>

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
