// ============================================================
// NEXORA FOREX — App Root
//
// Providers globais (Auth, Loader, Trading) ficam aqui.
// BotsProvider NÃO está aqui para as rotas gerais: cada página que precisa
// dele (Dashboard, OperarManual) monta o seu próprio <BotsProvider/>, para
// só carregar o catálogo de bots depois de existir sessão.
//
// Entrada: "/" (LoginPage) oferece "Entrar com a Deriv" e "Criar conta na
// Deriv" (OAuth no servidor). O servidor termina o login em "/callback".
// Rotas de funcionalidades sem servidor (admin, operar manual) mostram um
// ecrã de "indisponível" enquanto a flag correspondente (lib/config) estiver desligada.
// ============================================================
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { TradingProvider } from './context/TradingContext'
import { LoaderProvider } from './context/LoaderContext'
import LoginPage from './pages/LoginPage'
import ConnectDerivPage from './pages/ConnectDerivPage'
import CallbackPage from './pages/CallbackPage'
import DashboardPage from './pages/DashboardPage'
import MenuPage from './pages/MenuPage'
import AdminPage from './pages/AdminPage'
import VideoLessonsPage from './pages/VideoLessonsPage'
import OperarManualPage from './pages/OperarManualPage'
import FeatureUnavailablePage from './pages/FeatureUnavailablePage'
import { FEATURES } from './lib/config'

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <LoaderProvider>
          <TradingProvider>
            <Routes>
              <Route path="/" element={<LoginPage />} />
              <Route path="/register" element={<Navigate to="/" replace />} />
              <Route path="/connect-deriv" element={<ConnectDerivPage />} />
              <Route path="/callback" element={<CallbackPage />} />
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/menu" element={<MenuPage />} />
              <Route path="/admin" element={FEATURES.admin ? <AdminPage /> : <FeatureUnavailablePage title="Painel de administração" />} />
              <Route path="/aprender-a-operar" element={<VideoLessonsPage />} />
              {/* OperarManualPage já monta o seu próprio <BotsProvider/>
                  internamente — NÃO envolver aqui outra vez. */}
              <Route path="/operar-manual" element={FEATURES.manualTrading ? <OperarManualPage /> : <FeatureUnavailablePage title="Operar manualmente" />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </TradingProvider>
        </LoaderProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}
