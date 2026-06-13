const DEFAULT_TIMEOUT_MS = 30000;
const DEFAULT_MAX_RESPONSE_CHARS = 200000;

const SECRET_KEY_PATTERN =
  /(^|_)(access_)?token$|password|secret|authorization|authorization_header|private_key/i;

export class GiteaConfigError extends Error {
  constructor(message) {
    super(message);
    this.name = "GiteaConfigError";
  }
}

export class GiteaApiError extends Error {
  constructor(message, { status, data, route, method }) {
    super(message);
    this.name = "GiteaApiError";
    this.status = status;
    this.data = data;
    this.route = route;
    this.method = method;
  }
}

export function getGiteaConfig(env = process.env) {
  const rawBaseUrl = env.GITEA_BASE_URL || env.GITEA_URL;
  if (!rawBaseUrl) {
    throw new GiteaConfigError(
      "Set GITEA_BASE_URL to the root URL of the Gitea instance."
    );
  }

  const baseUrl = normalizeBaseUrl(rawBaseUrl);
  const timeoutMs = parsePositiveInteger(env.GITEA_TIMEOUT_MS, DEFAULT_TIMEOUT_MS);
  const maxResponseChars = parsePositiveInteger(
    env.GITEA_MAX_RESPONSE_CHARS,
    DEFAULT_MAX_RESPONSE_CHARS
  );

  return {
    baseUrl,
    apiBaseUrl: baseUrl.endsWith("/api/v1") ? baseUrl : `${baseUrl}/api/v1`,
    token: env.GITEA_TOKEN || env.GITEA_ACCESS_TOKEN || env.GITEA_API_TOKEN || "",
    authScheme: env.GITEA_AUTH_SCHEME || "token",
    timeoutMs,
    maxResponseChars
  };
}

export function normalizeBaseUrl(rawBaseUrl) {
  const parsed = new URL(rawBaseUrl);
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new GiteaConfigError("GITEA_BASE_URL must use http or https.");
  }

  parsed.pathname = parsed.pathname.replace(/\/+$/, "");
  parsed.search = "";
  parsed.hash = "";
  return parsed.toString().replace(/\/+$/, "");
}

export function normalizeApiRoute(route) {
  if (typeof route !== "string" || route.trim() === "") {
    throw new GiteaConfigError("API route must be a non-empty string.");
  }

  let normalized = route.trim();
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(normalized) || normalized.startsWith("//")) {
    throw new GiteaConfigError("API route must be relative to the configured Gitea host.");
  }

  if (!normalized.startsWith("/")) {
    normalized = `/${normalized}`;
  }

  if (normalized === "/api/v1") {
    return "/";
  }

  if (normalized.startsWith("/api/v1/")) {
    normalized = normalized.slice("/api/v1".length);
  }

  return normalized;
}

export function buildApiUrl(config, route, query = {}) {
  const normalizedRoute = normalizeApiRoute(route);
  const url = new URL(`${config.apiBaseUrl}${normalizedRoute}`);
  appendQuery(url.searchParams, query);
  return url;
}

export function encodeSegment(value, fieldName = "value") {
  if (typeof value !== "string" || value.length === 0) {
    throw new GiteaConfigError(`${fieldName} must be a non-empty string.`);
  }
  return encodeURIComponent(value);
}

export function encodeRepoPath(path = "") {
  if (path === "") {
    return "";
  }
  return String(path)
    .split("/")
    .filter((segment) => segment.length > 0)
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

export function repoRoute(owner, repo, suffix = "") {
  return `/repos/${encodeSegment(owner, "owner")}/${encodeSegment(repo, "repo")}${suffix}`;
}

export function contentRoute(owner, repo, path = "") {
  const encodedPath = encodeRepoPath(path);
  const suffix = encodedPath ? `/contents/${encodedPath}` : "/contents";
  return repoRoute(owner, repo, suffix);
}

export function toBase64(content) {
  return Buffer.from(String(content), "utf8").toString("base64");
}

export function decodeGiteaContent(data) {
  if (
    data &&
    typeof data === "object" &&
    !Array.isArray(data) &&
    data.encoding === "base64" &&
    typeof data.content === "string"
  ) {
    return {
      ...data,
      decoded_content: Buffer.from(data.content.replace(/\s/g, ""), "base64").toString(
        "utf8"
      )
    };
  }
  return data;
}

export async function giteaRequest(route, options = {}) {
  const config = options.config || getGiteaConfig();
  const method = (options.method || "GET").toUpperCase();
  const url = buildApiUrl(config, route, options.query);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);

  const headers = {
    Accept: "application/json",
    ...(options.headers || {})
  };

  if (config.token) {
    headers.Authorization = formatAuthorizationHeader(config.authScheme, config.token);
  }

  const init = {
    method,
    headers,
    signal: controller.signal
  };

  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(options.body);
  }

  try {
    const response = await fetch(url, init);
    const data = await parseResponse(response);
    if (!response.ok) {
      throw new GiteaApiError(
        `Gitea API request failed: ${method} ${normalizeApiRoute(route)} returned ${response.status}.`,
        { status: response.status, data, route: normalizeApiRoute(route), method }
      );
    }

    return {
      status: response.status,
      data,
      headers: Object.fromEntries(response.headers.entries())
    };
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new GiteaApiError(
        `Gitea API request timed out after ${config.timeoutMs} ms: ${method} ${normalizeApiRoute(route)}.`,
        { status: 0, data: null, route: normalizeApiRoute(route), method }
      );
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export function publicResponse(response) {
  return {
    status: response.status,
    data: redactSecrets(response.data)
  };
}

export function redactSecrets(value) {
  if (Array.isArray(value)) {
    return value.map((item) => redactSecrets(item));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        SECRET_KEY_PATTERN.test(key) ? "[REDACTED]" : redactSecrets(item)
      ])
    );
  }

  return value;
}

export function limitResponseText(text, maxChars) {
  if (text.length <= maxChars) {
    return text;
  }

  return `${text.slice(0, maxChars)}\n\n[truncated ${text.length - maxChars} characters]`;
}

function appendQuery(searchParams, query = {}) {
  for (const [key, value] of Object.entries(query || {})) {
    if (value === undefined || value === null || value === "") {
      continue;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        if (item !== undefined && item !== null && item !== "") {
          searchParams.append(key, stringifyQueryValue(item));
        }
      }
      continue;
    }

    searchParams.set(key, stringifyQueryValue(value));
  }
}

function stringifyQueryValue(value) {
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  return String(value);
}

function formatAuthorizationHeader(authScheme, token) {
  const scheme = String(authScheme || "token").trim();
  if (scheme.toLowerCase() === "bearer") {
    return `Bearer ${token}`;
  }
  if (scheme.toLowerCase() === "token") {
    return `token ${token}`;
  }
  return `${scheme} ${token}`;
}

function parsePositiveInteger(value, fallback) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

async function parseResponse(response) {
  const text = await response.text();
  if (!text) {
    return null;
  }

  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("json")) {
    return JSON.parse(text);
  }

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
