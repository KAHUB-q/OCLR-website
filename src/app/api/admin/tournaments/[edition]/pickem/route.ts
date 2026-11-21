import { pickemPage } from "@/lib/pickem-model";
import { pickemAdminRead } from "@/lib/pickem";
import {
  pickemActor,
  pickemQuery,
  pickemResponse,
} from "@/app/api/_shared/pickem-http";

export function GET(
  request: Request,
  { params }: RouteContext<"/api/admin/tournaments/[edition]/pickem">,
) {
  return pickemResponse(async () => {
    const { round, status, cursor } = pickemQuery(request);
    const { rows, ...config } = await pickemAdminRead(
      (await params).edition,
      await pickemActor(true),
    );
    return {
      ...config,
      ...pickemPage(
        rows.filter(
          (row) =>
            (!round || row.roundId === round) &&
            (!status || row.window?.status === status),
        ),
        cursor,
      ),
    };
  });
}
