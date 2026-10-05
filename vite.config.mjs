import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  base: './',
  plugins: [react()],
  server: {
    port: 3000,
    host: true,
    proxy: {
      '/api/meroShare': {
        target: 'https://webbackend.cdsc.com.np',
        changeOrigin: true,
        secure: false,
        cookieDomainRewrite: '',
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq) => {
            // Aggressively strip ALL cookies to bypass F5 Bot Defense JS checks
            // We act exactly like the official stateless Android app.
            proxyReq.removeHeader('cookie');
            proxyReq.setHeader('Origin', 'https://meroshare.cdsc.com.np');
            proxyReq.setHeader('Referer', 'https://meroshare.cdsc.com.np/');
          });
          proxy.on('proxyRes', (proxyRes) => {
            const authHeader = proxyRes.headers['authorization'];
            if (authHeader) {
              proxyRes.headers['authorization'] = authHeader;
            }
            proxyRes.headers['access-control-allow-origin'] = '*';
            proxyRes.headers['access-control-expose-headers'] = 'Authorization';
            const setCookie = proxyRes.headers['set-cookie'];
            if (setCookie) {
              proxyRes.headers['set-cookie'] = setCookie.map(c => c.replace(/;\s*Secure/i, ''));
            }
          });
        }
      },
      '/api/meroShareView': {
        target: 'https://webbackend.cdsc.com.np',
        changeOrigin: true,
        secure: false,
        cookieDomainRewrite: '',
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq) => {
            proxyReq.removeHeader('cookie');
            proxyReq.setHeader('Origin', 'https://meroshare.cdsc.com.np');
            proxyReq.setHeader('Referer', 'https://meroshare.cdsc.com.np/');
          });
          proxy.on('proxyRes', (proxyRes) => {
            const authHeader = proxyRes.headers['authorization'];
            if (authHeader) {
              proxyRes.headers['authorization'] = authHeader;
            }
            proxyRes.headers['access-control-allow-origin'] = '*';
            proxyRes.headers['access-control-expose-headers'] = 'Authorization';
          });
        }
      },
      '/cdsc-ipo': {
        target: 'https://iporesult.cdsc.com.np',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/cdsc-ipo/, ''),
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq) => {
            proxyReq.removeHeader('cookie');
            proxyReq.setHeader('Origin', 'https://iporesult.cdsc.com.np');
            proxyReq.setHeader('Referer', 'https://iporesult.cdsc.com.np/');
          });
        }
      },
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true
      }
    }
  },
  build: {
    target: 'esnext',
    minify: 'esbuild',
    chunkSizeWarningLimit: 1600,
    rollupOptions: {
      output: {
        manualChunks(id) {
          // Firebase — its own chunk (448 kB)
          if (id.includes('firebase')) return 'firebase';
          // React + UI libs — vendor chunk (364 kB)
          if (id.includes('node_modules/react') ||
              id.includes('node_modules/react-dom') ||
              id.includes('lucide-react') ||
              id.includes('lightweight-charts')) return 'vendor';
          // Core quantitative & technical analysis engines
          if (id.includes('quantEngine') ||
              id.includes('/utils/indicators') ||
              id.includes('/utils/backtest') ||
              id.includes('/utils/fundamentals') ||
              id.includes('/utils/riskManagement') ||
              id.includes('/utils/calculations') ||
              id.includes('/utils/priceAdjustment') ||
              id.includes('accumulationDistributionEngine') ||
              id.includes('masterProfitEngine') ||
              id.includes('setupAnalyzer')) return 'analysis-engine';
          // Calendar + nepseUniverse data
          if (id.includes('nepseCalendar') ||
              id.includes('nepseUniverse') ||
              id.includes('nepseDividends')) return 'nepse-data';
        }
      }
    }
  },

  esbuild: {
    drop: ['debugger']
  }
})
