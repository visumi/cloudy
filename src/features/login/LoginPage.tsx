import { Button } from "../../components/ui/button";
import CRTWarp from "../../components/CRTWarp";
import { useAuth } from "../../hooks/use-auth";

export function LoginPage() {
  const { authError, signIn } = useAuth();
  return (
    <main className="auth-page">
      <div className="auth-background" aria-hidden="true">
        <CRTWarp
          color="#22a8ed"
          backgroundColor="#f7faff"
          speed={0.5}
          curvature={0.25}
          scanlineStrength={0.25}
          scanlineFrequency={200}
          waveAmplitude={0.3}
          waveFrequency={2.5}
          bloom={1.5}
          bloomRadius={1}
          noise={0.1}
          vignette={0}
          brightness={1.25}
          pixelation={1}
          rgbShift={0.015}
          mouseReact
          mouseStrength={0.5}
          dpr={1}
          fps={30}
        />
      </div>
      <section className="auth-card" aria-label="Entrar no Cloudy">
        <img className="cloud-mark" src="/cloudy-logo.png" alt="" aria-hidden="true" />
        <p className="logo-word">cloudy</p>
        <Button onClick={() => void signIn()} className="google-button">
          <GoogleIcon />
          Entrar com Google
        </Button>
        {authError && <p className="status-message" role="status">{authError}</p>}
        <p className="login-tagline">Guarde o que inspira você.</p>
      </section>
      <footer className="login-footer">
        © {new Date().getFullYear()} · Desenvolvido por <a href="https://isumi.com.br/" target="_blank" rel="noreferrer">isumi.</a>
      </footer>
    </main>
  );
}

function GoogleIcon() {
  return (
    <svg aria-hidden="true" className="google-icon" viewBox="0 0 24 24">
      <path fill="#4285F4" d="M21.35 12.27c0-.79-.07-1.55-.2-2.27H12v4.3h5.24a4.48 4.48 0 0 1-1.94 2.94v2.45h3.15c1.85-1.7 2.9-4.2 2.9-7.42Z" />
      <path fill="#34A853" d="M12 21.6c2.64 0 4.86-.87 6.48-2.36l-3.15-2.45c-.87.58-1.98.92-3.33.92-2.56 0-4.73-1.73-5.51-4.05H3.23v2.53A9.79 9.79 0 0 0 12 21.6Z" />
      <path fill="#FBBC05" d="M6.49 13.66A5.9 5.9 0 0 1 6.18 12c0-.58.1-1.14.31-1.66V7.81H3.23A9.8 9.8 0 0 0 2.2 12c0 1.58.38 3.07 1.03 4.19l3.26-2.53Z" />
      <path fill="#EA4335" d="M12 6.29c1.44 0 2.73.5 3.75 1.48l2.81-2.81C16.85 3.38 14.63 2.4 12 2.4a9.79 9.79 0 0 0-8.77 5.41l3.26 2.53C7.27 8.02 9.44 6.29 12 6.29Z" />
    </svg>
  );
}
