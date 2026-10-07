export function isPreviewHost(host: string): boolean {
  const name = host.toLowerCase();
  return (
    name === "localhost" ||
    name === "127.0.0.1" ||
    name.endsWith(".grok-sandbox.com") ||
    name.endsWith(".grokusercontent.com")
  );
}

export function shareTarget(origin: string, host: string): { kind: "preview" } | { kind: "public"; url: string; embed: string } {
  if (isPreviewHost(host)) return { kind: "preview" };
  const url = origin.endsWith("/") ? origin : `${origin}/`;
  const embed = `<iframe src="${url}?embed=1" title="金哨" style="width:100%;height:780px;border:0"></iframe>`;
  return { kind: "public", url, embed };
}
