# Slotty application stack, applied into the slotty-prod member account (see ../org).
# Credentials: the management account's admin; the provider assumes OrganizationAccountAccessRole.
#
#   cp terraform.tfvars.example terraform.tfvars   # fill in
#   terraform init && terraform apply

terraform {
  required_version = ">= 1.10"
  required_providers {
    aws    = { source = "hashicorp/aws", version = "~> 6.0" }
    random = { source = "hashicorp/random", version = "~> 3.6" }
  }
  backend "s3" {
    bucket       = "slotty-tfstate-007576456316"
    key          = "app.tfstate"
    region       = "us-east-1"
    encrypt      = true
    use_lockfile = true
  }
}

provider "aws" {
  region = "us-east-1"
  assume_role {
    role_arn     = var.account_role_arn
    session_name = "terraform-slotty-app"
  }
  default_tags {
    tags = { Project = "slotty", Env = "prod", ManagedBy = "terraform" }
  }
}

data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

locals {
  name       = "slotty"
  account_id = data.aws_caller_identity.current.account_id
  region     = data.aws_region.current.region
  app_url    = "https://${var.domain}"
  mail_from  = "Slotty <no-reply@${var.domain}>"
  push_on    = var.vapid_public_key != "" && var.vapid_private_key != ""
}
