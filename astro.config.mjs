// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import { VitePWA } from 'vite-plugin-pwa';

// https://astro.build/config
export default defineConfig({
	site: 'https://worlddrinks.top',
	devToolbar: {
		enabled: false
	},
	integrations: [react(), sitemap()],
	vite: {
		preview: {
			allowedHosts: ['worlddrinks.top', 'www.worlddrinks.top']
		},
		plugins: [
			VitePWA({
				registerType: 'autoUpdate',
				includeAssets: ['favicon.svg', 'favicon-32.png', 'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png'],
				manifest: {
					name: 'World Drinks',
					short_name: 'World Drinks',
					description: 'Explore popular and culturally significant drinks around the world on an interactive map.',
					start_url: '/',
					scope: '/',
					display: 'standalone',
					orientation: 'any',
					background_color: '#f8f3ea',
					theme_color: '#14342b',
					icons: [
						{
							src: '/icons/icon-192.png',
							sizes: '192x192',
							type: 'image/png',
							purpose: 'any maskable'
						},
						{
							src: '/icons/icon-512.png',
							sizes: '512x512',
							type: 'image/png',
							purpose: 'any maskable'
						}
					]
				},
				workbox: {
					navigateFallback: '/offline.html',
					globPatterns: ['**/*.{css,js,html,svg,png,jpg,json,webmanifest}'],
					runtimeCaching: [
						{
							urlPattern: ({ url }) => url.pathname.startsWith('/drinks/'),
							handler: 'CacheFirst',
							options: {
								cacheName: 'drink-images',
								expiration: {
									maxEntries: 80,
									maxAgeSeconds: 60 * 60 * 24 * 30
								}
							}
						},
						{
							urlPattern: ({ url }) => url.pathname.startsWith('/maps/'),
							handler: 'StaleWhileRevalidate',
							options: {
								cacheName: 'map-data'
							}
						}
					]
				}
			})
		]
	}
});
