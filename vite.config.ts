import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // Same-origin proxy avoids browser CORS preflight to Supabase Edge Functions
      '/api/fetch-street-view': {
        target: 'https://btndxkoalspihpnhzqtw.supabase.co/functions/v1/fetch-street-view',
        changeOrigin: true,
        secure: true,
      },
    },
  },
})
