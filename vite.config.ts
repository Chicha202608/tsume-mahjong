import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', ['VITE_PUBLIC_SITE_URL', 'VERCEL_PROJECT_PRODUCTION_URL']);
  const productionDomain = env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  const publicSiteUrl = env.VITE_PUBLIC_SITE_URL?.trim() || (productionDomain ? `https://${productionDomain}` : '');
  const publicSite = publicSiteUrl ? new URL(publicSiteUrl) : null;
  if (publicSite && (publicSite.protocol !== 'https:' || publicSite.href !== `${publicSite.origin}/`)) {
    throw new Error('The public site URL must be an HTTPS origin without a path, query, or fragment');
  }

  return {
    plugins: [react()],
    define: {
      'import.meta.env.VITE_DAILY_SHARE_ORIGIN': JSON.stringify(publicSite?.origin ?? ''),
    },
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    optimizeDeps: {
      exclude: ['lucide-react'],
    },
  };
});
