# One-time setup of the standalone production account (ADR-037): the Terraform state bucket for
# ../app and the budget alerts. It replaces what ../org does for slotty-prod, without any AWS
# Organizations feature: the account was opened with AWS's new sign-up experience, sits in an
# organization AWS manages, and keeps its Free Tier credits only while that stays untouched.
#
#   aws login --profile uniflow
#   cp terraform.tfvars.example terraform.tfvars   # fill in (gitignored)
#   terraform init && terraform plan               # review, then apply
# Then move this stack's own state into the bucket:
#   cp backend.tf.example backend.tf && terraform init -migrate-state

terraform {
  required_version = ">= 1.10"
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 6.0" }
  }
}

provider "aws" {
  region              = var.region
  profile             = var.aws_profile
  allowed_account_ids = [var.account_id]
  default_tags {
    tags = { Project = var.name, Stack = "account", ManagedBy = "terraform" }
  }
}

variable "account_id" {
  description = "The standalone account; the provider refuses any other."
  type        = string
  default     = "063140644495"
}

variable "aws_profile" {
  type    = string
  default = "uniflow"
}

variable "region" {
  description = "The project's region, assigned by AWS at sign-up (resources elsewhere are denied)."
  type        = string
  default     = "ap-southeast-2"
}

variable "name" {
  type    = string
  default = "uniflow"
}

variable "alert_email" {
  description = "Where budget alerts go."
  type        = string
}

variable "monthly_usage_usd" {
  description = "Expected monthly usage before credits (docs ch. 12). Alerts at 80% and 100%, and on a forecast over 100%."
  type        = number
  default     = 55
}
