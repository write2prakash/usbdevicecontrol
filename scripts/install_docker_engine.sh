#!/bin/bash
set -e

sudo apt-get update -y
sudo apt-get install -y ca-certificates curl gnupg lsb-release

curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg
ARCH=$(dpkg --print-architecture)
DISTRO=$(lsb_release -cs)
echo "deb [arch=${ARCH} signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu ${DISTRO} stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt-get update -y
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
sudo systemctl enable --now docker

# Start application containers
cd ~/usbdevicecontrol || exit 0
if command -v docker-compose >/dev/null 2>&1; then
  DC=docker-compose
else
  DC="docker compose"
fi
sudo $DC down || true
sudo $DC up -d --build

echo "DOCKER_ENGINE_INSTALL_COMPLETE"
