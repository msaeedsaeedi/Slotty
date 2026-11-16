output "name_servers" {
  description = "Add these as NS records for `slotty` in the Cloudflare zone of msaeedsaeedi.com."
  value       = aws_route53_zone.main.name_servers
}

output "url" {
  value = local.app_url
}

output "cloudfront_domain" {
  value = aws_cloudfront_distribution.main.domain_name
}

output "api_endpoint" {
  description = "Direct origin URL: should answer 403 (requests must come through CloudFront)."
  value       = aws_apigatewayv2_api.main.api_endpoint
}

output "db_address" {
  value = aws_db_instance.main.address
}

output "nat_instance_id" {
  description = "Target for SSM port forwarding to RDS."
  value       = var.nat_mode == "instance" ? aws_instance.nat[0].id : null
}

# Repository variables for .github/workflows/deploy.yml (Settings → Secrets and variables → Actions → Variables).
output "github_actions_variables" {
  value = {
    AWS_DEPLOY_ROLE_ARN = aws_iam_role.deploy.arn
    ECR_REPOSITORY      = aws_ecr_repository.app.repository_url
    ECS_CLUSTER         = aws_ecs_cluster.main.name
    ECS_SUBNETS         = join(",", aws_subnet.app[*].id)
    ECS_SECURITY_GROUP  = aws_security_group.worker.id
    APP_URL             = local.app_url
  }
}
