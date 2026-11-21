# ── ECS roles ──

data "aws_iam_policy_document" "ecs_tasks_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "aws:SourceAccount"
      values   = [local.account_id]
    }
  }
}

# Used by ECS itself: pull the image, write logs, read the task's secrets.
resource "aws_iam_role" "execution" {
  name               = "${local.name}-ecs-execution"
  assume_role_policy = data.aws_iam_policy_document.ecs_tasks_assume.json
}

resource "aws_iam_role_policy_attachment" "execution" {
  role       = aws_iam_role.execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

resource "aws_iam_role_policy" "execution_secrets" {
  name = "read-slotty-secrets"
  role = aws_iam_role.execution.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["ssm:GetParameters"]
      Resource = "arn:aws:ssm:${local.region}:${local.account_id}:parameter${local.ssm_prefix}/*"
    }]
  })
}

# Used by the app code. It calls no AWS APIs (email goes over SMTP), so this only enables ECS Exec.
resource "aws_iam_role" "task" {
  name               = "${local.name}-task"
  assume_role_policy = data.aws_iam_policy_document.ecs_tasks_assume.json
}

resource "aws_iam_role_policy" "task_exec" {
  count = var.enable_exec ? 1 : 0
  name  = "ecs-exec"
  role  = aws_iam_role.task.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["ssmmessages:CreateControlChannel", "ssmmessages:CreateDataChannel", "ssmmessages:OpenControlChannel", "ssmmessages:OpenDataChannel"]
      Resource = "*"
    }]
  })
}

# ── GitHub Actions roles (OIDC, no stored keys) ──
# Two roles, so each job gets only what it needs (ADR-022). master is production (ADR-027):
#   build  — pushes images to ECR; jobs on master (which only takes CI-green PRs) or on a v* tag
#            (a release, run by hand to redeploy or roll back; tags can't be moved or deleted).
#   deploy — migrates and rolls out on ECS; only jobs in the `production` GitHub Environment,
#            whose deployment rules allow master and v* tags only.

resource "aws_iam_openid_connect_provider" "github" {
  url            = "https://token.actions.githubusercontent.com"
  client_id_list = ["sts.amazonaws.com"]
}

locals {
  github_trust = {
    for role, subjects in {
      build = [
        "${var.github_oidc_subject_prefix}:ref:refs/heads/master",
        "${var.github_oidc_subject_prefix}:ref:refs/tags/v*",
      ]
      deploy = ["${var.github_oidc_subject_prefix}:environment:production"]
      } : role => jsonencode({
        Version = "2012-10-17"
        Statement = [{
          Effect    = "Allow"
          Principal = { Federated = aws_iam_openid_connect_provider.github.arn }
          Action    = "sts:AssumeRoleWithWebIdentity"
          Condition = {
            StringEquals = { "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com" }
            # StringLike for the tag wildcard; the other subjects have none, so they match exactly.
            StringLike = { "token.actions.githubusercontent.com:sub" = subjects }
          }
        }]
    })
  }
}

resource "aws_iam_role" "build" {
  name               = "${local.name}-github-build"
  assume_role_policy = local.github_trust.build
}

resource "aws_iam_role_policy" "build" {
  name = "push-slotty-images"
  role = aws_iam_role.build.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "EcrLogin"
        Effect   = "Allow"
        Action   = "ecr:GetAuthorizationToken"
        Resource = "*"
      },
      {
        Sid    = "EcrPush"
        Effect = "Allow"
        Action = [
          "ecr:BatchCheckLayerAvailability", "ecr:BatchGetImage", "ecr:CompleteLayerUpload", "ecr:DescribeImages",
          "ecr:GetDownloadUrlForLayer", "ecr:InitiateLayerUpload", "ecr:PutImage", "ecr:UploadLayerPart",
        ]
        Resource = aws_ecr_repository.app.arn
      },
    ]
  })
}

resource "aws_iam_role" "deploy" {
  name               = "${local.name}-github-deploy"
  assume_role_policy = local.github_trust.deploy
}

resource "aws_iam_role_policy" "deploy" {
  name = "deploy-slotty"
  role = aws_iam_role.deploy.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "TaskDefinitions"
        Effect   = "Allow"
        Action   = ["ecs:DescribeTaskDefinition", "ecs:RegisterTaskDefinition"]
        Resource = "*"
      },
      {
        Sid       = "RunMigrations"
        Effect    = "Allow"
        Action    = "ecs:RunTask"
        Resource  = "arn:aws:ecs:${local.region}:${local.account_id}:task-definition/${local.name}-migrate:*"
        Condition = { ArnEquals = { "ecs:cluster" = aws_ecs_cluster.main.arn } }
      },
      {
        Sid      = "WatchTasks"
        Effect   = "Allow"
        Action   = ["ecs:DescribeTasks"]
        Resource = "arn:aws:ecs:${local.region}:${local.account_id}:task/${aws_ecs_cluster.main.name}/*"
      },
      {
        Sid      = "RollServices"
        Effect   = "Allow"
        Action   = ["ecs:UpdateService", "ecs:DescribeServices"]
        Resource = [aws_ecs_service.web.id, aws_ecs_service.worker.id]
      },
      {
        Sid       = "PassTaskRoles"
        Effect    = "Allow"
        Action    = "iam:PassRole"
        Resource  = [aws_iam_role.execution.arn, aws_iam_role.task.arn]
        Condition = { StringEquals = { "iam:PassedToService" = "ecs-tasks.amazonaws.com" } }
      },
      {
        Sid      = "MigrationLogs"
        Effect   = "Allow"
        Action   = ["logs:GetLogEvents"]
        Resource = "${aws_cloudwatch_log_group.task["migrate"].arn}:*"
      },
    ]
  })
}
