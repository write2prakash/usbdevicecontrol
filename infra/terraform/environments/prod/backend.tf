terraform {
  backend "s3" {
    bucket = "usb-control-prod-terraform-state"
    key    = "prod/terraform.tfstate"
    region = "us-east-1"
    dynamodb_table = "usb-control-prod-lock"
  }
}
