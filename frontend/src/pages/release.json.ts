// Release marker: lets the release controller confirm which release is actually being served.
import type { APIRoute } from 'astro';
import { release, snapshot } from '../lib/content';

export const GET: APIRoute = () =>
  new Response(
    JSON.stringify({
      id: release.id,
      kind: release.kind,
      contentHash: release.contentHash,
      financePolicy: release.financePolicy,
      rateSet: snapshot.rateSet.id,
      ratesValidUntil: snapshot.rateSet.validUntil,
    }),
    { headers: { 'Content-Type': 'application/json' } },
  );
