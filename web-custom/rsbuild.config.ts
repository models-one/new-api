import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { defineConfig } from '@rsbuild/core'
import { pluginReact } from '@rsbuild/plugin-react'
import { pluginTailwindcss } from '@rsbuild/plugin-tailwindcss'

const currentDirectory = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig(({ envMode }) => {
  const apiProxyTarget = process.env.API_PROXY_TARGET || 'http://127.0.0.1:3000'
  const isProduction = envMode === 'production'

  return {
    plugins: [pluginReact(), pluginTailwindcss({ optimize: false })],
    splitChunks: {
      preset: 'default',
      cacheGroups: {
        'vendor-react': {
          test: /node_modules[\\/](react|react-dom)[\\/]/,
          name: 'vendor-react',
          chunks: 'all',
          enforce: true,
        },
        'vendor-tanstack': {
          test: /node_modules[\\/]@tanstack[\\/]/,
          name: 'vendor-tanstack',
          chunks: 'all',
          enforce: true,
        },
      },
    },
    source: {
      entry: {
        index: './src/main.tsx',
      },
    },
    resolve: {
      alias: {
        '@': path.resolve(currentDirectory, './src'),
      },
    },
    html: {
      template: './index.html',
    },
    server: {
      host: '0.0.0.0',
      port: 4173,
      strictPort: false,
      historyApiFallback: true,
      proxy: {
        '/api': {
          target: apiProxyTarget,
          changeOrigin: true,
        },
      },
    },
    output: {
      assetPrefix: isProduction ? '/web-custom-assets/' : '/',
      minify: isProduction,
      distPath: {
        root: 'dist',
      },
    },
  }
})
