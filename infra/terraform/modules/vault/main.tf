resource "aws_secretsmanager_secret" "vault_root" {
  name = "usb-control-${var.environment}-vault-root"
}

output "vault_secret_arn" {
  value = aws_secretsmanager_secret.vault_root.arn
}
