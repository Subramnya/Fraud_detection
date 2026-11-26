import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const PORT_ROLES: Record<string, string> = {
  '5173': 'USER',
  '5174': 'FRAUDSTER',
  '5175': 'BANKER',
  '5176': 'CYBERCELL',
  '5177': 'AI_MODEL',
  '5178': 'DB_VIEWER',
}

function getCliPort(argv: string[]): string | undefined {
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg.startsWith('--port=')) return arg.slice('--port='.length)
    if ((arg === '--port' || arg === '-p') && argv[i + 1]) return argv[i + 1]
  }
  return undefined
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '')
  const apiTarget = env.VITE_API_PROXY_TARGET || 'http://127.0.0.1:8000'
  const cliPort = getCliPort(process.argv) || env.PORT
  const resolvedRole = (
    env.VITE_APP_ROLE ||
    (cliPort ? PORT_ROLES[cliPort] : '') ||
    ''
  ).toUpperCase()

  return {
    plugins: [react(), tailwindcss()],
    define: {
      'import.meta.env.VITE_APP_ROLE': JSON.stringify(resolvedRole),
    },
    server: {
      port: cliPort ? Number(cliPort) : 5173,
      strictPort: true,
      host: '0.0.0.0',
      allowedHosts: true,
      proxy: {
        '/api': { target: apiTarget, changeOrigin: true },
        '/health': { target: apiTarget, changeOrigin: true },
      },
    },
  }
})
