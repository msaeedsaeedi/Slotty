# Account-wide: no public S3 buckets, ever.
resource "aws_s3_account_public_access_block" "main" {
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# Encrypt new EBS volumes by default (the NAT instance's root volume and anything later).
resource "aws_ebs_encryption_by_default" "main" {
  enabled = true
}

resource "aws_guardduty_detector" "main" {
  count  = var.enable_guardduty ? 1 : 0
  enable = true
}
