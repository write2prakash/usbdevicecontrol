terraform {
  backend "s3" {
    bucket = "usb-control-dev-terraform-state"
    key    = "dev/terraform.tfstate"
    region = "us-east-1"
    dynamodb_table = "usb-control-dev-lock"
  }
}

provider "aws" {
  region = "us-east-1"
}

module "vpc" {
  source      = "../../modules/vpc"
  environment = "dev"
  cidr_block  = "10.0.0.0/16"
}

module "rds" {
  source             = "../../modules/rds"
  environment        = "dev"
  instance_class     = "db.t3.micro"
  allocated_storage  = 20
  db_name            = "usb_control"
  username           = "usbadmin"
  password           = "change-me"
  multi_az           = false
  security_group_ids = []
  subnet_group       = ""
}
