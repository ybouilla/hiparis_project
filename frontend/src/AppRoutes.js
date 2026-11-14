import React, { Suspense, lazy } from "react";
import { Routes, Route } from "react-router-dom";
import { Box, CircularProgress } from "@mui/material";

import App from "./App";
import NotFound from "./NotFound";

// The statistics page carries the charting libraries (echarts, recharts: about 1.3 MB of
// JavaScript). They are downloaded when that page is opened, not with the movie list.
const MovieGraph = lazy(() => import("./MovieGraph"));

function PageLoading() {
  return (
    <Box sx={{ display: "grid", placeItems: "center", minHeight: "60vh" }}>
      <CircularProgress aria-label="Loading the page" />
    </Box>
  );
}

export default function AppRoutes() {
  return (
    <Suspense fallback={<PageLoading />}>
      <Routes>
        <Route path="/" element={<App />} />
        <Route path="/statistics" element={<MovieGraph />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  );
}
