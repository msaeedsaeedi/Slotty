// Run: bun infra/aws/app/support-forwarder/rewrite.test.mjs
import { rewrite } from "./rewrite.mjs";
const raw = Buffer.from([
  "Received: from x", "DKIM-Signature: v=1; a=rsa-sha256;", "\tb=abc", "From: Ali Raza <ali@example.com>",
  "To: support@slotty.msaeedsaeedi.com", "Subject: =?UTF-8?B?w6k=?= help", "Message-ID: <1@x>", "Return-Path: <ali@example.com>",
  "Content-Type: text/plain; charset=utf-8", "", "Body line 1\r\n\r\nline \xc3\xa9", ""].join("\r\n"), "latin1");
const out = rewrite(raw, "Ali Raza <ali@example.com>", "support@slotty.msaeedsaeedi.com").toString("latin1");
console.log(out);
const assert = (c, m) => { if (!c) throw new Error(m); };
assert(!/DKIM-Signature|Message-ID|Return-Path|From: Ali/.test(out), "dropped headers");
assert(out.includes('From: "ali@example.com via Slotty support" <support@slotty.msaeedsaeedi.com>'), "from");
assert(out.includes("Reply-To: Ali Raza <ali@example.com>"), "reply-to");
assert(Buffer.compare(Buffer.from(out, "latin1").subarray(-12), raw.subarray(-12)) === 0, "body bytes");
assert(!out.includes("\tb=abc"), "folded continuation dropped with its header");
const withReply = rewrite(Buffer.from("From: a@b\nReply-To: c@d\nSubject: s\n\nhi"), "a@b", "support@x").toString();
assert(withReply.match(/Reply-To/g).length === 1, "keeps existing reply-to only");
const intl = rewrite(Buffer.from("From: x\n\nhi"), "Zoë Khan <zoe@example.com>", "support@x").toString("latin1");
assert(intl.includes("Reply-To: zoe@example.com\n"), "non-ASCII name falls back to the address");
console.log("OK");
