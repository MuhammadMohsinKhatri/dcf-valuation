import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

// GET /api/versions?modelId=xxx  — list all versions for a model
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const modelId = searchParams.get("modelId");
  if (!modelId) return NextResponse.json({ error: "modelId required" }, { status: 400 });

  const versions = await prisma.modelVersion.findMany({
    where: { modelId },
    orderBy: { versionNum: "desc" },
    select: {
      id: true,
      versionNum: true,
      label: true,
      baseIVPS: true,
      bearIVPS: true,
      bullIVPS: true,
      createdAt: true,
      createdBy: true,
    },
  });

  return NextResponse.json(versions);
}

// POST /api/versions  — save a new version snapshot
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as {
    modelId: string;
    label?: string;
    modelData: string;
    baseIVPS?: number;
    bearIVPS?: number;
    bullIVPS?: number;
  };

  // Get next version number
  const last = await prisma.modelVersion.findFirst({
    where: { modelId: body.modelId },
    orderBy: { versionNum: "desc" },
    select: { versionNum: true },
  });

  const version = await prisma.modelVersion.create({
    data: {
      modelId: body.modelId,
      versionNum: (last?.versionNum ?? 0) + 1,
      label: body.label ?? null,
      modelData: body.modelData,
      baseIVPS: body.baseIVPS ?? null,
      bearIVPS: body.bearIVPS ?? null,
      bullIVPS: body.bullIVPS ?? null,
      createdBy: session.user.id,
    },
  });

  return NextResponse.json(version);
}
