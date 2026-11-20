// Forwards mail sent to support@<domain> to the product owner (support-mail.tf).
//
// SES stores each message in S3, then invokes this function. The message is re-sent through
// SES from support@<domain>, so DKIM and DMARC still pass at the destination; the original
// sender goes into Reply-To, so replying reaches them. Spam and viruses are dropped.
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";
import { rewrite } from "./rewrite.mjs";

const s3 = new S3Client({});
const ses = new SESv2Client({});
const { BUCKET, PREFIX, FORWARD_TO, FROM_ADDRESS } = process.env;

export async function handler(event) {
  const { mail, receipt } = event.Records[0].ses;
  const verdicts = { spam: receipt.spamVerdict?.status, virus: receipt.virusVerdict?.status };
  if (verdicts.spam === "FAIL" || verdicts.virus === "FAIL") {
    console.log(JSON.stringify({ dropped: mail.messageId, verdicts }));
    return;
  }
  const object = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: `${PREFIX}${mail.messageId}` }));
  const raw = Buffer.from(await object.Body.transformToByteArray());
  // The From header, not the envelope sender (often a bounce address of a mailing service).
  const sender = mail.commonHeaders?.from?.[0] ?? mail.source;
  const message = rewrite(raw, sender, FROM_ADDRESS);
  await ses.send(
    new SendEmailCommand({
      FromEmailAddress: FROM_ADDRESS,
      Destination: { ToAddresses: [FORWARD_TO] },
      Content: { Raw: { Data: message } },
    }),
  );
  console.log(JSON.stringify({ forwarded: mail.messageId, verdicts }));
}
