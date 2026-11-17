import Link from "next/link";
import { CalendarCheck } from "lucide-react";
import { RAW_RETENTION_DAYS } from "@/domain/analytics";

export const metadata = { title: "Privacy and usage data" };

/** Plain-language notice for the usage data and feedback described in docs chapter 11. */
export default function PrivacyPage() {
  return (
    <main className="mx-auto w-full max-w-2xl flex-1 space-y-6 px-4 py-10 text-sm leading-relaxed">
      <Link href="/" className="flex items-center gap-2 text-lg font-semibold">
        <CalendarCheck className="size-5 text-primary" /> Slotty
      </Link>
      <h1 className="text-2xl font-semibold tracking-tight">Privacy and usage data</h1>
      <p>
        Slotty keeps the information it needs to run your course: your account, bookings, marks and the notifications it sends. This page covers
        the extra data it collects to find out what to improve.
      </p>

      <section className="space-y-2">
        <h2 className="text-base font-semibold">Usage data (on by default)</h2>
        <p>While you&apos;re signed in, Slotty records:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>which kind of page you open (for example &ldquo;an assignment page&rdquo;, never which one);</li>
          <li>how quickly pages load and respond on your device;</li>
          <li>the steps of booking, rescheduling and marking, and whether they succeeded;</li>
          <li>a few features you use, such as &ldquo;Add to calendar&rdquo;;</li>
          <li>your role (student, staff or admin), whether you&apos;re on a phone, tablet or computer, and the Slotty version.</li>
        </ul>
        <p>
          Your name, email and account id are not stored with it. Instead each person gets a code made from their account with a secret key, so we
          can count people without knowing who they are. Slotty doesn&apos;t store your IP address or browser details, uses no tracking cookies and
          sends nothing to other companies: the data stays in Slotty&apos;s own database.
        </p>
        <p>
          You can turn this off under <Link href="/account" className="underline underline-offset-2">Account → Usage data</Link>.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold">Errors</h2>
        <p>
          When something breaks on a page, Slotty records the error (with emails, links and long numbers removed) and the page type, even if usage
          data is off. If it is off, the error is stored without your code.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold">Feedback and quick surveys</h2>
        <p>
          The feedback button and the one-question surveys after booking or marking are anonymous: answers are stored without your account, with
          only your role, the page type and the Slotty version. That also means we can&apos;t reply, so please leave out personal details. Slotty
          remembers that you were asked a survey so it doesn&apos;t ask again for two weeks, but not what you answered.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold">How long it&apos;s kept, and who sees it</h2>
        <p>
          Individual events are deleted after {RAW_RETENTION_DAYS} days. Daily totals (for example &ldquo;120 people booked a demo on Monday&rdquo;)
          are kept for 13 months. Only the team that builds Slotty can see this data, in summary reports; course staff and administrators
          can&apos;t.
        </p>
      </section>
    </main>
  );
}
