/**
 * Public facts about this Slotty deployment, shown on the landing page, the sign-in pages and in
 * invite emails. The support address forwards to the product owner (infra/aws/app/support-mail.tf).
 */
export const SUPPORT_EMAIL = "support@slotty.msaeedsaeedi.com";

/** The university this deployment serves. */
export const INSTITUTION = "FAST-NUCES";

/** A mailto: link to support, optionally with a subject line. */
export function supportMailto(subject?: string): string {
  return `mailto:${SUPPORT_EMAIL}${subject ? `?subject=${encodeURIComponent(subject)}` : ""}`;
}

/** The person behind Slotty, credited on the landing page. */
export const MAKER = { name: "Mohammad Saeed Saeedi", initials: "MS", url: "https://msaeedsaeedi.com", host: "msaeedsaeedi.com" } as const;

/** Slotty's source code. */
export const GITHUB_URL = "https://github.com/msaeedsaeedi/Slotty";
