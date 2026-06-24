using System.Collections.Concurrent;
using System.Management;
using System.Net.NetworkInformation;
using System.Net.Sockets;
using System.Net.WebSockets;
using System.Runtime.InteropServices;
using System.Security.Principal;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Threading.Channels;
using System.Windows.Forms;
using Microsoft.Win32;

// ── File logger (WinExe has no console window) ─────────────────────────────────
var LogFile = Path.Combine(AppContext.BaseDirectory, "agent.log");
void Log(string msg)
{
    try { File.AppendAllText(LogFile, $"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] {msg}{Environment.NewLine}"); }
    catch { }
}

// ── Elevation check ─────────────────────────────────────────────────────────────
var isAdmin = new WindowsPrincipal(WindowsIdentity.GetCurrent()).IsInRole(WindowsBuiltInRole.Administrator);
if (!isAdmin)
    Log("Warning: not running as Administrator — USB drive ejection will be skipped.");

// ── CLI args ────────────────────────────────────────────────────────────────────
var cliArgs = Environment.GetCommandLineArgs().Skip(1).ToArray();
string? cliToken = null, cliApiUrl = null;
for (int i = 0; i + 1 < cliArgs.Length; i++)
{
    if (cliArgs[i] == "--token")   cliToken  = cliArgs[i + 1];
    if (cliArgs[i] == "--api-url") cliApiUrl = cliArgs[i + 1];
}

// ── Config ──────────────────────────────────────────────────────────────────────
var ConfigFile = Path.Combine(AppContext.BaseDirectory, "agent_config.json");

AgentConfig config;
if (File.Exists(ConfigFile))
{
    config = JsonSerializer.Deserialize<AgentConfig>(File.ReadAllText(ConfigFile))!;
    Log($"Loaded config. Endpoint ID: {config.EndpointId}");
}
else
{
    if (cliToken == null || cliApiUrl == null)
    {
        MessageBox.Show(
            "USB Control Agent\n\nNo install token provided.\nUse the admin dashboard to generate an installer.",
            "USB Control Agent", MessageBoxButtons.OK, MessageBoxIcon.Error);
        return;
    }

    var apiUrl       = cliApiUrl;
    var installToken = cliToken;

    Log($"Silent install — registering with {apiUrl}");
    var apiUrlNorm = apiUrl.TrimEnd('/') + "/";
    using var setupClient = new HttpClient { BaseAddress = new Uri(apiUrlNorm) };

    var regPayload = new AgentRegisterRequest
    {
        InstallToken = installToken,
        Hostname     = Environment.MachineName,
        OsVersion    = RuntimeInformation.OSDescription,
        Cpu          = GetCpuInfo(),
        Ram          = GetRamInfo(),
        MacAddress   = GetPrimaryMac(),
        IpAddress    = GetPrimaryIp(),
        MachineId    = GetMachineId(),
        Version      = "1.0.0",
    };

    var regResp = await PostJson<AgentRegisterRequest, AgentRegisterResponse>(setupClient, "agent/register", regPayload);
    config = new AgentConfig { ApiBaseUrl = apiUrl, EndpointId = regResp.EndpointId };
    File.WriteAllText(ConfigFile, JsonSerializer.Serialize(config, new JsonSerializerOptions { WriteIndented = true }));
    Log($"Registered. Endpoint ID: {regResp.EndpointId}");
}

// ── Runtime ─────────────────────────────────────────────────────────────────────
var apiBaseUrl = config.ApiBaseUrl.TrimEnd('/') + "/";
using var http = new HttpClient { BaseAddress = new Uri(apiBaseUrl) };
var cts = new CancellationTokenSource();
var pendingDecisions = new ConcurrentDictionary<int, TaskCompletionSource<string>>();

_ = Task.Run(() => HeartbeatLoop(http, config.EndpointId, cts.Token));
_ = Task.Run(() => UsbWatcherLoop(http, apiBaseUrl, config.EndpointId, pendingDecisions, isAdmin, cts.Token));
_ = Task.Run(() => WebSocketLoop(apiBaseUrl, config.EndpointId, pendingDecisions, cts.Token));

Log("Agent running — monitoring USB drives.");
try { await Task.Delay(Timeout.Infinite, cts.Token); } catch (TaskCanceledException) { }
Log("Agent stopped.");

// ── Heartbeat ───────────────────────────────────────────────────────────────────
static async Task HeartbeatLoop(HttpClient client, int endpointId, CancellationToken ct)
{
    while (!ct.IsCancellationRequested)
    {
        try
        {
            await PostJson<AgentHeartbeatRequest, object>(
                client, "agent/heartbeat", new AgentHeartbeatRequest { EndpointId = endpointId });
        }
        catch { }
        try { await Task.Delay(TimeSpan.FromSeconds(30), ct); } catch { break; }
    }
}

// ── USB Watcher ─────────────────────────────────────────────────────────────────
static async Task UsbWatcherLoop(
    HttpClient client, string apiBase, int endpointId,
    ConcurrentDictionary<int, TaskCompletionSource<string>> pending, bool canEject, CancellationToken ct)
{
    var channel = Channel.CreateUnbounded<UsbDriveInfo>();

    using var watcher = new ManagementEventWatcher(new WqlEventQuery(
        "SELECT * FROM __InstanceCreationEvent WITHIN 2 " +
        "WHERE TargetInstance ISA 'Win32_LogicalDisk' AND TargetInstance.DriveType = 2"));

    watcher.EventArrived += (_, e) =>
    {
        var disk = (ManagementBaseObject)e.NewEvent["TargetInstance"];
        var info = new UsbDriveInfo(
            DriveLetter: disk["DeviceID"]?.ToString() ?? "?",
            VolumeName:  disk["VolumeName"]?.ToString()?.Trim() is { Length: > 0 } v ? v : "USB Drive",
            Serial:      disk["VolumeSerialNumber"]?.ToString() ?? Guid.NewGuid().ToString("N")[..12],
            Size:        FormatBytes(Convert.ToInt64(disk["Size"] ?? 0)));
        channel.Writer.TryWrite(info);
    };

    watcher.Start();

    await foreach (var info in channel.Reader.ReadAllAsync(ct))
        _ = Task.Run(async () => await HandleUsbInsertion(client, info, endpointId, pending, canEject, ct), ct);

    watcher.Stop();
}

static async Task HandleUsbInsertion(
    HttpClient client, UsbDriveInfo info, int endpointId,
    ConcurrentDictionary<int, TaskCompletionSource<string>> pending, bool canEject, CancellationToken ct)
{
    try
    {
        ShowToast("USB Detected",
            $"Drive '{info.VolumeName}' ({info.DriveLetter}) inserted.\nWaiting for admin approval...");

        var resp = await PostJson<AgentUsbEventRequest, AgentUsbEventResponse>(client, "agent/usb-event",
            new AgentUsbEventRequest
            {
                EndpointId   = endpointId,
                DeviceName   = info.VolumeName,
                DeviceSerial = info.Serial,
            });

        var tcs = new TaskCompletionSource<string>();
        pending[resp.Id] = tcs;

        _ = Task.Run(async () =>
        {
            var deadline = DateTime.UtcNow.AddMinutes(10);
            while (DateTime.UtcNow < deadline && !tcs.Task.IsCompleted && !ct.IsCancellationRequested)
            {
                try
                {
                    var s = await GetJson<AgentUsbEventStatusResponse>(client, $"agent/usb-event/{resp.Id}/status");
                    if (s.Status != "pending") { tcs.TrySetResult(s.Status); break; }
                }
                catch { }
                try { await Task.Delay(3000, ct); } catch { break; }
            }
            tcs.TrySetResult("pending");
        }, ct);

        var decision = await tcs.Task.WaitAsync(TimeSpan.FromMinutes(11));
        pending.TryRemove(resp.Id, out _);

        if (decision == "rejected")
        {
            if (canEject)
            {
                ShowToast("USB BLOCKED",
                    $"Admin rejected '{info.VolumeName}' ({info.DriveLetter}).\nEjecting drive...");
                EjectDrive(info.DriveLetter);
            }
            else
            {
                ShowToast("USB BLOCKED",
                    $"Admin rejected '{info.VolumeName}' ({info.DriveLetter}).\nRun agent as Administrator to enable auto-eject.");
            }
        }
        else if (decision == "approved")
        {
            ShowToast("USB Approved",
                $"Admin approved '{info.VolumeName}' ({info.DriveLetter}). File transfers allowed.");
        }
    }
    catch { }
}

// ── WebSocket ───────────────────────────────────────────────────────────────────
static async Task WebSocketLoop(
    string apiBase, int endpointId,
    ConcurrentDictionary<int, TaskCompletionSource<string>> pending, CancellationToken ct)
{
    while (!ct.IsCancellationRequested)
    {
        using var ws = new ClientWebSocket();
        try
        {
            var baseUri  = new Uri(apiBase);
            var wsScheme = baseUri.Scheme == "https" ? "wss" : "ws";
            var wsUri    = new Uri($"{wsScheme}://{baseUri.Authority}{baseUri.AbsolutePath}agent/ws/{endpointId}");

            await ws.ConnectAsync(wsUri, ct);

            var buf = new byte[4096];
            while (!ct.IsCancellationRequested && ws.State == WebSocketState.Open)
            {
                var result = await ws.ReceiveAsync(new ArraySegment<byte>(buf), ct);
                if (result.CloseStatus.HasValue) break;

                var json = Encoding.UTF8.GetString(buf, 0, result.Count);
                try
                {
                    var msg = JsonSerializer.Deserialize<WsMessage>(json,
                        new JsonSerializerOptions { PropertyNameCaseInsensitive = true });
                    if (msg?.EventId is int eid && msg.Status is string st)
                        if (pending.TryRemove(eid, out var tcs))
                            tcs.TrySetResult(st);
                }
                catch { }
            }
        }
        catch (TaskCanceledException) { break; }
        catch { }

        if (!ct.IsCancellationRequested)
            try { await Task.Delay(5000, ct); } catch { break; }
    }
}

// ── Drive eject ─────────────────────────────────────────────────────────────────
static void EjectDrive(string driveLetter)
{
    try
    {
        var drive = driveLetter.TrimEnd(':', '\\', '/');
        var psi = new System.Diagnostics.ProcessStartInfo("cmd.exe", $"/c mountvol {drive}: /p")
        {
            CreateNoWindow         = true,
            UseShellExecute        = false,
            RedirectStandardOutput = true,
            RedirectStandardError  = true,
        };
        using var proc = System.Diagnostics.Process.Start(psi)!;
        proc.WaitForExit(5000);
    }
    catch { }
}

// ── Windows toast notification ──────────────────────────────────────────────────
static void ShowToast(string title, string body)
{
    var thread = new Thread(() =>
    {
        Application.EnableVisualStyles();
        using var icon = new NotifyIcon { Icon = SystemIcons.Information, Visible = true };
        icon.ShowBalloonTip(7000, title, body, ToolTipIcon.Info);
        Thread.Sleep(7500);
        icon.Visible = false;
    });
    thread.SetApartmentState(ApartmentState.STA);
    thread.IsBackground = true;
    thread.Start();
}

// ── Hardware helpers ─────────────────────────────────────────────────────────────
static string? GetMachineId()
{
    try { return Registry.GetValue(@"HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Cryptography", "MachineGuid", null)?.ToString(); }
    catch { return null; }
}

static string? GetCpuInfo()
{
    try
    {
        using var s = new ManagementObjectSearcher("SELECT Name FROM Win32_Processor");
        foreach (var o in s.Get()) return o["Name"]?.ToString()?.Trim();
    }
    catch { }
    return Environment.GetEnvironmentVariable("PROCESSOR_IDENTIFIER");
}

static string? GetRamInfo()
{
    try
    {
        long total = 0;
        using var s = new ManagementObjectSearcher("SELECT Capacity FROM Win32_PhysicalMemory");
        foreach (var o in s.Get()) total += Convert.ToInt64(o["Capacity"] ?? 0);
        return total > 0 ? $"{total / 1024 / 1024 / 1024} GB" : null;
    }
    catch
    {
        var b = GC.GetGCMemoryInfo().TotalAvailableMemoryBytes;
        return b > 0 ? $"{b / 1024 / 1024} MB" : null;
    }
}

static string? GetPrimaryMac()
{
    try
    {
        return NetworkInterface.GetAllNetworkInterfaces()
            .Where(n => n.OperationalStatus == OperationalStatus.Up
                     && n.NetworkInterfaceType != NetworkInterfaceType.Loopback)
            .OrderByDescending(n => n.Speed)
            .FirstOrDefault()?.GetPhysicalAddress().ToString();
    }
    catch { return null; }
}

static string? GetPrimaryIp()
{
    try
    {
        return System.Net.Dns.GetHostEntry(System.Net.Dns.GetHostName()).AddressList
            .FirstOrDefault(a => a.AddressFamily == AddressFamily.InterNetwork)?.ToString();
    }
    catch { return null; }
}

static string FormatBytes(long bytes)
{
    if (bytes <= 0) return "unknown size";
    string[] units = ["B", "KB", "MB", "GB", "TB"];
    int i = 0; double v = bytes;
    while (v >= 1024 && i < units.Length - 1) { v /= 1024; i++; }
    return $"{v:F1} {units[i]}";
}

// ── HTTP helpers ─────────────────────────────────────────────────────────────────
static async Task<TRes> PostJson<TReq, TRes>(HttpClient client, string path, TReq payload)
{
    var opts = new JsonSerializerOptions { DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull };
    using var content = new StringContent(JsonSerializer.Serialize(payload, opts), Encoding.UTF8, "application/json");
    using var resp = await client.PostAsync(path, content);
    resp.EnsureSuccessStatusCode();
    return JsonSerializer.Deserialize<TRes>(await resp.Content.ReadAsStringAsync(),
        new JsonSerializerOptions { PropertyNameCaseInsensitive = true })!;
}

static async Task<TRes> GetJson<TRes>(HttpClient client, string path)
{
    using var resp = await client.GetAsync(path);
    resp.EnsureSuccessStatusCode();
    return JsonSerializer.Deserialize<TRes>(await resp.Content.ReadAsStringAsync(),
        new JsonSerializerOptions { PropertyNameCaseInsensitive = true })!;
}

// ── Models ───────────────────────────────────────────────────────────────────────
record UsbDriveInfo(string DriveLetter, string VolumeName, string Serial, string Size);

class AgentConfig
{
    public string ApiBaseUrl { get; set; } = string.Empty;
    public int    EndpointId  { get; set; }
}

class AgentRegisterRequest
{
    [JsonPropertyName("install_token")] public string  InstallToken { get; set; } = string.Empty;
    [JsonPropertyName("hostname")]      public string  Hostname     { get; set; } = string.Empty;
    [JsonPropertyName("os_version")]    public string? OsVersion    { get; set; }
    [JsonPropertyName("cpu")]           public string? Cpu          { get; set; }
    [JsonPropertyName("ram")]           public string? Ram          { get; set; }
    [JsonPropertyName("mac_address")]   public string? MacAddress   { get; set; }
    [JsonPropertyName("ip_address")]    public string? IpAddress    { get; set; }
    [JsonPropertyName("machine_id")]    public string? MachineId    { get; set; }
    [JsonPropertyName("version")]       public string? Version      { get; set; }
}

class AgentRegisterResponse
{
    [JsonPropertyName("endpoint_id")]  public int    EndpointId  { get; set; }
    [JsonPropertyName("installed_at")] public string InstalledAt { get; set; } = string.Empty;
    [JsonPropertyName("status")]       public string Status      { get; set; } = string.Empty;
}

class AgentHeartbeatRequest
{
    [JsonPropertyName("endpoint_id")] public int EndpointId { get; set; }
}

class AgentUsbEventRequest
{
    [JsonPropertyName("endpoint_id")]   public int     EndpointId   { get; set; }
    [JsonPropertyName("device_name")]   public string  DeviceName   { get; set; } = string.Empty;
    [JsonPropertyName("device_serial")] public string? DeviceSerial { get; set; }
    [JsonPropertyName("vendor_id")]     public string? VendorId     { get; set; }
    [JsonPropertyName("product_id")]    public string? ProductId    { get; set; }
}

class AgentUsbEventResponse
{
    [JsonPropertyName("id")]     public int    Id     { get; set; }
    [JsonPropertyName("status")] public string Status { get; set; } = string.Empty;
}

class AgentUsbEventStatusResponse
{
    [JsonPropertyName("id")]     public int    Id     { get; set; }
    [JsonPropertyName("status")] public string Status { get; set; } = string.Empty;
}

class WsMessage
{
    [JsonPropertyName("event_id")] public int?    EventId { get; set; }
    [JsonPropertyName("status")]   public string? Status  { get; set; }
}
