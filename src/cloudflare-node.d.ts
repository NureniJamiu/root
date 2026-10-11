/** The one function the Worker uses from Cloudflare's `cloudflare:node` module. */
declare module 'cloudflare:node' {
  /** Hand a request to the Node `http.Server` listening on `port` in this Worker. */
  export function handleAsNodeRequest(port: number, request: Request, env?: unknown, ctx?: unknown): Promise<Response>;
}
