import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Mobi Platform',
    short_name: 'Mobi',
    description: 'Plataforma para criar e operar agentes de IA',
    start_url: '/',
    display: 'standalone',
    orientation: 'portrait-primary',
    background_color: '#09090b',
    theme_color: '#18181b',
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
