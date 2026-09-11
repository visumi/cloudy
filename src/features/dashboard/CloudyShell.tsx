import { Button } from "../../components/ui/button";
import { useAuth } from "../../hooks/use-auth";

export function CloudyShell() {
  const { user, profile, signOutUser } = useAuth();
  const name = profile?.name || user?.displayName || "pessoa";
  return (
    <main className="app-page">
      <header className="topbar">
        <div className="brand-lockup"><span className="brand-dot" aria-hidden="true" /> <span>Cloudy</span></div>
        <div className="account-actions">
          <span className="account-name">Olá, {name.split(" ")[0]}</span>
          <Button className="text-button" onClick={() => void signOutUser()}>Sair</Button>
        </div>
      </header>
      <section className="workspace" aria-labelledby="workspace-title">
        <div className="workspace-heading">
          <p className="eyebrow">SEU ESPAÇO</p>
          <h1 id="workspace-title">A nuvem começa aqui.</h1>
          <p className="lede">Salve seu primeiro link para começar a construir seu mapa de referências.</p>
        </div>
        <div className="empty-graph" role="status">
          <div className="empty-cloud" aria-hidden="true"><span /><span /><span /></div>
          <h2>Nenhum link salvo ainda</h2>
          <p>O grafo visual aparecerá aqui quando sua coleção ganhar forma.</p>
          <Button disabled aria-disabled="true">Salvar primeiro link</Button>
        </div>
      </section>
    </main>
  );
}
