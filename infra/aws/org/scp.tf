# Guardrails on every account in the Workloads OU. They cap what can be created (and so what can
# be spent) even with admin access or leaked credentials. Raise the allowlists here when Slotty grows.

locals {
  # Global services (or ones with a us-east-1-only control plane) exempt from the region lock.
  global_actions = [
    "account:*", "acm:*", "aws-portal:*", "billing:*", "budgets:*", "ce:*", "cloudfront:*",
    "cur:*", "freetier:*", "health:*", "iam:*", "invoicing:*", "organizations:*", "payments:*",
    "pricing:*", "route53:*", "route53domains:*", "shield:*", "sts:*", "support:*", "tag:*",
    "trustedadvisor:*", "waf:*", "wafv2:*", "waf-regional:*", "s3:GetAccountPublicAccessBlock",
    "s3:PutAccountPublicAccessBlock", "s3:ListAllMyBuckets", "sso:*", "notifications:*",
  ]
  ec2_instance_types = ["t4g.nano", "t4g.micro", "t4g.small"]
  rds_classes        = ["db.t4g.micro", "db.t4g.small"]
}

resource "aws_organizations_policy" "region_lock" {
  # SCPs can only be created once the organization (with SCPs enabled) exists.
  depends_on  = [aws_organizations_organization.this]
  name        = "slotty-region-lock"
  description = "Only ${var.allowed_region}, apart from global services."
  content = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid       = "DenyOtherRegions"
      Effect    = "Deny"
      NotAction = local.global_actions
      Resource  = "*"
      Condition = { StringNotEquals = { "aws:RequestedRegion" = [var.allowed_region] } }
    }]
  })
}

resource "aws_organizations_policy" "cost_guardrails" {
  # SCPs can only be created once the organization (with SCPs enabled) exists.
  depends_on  = [aws_organizations_organization.this]
  name        = "slotty-cost-guardrails"
  description = "Small instance sizes only; no expensive services or long-term purchases."
  content = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "SmallEc2Only"
        Effect    = "Deny"
        Action    = ["ec2:RunInstances"]
        Resource  = "arn:aws:ec2:*:*:instance/*"
        Condition = { StringNotEquals = { "ec2:InstanceType" = local.ec2_instance_types } }
      },
      {
        Sid       = "SmallRdsOnly"
        Effect    = "Deny"
        Action    = ["rds:CreateDBInstance", "rds:ModifyDBInstance", "rds:CreateDBInstanceReadReplica", "rds:RestoreDBInstanceFromDBSnapshot", "rds:RestoreDBInstanceToPointInTime"]
        Resource  = "*"
        Condition = { StringNotEquals = { "rds:DatabaseClass" = local.rds_classes } }
      },
      {
        Sid    = "NoExpensiveServices"
        Effect = "Deny"
        Action = [
          "rds:CreateDBCluster", "eks:CreateCluster", "sagemaker:*", "redshift:*", "redshift-serverless:*",
          "elasticache:Create*", "memorydb:Create*", "es:Create*", "aoss:Create*", "kafka:Create*",
          "emr:*", "elasticmapreduce:*", "opensearch:*", "workspaces:*", "lightsail:*", "gamelift:*",
          "bedrock:*", "ec2:CreateNatGateway", "ec2:AllocateHosts", "globalaccelerator:*",
          "shield:CreateSubscription", "route53domains:RegisterDomain", "route53domains:TransferDomain",
          "ec2:PurchaseReservedInstancesOffering", "rds:PurchaseReservedDBInstancesOffering",
          "savingsplans:CreateSavingsPlan", "ec2:PurchaseHostReservation", "ec2:PurchaseCapacityBlock",
        ]
        Resource = "*"
      },
    ]
  })
}

resource "aws_organizations_policy" "protect" {
  # SCPs can only be created once the organization (with SCPs enabled) exists.
  depends_on  = [aws_organizations_organization.this]
  name        = "slotty-protect"
  description = "Stay in the org, no root-user use, keep audit logging."
  content = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "StayInOrg"
        Effect   = "Deny"
        Action   = ["organizations:LeaveOrganization", "account:CloseAccount"]
        Resource = "*"
      },
      {
        Sid       = "NoRootUser"
        Effect    = "Deny"
        Action    = "*"
        Resource  = "*"
        Condition = { StringLike = { "aws:PrincipalArn" = ["arn:aws:iam::*:root"] } }
      },
      {
        Sid      = "KeepAuditTrail"
        Effect   = "Deny"
        Action   = ["cloudtrail:StopLogging", "cloudtrail:DeleteTrail", "cloudtrail:UpdateTrail", "cloudtrail:PutEventSelectors"]
        Resource = "*"
      },
    ]
  })
}

resource "aws_organizations_policy_attachment" "workloads" {
  for_each = {
    region_lock     = aws_organizations_policy.region_lock.id
    cost_guardrails = aws_organizations_policy.cost_guardrails.id
    protect         = aws_organizations_policy.protect.id
  }
  policy_id = each.value
  target_id = aws_organizations_organizational_unit.workloads.id
}
