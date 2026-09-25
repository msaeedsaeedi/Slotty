import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const COMMON_TIMEZONES = Intl.supportedValuesOf("timeZone");

export function CourseFields({ defaults }: { defaults?: { code: string; title: string; term: string; timezone: string } }) {
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor="code">Course code</Label>
          <Input id="code" name="code" placeholder="CS 350" defaultValue={defaults?.code} required />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="title">Title</Label>
          <Input id="title" name="title" placeholder="Operating Systems" defaultValue={defaults?.title} required />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="term">Term</Label>
          <Input id="term" name="term" placeholder="Fall 2026" defaultValue={defaults?.term} required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="timezone">Timezone</Label>
          <Input id="timezone" name="timezone" list="timezones" defaultValue={defaults?.timezone} required />
          <datalist id="timezones">
            {COMMON_TIMEZONES.map((tz) => (
              <option key={tz} value={tz} />
            ))}
          </datalist>
          <p className="text-xs text-muted-foreground">All slot times are shown in this timezone.</p>
        </div>
      </div>
    </>
  );
}
