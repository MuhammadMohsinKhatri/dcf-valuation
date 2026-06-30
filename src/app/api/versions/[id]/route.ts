import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

// GET /api/versions/[id]  — fetch full snapshot for a single version
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const version = await prisma.modelVersion.findUnique({ where: { id } });
  if (!version) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json(version);
}

// DELETE /api/versions/[id]  — delete a version
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  await prisma.modelVersion.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
