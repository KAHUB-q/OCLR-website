import {
  pickemId,
  pickemQuery,
  pickemResponse,
} from "@/app/api/_shared/pickem-http";
import { pickemNamedPredictions } from "@/lib/pickem";

export function GET(
  request: Request,
  {
    params,
  }: RouteContext<"/api/tournaments/[edition]/pickem/fixtures/[fixtureId]/predictions">,
) {
  return pickemResponse(async () => {
    const { edition, fixtureId } = await params;
    const windowId = pickemId(new URL(request.url).searchParams.get("window"));
    const { cursor } = pickemQuery(request);
    return pickemNamedPredictions(
      edition,
      pickemId(fixtureId),
      windowId,
      cursor,
    );
  });
}
