# ECS on Fargate (ARM64/Graviton). Three task definitions from the same build:
#   web     → service, min var.web_min (first task on regular Fargate, the rest on Spot), CPU autoscaling
#   worker  → service, 1 task on Spot (it claims rows and drains on SIGTERM, so interruptions are safe)
#   migrate → one-off task CI runs before rolling out the services
#
# Images: Terraform registers revisions with `image_tag`. CI (.github/workflows/deploy.yml) takes
# the latest revision, swaps in the new image and deploys it. Services ignore task_definition
# changes, so an env change made here goes live on the next CI deploy (run the workflow by hand).

variable "image_tag" {
  description = "Image tag Terraform's own revisions use; CI replaces it on every deploy."
  type        = string
  default     = "bootstrap"
}

resource "aws_ecs_cluster" "main" {
  name = local.name
  setting {
    name  = "containerInsights"
    value = "disabled"
  }
}

resource "aws_ecs_cluster_capacity_providers" "main" {
  cluster_name       = aws_ecs_cluster.main.name
  capacity_providers = ["FARGATE", "FARGATE_SPOT"]
}

resource "aws_cloudwatch_log_group" "task" {
  for_each          = toset(["web", "worker", "migrate"])
  name              = "/${local.name}/${each.key}"
  retention_in_days = 14
}

locals {
  image = "${aws_ecr_repository.app.repository_url}:${var.image_tag}"

  common_env = [
    { name = "APP_URL", value = local.app_url },
    { name = "MAIL_FROM", value = local.mail_from },
    { name = "SMTP_HOST", value = "email-smtp.${local.region}.amazonaws.com" },
    { name = "SMTP_PORT", value = "587" },
    { name = "VAPID_SUBJECT", value = "mailto:no-reply@${var.domain}" },
    { name = "NODE_EXTRA_CA_CERTS", value = "/app/certs/rds-global-bundle.pem" },
    # db.t4g.micro allows ~80 connections: 4 web tasks + worker stay well under.
    { name = "DATABASE_POOL_MAX", value = "10" },
  ]

  push_secrets = local.push_on ? [
    { name = "VAPID_PUBLIC_KEY", valueFrom = aws_ssm_parameter.vapid_public[0].arn },
    { name = "VAPID_PRIVATE_KEY", valueFrom = aws_ssm_parameter.vapid_private[0].arn },
  ] : []

  log_config = {
    for k in ["web", "worker", "migrate"] : k => {
      logDriver = "awslogs"
      options = {
        awslogs-group         = aws_cloudwatch_log_group.task[k].name
        awslogs-region        = local.region
        awslogs-stream-prefix = k
        # Never block the app on log delivery.
        mode            = "non-blocking"
        max-buffer-size = "25m"
      }
    }
  }
}

resource "aws_ecs_task_definition" "web" {
  family                   = "${local.name}-web"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.web_cpu
  memory                   = var.web_memory
  execution_role_arn       = aws_iam_role.execution.arn
  task_role_arn            = aws_iam_role.task.arn
  skip_destroy             = true

  runtime_platform {
    cpu_architecture        = "ARM64"
    operating_system_family = "LINUX"
  }

  container_definitions = jsonencode([{
    name         = "web"
    image        = local.image
    essential    = true
    portMappings = [{ containerPort = 3000, protocol = "tcp", name = "web" }]
    environment  = concat(local.common_env, [{ name = "HOSTNAME", value = "0.0.0.0" }])
    secrets = concat([
      { name = "DATABASE_URL", valueFrom = aws_ssm_parameter.database_url.arn },
      { name = "ORIGIN_VERIFY_SECRET", valueFrom = aws_ssm_parameter.origin_verify.arn },
      { name = "ANALYTICS_SECRET", valueFrom = aws_ssm_parameter.analytics_secret.arn },
    ], local.push_secrets)
    healthCheck = {
      command     = ["CMD", "node", "-e", "fetch('http://localhost:3000/health/live').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]
      interval    = 15
      timeout     = 5
      retries     = 3
      startPeriod = 30
    }
    linuxParameters  = { initProcessEnabled = true }
    stopTimeout      = 30
    logConfiguration = local.log_config.web
  }])
}

resource "aws_ecs_task_definition" "worker" {
  family                   = "${local.name}-worker"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.worker_cpu
  memory                   = var.worker_memory
  execution_role_arn       = aws_iam_role.execution.arn
  task_role_arn            = aws_iam_role.task.arn
  skip_destroy             = true

  runtime_platform {
    cpu_architecture        = "ARM64"
    operating_system_family = "LINUX"
  }

  container_definitions = jsonencode([{
    name        = "worker"
    image       = local.image
    essential   = true
    command     = ["node", "dist/jobs/worker.js"]
    environment = local.common_env
    secrets = concat([
      { name = "DATABASE_URL", valueFrom = aws_ssm_parameter.database_url.arn },
      { name = "SMTP_USER", valueFrom = aws_ssm_parameter.smtp_user.arn },
      { name = "SMTP_PASS", valueFrom = aws_ssm_parameter.smtp_pass.arn },
    ], local.push_secrets)
    linuxParameters = { initProcessEnabled = true }
    # The worker force-exits after 25 s; Spot gives 2 minutes' warning before SIGTERM's deadline.
    stopTimeout      = 30
    logConfiguration = local.log_config.worker
  }])
}

resource "aws_ecs_task_definition" "migrate" {
  family                   = "${local.name}-migrate"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = 256
  memory                   = 512
  execution_role_arn       = aws_iam_role.execution.arn
  task_role_arn            = aws_iam_role.task.arn
  skip_destroy             = true

  runtime_platform {
    cpu_architecture        = "ARM64"
    operating_system_family = "LINUX"
  }

  container_definitions = jsonencode([{
    name             = "migrate"
    image            = "${local.image}-migrate"
    essential        = true
    environment      = []
    secrets          = [{ name = "DATABASE_URL", valueFrom = aws_ssm_parameter.migrate_database_url.arn }]
    logConfiguration = local.log_config.migrate
  }])
}

resource "aws_ecs_service" "web" {
  name                               = "web"
  cluster                            = aws_ecs_cluster.main.id
  task_definition                    = aws_ecs_task_definition.web.arn
  desired_count                      = var.launch ? var.web_min : 0
  deployment_minimum_healthy_percent = 100
  deployment_maximum_percent         = 200
  enable_execute_command             = var.enable_exec
  propagate_tags                     = "SERVICE"
  availability_zone_rebalancing      = "ENABLED"

  capacity_provider_strategy {
    capacity_provider = "FARGATE"
    base              = 1
    weight            = 0
  }
  capacity_provider_strategy {
    capacity_provider = "FARGATE_SPOT"
    weight            = 1
  }

  network_configuration {
    subnets          = aws_subnet.app[*].id
    security_groups  = [aws_security_group.web.id]
    assign_public_ip = false
  }

  service_registries {
    registry_arn   = aws_service_discovery_service.web.arn
    container_name = "web"
    container_port = 3000
  }

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  lifecycle {
    # CI owns the running revision; autoscaling owns the count.
    ignore_changes = [task_definition, desired_count]
  }

  depends_on = [aws_ecs_cluster_capacity_providers.main]
}

resource "aws_ecs_service" "worker" {
  name                               = "worker"
  cluster                            = aws_ecs_cluster.main.id
  task_definition                    = aws_ecs_task_definition.worker.arn
  desired_count                      = var.launch ? 1 : 0
  deployment_minimum_healthy_percent = 0
  deployment_maximum_percent         = 100
  enable_execute_command             = var.enable_exec
  propagate_tags                     = "SERVICE"

  capacity_provider_strategy {
    capacity_provider = "FARGATE_SPOT"
    weight            = 1
  }

  network_configuration {
    subnets          = aws_subnet.app[*].id
    security_groups  = [aws_security_group.worker.id]
    assign_public_ip = false
  }

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  lifecycle {
    ignore_changes = [task_definition]
  }

  depends_on = [aws_ecs_cluster_capacity_providers.main]
}

# ── Web autoscaling on CPU ──

resource "aws_appautoscaling_target" "web" {
  service_namespace  = "ecs"
  resource_id        = "service/${aws_ecs_cluster.main.name}/${aws_ecs_service.web.name}"
  scalable_dimension = "ecs:service:DesiredCount"
  min_capacity       = var.launch ? var.web_min : 0
  max_capacity       = var.launch ? var.web_max : 0
}

resource "aws_appautoscaling_policy" "web_cpu" {
  name               = "web-cpu"
  service_namespace  = aws_appautoscaling_target.web.service_namespace
  resource_id        = aws_appautoscaling_target.web.resource_id
  scalable_dimension = aws_appautoscaling_target.web.scalable_dimension
  policy_type        = "TargetTrackingScaling"

  target_tracking_scaling_policy_configuration {
    target_value       = 60
    scale_in_cooldown  = 300
    scale_out_cooldown = 60
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageCPUUtilization"
    }
  }
}
