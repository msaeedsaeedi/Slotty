# Budget and anomaly alerts for the Slotty account, kept in the management account so the
# member account can't change or delete them.

resource "aws_budgets_budget" "slotty" {
  name         = "slotty-prod-monthly"
  budget_type  = "COST"
  limit_amount = tostring(var.budget_usd)
  limit_unit   = "USD"
  time_unit    = "MONTHLY"

  cost_filter {
    name   = "LinkedAccount"
    values = [aws_organizations_account.slotty.id]
  }

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 90
    threshold_type             = "PERCENTAGE"
    notification_type          = "ACTUAL"
    subscriber_email_addresses = [var.alert_email]
  }

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 100
    threshold_type             = "PERCENTAGE"
    notification_type          = "ACTUAL"
    subscriber_email_addresses = [var.alert_email]
  }

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 100
    threshold_type             = "PERCENTAGE"
    notification_type          = "FORECASTED"
    subscriber_email_addresses = [var.alert_email]
  }
}

resource "aws_ce_anomaly_monitor" "slotty" {
  name         = "slotty-prod-spend"
  monitor_type = "CUSTOM"
  monitor_specification = jsonencode({
    Dimensions = { Key = "LINKED_ACCOUNT", Values = [aws_organizations_account.slotty.id], MatchOptions = null }
    And        = null, Or = null, Not = null, CostCategories = null, Tags = null, ProductAttributes = null
  })
}

resource "aws_ce_anomaly_subscription" "slotty" {
  name             = "slotty-prod-anomalies"
  frequency        = "DAILY"
  monitor_arn_list = [aws_ce_anomaly_monitor.slotty.arn]

  subscriber {
    type    = "EMAIL"
    address = var.alert_email
  }

  # Alert when an anomaly's total impact is at least $5.
  threshold_expression {
    dimension {
      key           = "ANOMALY_TOTAL_IMPACT_ABSOLUTE"
      match_options = ["GREATER_THAN_OR_EQUAL"]
      values        = ["5"]
    }
  }
}
