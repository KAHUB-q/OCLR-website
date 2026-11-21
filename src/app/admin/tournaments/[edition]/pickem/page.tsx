import { notFound } from "next/navigation";
import { PickemAdmin } from "@/components/pickem-admin";
import { PageHeading } from "@/components/ui";
import { getAppTranslations } from "@/i18n/server";
import { authorizedPage } from "@/lib/auth/page";
import { requireStaff } from "@/lib/auth/staff-request";
import { pickemAdminRead } from "@/lib/pickem";

export default async function Page({
  params,
}: PageProps<"/admin/tournaments/[edition]/pickem">) {
  return authorizedPage(async () => {
    const { edition } = await params;
    const staff = await requireStaff();
    const tr = await getAppTranslations();
    const data = await pickemAdminRead(edition, staff);
    if (!data) notFound();
    return (
      <>
        <PageHeading title={tr("Match predictions")} />
        <PickemAdmin slug={edition} data={data} />
      </>
    );
  });
}
