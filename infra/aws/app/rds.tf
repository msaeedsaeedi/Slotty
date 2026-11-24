# PostgreSQL 17 on RDS. Private subnets only, encrypted, TLS required, 7 days of point-in-time
# recovery. No RDS Proxy: the worker relies on LISTEN/NOTIFY, which needs a direct session.

resource "random_password" "db" {
  length  = 32
  special = false
}

resource "aws_db_subnet_group" "main" {
  name       = local.name
  subnet_ids = aws_subnet.db[*].id
}

resource "aws_db_parameter_group" "main" {
  name   = "${local.name}-pg17"
  family = "postgres17"

  parameter {
    name         = "rds.force_ssl"
    value        = "1"
    apply_method = "pending-reboot"
  }
  # Log statements slower than 1 s.
  parameter {
    name  = "log_min_duration_statement"
    value = "1000"
  }
  # Don't let a stuck transaction hold locks forever.
  parameter {
    name  = "idle_in_transaction_session_timeout"
    value = "60000"
  }
}

resource "aws_db_instance" "main" {
  identifier     = local.name
  engine         = "postgres"
  engine_version = "17"
  instance_class = var.db_instance_class

  db_name  = var.db_name
  username = var.db_name
  password = random_password.db.result
  port     = 5432

  allocated_storage     = var.db_storage_gb
  max_allocated_storage = var.db_max_storage_gb
  storage_type          = "gp3"
  storage_encrypted     = true

  multi_az               = var.db_multi_az
  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = [aws_security_group.db.id]
  publicly_accessible    = false
  parameter_group_name   = aws_db_parameter_group.main.name

  backup_retention_period    = 7
  backup_window              = "07:00-07:30"
  maintenance_window         = "sun:08:00-sun:08:45"
  auto_minor_version_upgrade = true
  copy_tags_to_snapshot      = true
  deletion_protection        = true
  skip_final_snapshot        = false
  final_snapshot_identifier  = "${local.name}-final"
  apply_immediately          = false

  lifecycle {
    # Minor versions are upgraded by RDS in the maintenance window.
    ignore_changes = [engine_version]
  }
}
