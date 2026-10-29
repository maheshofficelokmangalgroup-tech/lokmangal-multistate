// Builds the website from seed/snapshot.json on purpose (offline work and static hosting such as Render).
// Release builds go through builder/server.mjs with CONTENT_SNAPSHOT instead.
import { fileURLToPath } from 'node:url';
import { build } from 'astro';

process.env.CONTENT_SOURCE = 'seed';
await build({ root: fileURLToPath(new URL('..', import.meta.url)) });
