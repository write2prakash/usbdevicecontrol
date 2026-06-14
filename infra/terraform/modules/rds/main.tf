resource "aws_db_instance" "mysql" {
  allocated_storage    = var.allocated_storage
  engine               = "mysql"
  engine_version       = "8.0"
  instance_class       = var.instance_class
  name                 = var.db_name
  username             = var.username
  password             = var.password
  publicly_accessible  = false
  multi_az             = var.multi_az
  skip_final_snapshot  = true
  vpc_security_group_ids = var.security_group_ids
  db_subnet_group_name = var.subnet_group
  tags = {
    Name = "usb-control-${var.environment}-rds"
  }
}

output "rds_endpoint" {
  value = aws_db_instance.mysql.address
}
