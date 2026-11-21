import { savePickemVisibility } from "@/lib/pickem";
import {
  pickemActor,
  pickemBody,
  pickemResponse,
} from "@/app/api/_shared/pickem-http";
import { pickemVisibilityBody } from "@/lib/pickem-model";

export function PUT(
  request: Request,
  {
    params,
  }: RouteContext<"/api/tournaments/[edition]/pickem/me/leaderboard-visibility">,
) {
  return pickemResponse(async () => {
    const body = await pickemBody(request, pickemVisibilityBody);
    return savePickemVisibility(
      (await params).edition,
      await pickemActor(true),
      body,
    );
  });
}
