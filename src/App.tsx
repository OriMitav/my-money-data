import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { AppLayout } from "@/components/AppLayout";
import LoginPage from "@/pages/LoginPage";
import UploadsPage from "@/pages/UploadsPage";
import TransactionsPage from "@/pages/TransactionsPage";
import DashboardPage from "@/pages/DashboardPage";
import CategoriesPage from "@/pages/CategoriesPage";
import SettingsPage from "@/pages/SettingsPage";
import IncomeTaxPage from "@/pages/IncomeTaxPage";
import PensionPage from "@/pages/PensionPage";
import NotFound from "@/pages/NotFound";

const queryClient = new QueryClient();

function ProtectedRoutes() {
  const { user, loading, isAllowed } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!user || !isAllowed) return <LoginPage />;

  return (
    <AppLayout>
      <Routes>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/uploads" element={<UploadsPage />} />
        <Route path="/transactions" element={<TransactionsPage />} />
        <Route path="/income-tax" element={<IncomeTaxPage />} />
        <Route path="/pension" element={<PensionPage />} />
        <Route path="/categories" element={<CategoriesPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </AppLayout>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <ProtectedRoutes />
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
