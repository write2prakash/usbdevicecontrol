"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiGet, apiPost, authMe, logout, getAuthToken } from "../../lib/api";

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

  // Per-machine token state
  const [generatingToken, setGeneratingToken] = useState(false);
  const [activeToken, setActiveToken] = useState<string | null>(null);
  const [tokenCopied, setTokenCopied] = useState(false);
  const [downloadingScript, setDownloadingScript] = useState(false);

  // Per-endpoint reissue token
  const [installTokens, setInstallTokens] = useState<Record<number, string>>({});
  const [creatingTokenFor, setCreatingTokenFor] = useState<number | null>(null);

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
        const [endpointsRes, eventsRes, notifRes] = await Promise.all([
          apiGet("/admin/endpoints"),
          apiGet("/admin/usb-events"),
          apiGet("/notifications"),
        ]);
        setEndpoints(endpointsRes.data);
        setEvents(eventsRes.data);
        setNotifications(notifRes.data);
      } catch {
        logout();
        router.push("/login");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [router]);

  // Poll notifications every 10 s
  useEffect(() => {
    const t = setInterval(async () => {
      try {
        const resp = await apiGet("/notifications");
        setNotifications(resp.data);
      } catch { }
    }, 10000);
    return () => clearInterval(t);
  }, []);

  // WebSocket for real-time admin notifications
  useEffect(() => {
    const token = getAuthToken();
    if (!token) return;
    const base = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
    const ws = new WebSocket(`${base.replace(/^http/, "ws")}/ws/admin?token=${encodeURIComponent(token)}`);
    ws.onmessage = async (ev) => {
      try {
        const data = JSON.parse(ev.data);
        if (data?.type === "notification") {
          const resp = await apiGet("/notifications");
          setNotifications(resp.data);
        }
      } catch { }
    };
    return () => ws.close();
  }, []);

  // ── Token generation ──────────────────────────────────────────────────────────
  const handleGenerateToken = async () => {
    setError("");
    setGeneratingToken(true);
    setActiveToken(null);
    setTokenCopied(false);
    try {
      const response = await apiPost("/admin/install-token");
      setActiveToken(response.data.install_token);
    } catch {
      setError("Could not generate token. Please try again.");
    } finally {
      setGeneratingToken(false);
    }
  };

  const handleCopyToken = () => {
    if (!activeToken) return;
    navigator.clipboard.writeText(activeToken);
    setTokenCopied(true);
    setTimeout(() => setTokenCopied(false), 2000);
  };

  const handleDownloadScript = () => {
    if (!activeToken) return;
    setDownloadingScript(true);
    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://52.66.196.47/api";
    const token = activeToken;

    const script = `# USB Control Agent - Installer
# Right-click this file and select "Run with PowerShell" (as Administrator)
# This token is valid for ONE machine only.

$ErrorActionPreference = "Stop"
$ApiUrl = "${apiUrl}"
$Token  = "${token}"
$InstallDir = "$env:ProgramFiles\\UsbControlAgent"

Write-Host ""
Write-Host "USB Control Agent Installer" -ForegroundColor Cyan
Write-Host "===========================" -ForegroundColor Cyan

if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Host "Restarting as Administrator..." -ForegroundColor Yellow
    Start-Process PowerShell -ArgumentList "-ExecutionPolicy Bypass -File \`"$PSCommandPath\`"" -Verb RunAs
    exit
}

Write-Host "Creating install directory..." -ForegroundColor Gray
New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null

Write-Host "Downloading agent binary..." -ForegroundColor Gray
Invoke-WebRequest -Uri "$ApiUrl/agent/download" -OutFile "$InstallDir\\UsbControlAgent.exe" -UseBasicParsing

Write-Host "Registering and starting agent..." -ForegroundColor Gray
Start-Process "$InstallDir\\UsbControlAgent.exe" \`
    -ArgumentList "--token $Token --api-url $ApiUrl" \`
    -WorkingDirectory $InstallDir \`
    -WindowStyle Normal

Write-Host ""
Write-Host "Done! This machine is now registered and will appear in the admin dashboard." -ForegroundColor Green
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
    setDownloadingScript(false);
  };

  // ── Per-endpoint reissue ──────────────────────────────────────────────────────
  const handleCreateToken = async (endpointId: number) => {
    setError("");
    setCreatingTokenFor(endpointId);
    try {
      const response = await apiPost(`/admin/endpoints/${endpointId}/install-token`);
      setInstallTokens((prev) => ({ ...prev, [endpointId]: response.data.install_token }));
    } catch {
      setError("Could not generate install token.");
    } finally {
      setCreatingTokenFor(null);
    }
  };

  // ── USB events ────────────────────────────────────────────────────────────────
  const handleUpdateEventStatus = async (eventId: number, action: "approve" | "reject") => {
    setError("");
    try {
      await apiPost(`/admin/usb-events/${eventId}/${action}`);
      setEvents((prev) =>
        prev.map((e) => (e.id === eventId ? { ...e, status: action === "approve" ? "approved" : "rejected" } : e))
      );
      try {
        const notResp = await apiGet("/notifications");
        setNotifications(notResp.data);
      } catch { }
    } catch {
      setError(`Unable to ${action} event. Please refresh and try again.`);
    }
  };

  const markNotificationRead = async (id: number) => {
    try {
      await apiPost(`/notifications/${id}/read`);
      setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)));
    } catch {
      setError("Unable to mark notification read.");
    }
  };

  const pendingCount = events.filter((e) => e.status === "pending").length;
  const unreadCount = notifications.filter((n) => !n.is_read).length;

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
          <p>Loading...</p>
        ) : (
          <div className="space-y-6">

            {error && <p className="text-sm text-red-600">{error}</p>}

            {/* Stats */}
            <div className="grid gap-6 md:grid-cols-3">
              <div className="rounded-2xl border p-6">
                <div className="text-sm text-slate-500">Endpoints</div>
                <div className="text-3xl font-bold mt-1">{endpoints.length}</div>
              </div>
              <div className="rounded-2xl border p-6">
                <div className="text-sm text-slate-500">Pending Approvals</div>
                <div className="text-3xl font-bold mt-1">{pendingCount}</div>
              </div>
              <div className="rounded-2xl border p-6">
                <div className="text-sm text-slate-500">Unread Notifications</div>
                <div className="text-3xl font-bold mt-1">{unreadCount}</div>
              </div>
            </div>

            {/* Enroll a new machine */}
            <div className="rounded-2xl border p-6 space-y-4">
              <div>
                <h2 className="text-xl font-semibold">Enroll a new machine</h2>
                <p className="text-sm text-slate-500 mt-1">
                  Each token is valid for <strong>one machine only</strong> and expires in 24 hours.
                  Generate a new token for every machine you want to monitor.
                </p>
              </div>

              <button
                type="button"
                onClick={handleGenerateToken}
                disabled={generatingToken}
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm text-white disabled:opacity-60"
              >
                {generatingToken ? "Generating..." : "Generate token for new machine"}
              </button>

              {activeToken && (
                <div className="rounded-2xl bg-slate-50 border border-slate-200 p-5 space-y-4">
                  {/* Token display */}
                  <div>
                    <div className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">
                      Install token — valid for 1 machine · 24 hours
                    </div>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 rounded-lg bg-white border border-slate-200 px-3 py-2 text-sm font-mono text-slate-800 break-all">
                        {activeToken}
                      </code>
                      <button
                        type="button"
                        onClick={handleCopyToken}
                        className="flex-shrink-0 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-white"
                      >
                        {tokenCopied ? "Copied!" : "Copy"}
                      </button>
                    </div>
                  </div>

                  {/* Two options */}
                  <div className="grid gap-4 md:grid-cols-2">
                    {/* Option A: Script */}
                    <div className="rounded-xl bg-white border border-slate-200 p-4 space-y-2">
                      <div className="text-sm font-semibold text-slate-700">Option A — Auto installer</div>
                      <p className="text-xs text-slate-500">
                        Download a PowerShell script. Run it as Administrator on the target machine — it downloads the agent and registers automatically.
                      </p>
                      <button
                        type="button"
                        onClick={handleDownloadScript}
                        disabled={downloadingScript}
                        className="w-full rounded-lg bg-slate-900 px-3 py-2 text-sm text-white hover:bg-slate-700 disabled:opacity-60"
                      >
                        Download installer script (.ps1)
                      </button>
                      <p className="text-xs text-slate-400">
                        Right-click the file → <em>Run with PowerShell</em>
                      </p>
                    </div>

                    {/* Option B: Manual */}
                    <div className="rounded-xl bg-white border border-slate-200 p-4 space-y-2">
                      <div className="text-sm font-semibold text-slate-700">Option B — Manual install</div>
                      <p className="text-xs text-slate-500">
                        Copy <code className="bg-slate-100 px-1 rounded">UsbControlAgent.exe</code> to the target machine, then run:
                      </p>
                      <code className="block bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-mono text-slate-700 break-all">
                        UsbControlAgent.exe --token {activeToken} --api-url {process.env.NEXT_PUBLIC_API_URL ?? "http://52.66.196.47/api"}
                      </code>
                    </div>
                  </div>

                  <p className="text-xs text-amber-600">
                    Once used on a machine, this token cannot be reused. Generate a new token for each additional machine.
                  </p>
                </div>
              )}
            </div>

            {/* Notifications + USB events */}
            <div className="grid gap-6 md:grid-cols-2">
              <div className="rounded-2xl border p-6">
                <h2 className="text-xl font-semibold mb-4">Notifications</h2>
                {notifications.length === 0 ? (
                  <p className="text-sm text-slate-500">No notifications.</p>
                ) : (
                  <div className="space-y-3">
                    {notifications.map((n) => (
                      <div key={n.id} className={`rounded-2xl p-4 ${n.is_read ? "bg-slate-50" : "bg-blue-50 border border-blue-100"}`}>
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="text-sm font-semibold text-slate-700">{n.type}</div>
                            <div className="text-sm text-slate-600">{n.message}</div>
                            <div className="mt-1 text-xs text-slate-400">{new Date(n.created_at).toLocaleString()}</div>
                          </div>
                          {!n.is_read && (
                            <button
                              type="button"
                              onClick={() => markNotificationRead(n.id)}
                              className="flex-shrink-0 rounded-lg bg-slate-900 px-3 py-1 text-white text-xs"
                            >
                              Mark read
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="rounded-2xl border p-6">
                <h2 className="text-xl font-semibold mb-4">Recent USB events</h2>
                {events.length === 0 ? (
                  <p className="text-sm text-slate-500">No USB events yet.</p>
                ) : (
                  <div className="space-y-4">
                    {events.slice(0, 10).map((event) => (
                      <div key={event.id} className="rounded-2xl bg-slate-50 p-4">
                        <div className="flex items-center justify-between gap-2">
                          <div>
                            <div className="font-semibold text-sm">{event.device_name}</div>
                            <div className="text-xs text-slate-500">Endpoint #{event.endpoint_id} · {new Date(event.plugged_at).toLocaleString()}</div>
                          </div>
                          <span className={`rounded-full px-2 py-0.5 text-xs font-medium uppercase ${
                            event.status === "approved" ? "bg-green-100 text-green-700" :
                            event.status === "rejected" ? "bg-red-100 text-red-600" :
                            "bg-amber-100 text-amber-700"
                          }`}>
                            {event.status}
                          </span>
                        </div>
                        <div className="mt-1 text-xs text-slate-500">
                          Serial: {event.device_serial ?? "N/A"} · Vendor: {event.vendor_id ?? "N/A"} · Product: {event.product_id ?? "N/A"}
                        </div>
                        {event.status === "pending" && (
                          <div className="mt-3 flex gap-2">
                            <button
                              type="button"
                              onClick={() => handleUpdateEventStatus(event.id, "approve")}
                              className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs text-white hover:bg-emerald-700"
                            >
                              Approve
                            </button>
                            <button
                              type="button"
                              onClick={() => handleUpdateEventStatus(event.id, "reject")}
                              className="rounded-lg bg-rose-600 px-3 py-1.5 text-xs text-white hover:bg-rose-700"
                            >
                              Reject
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Endpoint inventory */}
            <div className="rounded-2xl border p-6">
              <h2 className="text-xl font-semibold mb-4">Endpoint inventory</h2>
              {endpoints.length === 0 ? (
                <p className="text-sm text-slate-500">No endpoints enrolled yet. Generate a token above to enroll your first machine.</p>
              ) : (
                <div className="space-y-4">
                  {endpoints.map((endpoint) => (
                    <div key={endpoint.id} className="rounded-2xl border p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <div className="text-lg font-semibold">{endpoint.hostname}</div>
                          <div className="text-sm text-slate-500">{endpoint.os_version ?? "Unknown OS"}</div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                            endpoint.agent_installed ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"
                          }`}>
                            {endpoint.agent_installed ? "Agent Active" : "Not Installed"}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleCreateToken(endpoint.id)}
                            disabled={creatingTokenFor === endpoint.id}
                            className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                          >
                            {creatingTokenFor === endpoint.id ? "Generating..." : "Reissue token"}
                          </button>
                        </div>
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 md:grid-cols-3">
                        {[
                          ["IP Address", endpoint.ip_address],
                          ["MAC Address", endpoint.mac_address],
                          ["Machine ID", endpoint.machine_id],
                          ["CPU", endpoint.cpu],
                          ["RAM", endpoint.ram],
                          ["Last Seen", endpoint.last_seen ? new Date(endpoint.last_seen).toLocaleString() : "Never"],
                        ].map(([label, value]) => (
                          <div key={label as string}>
                            <div className="text-xs text-slate-400 uppercase tracking-wide">{label}</div>
                            <div className="text-sm text-slate-700 font-mono truncate">{value ?? "—"}</div>
                          </div>
                        ))}
                      </div>
                      {installTokens[endpoint.id] && (
                        <div className="mt-3 rounded-xl bg-slate-50 border border-slate-200 p-3 text-xs">
                          <span className="text-slate-500">Reissued token: </span>
                          <code className="font-mono text-slate-800 break-all">{installTokens[endpoint.id]}</code>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>
        )}
      </div>
    </main>
  );
}
