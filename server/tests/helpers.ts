import { WebSocketServer, type WebSocket } from "ws";
import type { IncomingHttpHeaders } from "node:http";
import type { AddressInfo } from "node:net";

/** Local server speaking the documented Gnani protocol, so adapters can be tested offline. */
export async function fakeServer(onConnection: (socket: WebSocket, headers: IncomingHttpHeaders) => void) {
  const server = new WebSocketServer({ port: 0 });
  await new Promise((resolve) => server.once("listening", resolve));
  server.on("connection", (socket, request) => onConnection(socket, request.headers));
  return {
    url: `ws://127.0.0.1:${(server.address() as AddressInfo).port}`,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

export const waitFor = async (check: () => boolean, ms = 2000) => {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > ms) throw new Error("waitFor timed out");
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
};
