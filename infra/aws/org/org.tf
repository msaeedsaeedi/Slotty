# The account you run this with becomes the Organization's management account.
# An Organization can only be deleted once every member account has been closed, hence prevent_destroy.
resource "aws_organizations_organization" "this" {
  feature_set                   = "ALL"
  enabled_policy_types          = ["SERVICE_CONTROL_POLICY"]
  aws_service_access_principals = ["cloudtrail.amazonaws.com"]

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_organizations_organizational_unit" "workloads" {
  name      = "Workloads"
  parent_id = aws_organizations_organization.this.roots[0].id
}

# Admins of the management account reach it by assuming OrganizationAccountAccessRole.
resource "aws_organizations_account" "slotty" {
  name                       = "slotty-prod"
  email                      = var.account_email
  parent_id                  = aws_organizations_organizational_unit.workloads.id
  role_name                  = "OrganizationAccountAccessRole"
  iam_user_access_to_billing = "ALLOW"
  close_on_deletion          = false

  lifecycle {
    prevent_destroy = true
    # AWS doesn't return these after creation; changing them would force a new account.
    ignore_changes = [role_name, iam_user_access_to_billing]
  }
}

output "slotty_account_id" {
  value = aws_organizations_account.slotty.id
}

output "slotty_admin_role_arn" {
  description = "Role the app stack's provider assumes."
  value       = "arn:aws:iam::${aws_organizations_account.slotty.id}:role/OrganizationAccountAccessRole"
}
