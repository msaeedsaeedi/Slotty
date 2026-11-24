# Runtime secrets as SSM SecureStrings (free; AWS-managed KMS key), injected into containers by
# ECS. Terraform generates them, so they also sit in the state file: the state bucket is private
# and encrypted.

locals {
  ssm_prefix = "/${local.name}"
  db_base    = "postgres://${var.db_name}:${random_password.db.result}@${aws_db_instance.main.address}:5432/${var.db_name}"
}

# node-postgres (app and worker): full verification against the RDS CA bundle, which is baked
# into the image and trusted through NODE_EXTRA_CA_CERTS.
resource "aws_ssm_parameter" "database_url" {
  name  = "${local.ssm_prefix}/DATABASE_URL"
  type  = "SecureString"
  value = "${local.db_base}?sslmode=verify-full"
}

# The Prisma schema engine (migrations) has its own URL syntax. `sslaccept=strict` verifies the
# chain and hostname against OpenSSL's trust store, which the migrate image points at the RDS bundle
# (SSL_CERT_FILE in the Dockerfile). Don't use `sslcert`: it reads only the bundle's first root.
resource "aws_ssm_parameter" "migrate_database_url" {
  name  = "${local.ssm_prefix}/MIGRATE_DATABASE_URL"
  type  = "SecureString"
  value = "${local.db_base}?sslmode=require&sslaccept=strict"
}

resource "aws_ssm_parameter" "origin_verify" {
  name  = "${local.ssm_prefix}/ORIGIN_VERIFY_SECRET"
  type  = "SecureString"
  value = random_password.origin_verify.result
}

# Key for the pseudonymous visitor code in usage analytics (ADR-015). Rotating it makes everyone
# look like a new visitor; it never leaves SSM and the app never shows it.
resource "random_password" "analytics" {
  length  = 48
  special = false
}

resource "aws_ssm_parameter" "analytics_secret" {
  name  = "${local.ssm_prefix}/ANALYTICS_SECRET"
  type  = "SecureString"
  value = random_password.analytics.result
}

resource "aws_ssm_parameter" "smtp_user" {
  name  = "${local.ssm_prefix}/SMTP_USER"
  type  = "SecureString"
  value = aws_iam_access_key.ses_smtp.id
}

resource "aws_ssm_parameter" "smtp_pass" {
  name  = "${local.ssm_prefix}/SMTP_PASS"
  type  = "SecureString"
  value = aws_iam_access_key.ses_smtp.ses_smtp_password_v4
}

resource "aws_ssm_parameter" "vapid_public" {
  count = local.push_on ? 1 : 0
  name  = "${local.ssm_prefix}/VAPID_PUBLIC_KEY"
  type  = "SecureString"
  value = var.vapid_public_key
}

resource "aws_ssm_parameter" "vapid_private" {
  count = local.push_on ? 1 : 0
  name  = "${local.ssm_prefix}/VAPID_PRIVATE_KEY"
  type  = "SecureString"
  value = var.vapid_private_key
}
