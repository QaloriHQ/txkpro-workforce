import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const required = ["CLINE_PLAN_MODEL", "CLINE_ACT_MODEL"];
for (const key of required) {
  if (!process.env[key]?.trim()) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
}

const dataDir = path.join(os.homedir(), ".cline", "data");
const statePath = path.join(dataDir, "globalState.json");
fs.mkdirSync(dataDir, { recursive: true });

let state = {};
if (fs.existsSync(statePath)) {
  const raw = fs.readFileSync(statePath, "utf8").trim();
  if (raw) {
    state = JSON.parse(raw);
  }
}

const next = {
  ...state,
  planActSeparateModelsSetting: true,
  planActMode: "plan",
  planModeApiProvider: "openrouter",
  actModeApiProvider: "openrouter",
  planModeOpenRouterModelId: process.env.CLINE_PLAN_MODEL.trim(),
  actModeOpenRouterModelId: process.env.CLINE_ACT_MODEL.trim(),
  welcomeViewCompleted: true,
  isNewUser: false,
};

const tempPath = `${statePath}.tmp`;
fs.writeFileSync(tempPath, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600 });
fs.renameSync(tempPath, statePath);

console.log(
  `[cline-config] plan=${next.planModeOpenRouterModelId} act=${next.actModeOpenRouterModelId} provider=openrouter`,
);
