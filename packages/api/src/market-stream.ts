import {
  fetchBridgeAccount,
  fetchBridgeHealth,
  fetchBridgeOHLC,
  fetchBridgeOrders,
  fetchBridgePositions,
} from "./bridge";
import { listRunningContainers } from "./docker";
import { emitSocketEvent } from "./socket";

const POLL_INTERVAL = 5_000;
let intervalHandle: ReturnType<typeof setInterval> | null = null;

const DEFAULT_SYMBOLS = ["EURUSD", "GBPUSD", "USDJPY", "BTCUSD", "ETHUSD"];
const DEFAULT_TIMEFRAMES = ["M1", "M5", "M15", "H1", "H4", "D1"];

async function collectAndEmit() {
  const instances = listRunningContainers();
  for (const [name] of Object.entries(instances)) {
    try {
      const health = await fetchBridgeHealth(name);
      if (!health || health.status !== "ok") continue;

      const account = await fetchBridgeAccount(name);
      if (account) {
        emitSocketEvent("market:account", { name, data: account, time: Date.now() });
      }

      const positions = await fetchBridgePositions(name);
      if (positions) {
        emitSocketEvent("market:positions", { name, data: positions, time: Date.now() });
      }

      const orders = await fetchBridgeOrders(name);
      if (orders) {
        emitSocketEvent("market:orders", { name, data: orders, time: Date.now() });
      }
    } catch {
      // Skip instance on error
    }
  }
}

export function startMarketStream() {
  if (intervalHandle) return;
  collectAndEmit();
  intervalHandle = setInterval(collectAndEmit, POLL_INTERVAL);
}

export function stopMarketStream() {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
}
