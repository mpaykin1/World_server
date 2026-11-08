#!/usr/bin/env node
"use strict";

// Verifies the installed official REA MCP process via a real stdio handshake.
// This process is local to the runner: it never opens a network listener.
const { spawn } = require("node:child_process");

const command = process.env.REA_BIN || "rea";
const child = spawn(command, ["mcp"], {
  stdio: ["pipe", "pipe", "pipe"],
  env: {
    ...process.env,
    REA_MCP_INPUT_SCHEMA_PROFILE: "compact",
    REA_MCP_OUTPUT_SCHEMA_PROFILE: "compact",
  },
});

let finished = false;
let output = "";
let diagnostics = "";

const timer = setTimeout(() => {
  fail("REA MCP handshake timed out");
}, 120000);

function send(message) {
  child.stdin.write(JSON.stringify(message) + "\n");
}

function finish(message) {
  if (finished) return;
  finished = true;
  clearTimeout(timer);
  console.log(message);
  child.kill();
}

function fail(message) {
  if (finished) return;
  finished = true;
  clearTimeout(timer);
  console.error(message);
  if (diagnostics) console.error(diagnostics.slice(-1600));
  process.exitCode = 1;
  child.kill();
}

function handle(message) {
  if (message.id === 1) {
    if (message.error) return fail("REA MCP initialize rejected: " + JSON.stringify(message.error));
    if (!message.result || !message.result.protocolVersion) return fail("Invalid REA initialize response");
    send({ jsonrpc: "2.0", method: "notifications/initialized" });
    send({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
  } else if (message.id === 2) {
    const tools = message.result?.tools;
    if (!Array.isArray(tools) || tools.length === 0) return fail("REA exposed no MCP tools");
    const names = tools.map((tool) => tool.name);
    if (!names.every((name) => typeof name === "string" && name.length)) return fail("Malformed REA MCP tool list");
    finish("REA_MCP_READY: " + tools.length + " tools");
  }
}

child.stdout.on("data", (chunk) => {
  output += chunk.toString("utf8");
  if (output.length > 8 * 1024 * 1024) return fail("REA response exceeded 8 MiB");
  let newline;
  while ((newline = output.indexOf("\n")) >= 0) {
    const line = output.slice(0, newline).trim();
    output = output.slice(newline + 1);
    if (!line) continue;
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      return fail("REA MCP wrote invalid JSON to stdout");
    }
    handle(message);
  }
});

child.stderr.on("data", (chunk) => {
  diagnostics = (diagnostics + chunk.toString("utf8")).slice(-2000);
});
child.on("error", (error) => fail("REA MCP process failed to start: " + error.message));
child.on("exit", (code, signal) => {
  if (!finished) fail("REA MCP exited before handshake: " + (signal || code));
});

send({
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "world-server-rea-check", version: "1.0.0" },
  },
});
