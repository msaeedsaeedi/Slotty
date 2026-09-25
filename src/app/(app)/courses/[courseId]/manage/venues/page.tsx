import { createVenueAction, deleteVenueAction } from "@/app/actions/courses";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { EmptyState } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { requireUser } from "@/server/auth/session";
import { load } from "@/server/page-utils";
import { listVenues } from "@/server/services/courses";

export const metadata = { title: "Venues" };

export default async function VenuesPage({ params }: PageProps<"/courses/[courseId]/manage/venues">) {
  const { courseId } = await params;
  const user = await requireUser();
  const venues = await load(listVenues(user, courseId));
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <div className="space-y-3">
        <h2 className="text-lg font-semibold">Venues</h2>
        {venues.length === 0 ? (
          <EmptyState title="No venues yet">Add labs, rooms or an online meeting link. You can move slots between venues later.</EmptyState>
        ) : (
          <Card className="divide-y p-0">
            {venues.map((v) => (
              <div key={v.id} className="flex items-center gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{v.name}</p>
                  <p className="truncate text-sm text-muted-foreground">{[v.location, v.meetingUrl].filter(Boolean).join(" · ") || "—"}</p>
                </div>
                <ActionForm action={deleteVenueAction} compact confirm={`Delete ${v.name}?`}>
                  <input type="hidden" name="venueId" value={v.id} />
                  <SubmitButton variant="ghost" size="sm" className="text-destructive">
                    Delete
                  </SubmitButton>
                </ActionForm>
              </div>
            ))}
          </Card>
        )}
      </div>
      <Card className="h-fit">
        <CardHeader>
          <CardTitle>Add venue</CardTitle>
          <CardDescription>Students see the name, location and meeting link on their booking.</CardDescription>
        </CardHeader>
        <CardContent>
          <ActionForm action={createVenueAction} className="space-y-3" resetOnSuccess>
            <input type="hidden" name="courseId" value={courseId} />
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input id="name" name="name" placeholder="Lab 3" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="location">Location</Label>
              <Input id="location" name="location" placeholder="Engineering building, 2nd floor" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="meetingUrl">Meeting link (online)</Label>
              <Input id="meetingUrl" name="meetingUrl" type="url" placeholder="https://meet.example.com/abc" />
            </div>
            <SubmitButton>Add venue</SubmitButton>
          </ActionForm>
        </CardContent>
      </Card>
    </div>
  );
}
