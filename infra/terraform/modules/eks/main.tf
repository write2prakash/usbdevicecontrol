resource "aws_eks_cluster" "cluster" {
  name     = "usb-control-${var.environment}"
  role_arn = var.cluster_role_arn

  vpc_config {
    subnet_ids = var.subnet_ids
  }

  lifecycle {
    ignore_changes = ["identity"]
  }
}

resource "aws_eks_node_group" "workers" {
  cluster_name    = aws_eks_cluster.cluster.name
  node_group_name = "usb-control-${var.environment}-workers"
  node_role_arn   = var.node_role_arn
  subnet_ids      = var.subnet_ids

  scaling_config {
    desired_size = var.node_count
    max_size     = var.node_count + 1
    min_size     = var.node_count
  }
}

output "cluster_name" {
  value = aws_eks_cluster.cluster.name
}
