import { NextResponse } from "next/server";
import { z } from "zod";
import { currentUser } from "@/lib/auth/user";
import { assertCapability } from "@/lib/auth/staff";
import { remoteMode } from "@/lib/data-source";
import { apiError, HttpError, readJson, requireSameOrigin } from "@/lib/http";
import { PickemError } from "@/lib/pickem";

const paging = z.object({
  round: z.uuid().optional(),
  cursor: z.coerce.number().int().nonnegative().max(100000).optional(),
  status: z.enum(["open", "closed", "pending", "settled", "void"]).optional(),
  scope: z.enum(["round", "season"]).optional(),
});

export function pickemQuery(request: Request) {
  const parsed = paging.safeParse(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  if (!parsed.success)
    throw new HttpError(400, "Check the prediction filters.");
  return parsed.data;
}

export async function pickemActor(
  required: true,
): Promise<NonNullable<Awaited<ReturnType<typeof currentUser>>>>;
export async function pickemActor(
  required: false,
): Promise<Awaited<ReturnType<typeof currentUser>>>;
export async function pickemActor(required: boolean) {
  if (remoteMode() || !process.env.DATABASE_URL)
    throw new HttpError(
      404,
      "Predictions are unavailable for this tournament.",
    );
  const user = await currentUser();
  if (!user && required)
    throw new HttpError(401, "Sign in with osu! to continue.");
  return user;
}

export async function pickemAdminActor(slug: string) {
  const actor = await pickemActor(true);
  await assertCapability(actor, "configure_tournament", slug);
  return actor;
}

export async function pickemBody<Shape extends z.ZodType>(
  request: Request,
  schema: Shape,
) {
  requireSameOrigin(request);
  const parsed = schema.safeParse(await readJson(request, 4096));
  if (!parsed.success)
    throw new PickemError(
      400,
      "invalid_request",
      "Check the prediction request.",
    );
  return parsed.data;
}

export function pickemId(value: string | null) {
  const parsed = z.uuid().safeParse(value);
  if (!parsed.success)
    throw new HttpError(400, "Check the prediction identifier.");
  return parsed.data;
}

export async function pickemResponse<T>(handle: () => Promise<T>) {
  const headers = { "Cache-Control": "private, no-store" };
  try {
    return NextResponse.json(await handle(), { headers });
  } catch (error) {
    if (!(error instanceof PickemError)) return apiError(error);
    return NextResponse.json(
      { error: error.message, code: error.code, current: error.current },
      { status: error.status, headers },
    );
  }
}
