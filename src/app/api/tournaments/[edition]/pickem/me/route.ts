import { pickemPage } from "@/lib/pickem-model";
import { pickemRead } from "@/lib/pickem";
import {
  pickemActor,
  pickemQuery,
  pickemResponse,
} from "@/app/api/_shared/pickem-http";

export function GET(
  request: Request,
  { params }: RouteContext<"/api/tournaments/[edition]/pickem/me">,
) {
  return pickemResponse(async () => {
    const { round, cursor } = pickemQuery(request);
    const { cards, myScore, seasonScore, visibility } = await pickemRead(
      (await params).edition,
      await pickemActor(true),
      round,
    );
    return {
      ...pickemPage(
        cards.filter((card) => card.mine && (!round || card.roundId === round)),
        cursor,
      ),
      myScore,
      seasonScore,
      visibility,
    };
  });
}
