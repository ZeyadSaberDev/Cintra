interface OriginRequest {
  protocol: string;
  secure: boolean;
  get(name: string): string | undefined;
}

export function getRequestOrigin(req: OriginRequest): string | null {
  const forwardedProtocol = req.get('x-forwarded-proto')?.split(',')[0]?.trim();
  const protocol = forwardedProtocol || (req.secure ? 'https' : req.protocol);
  const forwardedHost = req.get('x-forwarded-host')?.split(',')[0]?.trim();
  const host = forwardedHost || req.get('host')?.split(',')[0]?.trim();
  if (!host || (protocol !== 'http' && protocol !== 'https')) return null;

  try {
    const url = new URL(`${protocol}://${host}`);
    if (url.username || url.password || url.pathname !== '/' || url.search || url.hash) return null;
    return url.origin;
  } catch {
    return null;
  }
}
