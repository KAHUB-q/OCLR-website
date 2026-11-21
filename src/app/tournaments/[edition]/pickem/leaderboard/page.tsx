import { PickemPlayerPage } from "@/components/pickem-player-page";
import { getAppTranslations } from "@/i18n/server";

export async function generateMetadata() {
  const tr = await getAppTranslations();
  return { title: tr("Match predictions") };
}

export default async function Page({
  params,
  searchParams,
}: PageProps<"/tournaments/[edition]/pickem/leaderboard">) {
  return (
    <PickemPlayerPage
      slug={(await params).edition}
      view="leaderboard"
      query={await searchParams}
    />
  );
}
