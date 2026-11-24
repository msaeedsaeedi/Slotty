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

# fck-nat arm64 AMI in ap-southeast-2, pinned like the us-east-1 one (variables.tf). Look it up
# (read-only) and fill in before the first plan:
#   aws ec2 describe-images --profile uniflow --region ap-southeast-2 --owners 568608671756 \
#     --filters "Name=name,Values=fck-nat-al2023-hvm-1.4.0-*-arm64-ebs" \
#     --query 'Images[].[ImageId,Name]' --output text
nat_ami_id = "ami-REPLACE-ME"

# false until CI has pushed the first image to this account's ECR.
launch = false
