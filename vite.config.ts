import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  server: {
    proxy: {
      // 本地开发代理：/deepseek -> https://api.deepseek.com，规避浏览器 CORS。
      // 其他 provider：若其 API 支持 CORS 可直接填完整 URL；否则仿照此配置增加一条代理。
      '/deepseek': {
        target: 'https://api.deepseek.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/deepseek/, ''),
      },
    },
  },
})