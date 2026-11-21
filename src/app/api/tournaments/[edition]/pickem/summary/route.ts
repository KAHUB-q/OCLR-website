import { pickemRead } from "@/lib/pickem";
import { pickemResponse } from "@/app/api/_shared/pickem-http";

export function GET(
  _request: Request,
  { params }: RouteContext<"/api/tournaments/[edition]/pickem/summary">,
) {
  return pickemResponse(async () => {
    const data = await pickemRead((await params).edition, null);
    return {
      rounds: data.rounds,
      rulesVersion: data.rulesVersion,
      serverNow: data.serverNow,
      fixtures: data.cards
        .filter((card) => card.status === "open")
        .map(
          ({
            fixtureId,
            label,
            roundId,
            home,
            away,
            scheduledAt,
            timeZone,
            closesAt,
          }) => ({
            fixtureId,
            label,
            roundId,
            home,
            away,
            scheduledAt,
            timeZone,
            closesAt,
          }),
        ),
    };
  });
}
