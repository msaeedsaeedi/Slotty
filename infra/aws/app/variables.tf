variable "region" {
  description = "Where the app runs. CloudFront's certificate is always in us-east-1 (provider aws.us_east_1)."
  type        = string
  default     = "us-east-1"
}

variable "account_role_arn" {
  description = "slotty-prod: role in the member account to assume (output slotty_admin_role_arn of ../org). Null for a standalone account signed in with aws_profile."
  type        = string
  default     = null
}

variable "account_id" {
  description = "The account this deployment must run in. Defaults to the one in account_role_arn."
  type        = string
  default     = null
  validation {
    condition     = var.account_id != null || var.account_role_arn != null
    error_message = "Set account_id (standalone account) or account_role_arn (slotty-prod)."
  }
}

variable "aws_profile" {
  description = "AWS CLI profile (e.g. from `aws login --profile uniflow`). Null uses the default credential chain."
  type        = string
  default     = null
}

variable "name" {
  description = "Prefix for resource names, SSM paths and log groups (lowercase)."
  type        = string
  default     = "slotty"
}

variable "product_name" {
  description = "Display name: the mail sender, CloudFront and API descriptions, the custom metrics namespace."
  type        = string
  default     = "Slotty"
}

variable "db_name" {
  description = "Database name and master user."
  type        = string
  default     = "slotty"
}

variable "domain" {
  description = "Public hostname; its DNS is delegated to the Route 53 zone created here."
  type        = string
  default     = "slotty.msaeedsaeedi.com"
}

variable "alert_email" {
  description = "Where CloudWatch alarms go (confirm the SNS subscription email once)."
  type        = string
}

variable "github_oidc_subject_prefix" {
  description = <<-EOT
    Subject prefix of the repository's GitHub OIDC tokens; only its master branch and v* release
    tags may build, and only its `production` environment may deploy (ADR-027).
    This repo uses immutable subjects (owner and repo IDs), so a renamed or re-created repo
    with the same name can't deploy. Check with:
      gh api repos/<owner>/<repo>/actions/oidc/customization/sub   (sub_claim_prefix)
  EOT
  type        = string
  default     = "repo:msaeedsaeedi@144554925/Slotty@1310919958"
}

variable "launch" {
  description = "false until CI has pushed the first image: services exist but run no tasks."
  type        = bool
  default     = false
}

# ── Sizing (the cost levers) ──

variable "web_cpu" {
  type    = number
  default = 512
}

variable "web_memory" {
  type    = number
  default = 1024
}

variable "web_min" {
  description = "Minimum web tasks. 1 on regular Fargate at low traffic; CPU autoscaling adds Spot tasks up to web_max under load (ADR-030)."
  type        = number
  default     = 1
}

variable "web_max" {
  type    = number
  default = 4
}

variable "worker_cpu" {
  type    = number
  default = 256
}

variable "worker_memory" {
  type    = number
  default = 512
}

variable "db_instance_class" {
  type    = string
  default = "db.t4g.micro"
}

variable "db_multi_az" {
  type    = bool
  default = false
}

variable "db_storage_gb" {
  type    = number
  default = 20
}

variable "db_max_storage_gb" {
  type    = number
  default = 50
}

variable "nat_ami_id" {
  # Pinned (#40): fck-nat-al2023-hvm-1.4.0-20261109-arm64-ebs, owner 568608671756 (fck-nat), us-east-1.
  # To upgrade, pick a newer fck-nat AL2023 arm64 image, set its ID here and review the plan: it
  # replaces the NAT instance (about a minute without outbound traffic).
  description = "AMI of the fck-nat instance (nat_mode = \"instance\")."
  type        = string
  default     = "ami-04cdf0e88da1d5502"
}

variable "nat_mode" {
  description = "\"instance\" (fck-nat on t4g.nano, ~$7/mo) or \"gateway\" (managed NAT Gateway, ~$33/mo; also lift the SCP deny in ../org)."
  type        = string
  default     = "instance"
  validation {
    condition     = contains(["instance", "gateway"], var.nat_mode)
    error_message = "nat_mode must be \"instance\" or \"gateway\"."
  }
}

variable "api_rate_limit" {
  description = "API Gateway steady-state requests per second (the edge rate limit; there is no WAF)."
  type        = number
  default     = 50
}

variable "api_burst_limit" {
  type    = number
  default = 100
}

variable "enable_guardduty" {
  description = "GuardDuty threat detection (30-day free trial, then a few $/month)."
  type        = bool
  default     = false
}

variable "enable_exec" {
  description = "Allow `aws ecs execute-command` into running tasks. Off by default: turn on for an incident (`-var enable_exec=true`, then a redeploy); every session is logged to /slotty/exec."
  type        = bool
  default     = false
}

# ── Web Push. Generate once: bunx web-push generate-vapid-keys. Empty = push off. ──

variable "vapid_public_key" {
  type    = string
  default = ""
}

variable "vapid_private_key" {
  type      = string
  default   = ""
  sensitive = true
}
