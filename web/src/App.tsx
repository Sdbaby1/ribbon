import { useEffect } from "react";
import { BrowserRouter, Link, Route, Routes, useLocation } from "react-router-dom";
import { Layout } from "./components/Layout";
import { CirclePage } from "./pages/CirclePage";
import { HomePage } from "./pages/HomePage";
import { CookiesPage, PrivacyPage, TermsPage } from "./pages/PolicyPage";

export function App() {
  return (
    <BrowserRouter>
      <RouteMetadata />
      <Layout>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/c/:circleId" element={<CirclePage />} />
          <Route path="/privacy" element={<PrivacyPage />} />
          <Route path="/terms" element={<TermsPage />} />
          <Route path="/cookies" element={<CookiesPage />} />
          <Route
            path="*"
            element={
              <section className="paper">
                <h2>That page is not part of Ribbon.</h2>
                <Link to="/">Back home</Link>
              </section>
            }
          />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}

function RouteMetadata() {
  const { pathname } = useLocation();

  useEffect(() => {
    if (pathname === "/privacy") document.title = "Privacy Policy | Ribbon";
    else if (pathname === "/terms") document.title = "Terms and Conditions | Ribbon";
    else if (pathname === "/cookies") document.title = "Cookies Policy | Ribbon";
    else if (pathname.startsWith("/c/")) document.title = "Circle | Ribbon";
    else document.title = "Ribbon | Settle shared expenses in USDC";
  }, [pathname]);

  return null;
}
