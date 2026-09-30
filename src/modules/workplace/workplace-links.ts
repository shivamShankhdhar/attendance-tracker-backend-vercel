import { AppError } from '../../middleware/errorHandler';

/** Branch preserves the opaque invite through a store installation. No account data is sent. */
export async function createDeferredInviteLink(token: string, name: string, canonicalUrl: string): Promise<string> {
  const response = await fetch('https://api2.branch.io/v1/url', {
    method: 'POST', signal: AbortSignal.timeout(8000), headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      branch_key: process.env.BRANCH_KEY,
      alias: `join/${token}`, feature: 'workspace-invitation',
      data: {
        workspace_token: token, $deeplink_path: `join/${token}`, $canonical_url: canonicalUrl,
        $desktop_url: canonicalUrl, $fallback_url: canonicalUrl,
        $og_title: `Join ${name}`, $og_description: 'Sign in to view the workplace and request to join.',
        ...(process.env.PLAY_STORE_URL ? { $android_url: process.env.PLAY_STORE_URL } : {}),
        ...(process.env.APP_STORE_URL ? { $ios_url: process.env.APP_STORE_URL } : {}),
      },
    }),
  });
  const result = await response.json() as { url?: string };
  if (!response.ok || !result.url?.startsWith('https://')) {
    throw new AppError('Unable to create an install-ready invitation. Please retry.', 503, 'INVITE_LINK_UNAVAILABLE');
  }
  return result.url;
}
