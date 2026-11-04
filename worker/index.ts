import handler from "vinext/server/fetch-handler";
import { runWithConnectorBinding } from "../lib/connector-context";
import type { ConnectorBinding } from "../lib/connector-contract.mjs";

// Conservative headers for every response. No Content-Security-Policy here on
// purpose: the app uses inline scripts, Google Fonts and Razorpay checkout, and a
// CSP needs browser testing before it is enforced.
function withSecurityHeaders(request: Request, response: Response): Response {
  if (response.status === 101) return response; // WebSocket upgrade
  const out = new Response(response.body, response);
  const defaults: Record<string, string> = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "SAMEORIGIN",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  };
  if (new URL(request.url).protocol === "https:") {
    defaults["Strict-Transport-Security"] = "max-age=31536000";
  }
  for (const [name, value] of Object.entries(defaults)) {
    if (!out.headers.has(name)) out.headers.set(name, value);
  }
  return out;
}

const worker = {
  async fetch(request: Request, env: Cloudflare.Env, ctx: ExecutionContext<{ CONNECTORS?: ConnectorBinding }>) {
    let binding = ctx.props?.CONNECTORS;
    // Local preview emulates the same request-scoped capability. This branch and
    // the auxiliary service binding are absent from production builds.
    if (import.meta.env.DEV && !binding && env.CONNECTORS) {
      const preview = env.CONNECTORS;
      const expiresAt = Date.now() + 60_000;
      binding = {
        async getContext() {
          if (Date.now() >= expiresAt) return { status: "request_context_expired" };
          return preview.getContext?.() ?? { status: "binding_unavailable" };
        },
        async invoke(connectorId, actionName, args) {
          if (Date.now() >= expiresAt) {
            return { status: "request_context_expired", message: "This request has expired. Please try again." };
          }
          return preview.invoke(connectorId, actionName, args);
        },
      };
    }
    const response = await runWithConnectorBinding(binding, () => handler.fetch(request, env, ctx));
    return withSecurityHeaders(request, response);
  },
};

export default worker;
