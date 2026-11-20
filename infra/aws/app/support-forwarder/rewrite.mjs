// Turns a received message into one support@ can re-send (see index.mjs). No dependencies, so it can be
// tested locally: bun infra/aws/app/support-forwarder/rewrite.test.mjs
// Headers that belong to the original sender's domain and would fail checks once we re-send.
const DROP = new Set(["from", "sender", "return-path", "dkim-signature", "message-id"]);

/** Split raw headers into whole (unfolded) fields, keeping each field's original lines. */
function splitHeaders(head, eol) {
  const fields = [];
  for (const line of head.split(eol)) {
    if (/^[ \t]/.test(line) && fields.length) fields[fields.length - 1] += eol + line;
    else fields.push(line);
  }
  return fields;
}

const nameOf = (field) => field.slice(0, field.indexOf(":")).trim().toLowerCase();

/**
 * `sender` is the original From header ("Ali <ali@example.com>" or a bare address): it becomes
 * Reply-To, and its address labels the new From so the inbox still shows who wrote.
 */
export function rewrite(raw, sender, fromAddress) {
  const text = raw.toString("latin1"); // byte-preserving: the body is passed through untouched
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const split = text.indexOf(eol + eol);
  const head = split === -1 ? text : text.slice(0, split);
  const body = split === -1 ? "" : text.slice(split);

  const fields = splitHeaders(head, eol);
  const hasReplyTo = fields.some((f) => nameOf(f) === "reply-to");
  const kept = fields.filter((f) => !DROP.has(nameOf(f)));
  const address = /<([^>]+)>/.exec(sender)?.[1] ?? sender;
  const label = address.replace(/["\\\r\n]/g, "");
  kept.unshift(`From: "${label} via Slotty support" <${fromAddress}>`);
  // SES gives the header decoded; a non-ASCII display name can't go back in raw, so use the address.
  const replyTo = /^[\x20-\x7e]*$/.test(sender) ? sender : address;
  if (!hasReplyTo) kept.unshift(`Reply-To: ${replyTo}`);
  return Buffer.from(kept.join(eol) + body, "latin1");
}
