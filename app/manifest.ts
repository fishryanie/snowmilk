import type { MetadataRoute } from 'next';
import { loadBusinessProfile } from '@/lib/business-profile.server';

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const profile = await loadBusinessProfile();
  return {
    name: `${profile.displayName} — Quản lý vận hành`,
    short_name: profile.displayName,
    description: `${profile.description}. ${profile.tagline}`,
    start_url: '/dashboard',
    orientation: 'portrait-primary',
    display: 'standalone',
    display_override: ['standalone', 'fullscreen'],
    background_color: profile.brandColors.cream,
    theme_color: profile.brandColors.terracotta,
  };
}
