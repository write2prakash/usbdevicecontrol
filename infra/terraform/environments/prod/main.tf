terraform {
  backend "s3" {
    bucket = "usb-control-prod-terraform-state"
    key    = "prod/terraform.tfstate"
    region = "us-east-1"
    dynamodb_table = "usb-control-prod-lock"
  }
}

provider "aws" {
  region = "us-east-1"
}

module "vpc" {
  source      = "../../modules/vpc"
  environment = "prod"
  cidr_block  = "10.1.0.0/16"
}

module "rds" {
  source             = "../../modules/rds"
  environment        = "prod"
  instance_class     = "db.r6g.large"
  allocated_storage  = 100
  db_name            = "usb_control"
  username           = "usbadmin"
  password           = "change-me"
  multi_az           = true
  security_group_ids = []
  subnet_group       = ""
}
