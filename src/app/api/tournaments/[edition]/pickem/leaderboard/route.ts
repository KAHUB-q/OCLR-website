import { pickemPage } from "@/lib/pickem-model";
import { HttpError } from "@/lib/http-error";
import { pickemRead } from "@/lib/pickem";
import {
  pickemActor,
  pickemQuery,
  pickemResponse,
} from "@/app/api/_shared/pickem-http";

export function GET(
  request: Request,
  { params }: RouteContext<"/api/tournaments/[edition]/pickem/leaderboard">,
) {
  return pickemResponse(async () => {
    const { round, scope, cursor } = pickemQuery(request);
    if (scope === "round" && !round)
      throw new HttpError(400, "Select a prediction round.");
    const data = await pickemRead(
      (await params).edition,
      await pickemActor(true),
      round,
    );
    const rows = scope === "round" ? data.leaderboard : data.seasonLeaderboard;
    const mineIndex = rows.findIndex((row) => row.mine);
    return {
      ...pickemPage(rows, cursor),
      myRow: rows[mineIndex] ?? null,
      myCursor: mineIndex >= 0 ? Math.floor(mineIndex / 25) * 25 : null,
      visibility: data.visibility,
    };
  });
}
