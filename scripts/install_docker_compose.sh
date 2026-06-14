#!/bin/bash
set -e

if ! command -v docker-compose >/dev/null 2>&1; then
  echo "docker-compose not found, installing..."
  sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
  sudo chmod +x /usr/local/bin/docker-compose
  echo "docker-compose installed successfully."
else
  echo "docker-compose already installed."
fi
