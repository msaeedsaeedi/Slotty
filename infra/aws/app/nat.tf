# Egress for the app subnets. Default: fck-nat (https://fck-nat.dev) on a t4g.nano, about $7/month
# with its public IPv4, instead of about $33 + $0.045/GB for a managed NAT Gateway.
# It's a single instance: EC2 automatic recovery restarts it on host failure. While it's down,
# running tasks keep serving users but can't send email or pull images.

resource "aws_security_group" "nat" {
  name        = "${local.name}-nat"
  description = "NAT instance: anything from the app subnets, out to the internet"
  vpc_id      = aws_vpc.main.id
}

resource "aws_vpc_security_group_ingress_rule" "nat_from_app" {
  for_each          = toset(local.cidr.app)
  security_group_id = aws_security_group.nat.id
  cidr_ipv4         = each.value
  ip_protocol       = "-1"
}

resource "aws_vpc_security_group_egress_rule" "nat_out" {
  security_group_id = aws_security_group.nat.id
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "-1"
}

# Session Manager on the NAT instance doubles as the bastion for RDS port forwarding.
resource "aws_iam_role" "nat" {
  count = var.nat_mode == "instance" ? 1 : 0
  name  = "${local.name}-nat"
  assume_role_policy = jsonencode({
    Version   = "2012-10-17"
    Statement = [{ Effect = "Allow", Principal = { Service = "ec2.amazonaws.com" }, Action = "sts:AssumeRole" }]
  })
}

resource "aws_iam_role_policy_attachment" "nat_ssm" {
  count      = var.nat_mode == "instance" ? 1 : 0
  role       = aws_iam_role.nat[0].name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

resource "aws_iam_instance_profile" "nat" {
  count = var.nat_mode == "instance" ? 1 : 0
  name  = "${local.name}-nat"
  role  = aws_iam_role.nat[0].name
}

resource "aws_instance" "nat" {
  count                       = var.nat_mode == "instance" ? 1 : 0
  ami                         = var.nat_ami_id
  instance_type               = "t4g.nano"
  subnet_id                   = aws_subnet.public[0].id
  vpc_security_group_ids      = [aws_security_group.nat.id]
  associate_public_ip_address = true
  source_dest_check           = false
  iam_instance_profile        = aws_iam_instance_profile.nat[0].name

  metadata_options {
    http_tokens = "required"
  }

  root_block_device {
    volume_type = "gp3"
    volume_size = 4
    encrypted   = true
  }

  maintenance_options {
    auto_recovery = "default"
  }

  tags = { Name = "${local.name}-nat" }
}

resource "aws_route" "app_default_instance" {
  count                  = var.nat_mode == "instance" ? 1 : 0
  route_table_id         = aws_route_table.app.id
  destination_cidr_block = "0.0.0.0/0"
  network_interface_id   = aws_instance.nat[0].primary_network_interface_id
}

# ── Managed alternative ──

resource "aws_eip" "nat" {
  count  = var.nat_mode == "gateway" ? 1 : 0
  domain = "vpc"
}

resource "aws_nat_gateway" "main" {
  count         = var.nat_mode == "gateway" ? 1 : 0
  allocation_id = aws_eip.nat[0].id
  subnet_id     = aws_subnet.public[0].id
  depends_on    = [aws_internet_gateway.main]
}

resource "aws_route" "app_default_gateway" {
  count                  = var.nat_mode == "gateway" ? 1 : 0
  route_table_id         = aws_route_table.app.id
  destination_cidr_block = "0.0.0.0/0"
  nat_gateway_id         = aws_nat_gateway.main[0].id
}
