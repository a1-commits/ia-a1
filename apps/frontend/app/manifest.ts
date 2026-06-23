import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Mobi Platform',
    short_name: 'Mobi',
    description: 'Plataforma para criar e operar agentes de IA',
    start_url: '/',
    display: 'standalone',
    orientation: 'portrait-primary',
    theme_color: '#2563eb',
    background_color: '#f4f8ff',
    lang: 'pt-BR',
    icons: [
      {
        src: '/icon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'any',
      },
    ],
  };
}
