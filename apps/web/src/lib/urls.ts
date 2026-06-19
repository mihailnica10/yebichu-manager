export function getWsUrl(host: string, port: number): string {
  const proto = typeof window !== "undefined" && window.location.protocol === "https:" ? "wss" : "ws";
  return `${proto}://${host}:${port}/websockify`;
}

export function getVncUrl(host: string, port: number): string {
  return `vnc://${host}:${port}`;
}

export function getBridgeUrl(host: string, port: number): string {
  return `http://${host}:${port}`;
}

export function getVncHost(): string {
  return process.env.NEXT_PUBLIC_VNC_HOST || (typeof window !== "undefined" ? window.location.hostname : "localhost");
}
