import { OwnerSetup } from '@/components/storefront/owner-setup';

export const dynamic = 'force-dynamic';

export default function StorefrontSetupPage() {
  const organizationId = process.env.STOREFRONT_ORGANIZATION_ID;
  const ready = Boolean(organizationId && process.env.AUTH_BOOTSTRAP_TOKEN && process.env.BETTER_AUTH_SECRET);
  return <OwnerSetup ready={ready} organizationId={organizationId ?? ''} />;
}
