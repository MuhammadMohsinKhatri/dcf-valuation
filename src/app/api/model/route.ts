import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const id = req.nextUrl.searchParams.get("id");

  if (id) {
    const model = await prisma.dCFModel.findFirst({
      where: { id, userId: session.user.id },
    });
    if (!model) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(model);
  }

  const models = await prisma.dCFModel.findMany({
    where: { userId: session.user.id },
    orderBy: { updatedAt: "desc" },
    select: { id: true, ticker: true, companyName: true, activeScenario: true, updatedAt: true },
  });
  return NextResponse.json(models);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const model = await prisma.dCFModel.create({
    data: {
      userId: session.user.id,
      ticker: body.ticker,
      companyName: body.companyName,
      currency: body.currency ?? "USD",
      modelData: JSON.stringify(body),
      activeScenario: body.activeScenario ?? "base",
    },
  });
  return NextResponse.json({ id: model.id }, { status: 201 });
}

export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const existing = await prisma.dCFModel.findFirst({
    where: { id: body.id, userId: session.user.id },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const model = await prisma.dCFModel.update({
    where: { id: body.id },
    data: {
      modelData: JSON.stringify(body),
      activeScenario: body.activeScenario ?? "base",
      ticker: body.ticker,
      companyName: body.companyName,
    },
  });
  return NextResponse.json({ id: model.id });
}
