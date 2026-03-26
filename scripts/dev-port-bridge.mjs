import net from "node:net";
import { spawn } from "node:child_process";
import process from "node:process";

const [, , command, ...args] = process.argv;

function usage() {
  console.error(
    [
      "usage:",
      "  node scripts/dev-port-bridge.mjs probe <host> <port>",
      "  node scripts/dev-port-bridge.mjs find-open-port <host> <preferred-port>",
      "  node scripts/dev-port-bridge.mjs extract-published-port <ports-json> <key>",
      "  node scripts/dev-port-bridge.mjs proxy <listen-host> <listen-port> <container> <target-host> <target-port>"
    ].join("\n")
  );
}

function connectable(host, port, timeoutMs = 750) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    const finish = (result) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(result);
    };

    socket.setTimeout(timeoutMs);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));
  });
}

function tryListen(host, port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.unref();
    server.once("error", () => resolve(null));
    server.listen({ host, port }, () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close(() => resolve(null));
        return;
      }

      const resolvedPort = address.port;
      server.close(() => resolve(resolvedPort));
    });
  });
}

async function runProbe(host, portText) {
  const port = Number(portText);
  if (!Number.isInteger(port) || port <= 0) {
    throw new Error(`invalid port: ${portText}`);
  }

  process.exit((await connectable(host, port)) ? 0 : 1);
}

async function runFindOpenPort(host, preferredPortText) {
  const preferredPort = Number(preferredPortText);
  if (!Number.isInteger(preferredPort) || preferredPort <= 0) {
    throw new Error(`invalid preferred port: ${preferredPortText}`);
  }

  const candidates = [preferredPort];
  for (let offset = 1; offset <= 32; offset += 1) {
    candidates.push(preferredPort + offset);
  }
  candidates.push(0);

  for (const candidate of candidates) {
    const resolved = await tryListen(host, candidate);
    if (resolved !== null) {
      console.log(resolved);
      return;
    }
  }

  throw new Error(`unable to find an open port near ${preferredPort}`);
}

function runExtractPublishedPort(portsJson, key) {
  const ports = JSON.parse(portsJson);
  const bindings = ports?.[key];
  if (!Array.isArray(bindings) || bindings.length === 0) {
    process.exit(1);
  }

  const binding = bindings.find((item) => item && item.HostPort);
  if (!binding) {
    process.exit(1);
  }

  let host = binding.HostIp || "127.0.0.1";
  if (host === "0.0.0.0" || host === "::") {
    host = "127.0.0.1";
  }

  console.log(`${host} ${binding.HostPort}`);
}

function createContainerBridge(container, targetHost, targetPort) {
  return spawn(
    "docker",
    [
      "exec",
      "-i",
      container,
      "bash",
      "-lc",
      `exec 3<>/dev/tcp/${targetHost}/${targetPort}; cat <&3 & cat >&3; wait`
    ],
    { stdio: ["pipe", "pipe", "inherit"] }
  );
}

function runProxy(listenHost, listenPortText, container, targetHost, targetPortText) {
  const listenPort = Number(listenPortText);
  const targetPort = Number(targetPortText);
  if (!Number.isInteger(listenPort) || listenPort <= 0) {
    throw new Error(`invalid listen port: ${listenPortText}`);
  }
  if (!Number.isInteger(targetPort) || targetPort <= 0) {
    throw new Error(`invalid target port: ${targetPortText}`);
  }

  const server = net.createServer((socket) => {
    const bridge = createContainerBridge(container, targetHost, targetPort);
    socket.pipe(bridge.stdin);
    bridge.stdout.pipe(socket);

    const stopBridge = () => {
      if (!bridge.killed) {
        bridge.kill("SIGTERM");
      }
    };

    socket.on("close", stopBridge);
    socket.on("error", stopBridge);
    bridge.on("exit", () => socket.destroy());
  });

  const shutdown = () => {
    server.close(() => process.exit(0));
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  server.listen({ host: listenHost, port: listenPort }, () => {
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("unable to determine proxy listen address");
    }

    console.log(`proxy listening on ${address.address}:${address.port}`);
  });
}

async function main() {
  switch (command) {
    case "probe":
      if (args.length !== 2) {
        usage();
        process.exit(1);
      }
      await runProbe(args[0], args[1]);
      return;
    case "find-open-port":
      if (args.length !== 2) {
        usage();
        process.exit(1);
      }
      await runFindOpenPort(args[0], args[1]);
      return;
    case "extract-published-port":
      if (args.length !== 2) {
        usage();
        process.exit(1);
      }
      runExtractPublishedPort(args[0], args[1]);
      return;
    case "proxy":
      if (args.length !== 5) {
        usage();
        process.exit(1);
      }
      runProxy(args[0], args[1], args[2], args[3], args[4]);
      return;
    default:
      usage();
      process.exit(1);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
