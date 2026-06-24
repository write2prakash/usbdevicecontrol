"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiGet, apiPost, authMe, logout } from "../../lib/api";
import { getAuthToken } from "../../lib/api";

type Endpoint = {
  id: number;
  hostname: string;
  os_version: string | null;
  cpu: string | null;
  ram: string | null;
  mac_address: string | null;
  ip_address: string | null;
  machine_id: string | null;
  agent_installed: boolean;
  last_seen: string | null;
};

type USBEvent = {
  id: number;
  endpoint_id: number;
  device_name: string;
  device_serial: string | null;
  vendor_id: string | null;
  product_id: string | null;
  status: string;
  plugged_at: string;
};

type Notification = {
  id: number;
  company_id: number;
  user_id: number | null;
  type: string;
  message: string;
  is_read: boolean;
  created_at: string;
};

export default function AdminPage() {
  const [endpoints, setEndpoints] = useState<Endpoint[]>([]);
  const [events, setEvents] = useState<USBEvent[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [installTokens, setInstallTokens] = useState<Record<number, string>>({});
  const [creatingTokenFor, setCreatingTokenFor] = useState<number | null>(null);
  const [newInstallToken, setNewInstallToken] = useState("");
  const [creatingCompanyToken, setCreatingCompanyToken] = useState(false);
  const [installingAgent, setInstallingAgent] = useState(false);
  const router = useRouter();

  const handleLogout = () => {
    logout();
    router.push("/login");
  };

  useEffect(() => {
    const load = async () => {
      try {
        const profile = await authMe();
        if (profile.role !== "admin") {
          logout();
          router.push("/login");
          return;
        }
        const [endpointsResponse, eventsResponse, notificationsResponse] = await Promise.all([
          apiGet("/admin/endpoints"),
          apiGet("/admin/usb-events"),
          apiGet("/notifications"),
        ]);
        setEndpoints(endpointsResponse.data);
        setEvents(eventsResponse.data);
        setNotifications(notificationsResponse.data);
      } catch (err) {
        logout();
        router.push("/login");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [router]);

  // poll notifications every 10 seconds to surface new messages
  useEffect(() => {
    const t = setInterval(async () => {
      try {
        const resp = await apiGet("/notifications");
        setNotifications(resp.data);
      } catch (_) {
        // ignore polling errors
      }
    }, 10000);
    return () => clearInterval(t);
  }, []);

  // realtime websocket for admin notifications
  useEffect(() => {
    const token = getAuthToken();
    if (!token) return;
    const base = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
    const wsBase = base.replace(/^http/, "ws");
    const ws = new WebSocket(`${wsBase}/ws/admin?token=${encodeURIComponent(token)}`);
    ws.onmessage = async (ev) => {
      try {
        const data = JSON.parse(ev.data);
        if (data?.type === "notification") {
          // refresh notifications list
          const resp = await apiGet("/notifications");
          setNotifications(resp.data);
        }
      } catch (e) {
        // ignore malformed messages
      }
    };
    ws.onclose = () => {
      // no-op; polling covers missed messages
    };
    return () => ws.close();
  }, []);

  const handleCreateToken = async (endpointId: number) => {
    setError("");
    setCreatingTokenFor(endpointId);
    try {
      const response = await apiPost(`/admin/endpoints/${endpointId}/install-token`);
      setInstallTokens((prev) => ({ ...prev, [endpointId]: response.data.install_token }));
    } catch (err) {
      setError("Could not generate install token. Ensure you are logged in and have permission.");
    } finally {
      setCreatingTokenFor(null);
    }
  };

  const handleCreateCompanyInstallToken = async () => {
    setError("");
    setCreatingCompanyToken(true);
    try {
      const response = await apiPost("/admin/install-token");
      setNewInstallToken(response.data.install_token);
    } catch (err) {
      setError("Could not generate install token. Ensure you are logged in and have permission.");
    } finally {
      setCreatingCompanyToken(false);
    }
  };

  const handleInstallAgent = async () => {
    setError("");
    setInstallingAgent(true);
    try {
      const response = await apiPost("/admin/install-token");
      const token = response.data.install_token;
      const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://52.66.196.47/api";

      const script = `# USB Control Agent - Silent Installer
# Right-click this file and select "Run with PowerShell" (as Administrator)

$ErrorActionPreference = "Stop"
$ApiUrl = "${apiUrl}"
$Token  = "${token}"
$InstallDir = "$env:ProgramFiles\\UsbControlAgent"

Write-Host ""
Write-Host "USB Control Agent Installer" -ForegroundColor Cyan
Write-Host "===========================" -ForegroundColor Cyan

# Ensure running as admin
if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Host "Restarting as Administrator..." -ForegroundColor Yellow
    Start-Process PowerShell -ArgumentList "-ExecutionPolicy Bypass -File \`"$PSCommandPath\`"" -Verb RunAs
    exit
}

Write-Host "Creating install directory: $InstallDir" -ForegroundColor Gray
New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null

Write-Host "Downloading agent binary..." -ForegroundColor Gray
Invoke-WebRequest -Uri "$ApiUrl/agent/download" -OutFile "$InstallDir\\UsbControlAgent.exe" -UseBasicParsing

Write-Host "Starting agent (registers this machine)..." -ForegroundColor Gray
Start-Process "$InstallDir\\UsbControlAgent.exe" \`
    -ArgumentList "--token $Token --api-url $ApiUrl" \`
    -WorkingDirectory $InstallDir \`
    -WindowStyle Normal

Write-Host ""
Write-Host "Done! The agent is running and this machine will appear in the admin dashboard." -ForegroundColor Green
Write-Host "You can close this window." -ForegroundColor Green
Read-Host "Press Enter to exit"
`;

      const blob = new Blob([script], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "install-usb-agent.ps1";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setError("Could not generate installer. Please try again.");
    } finally {
      setInstallingAgent(false);
    }
  };

  const handleUpdateEventStatus = async (eventId: number, action: "approve" | "reject") => {
    setError("");
    try {
      await apiPost(`/admin/usb-events/${eventId}/${action}`);
      setEvents((prev) => prev.map((event) => (event.id === eventId ? { ...event, status: action === "approve" ? "approved" : "rejected" } : event)));
      // refresh notifications after action
      try {
        const notResp = await apiGet("/notifications");
        setNotifications(notResp.data);
      } catch (_) {
        // ignore notification refresh errors
      }
    } catch (err) {
      setError(`Unable to ${action} event. Please refresh and try again.`);
    }
  };

  const markNotificationRead = async (id: number) => {
    try {
      await apiPost(`/notifications/${id}/read`);
      setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)));
    } catch (err) {
      setError("Unable to mark notification read.");
    }
  };

  return (
    <main className="min-h-screen p-8 bg-slate-50">
      <div className="mx-auto max-w-6xl rounded-3xl bg-white p-8 shadow-lg">
        <div className="flex items-center justify-between gap-4 mb-6">
          <h1 className="text-3xl font-bold">Company Admin</h1>
          <button
            type="button"
            onClick={handleLogout}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm text-slate-900 hover:bg-slate-100"
          >
            Logout
          </button>
        </div>
        {loading ? (
          <p>Loading endpoints...</p>
        ) : error ? (
          <p className="text-red-600">{error}</p>
        ) : (
          <div className="space-y-6">
            <div className="grid gap-6 md:grid-cols-3 mb-4">
              <div className="rounded-2xl border p-6">Endpoints: {endpoints.length}</div>
              <div className="rounded-2xl border p-6">Pending Approvals</div>
              <div className="rounded-2xl border p-6">Notifications</div>
            </div>
            <div className="rounded-2xl border p-6">
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="text-xl font-semibold">Install agent on this machine</h2>
                  <p className="text-sm text-slate-600">
                    Downloads a PowerShell installer script. Run it as Administrator to install the USB monitoring agent on this machine.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleInstallAgent}
                  disabled={installingAgent}
                  className="rounded-lg bg-slate-900 px-4 py-2 text-white disabled:opacity-60 whitespace-nowrap"
                >
                  {installingAgent ? "Preparing..." : "Install Agent"}
                </button>
              </div>
              <div className="mt-4 rounded-2xl bg-blue-50 border border-blue-100 p-4 text-sm text-blue-800 space-y-1">
                <p className="font-medium">How it works:</p>
                <ol className="list-decimal list-inside space-y-1 text-blue-700">
                  <li>Click <strong>Install Agent</strong> — a <code className="bg-blue-100 px-1 rounded">install-usb-agent.ps1</code> file will download.</li>
                  <li>Right-click the file → <strong>Run with PowerShell</strong> (it will auto-elevate to Administrator).</li>
                  <li>The agent downloads, registers this machine, and starts monitoring USB devices.</li>
                  <li>This machine will appear under <strong>Endpoint Inventory</strong> below.</li>
                </ol>
              </div>
            </div>
            <div className="grid gap-6 md:grid-cols-2">
              <div className="rounded-2xl border p-6">
                <h2 className="text-xl font-semibold mb-4">Notifications</h2>
                {notifications.length === 0 ? (
                  <p className="text-sm text-slate-600">No notifications.</p>
                ) : (
                  <div className="space-y-3">
                    {notifications.map((notification) => (
                      <div key={notification.id} className="rounded-2xl bg-slate-50 p-4">
                        <div className="flex items-start justify-between">
                          <div>
                            <div className="text-sm text-slate-700 font-semibold">{notification.type}</div>
                            <div className="text-sm text-slate-600">{notification.message}</div>
                            <div className="mt-2 text-xs text-slate-500">{new Date(notification.created_at).toLocaleString()}</div>
                          </div>
                          <div className="ml-4">
                            {!notification.is_read && (
                              <button
                                type="button"
                                onClick={() => markNotificationRead(notification.id)}
                                className="rounded-lg bg-slate-900 px-3 py-1 text-white text-xs"
                              >
                                Mark read
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="rounded-2xl border p-6">
                <h2 className="text-xl font-semibold mb-4">Recent USB events</h2>
                {events.length === 0 ? (
                  <p className="text-sm text-slate-600">No USB events yet.</p>
                ) : (
                  <div className="space-y-4">
                    {events.slice(0, 5).map((event) => (
                      <div key={event.id} className="rounded-2xl bg-slate-50 p-4">
                        <div className="flex items-center justify-between gap-2">
                          <div>
                            <div className="font-semibold">{event.device_name}</div>
                            <div className="text-sm text-slate-600">Endpoint ID: {event.endpoint_id}</div>
                          </div>
                          <span className="rounded-full bg-slate-200 px-3 py-1 text-xs uppercase tracking-wide">{event.status}</span>
                        </div>
                        <div className="mt-2 text-sm text-slate-600">Serial: {event.device_serial ?? "N/A"}</div>
                        <div className="mt-1 text-sm text-slate-600">Vendor: {event.vendor_id ?? "N/A"} Product: {event.product_id ?? "N/A"}</div>
                        <div className="mt-2 flex gap-2">
                          <button
                            type="button"
                            onClick={() => handleUpdateEventStatus(event.id, "approve")}
                            disabled={event.status !== "pending"}
                            className="rounded-lg bg-emerald-600 px-3 py-1 text-white disabled:opacity-50"
                          >
                            Approve
                          </button>
                          <button
                            type="button"
                            onClick={() => handleUpdateEventStatus(event.id, "reject")}
                            disabled={event.status !== "pending"}
                            className="rounded-lg bg-rose-600 px-3 py-1 text-white disabled:opacity-50"
                          >
                            Reject
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="rounded-2xl border p-6">
              <h2 className="text-xl font-semibold mb-4">Endpoint inventory</h2>
              {error && <p className="text-sm text-red-600 mb-4">{error}</p>}
              <div className="space-y-4">
                {endpoints.map((endpoint) => (
                  <div key={endpoint.id} className="rounded-2xl border p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="text-lg font-semibold">{endpoint.hostname}</div>
                        <div className="text-sm text-slate-500">{endpoint.os_version ?? "Unknown OS"}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${endpoint.agent_installed ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                          {endpoint.agent_installed ? "Agent Active" : "Not Installed"}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleCreateToken(endpoint.id)}
                          disabled={creatingTokenFor === endpoint.id}
                          className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm text-white disabled:opacity-60"
                        >
                          {creatingTokenFor === endpoint.id ? "Generating..." : "Reissue Token"}
                        </button>
                      </div>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1.5 md:grid-cols-3">
                      <div>
                        <div className="text-xs text-slate-400 uppercase tracking-wide">IP Address</div>
                        <div className="text-sm text-slate-700 font-mono">{endpoint.ip_address ?? "—"}</div>
                      </div>
                      <div>
                        <div className="text-xs text-slate-400 uppercase tracking-wide">MAC Address</div>
                        <div className="text-sm text-slate-700 font-mono">{endpoint.mac_address ?? "—"}</div>
                      </div>
                      <div>
                        <div className="text-xs text-slate-400 uppercase tracking-wide">Machine ID</div>
                        <div className="text-sm text-slate-700 font-mono truncate">{endpoint.machine_id ?? "—"}</div>
                      </div>
                      <div>
                        <div className="text-xs text-slate-400 uppercase tracking-wide">CPU</div>
                        <div className="text-sm text-slate-700 truncate">{endpoint.cpu ?? "—"}</div>
                      </div>
                      <div>
                        <div className="text-xs text-slate-400 uppercase tracking-wide">RAM</div>
                        <div className="text-sm text-slate-700">{endpoint.ram ?? "—"}</div>
                      </div>
                      <div>
                        <div className="text-xs text-slate-400 uppercase tracking-wide">Last Seen</div>
                        <div className="text-sm text-slate-700">{endpoint.last_seen ? new Date(endpoint.last_seen).toLocaleString() : "Never"}</div>
                      </div>
                    </div>
                    {installTokens[endpoint.id] && (
                      <div className="mt-3 rounded-2xl bg-slate-50 p-3 text-sm text-slate-800 break-all">
                        <strong>Install token:</strong> <span className="font-mono">{installTokens[endpoint.id]}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
