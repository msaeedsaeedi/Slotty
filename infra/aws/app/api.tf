# API Gateway HTTP API as the load balancer: a VPC link into the app subnets, routed through
# Cloud Map to whichever web tasks are healthy. About $1 per million requests, against ~$18/month
# for an ALB. Limits: 30 s per request, 10 MB responses, and responses are buffered, not streamed.
# Stage throttling is the edge rate limit.

resource "aws_apigatewayv2_vpc_link" "main" {
  name               = local.name
  subnet_ids         = aws_subnet.app[*].id
  security_group_ids = [aws_security_group.vpc_link.id]
}

resource "aws_apigatewayv2_api" "main" {
  name          = local.name
  protocol_type = "HTTP"
  description   = "${var.product_name} origin (behind CloudFront)"
}

resource "aws_apigatewayv2_integration" "web" {
  api_id                 = aws_apigatewayv2_api.main.id
  integration_type       = "HTTP_PROXY"
  integration_method     = "ANY"
  connection_type        = "VPC_LINK"
  connection_id          = aws_apigatewayv2_vpc_link.main.id
  integration_uri        = aws_service_discovery_service.web.arn
  payload_format_version = "1.0"
  timeout_milliseconds   = 30000
}

resource "aws_apigatewayv2_route" "default" {
  api_id    = aws_apigatewayv2_api.main.id
  route_key = "$default"
  target    = "integrations/${aws_apigatewayv2_integration.web.id}"
}

resource "aws_cloudwatch_log_group" "api" {
  name              = "/${local.name}/api"
  retention_in_days = 14
}

resource "aws_apigatewayv2_stage" "default" {
  api_id      = aws_apigatewayv2_api.main.id
  name        = "$default"
  auto_deploy = true

  default_route_settings {
    throttling_rate_limit  = var.api_rate_limit
    throttling_burst_limit = var.api_burst_limit
  }

  access_log_settings {
    destination_arn = aws_cloudwatch_log_group.api.arn
    format = jsonencode({
      requestId = "$context.requestId"
      ip        = "$context.identity.sourceIp"
      method    = "$context.httpMethod"
      path      = "$context.path"
      status    = "$context.status"
      latencyMs = "$context.responseLatency"
      error     = "$context.integrationErrorMessage"
    })
  }
}
