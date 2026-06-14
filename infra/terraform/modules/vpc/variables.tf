variable "environment" {
  type        = string
  description = "Deployment environment name"
}

variable "cidr_block" {
  type        = string
  description = "VPC CIDR block"
  default     = "10.0.0.0/16"
}
