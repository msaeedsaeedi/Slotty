# Cloud Map registry of the web tasks. ECS registers each task's IP and port (SRV) and removes
# it when the task stops or fails its container health check. API Gateway routes to what's listed.

resource "aws_service_discovery_private_dns_namespace" "main" {
  name = "${local.name}.internal"
  vpc  = aws_vpc.main.id
}

resource "aws_service_discovery_service" "web" {
  name = "web"

  dns_config {
    namespace_id   = aws_service_discovery_private_dns_namespace.main.id
    routing_policy = "MULTIVALUE"
    dns_records {
      type = "SRV"
      ttl  = 10
    }
  }

  # Health comes from ECS (the container health check), not Route 53 checks.
  health_check_custom_config {}
}
