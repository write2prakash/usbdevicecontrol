using System;
using System.Collections.Generic;
using System.Linq;
using System.Net.Http;
using System.Net;
using System.Net.NetworkInformation;
using System.Net.Sockets;
using System.Net.WebSockets;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Threading;
using System.Threading.Tasks;

const string defaultApiUrl = "http://localhost:8000";
using System.Net.WebSockets;

var apiBaseUrl = Prompt("Backend API base URL", defaultApiUrl);
var token = Prompt("Install token");

using var client = new HttpClient { BaseAddress = new Uri(apiBaseUrl) };
client.DefaultRequestHeaders.Accept.Add(new System.Net.Http.Headers.MediaTypeWithQualityHeaderValue("application/json"));

var payload = new AgentRegisterRequest
{
    InstallToken = token,
    Hostname = Environment.MachineName,
    OsVersion = RuntimeInformation.OSDescription,
    Cpu = GetCpuIdentifier(),
    Ram = GetMemoryInfo(),
    MacAddress = GetPrimaryMacAddress(),
    IpAddress = GetPrimaryIpAddress(),
    Version = "1.0.0"
};

Console.WriteLine("Registering agent with backend...");
var registerResponse = await PostJson<AgentRegisterRequest, AgentRegisterResponse>(client, "/agent/register", payload);
Console.WriteLine($"Registered endpoint ID {registerResponse.EndpointId} at {registerResponse.InstalledAt}.");

var cts = new CancellationTokenSource();
_ = Task.Run(() => HeartbeatLoop(client, registerResponse.EndpointId, cts.Token));

Console.WriteLine("Agent running. Enter 'send' to create a USB event, 'exit' to quit.");
while (true)
{
    Console.Write("> ");
    var command = Console.ReadLine()?.Trim().ToLowerInvariant();
    if (string.IsNullOrEmpty(command))
    {
_ = Task.Run(() => WebSocketListener(apiBaseUrl, registerResponse.EndpointId, cts.Token));
        continue;
    }

    if (command == "exit")
    {
        cts.Cancel();
        break;
    }

    if (command == "send")
    {
        var eventPayload = new AgentUsbEventRequest
        {
            EndpointId = registerResponse.EndpointId,
            DeviceName = "USB Thumb Drive",
            DeviceSerial = Guid.NewGuid().ToString().Substring(0, 12).ToUpperInvariant(),
            VendorId = "1234",
            ProductId = "5678"
        };

        var eventResponse = await PostJson<AgentUsbEventRequest, AgentUsbEventResponse>(client, "/agent/usb-event", eventPayload);
        Console.WriteLine($"USB event created: ID {eventResponse.Id}, status {eventResponse.Status}");
    }
    else if (command.StartsWith("status"))
    {
        var parts = command.Split(' ', StringSplitOptions.RemoveEmptyEntries);
        if (parts.Length != 2 || !int.TryParse(parts[1], out var eventId))
        {
            Console.WriteLine("Usage: status <eventId>");
            continue;
        }

        var statusResponse = await GetJson<AgentUsbEventStatusResponse>(client, $"/agent/usb-event/{eventId}/status");
        Console.WriteLine($"Event {statusResponse.Id} status: {statusResponse.Status}");
    }
    else
    {
        Console.WriteLine("Commands: send, status <id>, exit");
    }
}

Console.WriteLine("Agent shutting down.");

static string Prompt(string prompt, string defaultValue = "")
{
    Console.Write(prompt);
    var input = Console.ReadLine();
    return string.IsNullOrWhiteSpace(input) ? defaultValue : input.Trim();
}

static string? GetCpuIdentifier()
{
    return Environment.GetEnvironmentVariable("PROCESSOR_IDENTIFIER");
}

static string? GetMemoryInfo()
{
    try
    {
        var totalMemory = GC.GetGCMemoryInfo().TotalAvailableMemoryBytes;
        return totalMemory > 0 ? $"{totalMemory / 1024 / 1024} MB" : null;
    }
    catch
    {
        return null;
    }
}

static string? GetPrimaryMacAddress()
{
    try
    {
        var nic = NetworkInterface.GetAllNetworkInterfaces()
            .Where(n => n.OperationalStatus == OperationalStatus.Up && n.NetworkInterfaceType != NetworkInterfaceType.Loopback)
            .OrderByDescending(n => n.Speed)
            .FirstOrDefault();

        return nic?.GetPhysicalAddress().ToString();
    }
    catch
    {
        return null;
    }
}

static string? GetPrimaryIpAddress()
{
    try
    {
        var host = Dns.GetHostEntry(Dns.GetHostName());
        var address = host.AddressList.FirstOrDefault(a => a.AddressFamily == AddressFamily.InterNetwork);
        return address?.ToString();
    }
    catch
    {
        return null;
    }
}

static async Task<TResponse> PostJson<TRequest, TResponse>(HttpClient client, string path, TRequest payload)
{
    var json = JsonSerializer.Serialize(payload, new JsonSerializerOptions { DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull });
    using var content = new StringContent(json, Encoding.UTF8, "application/json");
    using var response = await client.PostAsync(path, content);
    response.EnsureSuccessStatusCode();
    var responseBody = await response.Content.ReadAsStringAsync();
    return JsonSerializer.Deserialize<TResponse>(responseBody, new JsonSerializerOptions { PropertyNameCaseInsensitive = true })!;
}

static async Task<TResponse> GetJson<TResponse>(HttpClient client, string path)
{
    using var response = await client.GetAsync(path);
    response.EnsureSuccessStatusCode();
    var responseBody = await response.Content.ReadAsStringAsync();
    return JsonSerializer.Deserialize<TResponse>(responseBody, new JsonSerializerOptions { PropertyNameCaseInsensitive = true })!;
}

static async Task HeartbeatLoop(HttpClient client, int endpointId, CancellationToken cancellationToken)
{
    while (!cancellationToken.IsCancellationRequested)
    {
        try
        {
            var payload = new AgentHeartbeatRequest { EndpointId = endpointId };
            await PostJson<AgentHeartbeatRequest, object>(client, "/agent/heartbeat", payload);
            Console.WriteLine($"Heartbeat sent for endpoint {endpointId}.");
        }
        catch (Exception ex)
        {
            Console.WriteLine($"Heartbeat failed: {ex.Message}");
        }

        try
        {
            await Task.Delay(TimeSpan.FromSeconds(30), cancellationToken);
        }
        catch (TaskCanceledException)
        {
            break;
        }
    }
}

static Uri GetWebSocketUri(string apiBaseUrl, int endpointId)
{
    var baseUri = new Uri(apiBaseUrl);
    var scheme = baseUri.Scheme == "https" ? "wss" : "ws";
    var builder = new UriBuilder(baseUri)
    {
        Scheme = scheme,
        Port = baseUri.IsDefaultPort ? (baseUri.Scheme == "https" ? 443 : 80) : baseUri.Port,
        Path = $"/agent/ws/{endpointId}"
    };
    return builder.Uri;
}

static async Task WebSocketListener(string apiBaseUrl, int endpointId, CancellationToken cancellationToken)
{
    using var websocket = new ClientWebSocket();
    var wsUri = GetWebSocketUri(apiBaseUrl, endpointId);
    try
    {
        await websocket.ConnectAsync(wsUri, cancellationToken);
        Console.WriteLine($"Connected to websocket {wsUri}");

        var buffer = new byte[4096];
        while (!cancellationToken.IsCancellationRequested && websocket.State == WebSocketState.Open)
        {
            var result = await websocket.ReceiveAsync(new ArraySegment<byte>(buffer), cancellationToken);
            if (result.CloseStatus.HasValue)
            {
                await websocket.CloseAsync(result.CloseStatus.Value, result.CloseStatusDescription, cancellationToken);
                break;
            }
            var message = Encoding.UTF8.GetString(buffer, 0, result.Count);
            Console.WriteLine($"WebSocket message: {message}");
        }
    }
    catch (Exception ex)
    {
        Console.WriteLine($"WebSocket connection failed: {ex.Message}");
    }
}

internal class AgentRegisterRequest
{
    [JsonPropertyName("install_token")]
    public string InstallToken { get; set; } = string.Empty;

    [JsonPropertyName("hostname")]
    public string Hostname { get; set; } = string.Empty;

    [JsonPropertyName("os_version")]
    public string? OsVersion { get; set; }

    [JsonPropertyName("cpu")]
    public string? Cpu { get; set; }

    [JsonPropertyName("ram")]
    public string? Ram { get; set; }

    [JsonPropertyName("mac_address")]
    public string? MacAddress { get; set; }

    [JsonPropertyName("ip_address")]
    public string? IpAddress { get; set; }

    [JsonPropertyName("version")]
    public string? Version { get; set; }
}

internal class AgentRegisterResponse
{
    [JsonPropertyName("endpoint_id")]
    public int EndpointId { get; set; }

    [JsonPropertyName("installed_at")]
    public string InstalledAt { get; set; } = string.Empty;

    [JsonPropertyName("status")]
    public string Status { get; set; } = string.Empty;
}

internal class AgentHeartbeatRequest
{
    [JsonPropertyName("endpoint_id")]
    public int EndpointId { get; set; }
}

internal class AgentUsbEventRequest
{
    [JsonPropertyName("endpoint_id")]
    public int EndpointId { get; set; }

    [JsonPropertyName("device_name")]
    public string DeviceName { get; set; } = string.Empty;

    [JsonPropertyName("device_serial")]
    public string? DeviceSerial { get; set; }

    [JsonPropertyName("vendor_id")]
    public string? VendorId { get; set; }

    [JsonPropertyName("product_id")]
    public string? ProductId { get; set; }
}

internal class AgentUsbEventResponse
{
    [JsonPropertyName("id")]
    public int Id { get; set; }

    [JsonPropertyName("status")]
    public string Status { get; set; } = string.Empty;
}

internal class AgentUsbEventStatusResponse
{
    [JsonPropertyName("id")]
    public int Id { get; set; }

    [JsonPropertyName("status")]
    public string Status { get; set; } = string.Empty;
}
