# VPC across two AZs. Public subnets hold only the NAT; tasks live in the app subnets and RDS in
# the db subnets, which have no route to the internet at all.

data "aws_availability_zones" "available" {
  state = "available"
}

locals {
  azs = slice(data.aws_availability_zones.available.names, 0, 2)
  cidr = {
    vpc    = "10.0.0.0/16"
    public = ["10.0.0.0/24", "10.0.1.0/24"]
    app    = ["10.0.10.0/24", "10.0.11.0/24"]
    db     = ["10.0.20.0/24", "10.0.21.0/24"]
  }
}

resource "aws_vpc" "main" {
  cidr_block           = local.cidr.vpc
  enable_dns_support   = true
  enable_dns_hostnames = true
  tags                 = { Name = local.name }
}

# The default security group allows all traffic between its members; leave it with no rules.
resource "aws_default_security_group" "default" {
  vpc_id = aws_vpc.main.id
}

resource "aws_internet_gateway" "main" {
  vpc_id = aws_vpc.main.id
  tags   = { Name = local.name }
}

resource "aws_subnet" "public" {
  count             = 2
  vpc_id            = aws_vpc.main.id
  cidr_block        = local.cidr.public[count.index]
  availability_zone = local.azs[count.index]
  tags              = { Name = "${local.name}-public-${local.azs[count.index]}" }
}

resource "aws_subnet" "app" {
  count             = 2
  vpc_id            = aws_vpc.main.id
  cidr_block        = local.cidr.app[count.index]
  availability_zone = local.azs[count.index]
  tags              = { Name = "${local.name}-app-${local.azs[count.index]}" }
}

resource "aws_subnet" "db" {
  count             = 2
  vpc_id            = aws_vpc.main.id
  cidr_block        = local.cidr.db[count.index]
  availability_zone = local.azs[count.index]
  tags              = { Name = "${local.name}-db-${local.azs[count.index]}" }
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id
  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.main.id
  }
  tags = { Name = "${local.name}-public" }
}

resource "aws_route_table_association" "public" {
  count          = 2
  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public.id
}

# App subnets: default route through the NAT (nat.tf adds it).
resource "aws_route_table" "app" {
  vpc_id = aws_vpc.main.id
  tags   = { Name = "${local.name}-app" }
}

resource "aws_route_table_association" "app" {
  count          = 2
  subnet_id      = aws_subnet.app[count.index].id
  route_table_id = aws_route_table.app.id
}

resource "aws_route_table" "db" {
  vpc_id = aws_vpc.main.id
  tags   = { Name = "${local.name}-db" }
}

resource "aws_route_table_association" "db" {
  count          = 2
  subnet_id      = aws_subnet.db[count.index].id
  route_table_id = aws_route_table.db.id
}

# Free: ECR image layers come from S3, so pulls skip the NAT.
resource "aws_vpc_endpoint" "s3" {
  vpc_id            = aws_vpc.main.id
  service_name      = "com.amazonaws.${local.region}.s3"
  vpc_endpoint_type = "Gateway"
  route_table_ids   = [aws_route_table.app.id]
  tags              = { Name = "${local.name}-s3" }
}

# ── Security groups: CloudFront → API Gateway (VPC link) → web → RDS. ──

resource "aws_security_group" "vpc_link" {
  name        = "${local.name}-vpc-link"
  description = "API Gateway VPC link"
  vpc_id      = aws_vpc.main.id
}

resource "aws_vpc_security_group_egress_rule" "vpc_link_to_web" {
  security_group_id            = aws_security_group.vpc_link.id
  referenced_security_group_id = aws_security_group.web.id
  ip_protocol                  = "tcp"
  from_port                    = 3000
  to_port                      = 3000
}

resource "aws_security_group" "web" {
  name        = "${local.name}-web"
  description = "Web tasks"
  vpc_id      = aws_vpc.main.id
}

resource "aws_vpc_security_group_ingress_rule" "web_from_vpc_link" {
  security_group_id            = aws_security_group.web.id
  referenced_security_group_id = aws_security_group.vpc_link.id
  ip_protocol                  = "tcp"
  from_port                    = 3000
  to_port                      = 3000
}

resource "aws_security_group" "worker" {
  name        = "${local.name}-worker"
  description = "Worker and one-off tasks (no inbound)"
  vpc_id      = aws_vpc.main.id
}

# Task egress, only what the tasks use (#63). Security groups don't filter the VPC's DNS
# resolver or the task metadata endpoint, so neither needs a rule.
#   web, worker: HTTPS (ECR, SSM, CloudWatch Logs through the NAT; push services) and Postgres to RDS.
#   worker only: SMTP submission (587) to SES.
locals {
  task_sgs = { web = aws_security_group.web.id, worker = aws_security_group.worker.id }
}

resource "aws_vpc_security_group_egress_rule" "tasks_https" {
  for_each          = local.task_sgs
  security_group_id = each.value
  description       = "HTTPS: AWS APIs and push services"
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "tcp"
  from_port         = 443
  to_port           = 443
}

resource "aws_vpc_security_group_egress_rule" "tasks_db" {
  for_each                     = local.task_sgs
  security_group_id            = each.value
  description                  = "Postgres"
  referenced_security_group_id = aws_security_group.db.id
  ip_protocol                  = "tcp"
  from_port                    = 5432
  to_port                      = 5432
}

resource "aws_vpc_security_group_egress_rule" "worker_smtp" {
  security_group_id = aws_security_group.worker.id
  description       = "SMTP submission to SES"
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "tcp"
  from_port         = 587
  to_port           = 587
}

resource "aws_security_group" "db" {
  name        = "${local.name}-db"
  description = "RDS Postgres"
  vpc_id      = aws_vpc.main.id
}

resource "aws_vpc_security_group_ingress_rule" "db_from" {
  for_each = {
    web    = aws_security_group.web.id
    worker = aws_security_group.worker.id
    # SSM port forwarding for admin access goes through the NAT instance.
    nat = aws_security_group.nat.id
  }
  security_group_id            = aws_security_group.db.id
  referenced_security_group_id = each.value
  ip_protocol                  = "tcp"
  from_port                    = 5432
  to_port                      = 5432
}
