import Link from "next/link";
import { SUPPORT_EMAIL, supportMailto } from "@/lib/site";

type Item = { q: string; a: React.ReactNode };

const mail = (subject: string) => (
  <a href={supportMailto(subject)} className="lp-link break-all">
    {SUPPORT_EMAIL}
  </a>
);

/* The answers are the original page's, word for word. The four most practical come first. */
const FIRST: Item[] = [
  {
    q: "How do I get an account?",
    a: "Slotty is invite-only. When your course staff add you to a course, you get an email from Slotty with a link to set your password. The link is valid for 14 days. After that, sign in with the same email.",
  },
  {
    q: "My invite expired, or never arrived.",
    a: (
      <>
        Check your spam folder first. Then use{" "}
        <Link href="/forgot-password" className="lp-link">
          Forgot password
        </Link>{" "}
        on the sign-in page with the email your staff used: if you haven&apos;t activated your account yet, it sends you a fresh invite. Still nothing?
        Ask your TA, or email {mail("Invite problem")}.
      </>
    ),
  },
  {
    q: "I'm signed in, but I can't see my course.",
    a: "A course appears once staff add you to it, using the email they have for you. If they used a different address (say, a personal one), ask them to add your university email, or sign in with the one they used.",
  },
  {
    q: "Can I change or cancel my booking?",
    a: "Usually, while booking is open. Each assignment sets how many changes you get and how close to the demo they lock, and the assignment page shows exactly what you have left. If you can't change it yourself, use “Ask course staff” on the same page.",
  },
];

const MORE: Item[] = [
  { q: "What timezone are the times in?", a: "Pakistan time (PKT). You can switch between a 12- and 24-hour clock on your account page." },
  {
    q: "Will I get a lot of notifications?",
    a: "No. You get one confirmation for your final booking, reminders 24 hours and 1 hour before, and a message when staff change something that affects you. You can turn off reminder emails and device notifications on your account page.",
  },
  {
    q: "Who sees my marks?",
    a: "You and your course staff. Students see marks only once they're released, and corrections to released marks are recorded. Slotty's admins, who run the platform, can open any course to help.",
  },
  {
    q: "How do I start using Slotty for my course?",
    a: (
      <>
        A TA can create a course and run it alone; a course with an instructor is set up by a Slotty admin. Email {mail("New course on Slotty")} with the course
        code, the term and who will run it.
      </>
    ),
  },
];

function Question({ item }: { item: Item }) {
  return (
    <details className="border-b border-[var(--line)]">
      <summary className="flex min-h-14 items-center justify-between gap-6 py-4 text-[17px] font-medium text-[var(--text)] sm:text-[18px]">
        {item.q}
        <span aria-hidden className="lp-mono w-4 shrink-0 text-center text-[18px] text-[var(--text-3)]">
          <span className="lp-plus">+</span>
          <span className="lp-minus">−</span>
        </span>
      </summary>
      <p className="max-w-[60ch] pb-5 text-[16px] text-pretty text-[var(--text-2)]">{item.a}</p>
    </details>
  );
}

export function Faq() {
  return (
    <section id="faq" aria-labelledby="faq-title" className="border-t border-[var(--line)] bg-[var(--panel)] py-20 sm:py-24">
      <div className="lp-container grid gap-10 lg:grid-cols-12">
        <div className="lg:col-span-4">
          <p className="lp-mono text-[11px] text-[var(--text-3)]">06 · FAQ</p>
          <h2 id="faq-title" className="lp-h2 mt-4">
            Questions people ask.
          </h2>
        </div>
        <div className="lp-faq border-t border-[var(--line)] lg:col-span-8">
          {FIRST.map((item) => (
            <Question key={item.q} item={item} />
          ))}
          <details className="lp-faq-more">
            <summary className="inline-flex min-h-11 items-center gap-2 py-4 text-[15px] text-[var(--text-2)] hover:text-[var(--text)]">
              <span className="lp-plus lp-mono">+</span>
              <span className="lp-minus lp-mono">−</span>
              More questions ({MORE.length})
            </summary>
            <div className="border-t border-[var(--line)]">
              {MORE.map((item) => (
                <Question key={item.q} item={item} />
              ))}
            </div>
          </details>
        </div>
      </div>
    </section>
  );
}
