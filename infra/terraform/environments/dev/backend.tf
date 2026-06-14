terraform {
  backend "s3" {
    bucket = "usb-control-dev-terraform-state"
    key    = "dev/terraform.tfstate"
    region = "us-east-1"
    dynamodb_table = "usb-control-dev-lock"
  }
}
