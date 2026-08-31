import type { IncomingMessage } from 'node:http';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Dev-only hint endpoint.
 *
 * The Anthropic API key must never reach the browser, so the call is made here,
 * inside the Vite dev server (a Node process). This exposes exactly the same
 * contract that a Cloudflare Worker will expose in Phase 5 — POST /api/hint,
 * JSON in, JSON out — so moving to the tablet is a base-URL change, not a
 * rewrite.
 *
 * If the key is absent the endpoint returns 503 and the client silently falls
 * back to the canned hint ladder. The app is fully usable with no key at all.
 */
interface ResolvedKey {
  key: string;
  varName: string;
  /** True when the value came from the shell rather than the .env file. */
  fromShell: boolean;
}

/**
 * Resolve which API key to use, preferring a project-specific variable.
 *
 * `GENESIS_LAB_ANTHROPIC_KEY` exists because Vite's loadEnv lets `process.env`
 * overwrite `.env` values — so a plain `ANTHROPIC_API_KEY` exported in your
 * shell for some *other* project would silently win over the one in this
 * project's .env, and this app's spend would land on the wrong key with no
 * warning. The dedicated name cannot collide.
 */
function resolveKey(env: Record<string, string>): ResolvedKey | null {
  for (const varName of ['GENESIS_LAB_ANTHROPIC_KEY', 'ANTHROPIC_API_KEY']) {
    const key = env[varName];
    if (key) {
      return { key, varName, fromShell: process.env[varName] === key };
    }
  }
  return null;
}

function hintApi(resolved: ResolvedKey | null): Plugin {
  const apiKey = resolved?.key;
  return {
    name: 'genesis-lab-hint-api',
    configureServer(server) {
      // Say plainly at startup which key is in play, so billing is never a
      // mystery. Only the last four characters are printed.
      if (!resolved) {
        server.config.logger.warn(
          '[hint] No API key found. Hints fall back to the authored ladder — ' +
            'the app works fully without one. See README to enable.',
        );
      } else {
        server.config.logger.info(
          `[hint] Claude hints enabled — key …${resolved.key.slice(-4)} ` +
            `via ${resolved.varName}` +
            (resolved.fromShell ? ' (from your shell, not .env)' : ' (from .env)'),
        );
        if (resolved.varName === 'ANTHROPIC_API_KEY' && resolved.fromShell) {
          server.config.logger.warn(
            '[hint] That key is inherited from your shell environment, so it is ' +
              'probably shared with another project. To bill this app separately, ' +
              'set GENESIS_LAB_ANTHROPIC_KEY in .env instead.',
          );
        }
      }

      server.middlewares.use('/api/hint', async (req, res) => {
        res.setHeader('Content-Type', 'application/json');

        // Key check first, so a GET acts as a free availability probe:
        // 503 = no key configured, 405 = key present and ready.
        if (!apiKey) {
          res.statusCode = 503;
          res.end(JSON.stringify({ error: 'no-api-key' }));
          return;
        }
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end(JSON.stringify({ error: 'POST only' }));
          return;
        }

        try {
          const raw = await readBody(req);
          const { system, user, maxTokens } = JSON.parse(raw) as {
            system: string;
            user: string;
            maxTokens?: number;
          };

          const { default: Anthropic } = await import('@anthropic-ai/sdk');
          const client = new Anthropic({ apiKey });

          const message = await client.messages.create({
            model: 'claude-haiku-4-5',
            // Hints stay short; the weekly parent summary needs more room.
            // Capped here rather than trusted from the client, so a malformed
            // request cannot run up a bill.
            max_tokens: Math.min(Math.max(Number(maxTokens) || 300, 100), 1200),
            system,
            messages: [{ role: 'user', content: user }],
          });

          if (message.stop_reason === 'refusal') {
            res.statusCode = 502;
            res.end(JSON.stringify({ error: 'refusal' }));
            return;
          }

          const text = message.content
            .filter((b): b is { type: 'text'; text: string; citations: null } =>
              b.type === 'text',
            )
            .map((b) => b.text)
            .join('')
            .trim();

          // Logged so you can watch real spend during playtests.
          const { input_tokens: i, output_tokens: o } = message.usage;
          const cents = ((i / 1e6) * 1 + (o / 1e6) * 5) * 100;
          server.config.logger.info(
            `[hint] ${i} in / ${o} out  ≈ ${cents.toFixed(3)}¢`,
          );

          res.statusCode = 200;
          res.end(JSON.stringify({ text }));
        } catch (err) {
          server.config.logger.error(`[hint] ${String(err)}`);
          res.statusCode = 502;
          res.end(JSON.stringify({ error: 'upstream' }));
        }
      });
    },
  };
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk: Buffer | string) => {
      data += chunk.toString();
      if (data.length > 1e5) reject(new Error('body too large'));
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    // Set to '/<repo-name>/' when deploying to GitHub Pages in Phase 5.
    base: './',
    plugins: [react(), hintApi(resolveKey(env))],
    server: { host: true },
  };
});
