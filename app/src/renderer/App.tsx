import type { ReactElement } from 'react';

export function App(): ReactElement {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-8 text-foreground">
      <section className="w-full max-w-lg rounded-lg border border-border bg-card p-8 text-card-foreground">
        <p className="mb-3 text-sm font-medium text-muted-foreground">
          Clinic workspace
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">Health-ier</h1>
        <p className="mt-4 leading-relaxed text-muted-foreground">
          A shared space for your clinic team.
        </p>
      </section>
    </main>
  );
}
