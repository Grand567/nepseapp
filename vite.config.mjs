import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
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
  }
})
