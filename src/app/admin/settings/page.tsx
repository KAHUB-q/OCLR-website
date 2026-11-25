import { OsuImageSettings } from "@/components/osu-image-settings";
import { imagePoliciesForAdmin } from "@/lib/osu-image-cache";
import { SiteChatPromptForm } from "@/components/site-chat-prompt-form";
import { chatPromptForAdmin } from "@/lib/chat-prompt-settings";
import { SiteAppearanceForm } from "@/components/site-appearance-form";
import { canManageBackups } from "@/lib/admin-backups";
import { Action, PageHeading } from "@/components/ui";
import { getAppTranslations } from "@/i18n/server";
import { authorizedPage } from "@/lib/auth/page";
import { requireUser } from "@/lib/auth/user";
import { remotePage } from "@/lib/remote-page";
import { siteSettingsForAdmin } from "@/lib/site-settings";

export async function generateMetadata() {
  const tr = await getAppTranslations();
  return { title: tr("Site settings") };
}
async function Issue271Page() {
  return authorizedPage(async () => {
    const tr = await getAppTranslations();
    const actor = await requireUser();
    const settings = await siteSettingsForAdmin(actor);
    const chatPrompt = await chatPromptForAdmin(actor);
    const showBackups = await canManageBackups(actor);
    const policies = await imagePoliciesForAdmin(actor);
    return (
      <>
        <PageHeading
          eyebrow={tr("ADMINISTRATION")}
          title={tr("Site settings")}
        />
        {showBackups && (
          <div className="actions">
            <Action href="/admin/backups" secondary>
              {tr("Database backups")}
            </Action>
          </div>
        )}
        <SiteAppearanceForm
          initialAppearance={settings.defaultAppearance}
          revision={settings.revision}
        />
        {chatPrompt && <SiteChatPromptForm initial={chatPrompt} />}
        {policies.length > 0 && (
          <section
            className="image-cache-settings"
            aria-labelledby="image-cache-heading"
          >
            <header>
              <h2 id="image-cache-heading">{tr("Sitewide image cache")}</h2>
              <p>
                {tr(
                  "After a refresh, each image is fetched again the next time it is displayed.",
                )}
              </p>
            </header>
            {policies.map((policy) => (
              <OsuImageSettings key={policy.kind} initial={policy} />
            ))}
          </section>
        )}
      </>
    );
  });
}

export default function Page() {
  return remotePage(() => Issue271Page());
}
