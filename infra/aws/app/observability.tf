# Ten alarms (the CloudWatch always-free allowance) to one SNS email topic.
# Without Container Insights there's no task-count metric, so "service down" is "CPU metric
# missing" (missing data = breaching).

resource "aws_sns_topic" "alerts" {
  name              = "${local.name}-alerts"
  kms_master_key_id = aws_kms_key.alerts.arn
}

# A customer-managed key for the alerts topic (#63): CloudWatch alarms and SES feedback can only
# publish to an encrypted topic when the key policy lets them, which the AWS-managed aws/sns key
# can't. About $1 a month (ch. 12).
resource "aws_kms_key" "alerts" {
  description             = "${local.name} alerts topic"
  enable_key_rotation     = true
  deletion_window_in_days = 30
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "AccountAdmin"
        Effect    = "Allow"
        Principal = { AWS = "arn:aws:iam::${local.account_id}:root" }
        Action    = "kms:*"
        Resource  = "*"
      },
      {
        Sid       = "PublishersEncrypt"
        Effect    = "Allow"
        Principal = { Service = ["cloudwatch.amazonaws.com", "ses.amazonaws.com"] }
        Action    = ["kms:GenerateDataKey*", "kms:Decrypt"]
        Resource  = "*"
        Condition = { StringEquals = { "aws:SourceAccount" = local.account_id } }
      },
    ]
  })
}

resource "aws_kms_alias" "alerts" {
  name          = "alias/${local.name}-alerts"
  target_key_id = aws_kms_key.alerts.key_id
}

resource "aws_sns_topic_subscription" "email" {
  topic_arn = aws_sns_topic.alerts.arn
  protocol  = "email"
  endpoint  = var.alert_email
}

locals {
  alarm_actions = [aws_sns_topic.alerts.arn]
  ecs_dims      = { for s in ["web", "worker"] : s => { ClusterName = aws_ecs_cluster.main.name, ServiceName = s } }
}

resource "aws_cloudwatch_metric_alarm" "service_down" {
  for_each            = var.launch ? local.ecs_dims : {}
  alarm_name          = "${local.name}-${each.key}-down"
  alarm_description   = "No ${each.key} tasks reporting for 10 minutes."
  namespace           = "AWS/ECS"
  metric_name         = "CPUUtilization"
  dimensions          = each.value
  statistic           = "SampleCount"
  period              = 300
  evaluation_periods  = 2
  threshold           = 1
  comparison_operator = "LessThanThreshold"
  treat_missing_data  = "breaching"
  alarm_actions       = local.alarm_actions
  ok_actions          = local.alarm_actions
}

resource "aws_cloudwatch_metric_alarm" "web_cpu" {
  alarm_name          = "${local.name}-web-cpu-high"
  alarm_description   = "Web CPU above 85% for 15 minutes even with autoscaling: raise web_max or web_cpu."
  namespace           = "AWS/ECS"
  metric_name         = "CPUUtilization"
  dimensions          = local.ecs_dims.web
  statistic           = "Average"
  period              = 300
  evaluation_periods  = 3
  threshold           = 85
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = local.alarm_actions
}

resource "aws_cloudwatch_metric_alarm" "web_memory" {
  alarm_name          = "${local.name}-web-memory-high"
  namespace           = "AWS/ECS"
  metric_name         = "MemoryUtilization"
  dimensions          = local.ecs_dims.web
  statistic           = "Maximum"
  period              = 300
  evaluation_periods  = 2
  threshold           = 85
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = local.alarm_actions
}

resource "aws_cloudwatch_metric_alarm" "api_5xx" {
  alarm_name          = "${local.name}-5xx"
  alarm_description   = "More than 10 server errors in 5 minutes."
  namespace           = "AWS/ApiGateway"
  metric_name         = "5xx"
  dimensions          = { ApiId = aws_apigatewayv2_api.main.id, Stage = "$default" }
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  threshold           = 10
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = local.alarm_actions
}

resource "aws_cloudwatch_metric_alarm" "db_cpu" {
  alarm_name          = "${local.name}-db-cpu-high"
  namespace           = "AWS/RDS"
  metric_name         = "CPUUtilization"
  dimensions          = { DBInstanceIdentifier = aws_db_instance.main.identifier }
  statistic           = "Average"
  period              = 300
  evaluation_periods  = 3
  threshold           = 80
  comparison_operator = "GreaterThanThreshold"
  alarm_actions       = local.alarm_actions
}

resource "aws_cloudwatch_metric_alarm" "db_storage" {
  alarm_name          = "${local.name}-db-storage-low"
  namespace           = "AWS/RDS"
  metric_name         = "FreeStorageSpace"
  dimensions          = { DBInstanceIdentifier = aws_db_instance.main.identifier }
  statistic           = "Minimum"
  period              = 300
  evaluation_periods  = 1
  threshold           = 2 * 1024 * 1024 * 1024
  comparison_operator = "LessThanThreshold"
  alarm_actions       = local.alarm_actions
}

resource "aws_cloudwatch_metric_alarm" "db_connections" {
  alarm_name          = "${local.name}-db-connections-high"
  namespace           = "AWS/RDS"
  metric_name         = "DatabaseConnections"
  dimensions          = { DBInstanceIdentifier = aws_db_instance.main.identifier }
  statistic           = "Maximum"
  period              = 300
  evaluation_periods  = 2
  threshold           = 70
  comparison_operator = "GreaterThanThreshold"
  alarm_actions       = local.alarm_actions
}

resource "aws_cloudwatch_metric_alarm" "nat_status" {
  count               = var.nat_mode == "instance" ? 1 : 0
  alarm_name          = "${local.name}-nat-status-failed"
  alarm_description   = "NAT instance failing status checks: tasks can't send email or pull images."
  namespace           = "AWS/EC2"
  metric_name         = "StatusCheckFailed"
  dimensions          = { InstanceId = aws_instance.nat[0].id }
  statistic           = "Maximum"
  period              = 300
  evaluation_periods  = 2
  threshold           = 1
  comparison_operator = "GreaterThanOrEqualToThreshold"
  alarm_actions       = local.alarm_actions
}

# Worker problems, from its logs, as one alarm:
#   job crashes   "[worker] <job> failed"           → any crash alerts
#   failed sends  "[worker] … failed=N" (summaries) → only 10+ in 30 min: an outage (SMTP auth,
#                 SES limits), not one bad address. Bounces/complaints arrive via SES events.
resource "aws_cloudwatch_log_metric_filter" "worker_crashes" {
  name           = "worker-job-crashes"
  log_group_name = aws_cloudwatch_log_group.task["worker"].name
  pattern        = "\"[worker]\" \"failed\" -\"failed=\""
  metric_transformation {
    name          = "WorkerJobCrashes"
    namespace     = var.product_name
    value         = "1"
    default_value = "0"
  }
}

resource "aws_cloudwatch_log_metric_filter" "email_send_failures" {
  name           = "email-send-failures"
  log_group_name = aws_cloudwatch_log_group.task["worker"].name
  pattern        = "\"[worker]\" \"failed=\""
  metric_transformation {
    name          = "EmailSendFailures"
    namespace     = var.product_name
    value         = "1"
    default_value = "0"
  }
}

resource "aws_cloudwatch_metric_alarm" "worker_failures" {
  alarm_name          = "${local.name}-worker-failures"
  alarm_description   = "Worker job crashed, or 10+ failed email sends in 30 min (see /${local.name}/worker logs and Admin → email outbox)."
  evaluation_periods  = 1
  threshold           = 1
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = local.alarm_actions
  ok_actions          = local.alarm_actions

  metric_query {
    id          = "problem"
    expression  = "IF(crashes >= 1 OR sends >= 10, 1, 0)"
    label       = "Worker problem"
    return_data = true
  }
  metric_query {
    id = "crashes"
    metric {
      namespace   = var.product_name
      metric_name = "WorkerJobCrashes"
      period      = 1800
      stat        = "Sum"
    }
  }
  metric_query {
    id = "sends"
    metric {
      namespace   = var.product_name
      metric_name = "EmailSendFailures"
      period      = 1800
      stat        = "Sum"
    }
  }
}
