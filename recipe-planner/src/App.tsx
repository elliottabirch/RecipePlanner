import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ThemeProvider, createTheme, CssBaseline } from "@mui/material";
import Layout from "./components/Layout";

// Pages
import Stores from "./pages/registries/Stores";
import Sections from "./pages/registries/Sections";
import ContainerTypes from "./pages/registries/ContainerTypes";
import Tags from "./pages/registries/Tags";
import Products from "./pages/registries/Products";
import Recipes from "./pages/Recipes";
import RecipeEditor from "./pages/RecipeEditor";
import WeeklyPlans from "./pages/WeeklyPlans";
import Outputs from "./pages/Outputs";
import Inventory from "./pages/Inventory";

const theme = createTheme({
  palette: {
    mode: "light",
    primary: {
      main: "#2e7d32", // green
    },
    secondary: {
      main: "#ff6f00", // orange
    },
  },
});

function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<Navigate to="/recipes" replace />} />

            {/* Registries */}
            <Route path="registries">
              <Route
                index
                element={<Navigate to="/registries/products" replace />}
              />
              <Route path="stores" element={<Stores />} />
              <Route path="sections" element={<Sections />} />
              <Route path="containers" element={<ContainerTypes />} />
              <Route path="tags" element={<Tags />} />
              <Route path="products" element={<Products />} />
            </Route>

            {/* Recipes */}
            <Route path="recipes" element={<Recipes />} />
            <Route path="recipes/:id" element={<RecipeEditor />} />
            <Route path="recipes/new" element={<RecipeEditor />} />

            {/* Weekly Plans */}
            <Route path="plans" element={<WeeklyPlans />} />

            {/* Inventory */}
            <Route path="inventory" element={<Inventory />} />

            {/* Outputs */}
            <Route path="outputs" element={<Outputs />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  );
}

export default App;
