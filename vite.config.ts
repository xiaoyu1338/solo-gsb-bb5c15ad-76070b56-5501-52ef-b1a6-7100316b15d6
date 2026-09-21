import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// 默认监听 0.0.0.0:5173，端口可用 PORT 环境变量覆盖
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: Number(process.env.PORT) || 5173,
  },
  preview: {
    host: true,
    port: Number(process.env.PORT) || 5173,
  },
});
