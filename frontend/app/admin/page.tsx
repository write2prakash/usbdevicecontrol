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

  // Change password modal
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changePwSubmitting, setChangePwSubmitting] = useState(false);
  const [changePwError, setChangePwError] = useState("");
  const [changePwSuccess, setChangePwSuccess] = useState(false);

  // Per-machine token state
  const [generatingToken, setGeneratingToken] = useState(false);
  const [activeToken, setActiveToken] = useState<string | null>(null);
  const [tokenCopied, setTokenCopied] = useState(false);
  const [downloadingScript, setDownloadingScript] = useState(false);

  // Per-endpoint reissue token
  const [installTokens, setInstallTokens] = useState<Record<number, string>>({});
  const [creatingTokenFor, setCreatingTokenFor] = useState<number | null>(null);

  // Uninstall
  const [uninstallingEndpoint, setUninstallingEndpoint] = useState<Endpoint | null>(null);
  const [uninstallSubmitting, setUninstallSubmitting] = useState(false);

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

    const script = `# USB Control Agent - Silent Installer
# Right-click this file and select "Run with PowerShell" (as Administrator)
# This token is valid for ONE machine only.

$ErrorActionPreference = "Stop"
$ApiUrl     = "${apiUrl}"
$Token      = "${token}"
$InstallDir = "$env:ProgramFiles\\UsbControlAgent"
$ExePath    = "$InstallDir\\UsbControlAgent.exe"
$TaskName   = "UsbControlAgent"

# Auto-elevate to Administrator
if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Start-Process PowerShell -ArgumentList "-ExecutionPolicy Bypass -File \`"$PSCommandPath\`"" -Verb RunAs
    exit
}

# Create install directory
New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null

# Download agent binary
Invoke-WebRequest -Uri "$ApiUrl/agent/download" -OutFile $ExePath -UseBasicParsing

# Run hidden — registers this machine on first launch
Start-Process $ExePath \`
    -ArgumentList "--token $Token --api-url $ApiUrl" \`
    -WorkingDirectory $InstallDir \`
    -WindowStyle Hidden

# Register scheduled task so agent starts hidden on every boot (no login needed)
$action    = New-ScheduledTaskAction -Execute $ExePath -WorkingDirectory $InstallDir
$trigger   = New-ScheduledTaskTrigger -AtStartup
$settings  = New-ScheduledTaskSettingsSet -ExecutionTimeLimit 0 -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -MultipleInstances IgnoreNew
$principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -RunLevel Highest -LogonType ServiceAccount
Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Force | Out-Null

Write-Host "USB Control Agent installed and running silently." -ForegroundColor Green
Write-Host "It will start automatically on every boot." -ForegroundColor Green
Start-Sleep -Seconds 2
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

  const handleUninstall = async () => {
    if (!uninstallingEndpoint) return;
    setUninstallSubmitting(true);
    try {
      await apiPost(`/admin/endpoints/${uninstallingEndpoint.id}/uninstall`);
      setEndpoints((prev) => prev.filter((e) => e.id !== uninstallingEndpoint.id));
      setUninstallingEndpoint(null);
    } catch {
      setError("Failed to uninstall. The endpoint may already be offline.");
      setUninstallingEndpoint(null);
    } finally {
      setUninstallSubmitting(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setChangePwError("");
    if (newPassword !== confirmPassword) {
      setChangePwError("New passwords do not match.");
      return;
    }
    if (newPassword.length < 8) {
      setChangePwError("New password must be at least 8 characters.");
      return;
    }
    setChangePwSubmitting(true);
    try {
      await apiPost("/auth/change-password", {
        current_password: currentPassword,
        new_password: newPassword,
      });
      setChangePwSuccess(true);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setTimeout(() => {
        setShowChangePassword(false);
        setChangePwSuccess(false);
      }, 2000);
    } catch (err: any) {
      setChangePwError(err?.response?.data?.detail ?? "Failed to change password. Check your current password.");
    } finally {
      setChangePwSubmitting(false);
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
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => { setShowChangePassword(true); setChangePwError(""); setChangePwSuccess(false); }}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
            >
              Change Password
            </button>
            <button
              type="button"
              onClick={handleLogout}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm text-slate-900 hover:bg-slate-100"
            >
              Logout
            </button>
          </div>
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
                      <div className="text-sm font-semibold text-slate-700">Option B — Manual (PowerShell)</div>
                      <p className="text-xs text-slate-500">
                        Open PowerShell as Administrator on the target machine and run these two commands:
                      </p>
                      <div className="space-y-1">
                        <p className="text-xs text-slate-400">1. Download the agent:</p>
                        <code className="block bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-mono text-slate-700 break-all">
                          Invoke-WebRequest "{process.env.NEXT_PUBLIC_API_URL ?? "http://52.66.196.47/api"}/agent/download" -OutFile ".\UsbControlAgent.exe"
                        </code>
                        <p className="text-xs text-slate-400 pt-1">2. Register and start the agent:</p>
                        <code className="block bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-mono text-slate-700 break-all">
                          .\UsbControlAgent.exe --token {activeToken} --api-url {process.env.NEXT_PUBLIC_API_URL ?? "http://52.66.196.47/api"}
                        </code>
                      </div>
                      <p className="text-xs text-amber-600">Note: Always use <code className="bg-amber-50 px-1 rounded">.\</code> before the exe name in PowerShell.</p>
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
                          <button
                            type="button"
                            onClick={() => setUninstallingEndpoint(endpoint)}
                            className="rounded-lg border border-red-300 px-3 py-1.5 text-xs text-red-600 hover:bg-red-50"
                          >
                            Uninstall
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
      {/* Uninstall Confirmation Modal */}
      {uninstallingEndpoint && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="text-xl font-semibold mb-2">Uninstall agent</h2>
            <p className="text-sm text-slate-600 mb-1">
              This will remotely uninstall the agent from:
            </p>
            <p className="text-sm font-semibold text-slate-800 mb-4">
              {uninstallingEndpoint.hostname} ({uninstallingEndpoint.ip_address ?? "unknown IP"})
            </p>
            <p className="text-xs text-slate-500 mb-6">
              The agent process will stop, the scheduled task will be removed, and the endpoint will be deleted from the dashboard. The machine must be online for the remote uninstall to take effect.
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={handleUninstall}
                disabled={uninstallSubmitting}
                className="flex-1 rounded-lg bg-red-600 px-4 py-2 text-sm text-white hover:bg-red-700 disabled:opacity-60"
              >
                {uninstallSubmitting ? "Uninstalling..." : "Uninstall"}
              </button>
              <button
                type="button"
                onClick={() => setUninstallingEndpoint(null)}
                className="flex-1 rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Change Password Modal */}
      {showChangePassword && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="text-xl font-semibold mb-1">Change Password</h2>
            <p className="text-sm text-slate-500 mb-5">
              Enter your one-time password and choose a new password.
            </p>

            {changePwSuccess ? (
              <div className="rounded-xl bg-green-50 border border-green-200 p-4 text-center">
                <p className="text-green-700 font-medium">Password changed successfully!</p>
              </div>
            ) : (
              <form onSubmit={handleChangePassword} className="space-y-4">
                {changePwError && (
                  <p className="text-sm text-red-600">{changePwError}</p>
                )}
                <label className="block">
                  <span className="text-sm text-slate-700">Current (one-time) password</span>
                  <input
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    className="mt-1 block w-full rounded-lg border px-3 py-2 text-sm"
                    required
                    autoFocus
                  />
                </label>
                <label className="block">
                  <span className="text-sm text-slate-700">New password</span>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="mt-1 block w-full rounded-lg border px-3 py-2 text-sm"
                    required
                    minLength={8}
                    placeholder="Minimum 8 characters"
                  />
                </label>
                <label className="block">
                  <span className="text-sm text-slate-700">Confirm new password</span>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="mt-1 block w-full rounded-lg border px-3 py-2 text-sm"
                    required
                  />
                </label>
                <div className="flex gap-3 pt-1">
                  <button
                    type="submit"
                    disabled={changePwSubmitting}
                    className="flex-1 rounded-lg bg-slate-900 px-4 py-2 text-sm text-white disabled:opacity-60"
                  >
                    {changePwSubmitting ? "Changing..." : "Change Password"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowChangePassword(false)}
                    className="flex-1 rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
