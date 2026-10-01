import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const required = [
  "CLINE_PLAN_MODEL",
  "CLINE_ACT_MODEL",
  "CLINE_PLAN_MAX_TOKENS",
  "CLINE_ACT_MAX_TOKENS",
];
for (const key of required) {
  if (!process.env[key]?.trim()) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
}

function positiveIntegerEnv(name) {
  const value = Number(process.env[name]);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer; received "${process.env[name]}"`);
  }
  return value;
}

const planModel = process.env.CLINE_PLAN_MODEL.trim();
const actModel = process.env.CLINE_ACT_MODEL.trim();
const planMaxTokens = positiveIntegerEnv("CLINE_PLAN_MAX_TOKENS");
const actMaxTokens = positiveIntegerEnv("CLINE_ACT_MAX_TOKENS");

const dataDir = path.join(os.homedir(), ".cline", "data");
const settingsDir = path.join(dataDir, "settings");
const statePath = path.join(dataDir, "globalState.json");
const modelsPath = path.join(settingsDir, "models.json");
fs.mkdirSync(settingsDir, { recursive: true });

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
  planActMode: "act",
  planModeApiProvider: "openrouter",
  actModeApiProvider: "openrouter",
  planModeOpenRouterModelId: planModel,
  actModeOpenRouterModelId: actModel,
  hooksEnabled: true,
  welcomeViewCompleted: true,
  isNewUser: false,
};

const stateTempPath = `${statePath}.tmp`;
fs.writeFileSync(stateTempPath, `${JSON.stringify(next, null, 2)}\n`, {
  mode: 0o600,
});
fs.renameSync(stateTempPath, statePath);

let modelsState = { version: 1, providers: {} };
if (fs.existsSync(modelsPath)) {
  const raw = fs.readFileSync(modelsPath, "utf8").trim();
  if (raw) {
    const parsed = JSON.parse(raw);
    if (
      parsed?.version === 1 &&
      parsed.providers &&
      typeof parsed.providers === "object" &&
      !Array.isArray(parsed.providers)
    ) {
      modelsState = parsed;
    }
  }
}

const openrouter = modelsState.providers.openrouter ?? {};
const modelOverrides = { ...(openrouter.models ?? {}) };

modelOverrides[planModel] = {
  ...(modelOverrides[planModel] ?? {}),
  maxTokens: planMaxTokens,
};

modelOverrides[actModel] = {
  ...(modelOverrides[actModel] ?? {}),
  maxTokens: actMaxTokens,
};

const nextModelsState = {
  ...modelsState,
  version: 1,
  providers: {
    ...modelsState.providers,
    openrouter: {
      ...openrouter,
      models: modelOverrides,
    },
  },
};

const modelsTempPath = `${modelsPath}.tmp`;
fs.writeFileSync(
  modelsTempPath,
  `${JSON.stringify(nextModelsState, null, 2)}\n`,
  { mode: 0o600 },
);
fs.renameSync(modelsTempPath, modelsPath);

console.log(
  `[cline-config] defaultMode=act plan=${planModel} maxTokens=${planMaxTokens} act=${actModel} maxTokens=${actMaxTokens} provider=openrouter`,
);
