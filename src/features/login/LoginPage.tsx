import { Button } from "../../components/ui/button";
import { useAuth } from "../../hooks/use-auth";

export function LoginPage() {
  const { authError, signIn } = useAuth();
  return (
    <main className="auth-page">
      <section className="auth-card" aria-labelledby="login-title">
        <div className="cloud-mark" aria-hidden="true"><span /><span /><span /></div>
        <p className="eyebrow">CLOUDY</p>
        <h1 id="login-title">Suas referências, em um só espaço.</h1>
        <p className="lede">Guarde links hoje. Em breve, eles poderão formar uma nuvem visual de ideias.</p>
        <Button onClick={() => void signIn()} className="google-button">
          <span className="google-g" aria-hidden="true">G</span>
          Entrar com Google
        </Button>
        {authError && <p className="status-message" role="status">{authError}</p>}
        <p className="fine-print">Acesso disponível apenas para pessoas autorizadas.</p>
      </section>
    </main>
  );
}
