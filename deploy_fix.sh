#!/bin/bash
set -e
cd /home/ubuntu/usb-app

echo "=== Current container status ==="
sudo docker compose -f docker-compose.production.yml ps

echo ""
echo "=== Backend logs (last 5 lines) ==="
sudo docker compose -f docker-compose.production.yml logs backend --tail=5 2>&1 || true

echo ""
echo "=== Rebuilding backend with PyJWT ==="
sudo docker compose -f docker-compose.production.yml build --no-cache backend 2>&1

echo ""
echo "=== Restarting backend ==="
sudo docker compose -f docker-compose.production.yml up -d backend 2>&1

echo ""
echo "=== Waiting 10s for backend to start ==="
sleep 10

echo ""
echo "=== Final container status ==="
sudo docker compose -f docker-compose.production.yml ps

echo ""
echo "=== Health check ==="
curl -s http://localhost/api/health || echo "Backend API not responding yet"

echo ""
echo "=== Frontend check ==="
curl -s http://localhost/ | head -c 200 || echo "Frontend not responding"

echo "=== DONE ==="
