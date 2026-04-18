import {defineConfig, type Plugin} from 'vite';
import {hydrogen} from '@shopify/hydrogen/vite';
import {oxygen} from '@shopify/mini-oxygen/vite';
import {reactRouter} from '@react-router/dev/vite';
import tsconfigPaths from 'vite-tsconfig-paths';
import tailwindcss from '@tailwindcss/vite';
import {execSync} from 'node:child_process';

/**
 * Build-SHA marker stamped into SSR HTML + window.__BUILD_SHA__.
 * Shape: <shortSha>[-dirty]-<epoch>
 *
 * `-dirty` appears only when `git diff --quiet` finds uncommitted tracked
 * changes — a feature, not a bug: it signals the agent is probing
 * work that won't land on Oxygen until committed + pushed.
 *
 * Oxygen runs its build against a fresh clone, so `-dirty` never appears
 * there. Local `npm run dev` / `npm run build` is the only source of dirty
 * markers. Honor BUILD_SHA env override so CI can inject a stable value.
 */
function buildSha(): string {
  if (process.env.BUILD_SHA) return process.env.BUILD_SHA;
  try {
    const sha = execSync('git rev-parse --short HEAD', {stdio: ['ignore', 'pipe', 'ignore']})
      .toString()
      .trim();
    let dirty = '';
    try {
      execSync('git diff --quiet', {stdio: 'ignore'});
    } catch {
      dirty = '-dirty';
    }
    return `${sha}${dirty}-${Math.floor(Date.now() / 1000)}`;
  } catch {
    return `unknown-${Math.floor(Date.now() / 1000)}`;
  }
}

/**
 * Redirects node:path/process/url to bundleable polyfills so the SSR
 * worker doesn't contain bare node: imports that Oxygen can't resolve.
 * vfile (react-markdown dep) is the only consumer.
 */
function workerNodePolyfills(): Plugin {
  return {
    name: 'worker-node-polyfills',
    enforce: 'pre',
    resolveId(source) {
      if (source === 'node:path') return '\0polyfill:path';
      if (source === 'node:process') return '\0polyfill:process';
      if (source === 'node:url') return '\0polyfill:url';
      return null;
    },
    load(id) {
      if (id === '\0polyfill:path') return "export * from 'pathe'; export {default} from 'pathe';";
      if (id === '\0polyfill:process') return 'export default { cwd() { return "/"; } };';
      if (id === '\0polyfill:url') {
        return [
          'export function fileURLToPath(url) {',
          '  return typeof url === "string" ? (url.startsWith("file://") ? url.slice(7) : url) : url.pathname;',
          '}',
        ].join('\n');
      }
      return null;
    },
  };
}

export default defineConfig(({isSsrBuild}) => ({
  define: {
    __BUILD_SHA__: JSON.stringify(buildSha()),
  },
  resolve: {
    dedupe: ['react', 'react-dom'],
    ...(isSsrBuild
      ? {conditions: ['workerd', 'worker', 'browser']}
      : {}),
  },
  plugins: [
    ...(isSsrBuild ? [workerNodePolyfills()] : []),
    tailwindcss(),
    hydrogen(),
    oxygen(),
    reactRouter(),
    tsconfigPaths(),
  ],
  build: {
    // Allow a strict Content-Security-Policy
    // withtout inlining assets as base64:
    assetsInlineLimit: 0,
    rollupOptions: isSsrBuild
      ? {}
      : {
          output: {
            manualChunks: {
              // Put Three.js and related packages in a separate chunk for lazy loading
              'three-vendor': [
                'three',
                '@react-three/fiber',
                '@react-three/drei',
              ],
              // Framer Motion in its own chunk
              'framer-motion': ['framer-motion'],
            },
          },
        },
  },
  ssr: {
    optimizeDeps: {
      /**
       * Include dependencies here if they throw CJS<>ESM errors.
       * For example, for the following error:
       *
       * > ReferenceError: module is not defined
       * >   at /Users/.../node_modules/example-dep/index.js:1:1
       *
       * Include 'example-dep' in the array below.
       * @see https://vitejs.dev/config/dep-optimization-options
       */
      include: [
        'vfile',
        'extend',
        'debug',
        'style-to-js',
        'set-cookie-parser',
        'cookie',
        'react-router',
      ],
    },
  },
  server: {
    allowedHosts: ['.tryhydrogen.dev', 'de-ai-shopping-exp.shop.dev'],
    port: parseInt(process.env.SERVER_PORT || process.env.PORT || '3000'),
  },
}));
