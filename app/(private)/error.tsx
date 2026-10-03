"use client";
export default function ErrorView({ reset }: { reset: () => void }) {
  return (
    <section className="panel">
      <h1>Não foi possível carregar esta página</h1>
      <p>Tente novamente. Seus registros já salvos continuam no banco.</p>
      <button onClick={reset}>Tentar novamente</button>
    </section>
  );
}
