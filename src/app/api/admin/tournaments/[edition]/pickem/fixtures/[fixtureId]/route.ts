import { commandPickemFixture } from "@/lib/pickem";
import {
  pickemAdminActor,
  pickemBody,
  pickemId,
  pickemResponse,
} from "@/app/api/_shared/pickem-http";
import { pickemAdminBody } from "@/lib/pickem-model";

export function POST(
  request: Request,
  {
    params,
  }: RouteContext<"/api/admin/tournaments/[edition]/pickem/fixtures/[fixtureId]">,
) {
  return pickemResponse(async () => {
    const { edition, fixtureId } = await params;
    const actor = await pickemAdminActor(edition);
    const body = await pickemBody(request, pickemAdminBody);
    const { id, version, closesAt, scoreEnabled, voidReason } =
      await commandPickemFixture(edition, actor, pickemId(fixtureId), body);
    return {
      id,
      version,
      closesAt: closesAt.toISOString(),
      scoreEnabled,
      voidReason,
    };
  });
}
