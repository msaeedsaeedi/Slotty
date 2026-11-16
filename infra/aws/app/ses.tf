# Outgoing email through Amazon SES, using the worker's existing SMTP transport.
# The account starts in the SES sandbox (only verified recipients). Request production access
# once in the console: SES → Account dashboard → Request production access.

resource "aws_sesv2_email_identity" "domain" {
  email_identity = var.domain
}

resource "aws_route53_record" "dkim" {
  count   = 3
  zone_id = aws_route53_zone.main.zone_id
  name    = "${aws_sesv2_email_identity.domain.dkim_signing_attributes[0].tokens[count.index]}._domainkey.${var.domain}"
  type    = "CNAME"
  ttl     = 1800
  records = ["${aws_sesv2_email_identity.domain.dkim_signing_attributes[0].tokens[count.index]}.dkim.amazonses.com"]
}

# Custom MAIL FROM, so SPF aligns with the From domain (DMARC passes on SPF as well as DKIM).
resource "aws_sesv2_email_identity_mail_from_attributes" "domain" {
  email_identity         = aws_sesv2_email_identity.domain.email_identity
  mail_from_domain       = "mail.${var.domain}"
  behavior_on_mx_failure = "USE_DEFAULT_VALUE"
}

resource "aws_route53_record" "mail_from_mx" {
  zone_id = aws_route53_zone.main.zone_id
  name    = "mail.${var.domain}"
  type    = "MX"
  ttl     = 1800
  records = ["10 feedback-smtp.${local.region}.amazonses.com"]
}

resource "aws_route53_record" "mail_from_spf" {
  zone_id = aws_route53_zone.main.zone_id
  name    = "mail.${var.domain}"
  type    = "TXT"
  ttl     = 1800
  records = ["v=spf1 include:amazonses.com -all"]
}

resource "aws_route53_record" "dmarc" {
  zone_id = aws_route53_zone.main.zone_id
  name    = "_dmarc.${var.domain}"
  type    = "TXT"
  ttl     = 1800
  records = ["v=DMARC1; p=quarantine; adkim=s; aspf=r"]
}

# SMTP credentials: an IAM user that can only send as this domain. Rotate with
# `terraform apply -replace=aws_iam_access_key.ses_smtp`, then redeploy the worker.
resource "aws_iam_user" "ses_smtp" {
  name = "${local.name}-ses-smtp"
}

resource "aws_iam_user_policy" "ses_smtp" {
  name = "send-as-domain"
  user = aws_iam_user.ses_smtp.name
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Action    = "ses:SendRawEmail"
      Resource  = aws_sesv2_email_identity.domain.arn
      Condition = { StringLike = { "ses:FromAddress" = "*@${var.domain}" } }
    }]
  })
}

resource "aws_iam_access_key" "ses_smtp" {
  user = aws_iam_user.ses_smtp.name
}
