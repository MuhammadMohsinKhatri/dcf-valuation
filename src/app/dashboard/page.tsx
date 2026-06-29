import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { ModelCard } from "@/components/model/ModelCard";

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const models = await prisma.dCFModel.findMany({
    where: { userId: session.user.id },
    orderBy: { updatedAt: "desc" },
    take: 20,
  });

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-xl font-bold text-blue-700">BOE DCF</span>
          <span className="text-sm text-gray-400">Equity Valuation Platform</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-600">{session.user.name ?? session.user.email}</span>
          <Link href="/api/auth/signout">
            <Button variant="ghost" size="sm">Sign Out</Button>
          </Link>
        </div>
      </nav>

      <main className="max-w-5xl mx-auto px-6 py-10">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Your Models</h1>
            <p className="text-sm text-gray-500 mt-1">
              {models.length} model{models.length !== 1 ? "s" : ""} saved
            </p>
          </div>
          <Link href="/model/new">
            <Button size="lg">+ New Model</Button>
          </Link>
        </div>

        {models.length === 0 ? (
          <div className="bg-white rounded-xl border border-dashed border-gray-300 p-16 text-center">
            <p className="text-gray-400 text-lg mb-4">No models yet</p>
            <Link href="/model/new">
              <Button>Build your first DCF</Button>
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {models.map((m) => {
              let aiNarrative: string | undefined;
              try { aiNarrative = (JSON.parse(m.modelData as string) as { aiNarrative?: string }).aiNarrative; } catch { /* skip */ }
              return (
                <ModelCard
                  key={m.id}
                  id={m.id}
                  ticker={m.ticker}
                  companyName={m.companyName}
                  activeScenario={m.activeScenario}
                  updatedAt={m.updatedAt.toISOString()}
                  aiNarrative={aiNarrative}
                />
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
