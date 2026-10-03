import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DEFAULT_TIMEZONE, SUPPORTED_TIMEZONES } from "@/lib/time";

export function CourseFields({ defaults }: { defaults?: { code: string; title: string; term: string; timezone: string } }) {
  // A course created before the timezone list was narrowed keeps its own zone as an option.
  const zones: { id: string; label: string }[] = SUPPORTED_TIMEZONES.map((t) => ({ id: t.id, label: t.label }));
  if (defaults?.timezone && !zones.some((z) => z.id === defaults.timezone)) zones.push({ id: defaults.timezone, label: defaults.timezone });
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor="code">Course code</Label>
          <Input id="code" name="code" placeholder="CS 350" defaultValue={defaults?.code} required maxLength={40} />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="title">Title</Label>
          <Input id="title" name="title" placeholder="Operating Systems" defaultValue={defaults?.title} required maxLength={200} />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="term">Term</Label>
          <Input id="term" name="term" placeholder="Fall 2026" defaultValue={defaults?.term} required maxLength={60} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="timezone">Timezone</Label>
          <select
            id="timezone"
            name="timezone"
            defaultValue={defaults?.timezone ?? DEFAULT_TIMEZONE}
            className="h-8 w-full rounded-lg border bg-background px-2 text-sm"
          >
            {zones.map((z) => (
              <option key={z.id} value={z.id}>
                {z.label}
              </option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground">Every time in the course is shown in this timezone. More timezones are coming.</p>
        </div>
      </div>
    </>
  );
}
