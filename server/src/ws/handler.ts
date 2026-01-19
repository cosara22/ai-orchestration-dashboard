import type { ServerWebSocket } from "bun";

interface WSData {
  id: string;
  subscribedChannels: Set<string>;
}

// Track connected clients
const clients = new Map<string, ServerWebSocket<WSData>>();

export const wsHandler = {
  open(ws: ServerWebSocket<WSData>) {
    const id = crypto.randomUUID();
    ws.data = {
      id,
      subscribedChannels: new Set(["all"]),
    };
    clients.set(id, ws);
    console.log(`WebSocket client connected: ${id}`);

    // Send welcome message
    ws.send(
      JSON.stringify({
        type: "connected",
        clientId: id,
        timestamp: new Date().toISOString(),
      })
    );
  },

  message(ws: ServerWebSocket<WSData>, message: string | Buffer) {
    try {
      const data = JSON.parse(message.toString());

      switch (data.type) {
        case "subscribe":
          if (data.channel) {
            ws.data.subscribedChannels.add(data.channel);
            ws.send(
              JSON.stringify({
                type: "subscribed",
                channel: data.channel,
              })
            );
          }
          break;

        case "unsubscribe":
          if (data.channel) {
            ws.data.subscribedChannels.delete(data.channel);
            ws.send(
              JSON.stringify({
                type: "unsubscribed",
                channel: data.channel,
              })
            );
          }
          break;

        case "ping":
          ws.send(JSON.stringify({ type: "pong", timestamp: new Date().toISOString() }));
          break;

        default:
          console.log(`Unknown message type: ${data.type}`);
      }
    } catch (error) {
      console.error("WebSocket message error:", error);
      ws.send(JSON.stringify({ type: "error", message: "Invalid message format" }));
    }
  },

  close(ws: ServerWebSocket<WSData>) {
    if (ws.data?.id) {
      clients.delete(ws.data.id);
      console.log(`WebSocket client disconnected: ${ws.data.id}`);
    }
  },

  error(ws: ServerWebSocket<WSData>, error: Error) {
    console.error(`WebSocket error for client ${ws.data?.id}:`, error);
  },
};

// Broadcast message to all connected clients
export function broadcastToClients(message: any, channel: string = "all") {
  const payload = JSON.stringify(message);

  for (const [, ws] of clients) {
    if (ws.data.subscribedChannels.has(channel) || ws.data.subscribedChannels.has("all")) {
      try {
        ws.send(payload);
      } catch (error) {
        console.error("Error broadcasting to client:", error);
      }
    }
  }
}

// Get connected client count
export function getClientCount(): number {
  return clients.size;
}

// Alias for broadcastToClients with channel-first signature
export function broadcastToChannel(channel: string, message: any) {
  broadcastToClients(message, channel);
}
