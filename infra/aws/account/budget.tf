# Usage alerts. The budget counts usage before credits, so it shows how fast the Free Tier
# credits are being spent; the remaining balance is `aws freetier get-account-plan-state`
# (runbook, docs ch. 10). Deliberately not a "spend limit": at its limit AWS pauses the whole
# project, production included (ADR-037).

resource "aws_budgets_budget" "usage" {
  name         = "${var.name}-monthly-usage"
  budget_type  = "COST"
  limit_amount = tostring(var.monthly_usage_usd)
  limit_unit   = "USD"
  time_unit    = "MONTHLY"

  cost_types {
    include_credit = false
    include_refund = false
  }

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 80
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
