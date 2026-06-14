resource "aws_ecr_repository" "backend" {
  name = "usb-control-backend"
}

resource "aws_ecr_repository" "frontend" {
  name = "usb-control-frontend"
}

output "backend_repository_url" {
  value = aws_ecr_repository.backend.repository_url
}

output "frontend_repository_url" {
  value = aws_ecr_repository.frontend.repository_url
}
