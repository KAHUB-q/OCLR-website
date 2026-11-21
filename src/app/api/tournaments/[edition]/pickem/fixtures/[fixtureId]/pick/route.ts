import { savePickemPick } from "@/lib/pickem";
import {
  pickemActor,
  pickemBody,
  pickemId,
  pickemResponse,
} from "@/app/api/_shared/pickem-http";
import { pickemPickBody } from "@/lib/pickem-model";

export function PUT(
  request: Request,
  {
    params,
  }: RouteContext<"/api/tournaments/[edition]/pickem/fixtures/[fixtureId]/pick">,
) {
  return pickemResponse(async () => {
    const body = await pickemBody(request, pickemPickBody);
    const { edition, fixtureId } = await params;
    return savePickemPick(
      edition,
      await pickemActor(true),
      pickemId(fixtureId),
      body,
      pickemId(request.headers.get("Idempotency-Key")),
    );
  });
}
