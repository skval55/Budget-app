import { vitePlugin as remix } from "@remix-run/dev";
import { defineConfig } from "vite";
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [
    remix({
      ssr: false, // Disable server-side rendering for static deployment
    }), 
    tailwindcss()
  ],
  server: {
    port: 3000,
  },
});