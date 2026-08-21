import { SignInForm } from "@/components/v2/sign-in-form";
import { loadBusinessProfile } from "@/lib/business-profile.server";

export default async function SignInPage() {
  const profile = await loadBusinessProfile();
  return (
    <SignInForm
      displayName={profile.displayName}
      wordmark={profile.wordmark}
      tagline={profile.tagline}
      logoUrl={profile.logoUrl}
    />
  );
}
