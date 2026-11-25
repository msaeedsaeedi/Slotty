# Route 53 zone for the subdomain. Delegate it once from Cloudflare: add the four NS records
# from output `name_servers` for the subdomain (e.g. `slotty`, `uniflow`) (DNS only, not proxied).
# Apply this first on its own (`terraform apply -target=aws_route53_zone.main`): certificate
# validation waits until the delegation resolves.

resource "aws_route53_zone" "main" {
  name = var.domain
}

resource "aws_acm_certificate" "main" {
  provider          = aws.us_east_1
  domain_name       = var.domain
  validation_method = "DNS"
  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_route53_record" "cert_validation" {
  for_each = {
    for o in aws_acm_certificate.main.domain_validation_options : o.domain_name => o
  }
  zone_id         = aws_route53_zone.main.zone_id
  name            = each.value.resource_record_name
  type            = each.value.resource_record_type
  records         = [each.value.resource_record_value]
  ttl             = 300
  allow_overwrite = true
}

resource "aws_acm_certificate_validation" "main" {
  provider                = aws.us_east_1
  certificate_arn         = aws_acm_certificate.main.arn
  validation_record_fqdns = [for r in aws_route53_record.cert_validation : r.fqdn]
}

# Only Amazon may issue certificates for this name.
resource "aws_route53_record" "caa" {
  zone_id = aws_route53_zone.main.zone_id
  name    = var.domain
  type    = "CAA"
  ttl     = 3600
  records = [
    "0 issue \"amazon.com\"",
    "0 issue \"amazontrust.com\"",
    "0 issue \"awstrust.com\"",
    "0 issue \"amazonaws.com\"",
    "0 issuewild \";\"",
  ]
}

resource "aws_route53_record" "apex" {
  for_each = toset(["A", "AAAA"])
  zone_id  = aws_route53_zone.main.zone_id
  name     = var.domain
  type     = each.value
  alias {
    name                   = aws_cloudfront_distribution.main.domain_name
    zone_id                = aws_cloudfront_distribution.main.hosted_zone_id
    evaluate_target_health = false
  }
}

# Incoming mail (support@) goes to Cloudflare Email Routing, which forwards it to the owner's
# inbox (ADR-021). The subdomain's DNS lives here, not at Cloudflare, so the records Cloudflare
# would add for it have to be added here: the same MX hosts and SPF as on msaeedsaeedi.com.
# Sending is unaffected: SES uses its own MAIL FROM domain (mail.<domain>, ses.tf) and DKIM.
resource "aws_route53_record" "mail_mx" {
  zone_id = aws_route53_zone.main.zone_id
  name    = var.domain
  type    = "MX"
  ttl     = 3600
  records = [
    "2 route2.mx.cloudflare.net",
    "89 route3.mx.cloudflare.net",
    "91 route1.mx.cloudflare.net",
  ]
}

resource "aws_route53_record" "mail_spf" {
  zone_id = aws_route53_zone.main.zone_id
  name    = var.domain
  type    = "TXT"
  ttl     = 3600
  records = ["v=spf1 include:_spf.mx.cloudflare.net ~all"]
}
