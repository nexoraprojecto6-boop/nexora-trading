import { useCallback, useEffect, useMemo, useState } from "react";
import { createApiClient, normalizeApiBase, type SessionState } from "./api";

type ViewState = { readonly kind: "loading" } | SessionState;

function readLoginError(): boolean {
  const params = new URLSearchParams(window.location.search);
  const failed = params.get("auth") === "error";
  if (params.has("auth")) {
    // Remove o parâmetro para que um refresh não repita a mensagem.
    window.history.replaceState(null, "", window.location.pathname);
  }
  return failed;
}

export default function App() {
  const base = normalizeApiBase(import.meta.env.VITE_API_BASE_URL);
  const client = useMemo(() => (base === undefined ? undefined : createApiClient(base)), [base]);
  const [state, setState] = useState<ViewState>({ kind: "loading" });
  const [loginFailed] = useState(readLoginError);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (client === undefined) return;
    setState({ kind: "loading" });
    setState(await client.fetchSession());
  }, [client]);

  useEffect(() => {
    void load();
  }, [load]);

  const onLogout = async () => {
    if (client === undefined) return;
    setBusy(true);
    const done = await client.logout();
    setBusy(false);
    if (done) setState({ kind: "anonymous" });
    else setState({ kind: "error", message: "Não foi possível terminar a sessão. Tenta novamente." });
  };

  return (
    <main className="shell">
      <header>
        <h1>NEXORA TRADING</h1>
        <p className="tagline">Plataforma de trading em tempo real sobre a API oficial da Deriv.</p>
      </header>

      {client === undefined && (
        <p role="alert" className="notice error">
          Configuração em falta: define VITE_API_BASE_URL com o endereço https da API.
        </p>
      )}

      {loginFailed && state.kind !== "authenticated" && (
        <p role="alert" className="notice error">
          Não foi possível concluir o login. Tenta novamente.
        </p>
      )}

      {client !== undefined && state.kind === "loading" && <p aria-live="polite">A verificar sessão…</p>}

      {client !== undefined && state.kind === "error" && (
        <section>
          <p role="alert" className="notice error">{state.message}</p>
          <button type="button" onClick={() => void load()}>Tentar novamente</button>
        </section>
      )}

      {client !== undefined && state.kind === "anonymous" && (
        <section>
          <p>Para começar, liga a tua conta Deriv. Nunca vemos a tua palavra-passe.</p>
          <a className="button" href={client.loginUrl}>Entrar com a Deriv</a>
        </section>
      )}

      {client !== undefined && state.kind === "authenticated" && (
        <section>
          <h2>As tuas contas</h2>
          {state.user.accounts.length === 0 ? (
            <p>Sem contas disponíveis.</p>
          ) : (
            <ul className="accounts">
              {state.user.accounts.map((account) => (
                <li key={account.accountId}>
                  <strong>{account.accountId}</strong>
                  <span className={`badge ${account.accountType}`}>{account.accountType === "demo" ? "Demo" : "Real"}</span>
                  <span>{account.currency}</span>
                  {account.status === "inactive" && <span className="badge inactive">Inativa</span>}
                </li>
              ))}
            </ul>
          )}
          <button type="button" onClick={() => void onLogout()} disabled={busy}>Terminar sessão</button>
        </section>
      )}
    </main>
  );
}
