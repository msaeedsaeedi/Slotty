# Application stack. One root, two deployments, each with its own backend and tfvars:
#   slotty-prod (us-east-1, member account of ../org): the provider assumes account_role_arn.
#     terraform init -reconfigure -backend-config=backend-slotty.hcl
#   uniflow (ap-southeast-2, standalone account, see ../account and ADR-037): a CLI profile.
#     terraform init -reconfigure -backend-config=backend-uniflow.hcl
#     terraform plan -var-file=uniflow.tfvars
# The defaults below are slotty-prod's values, so its plan doesn't change.

terraform {
  required_version = ">= 1.10"
  required_providers {
    aws    = { source = "hashicorp/aws", version = "~> 6.0" }
    random = { source = "hashicorp/random", version = "~> 3.6" }
  }
  # Bucket, key and region come from backend-<deployment>.hcl (-backend-config).
  backend "s3" {
    encrypt      = true
    use_lockfile = true
  }
}

provider "aws" {
  region              = var.region
  profile             = var.aws_profile
  allowed_account_ids = [local.expected_account_id]
  dynamic "assume_role" {
    for_each = var.account_role_arn == null ? [] : [var.account_role_arn]
    content {
      role_arn     = assume_role.value
      session_name = "terraform-${var.name}-app"
    }
  }
  default_tags {
    tags = { Project = var.name, Env = "prod", ManagedBy = "terraform" }
  }
}

# The provider refuses any other account, so a wrong profile or role can't plan into the wrong one.
locals {
  expected_account_id = coalesce(var.account_id, try(regex("^arn:aws:iam::(\\d{12}):", var.account_role_arn)[0], null))
}

# CloudFront only takes certificates from us-east-1, wherever the app runs.
provider "aws" {
  alias               = "us_east_1"
  region              = "us-east-1"
  profile             = var.aws_profile
  allowed_account_ids = [local.expected_account_id]
  dynamic "assume_role" {
    for_each = var.account_role_arn == null ? [] : [var.account_role_arn]
    content {
      role_arn     = assume_role.value
      session_name = "terraform-${var.name}-app"
    }
  }
  default_tags {
    tags = { Project = var.name, Env = "prod", ManagedBy = "terraform" }
  }
}

data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

locals {
  name       = var.name
  account_id = data.aws_caller_identity.current.account_id
  region     = data.aws_region.current.region
  app_url    = "https://${var.domain}"
  mail_from  = "${var.product_name} <no-reply@${var.domain}>"
  push_on    = var.vapid_public_key != "" && var.vapid_private_key != ""
}
