#!/usr/bin/env python3
import argparse
import asyncio
import json
import os
import sys
import threading
import urllib.error
import urllib.parse
import urllib.request

try:
    import websockets
except ImportError:
    websockets = None


def http_request(base_url, path, method="GET", token=None, payload=None):
    url = urllib.parse.urljoin(base_url, path)
    headers = {
        "Content-Type": "application/json",
    }
    if token:
        headers["Authorization"] = f"Bearer {token}"

    data = None
    if payload is not None:
        data = json.dumps(payload).encode("utf-8")

    request = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(request) as response:
            body = response.read().decode("utf-8")
            if not body:
                return None
            return json.loads(body)
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8")
        message = body
        try:
            message = json.loads(body)
        except Exception:
            pass
        print(f"HTTP {exc.code} error for {method} {url}: {message}")
        sys.exit(1)
    except urllib.error.URLError as exc:
        print(f"Request failed for {method} {url}: {exc.reason}")
        sys.exit(1)


async def websocket_listener(base_url, token):
    if websockets is None:
        print("WebSocket client support requires the 'websockets' package. Install it with 'pip install websockets'.")
        return

    ws_url = base_url.replace("http://", "ws://").replace("https://", "wss://")
    ws_url = urllib.parse.urljoin(ws_url, f"/ws/admin?token={urllib.parse.quote(token)}")
    print(f"- Opening admin websocket connection to {ws_url}")
    try:
        async with websockets.connect(ws_url) as websocket:
            print("- WebSocket connected, waiting for notification events...")
            message = await websocket.recv()
            print("- Received websocket message:")
            try:
                print(json.dumps(json.loads(message), indent=2))
            except Exception:
                print(message)
    except Exception as exc:
        print(f"WebSocket connection failed: {exc}")


def start_websocket_thread(base_url, token):
    if websockets is None:
        print("WebSocket client support requires the 'websockets' package. Install it with 'pip install websockets'.")
        return None

    thread = threading.Thread(target=lambda: asyncio.run(websocket_listener(base_url, token)), daemon=True)
    thread.start()
    return thread


def main():
    parser = argparse.ArgumentParser(description="Run a demo agent/admin approval flow.")
    parser.add_argument("--api-url", default=os.getenv("API_URL", "http://localhost:8000"), help="Backend base URL")
    parser.add_argument("--superadmin-email", default=os.getenv("SUPERADMIN_EMAIL", "demo-superadmin@example.com"), help="Superadmin email")
    parser.add_argument("--superadmin-password", default=os.getenv("SUPERADMIN_PASSWORD", "DemoSuperSecret123!"), help="Superadmin password")
    parser.add_argument("--company-name", default="Demo Company", help="Company name")
    parser.add_argument("--company-domain", default="demo-company.local", help="Company domain")
    parser.add_argument("--admin-name", default="Demo Admin", help="Company admin name")
    parser.add_argument("--admin-email", default="demo-admin@example.com", help="Company admin email")
    parser.add_argument("--use-ws", action="store_true", help="Open an admin websocket and wait for a notification after approval")
    args = parser.parse_args()

    print("[1/8] Registering or logging in superadmin")
    try:
        sa_result = http_request(
            args.api_url,
            "/auth/register-superadmin",
            method="POST",
            payload={
                "name": args.superadmin_email,
                "email": args.superadmin_email,
                "password": args.superadmin_password,
            },
        )
        print("- Superadmin created:", sa_result.get("email"))
    except SystemExit:
        print("- Superadmin already exists, logging in instead.")

    superadmin_tokens = http_request(
        args.api_url,
        "/auth/login",
        method="POST",
        payload={"email": args.superadmin_email, "password": args.superadmin_password},
    )
    sa_access_token = superadmin_tokens["access_token"]
    print("- Superadmin access token acquired")

    print("[2/8] Creating company and admin user")
    company_result = http_request(
        args.api_url,
        "/superadmin/companies",
        method="POST",
        token=sa_access_token,
        payload={
            "name": args.company_name,
            "domain": args.company_domain,
            "max_seats": 5,
            "admin_name": args.admin_name,
            "admin_email": args.admin_email,
        },
    )
    admin_password = company_result["admin_temp_password"]
    print(f"- Company created: {company_result['name']} (id={company_result['id']})")
    print(f"- Admin account: {company_result['admin_email']} / {admin_password}")

    print("[3/8] Logging in as company admin")
    admin_tokens = http_request(
        args.api_url,
        "/auth/login",
        method="POST",
        payload={"email": args.admin_email, "password": admin_password},
    )
    admin_access_token = admin_tokens["access_token"]
    print("- Admin access token acquired")

    print("[4/8] Generating a company install token")
    install_token_result = http_request(
        args.api_url,
        "/admin/install-token",
        method="POST",
        token=admin_access_token,
    )
    install_token = install_token_result["install_token"]
    print("- Install token created:", install_token)

    print("[5/8] Registering a simulated agent")
    agent_register_result = http_request(
        args.api_url,
        "/agent/register",
        method="POST",
        payload={
            "install_token": install_token,
            "hostname": "demo-agent.local",
            "os_version": "Windows 11",
            "cpu": "Intel Core i7",
            "ram": "16GB",
            "mac_address": "00:11:22:33:44:55",
            "ip_address": "192.168.1.100",
            "version": "1.0.0",
        },
    )
    endpoint_id = agent_register_result["endpoint_id"]
    print(f"- Agent registered for endpoint {endpoint_id}")

    print("[6/8] Sending a USB event from the agent")
    usb_event_result = http_request(
        args.api_url,
        "/agent/usb-event",
        method="POST",
        payload={
            "endpoint_id": endpoint_id,
            "device_name": "Demo USB Drive",
            "device_serial": "DEM-12345",
            "vendor_id": "0x1234",
            "product_id": "0xABCD",
        },
    )
    event_id = usb_event_result["id"]
    print(f"- USB event created: id={event_id}, status={usb_event_result['status']}" )

    ws_thread = None
    if args.use_ws:
        print("[7/9] Opening the admin websocket before approval")
        ws_thread = start_websocket_thread(args.api_url, admin_access_token)

    print("[8/9] Approving the USB event as admin")
    approval_result = http_request(
        args.api_url,
        f"/admin/usb-events/{event_id}/approve",
        method="POST",
        token=admin_access_token,
    )
    print("- Approval response:", approval_result)

    if ws_thread is not None:
        print("- Waiting briefly for websocket notification...")
        ws_thread.join(timeout=8)

    print("[9/9] Fetching notifications")
    notifications = http_request(
        args.api_url,
        "/notifications",
        method="GET",
        token=admin_access_token,
    )
    print("- Notifications:")
    print(json.dumps(notifications, indent=2))

    print("\nDemo complete. You can now inspect the backend or connect a frontend client.")


if __name__ == "__main__":
    main()
