import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { buildDCFExcel } from "@/lib/excel/builder";
import type { DCFModel } from "@/types/model";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const model = await req.json() as DCFModel;

  if (!model?.ticker || !model?.historicalPeriods?.length) {
    return NextResponse.json({ error: "Invalid model data" }, { status: 400 });
  }

  const buffer = await buildDCFExcel(model);

  const filename = `${model.ticker}_DCF_${new Date().toISOString().slice(0, 10)}.xlsx`;

  return new NextResponse(buffer.buffer as ArrayBuffer, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": buffer.byteLength.toString(),
    },
  });
}
