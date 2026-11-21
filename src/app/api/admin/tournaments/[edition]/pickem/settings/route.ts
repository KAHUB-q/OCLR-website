import { savePickemSettings } from "@/lib/pickem";
import {
  pickemAdminActor,
  pickemBody,
  pickemResponse,
} from "@/app/api/_shared/pickem-http";
import { pickemSettingsBody } from "@/lib/pickem-model";

export function PUT(
  request: Request,
  { params }: RouteContext<"/api/admin/tournaments/[edition]/pickem/settings">,
) {
  return pickemResponse(async () => {
    const { edition } = await params;
    const actor = await pickemAdminActor(edition);
    const body = await pickemBody(request, pickemSettingsBody);
    return savePickemSettings(edition, actor, body);
  });
}
