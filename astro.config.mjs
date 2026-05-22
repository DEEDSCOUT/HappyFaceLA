// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
  site: 'https://happyfacesla.com',
  trailingSlash: 'always',
  integrations: [
    sitemap({
      // Exclude noindex pages from sitemap
      filter: (page) => !page.includes('/share-your-experience/')
    })
  ],
  vite: {
    plugins: [tailwindcss()]
  }
});
