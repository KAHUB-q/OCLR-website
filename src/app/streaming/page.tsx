import { redirect } from "next/navigation";
import { authorizedPage } from "@/lib/auth/page";
import { requireBrowserSession } from "@/lib/auth/user";
import { streamingAccessEditions } from "@/lib/streaming-api";
import { PageHeading } from "@/components/ui";
import { getAppTranslations } from "@/i18n/server";
export const metadata = { robots: { index: false, follow: false } };
export default async function Page() {
  return authorizedPage(async () => {
    const session = await requireBrowserSession();
    const editions = await streamingAccessEditions(session.osuId);
    const current =
      editions.find((edition) => edition.status === "live") ??
      editions.find((edition) => edition.status === "upcoming");
    if (current) redirect(`/streaming/${current.slug}`);
    const tr = await getAppTranslations();
    return (
      <div className="container page auth-page">
        <PageHeading title={tr("Streaming API access")} />
        <p>{tr("No tournaments available.")}</p>
      </div>
    );
  });
}
