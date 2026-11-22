# Management-account stack: the AWS Organization, Slotty's member account, guardrail SCPs,
# the Slotty budget and the organization CloudTrail. Run with the management account's admin
# credentials. The app itself lives in ../app (applied into the member account).
#
# First run (no state bucket yet):  terraform init && terraform apply
# Then move state into the bucket:   cp backend.tf.example backend.tf && terraform init -migrate-state

terraform {
  required_version = ">= 1.10"
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 6.0" }
  }
}

provider "aws" {
  region = "us-east-1"
  default_tags {
    tags = { Project = "slotty", Stack = "org", ManagedBy = "terraform" }
  }
}

data "aws_caller_identity" "current" {}

locals {
  mgmt_account_id = data.aws_caller_identity.current.account_id
}

variable "account_email" {
  description = "Root email of the new Slotty member account (must not be used by any other AWS account)."
  type        = string
}

variable "alert_email" {
  description = "Where budget and anomaly alerts go."
  type        = string
}

variable "budget_usd" {
  description = "Monthly cost budget for the Slotty account."
  type        = number
  default     = 55
}

variable "allowed_region" {
  type    = string
  default = "us-east-1"
}
