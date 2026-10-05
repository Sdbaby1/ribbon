import { BrowserRouter, Link, Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { CirclePage } from "./pages/CirclePage";
import { HomePage } from "./pages/HomePage";

export function App() {
  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/c/:circleId" element={<CirclePage />} />
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
