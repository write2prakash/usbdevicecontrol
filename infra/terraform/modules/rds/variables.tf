variable "environment" {
  type = string
}

variable "allocated_storage" {
  type    = number
  default = 20
}

variable "instance_class" {
  type    = string
  default = "db.t3.micro"
}

variable "db_name" {
  type    = string
  default = "usb_control"
}

variable "username" {
  type = string
}

variable "password" {
  type = string
}

variable "multi_az" {
  type    = bool
  default = false
}

variable "security_group_ids" {
  type = list(string)
}

variable "subnet_group" {
  type = string
}
