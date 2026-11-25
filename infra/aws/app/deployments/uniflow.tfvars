# uniflow: production after the move (#135), in a standalone account (ADR-037). Non-secret
# settings only; alert_email and the VAPID keys go in uniflow.secret.tfvars (gitignored).
account_id   = "063140644495"
aws_profile  = "uniflow"
region       = "ap-southeast-2"
name         = "uniflow"
product_name = "Uniflow"
db_name      = "uniflow"
domain       = "uniflow.msaeedsaeedi.com"

# The repository is renamed to Uniflow first (#135 step 1); owner and repo IDs don't change.
github_oidc_subject_prefix = "repo:msaeedsaeedi@144554925/Uniflow@1310919958"

# Pinned (#40): fck-nat-al2023-hvm-1.4.0-20261109-arm64-ebs, owner 568608671756 (fck-nat),
# ap-southeast-2: the same build as slotty-prod's us-east-1 image (variables.tf).
nat_ami_id = "ami-04b81362eeedc935e"

# false until CI has pushed the first image to this account's ECR.
launch = false

# AWS Free plan limits (until the upgrade in #146): only Free Tier instance types (arm64 ones in
# ap-southeast-2: t4g.micro/small, t9g.micro/small; checked 2026-11-25), and fewer days of RDS
# backups than 7. Revert both after the upgrade.
nat_instance_type        = "t4g.micro"
db_backup_retention_days = 1
