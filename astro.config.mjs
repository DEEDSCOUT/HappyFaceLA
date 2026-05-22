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
      // Exclude all noindex pages from sitemap
      filter: (page) => {
        const excludedPaths = [
          '/share-your-experience/',
          '/kids-birthday-party-entertainment-los-angeles/',
          '/corporate-event-face-painting-los-angeles/',
          '/school-festival-face-painting-los-angeles/',
          '/service-areas/'
        ];
        return !excludedPaths.some((p) => page.includes(p));
      }
    })
  ],
  vite: {
    plugins: [tailwindcss()]
  }
});
