import { pickemPage } from "@/lib/pickem-model";
import { pickemRead } from "@/lib/pickem";
import {
  pickemActor,
  pickemQuery,
  pickemResponse,
} from "@/app/api/_shared/pickem-http";

export function GET(
  request: Request,
  { params }: RouteContext<"/api/tournaments/[edition]/pickem/fixtures">,
) {
  return pickemResponse(async () => {
    const { round, status, cursor } = pickemQuery(request);
    const { cards, serverNow } = await pickemRead(
      (await params).edition,
      await pickemActor(true),
      round,
    );
    return {
      ...pickemPage(
        cards.filter(
          (card) =>
            (!round || card.roundId === round) &&
            (!status || card.status === status),
        ),
        cursor,
      ),
      serverNow,
    };
  });
}
