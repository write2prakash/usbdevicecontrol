import json
import urllib.error
import urllib.request

base = "http://localhost:8001"
creds = {"email": "demo-admin-3@example.com", "password": "-pRXLB_PKsSvVxjq"}

req = urllib.request.Request(
    base + "/auth/login",
    data=json.dumps(creds).encode("utf-8"),
    headers={"Content-Type": "application/json"},
    method="POST",
)
try:
    with urllib.request.urlopen(req) as r:
        tok = json.loads(r.read().decode())["access_token"]
        print("TOKEN:", tok[:40] + "...")
        req2 = urllib.request.Request(
            base + "/notifications",
            headers={"Authorization": f"Bearer {tok}"},
            method="GET",
        )
        try:
            with urllib.request.urlopen(req2) as r2:
                print(r2.status, r2.read().decode())
        except urllib.error.HTTPError as e:
            print("NOTIF ERROR", e.code)
            print(e.read().decode())
except urllib.error.HTTPError as e:
    print("LOGIN ERROR", e.code)
    print(e.read().decode())
