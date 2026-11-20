# support@<domain>: inbound mail through SES receiving, forwarded to var.support_forward_to.
#
#   MX → SES (spam/virus scan) → S3 (raw message, kept 30 days) → Lambda → SES send → inbox
#
# The Lambda re-sends from support@<domain> (DKIM-signed by the domain identity in ses.tf) with
# the original sender in Reply-To. A failed forward goes to the alerts topic.
# Empty support_forward_to turns all of it off.

locals {
  support_on      = var.support_forward_to != ""
  support_address = "support@${var.domain}"
  support_rule    = "support-forward"
  support_prefix  = "support/"
  # Known before the rule exists, so the bucket policy and Lambda permission can name it.
  support_rule_arn = "arn:aws:ses:${local.region}:${local.account_id}:receipt-rule-set/${local.name}:receipt-rule/${local.support_rule}"
}

resource "aws_route53_record" "inbound_mx" {
  count   = local.support_on ? 1 : 0
  zone_id = aws_route53_zone.main.zone_id
  name    = var.domain
  type    = "MX"
  ttl     = 1800
  records = ["10 inbound-smtp.${local.region}.amazonaws.com"]
}

# ── Raw message store ──

resource "aws_s3_bucket" "support_mail" {
  count         = local.support_on ? 1 : 0
  bucket        = "${local.name}-support-mail-${local.account_id}"
  force_destroy = true
}

resource "aws_s3_bucket_public_access_block" "support_mail" {
  count                   = local.support_on ? 1 : 0
  bucket                  = aws_s3_bucket.support_mail[0].id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "support_mail" {
  count  = local.support_on ? 1 : 0
  bucket = aws_s3_bucket.support_mail[0].id
  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "support_mail" {
  count  = local.support_on ? 1 : 0
  bucket = aws_s3_bucket.support_mail[0].id
  rule {
    id     = "expire"
    status = "Enabled"
    filter {}
    expiration {
      days = 30
    }
  }
}

resource "aws_s3_bucket_policy" "support_mail" {
  count  = local.support_on ? 1 : 0
  bucket = aws_s3_bucket.support_mail[0].id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "SesWritesSupportMail"
        Effect    = "Allow"
        Principal = { Service = "ses.amazonaws.com" }
        Action    = "s3:PutObject"
        Resource  = "${aws_s3_bucket.support_mail[0].arn}/${local.support_prefix}*"
        Condition = {
          StringEquals = { "aws:SourceAccount" = local.account_id }
          ArnLike      = { "aws:SourceArn" = local.support_rule_arn }
        }
      },
      {
        Sid       = "TlsOnly"
        Effect    = "Deny"
        Principal = "*"
        Action    = "s3:*"
        Resource  = [aws_s3_bucket.support_mail[0].arn, "${aws_s3_bucket.support_mail[0].arn}/*"]
        Condition = { Bool = { "aws:SecureTransport" = "false" } }
      },
    ]
  })
}

# ── Forwarder ──

data "archive_file" "support_forwarder" {
  type        = "zip"
  source_dir  = "${path.module}/support-forwarder"
  excludes    = ["rewrite.test.mjs"]
  output_path = "${path.module}/.build/support-forwarder.zip"
}

resource "aws_iam_role" "support_forwarder" {
  count = local.support_on ? 1 : 0
  name  = "${local.name}-support-forwarder"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
      Action    = "sts:AssumeRole"
      Condition = { StringEquals = { "aws:SourceAccount" = local.account_id } }
    }]
  })
}

resource "aws_iam_role_policy" "support_forwarder" {
  count = local.support_on ? 1 : 0
  name  = "forward-support-mail"
  role  = aws_iam_role.support_forwarder[0].id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "ReadMessages"
        Effect   = "Allow"
        Action   = "s3:GetObject"
        Resource = "${aws_s3_bucket.support_mail[0].arn}/${local.support_prefix}*"
      },
      {
        # Send only as support@; identity/* also covers the recipient while SES is in the sandbox.
        Sid       = "SendAsSupport"
        Effect    = "Allow"
        Action    = ["ses:SendEmail", "ses:SendRawEmail"]
        Resource  = ["arn:aws:ses:${local.region}:${local.account_id}:identity/*", aws_sesv2_configuration_set.main.arn]
        Condition = { StringEquals = { "ses:FromAddress" = local.support_address } }
      },
      {
        Sid      = "ReportFailures"
        Effect   = "Allow"
        Action   = "sns:Publish"
        Resource = aws_sns_topic.alerts.arn
      },
      {
        Sid      = "Logs"
        Effect   = "Allow"
        Action   = ["logs:CreateLogStream", "logs:PutLogEvents"]
        Resource = "${aws_cloudwatch_log_group.support_forwarder[0].arn}:*"
      },
    ]
  })
}

resource "aws_cloudwatch_log_group" "support_forwarder" {
  count             = local.support_on ? 1 : 0
  name              = "/aws/lambda/${local.name}-support-forwarder"
  retention_in_days = 14
}

resource "aws_lambda_function" "support_forwarder" {
  count            = local.support_on ? 1 : 0
  function_name    = "${local.name}-support-forwarder"
  role             = aws_iam_role.support_forwarder[0].arn
  runtime          = "nodejs22.x"
  architectures    = ["arm64"]
  handler          = "index.handler"
  filename         = data.archive_file.support_forwarder.output_path
  source_code_hash = data.archive_file.support_forwarder.output_base64sha256
  memory_size      = 256
  timeout          = 30
  environment {
    variables = {
      BUCKET       = aws_s3_bucket.support_mail[0].id
      PREFIX       = local.support_prefix
      FORWARD_TO   = var.support_forward_to
      FROM_ADDRESS = local.support_address
    }
  }
  logging_config {
    log_format = "Text"
    log_group  = aws_cloudwatch_log_group.support_forwarder[0].name
  }
}

# SES invokes asynchronously: two retries, then the failure lands in the alerts email.
resource "aws_lambda_function_event_invoke_config" "support_forwarder" {
  count                        = local.support_on ? 1 : 0
  function_name                = aws_lambda_function.support_forwarder[0].function_name
  maximum_retry_attempts       = 2
  maximum_event_age_in_seconds = 3600
  destination_config {
    on_failure {
      destination = aws_sns_topic.alerts.arn
    }
  }
}

resource "aws_lambda_permission" "ses_invokes_forwarder" {
  count          = local.support_on ? 1 : 0
  statement_id   = "AllowSesReceipt"
  action         = "lambda:InvokeFunction"
  function_name  = aws_lambda_function.support_forwarder[0].function_name
  principal      = "ses.amazonaws.com"
  source_account = local.account_id
  source_arn     = local.support_rule_arn
}

# ── Receipt rules (one active rule set per account and region) ──

resource "aws_ses_receipt_rule_set" "main" {
  count         = local.support_on ? 1 : 0
  rule_set_name = local.name
}

resource "aws_ses_active_receipt_rule_set" "main" {
  count         = local.support_on ? 1 : 0
  rule_set_name = aws_ses_receipt_rule_set.main[0].rule_set_name
}

resource "aws_ses_receipt_rule" "support" {
  count         = local.support_on ? 1 : 0
  name          = local.support_rule
  rule_set_name = aws_ses_receipt_rule_set.main[0].rule_set_name
  recipients    = [local.support_address]
  enabled       = true
  scan_enabled  = true
  tls_policy    = "Optional"

  s3_action {
    position          = 1
    bucket_name       = aws_s3_bucket.support_mail[0].id
    object_key_prefix = local.support_prefix
  }

  lambda_action {
    position        = 2
    function_arn    = aws_lambda_function.support_forwarder[0].arn
    invocation_type = "Event"
  }

  # SES checks it may write to the bucket and invoke the function when the rule is saved.
  depends_on = [aws_s3_bucket_policy.support_mail, aws_lambda_permission.ses_invokes_forwarder]
}
