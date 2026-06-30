import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

// GET /api/audit?modelId=xxx  — list assumption changes for a model
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const modelId = searchParams.get("modelId");
  if (!modelId) return NextResponse.json({ error: "modelId required" }, { status: 400 });

  const changes = await prisma.assumptionChange.findMany({
    where: { modelId },
    orderBy: { changedAt: "desc" },
    take: 200,
  });

  return NextResponse.json(changes);
}

// POST /api/audit  — log assumption changes (called on Save)
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as {
    modelId: string;
    changes: { field: string; oldValue: string; newValue: string }[];
  };

  if (!body.changes.length) return NextResponse.json({ ok: true });

  await prisma.assumptionChange.createMany({
    data: body.changes.map((c) => ({
      modelId: body.modelId,
      field: c.field,
      oldValue: c.oldValue,
      newValue: c.newValue,
      changedBy: session.user!.id!,
    })),
  });

  return NextResponse.json({ ok: true });
}
