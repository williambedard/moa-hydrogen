import {defineConfig} from 'vite';
import {hydrogen} from '@shopify/hydrogen/vite';
import {oxygen} from '@shopify/mini-oxygen/vite';
import {reactRouter} from '@react-router/dev/vite';
import tsconfigPaths from 'vite-tsconfig-paths';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({isSsrBuild}) => ({
  resolve: {
    dedupe: ['react', 'react-dom'],
  },
  plugins: [
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
