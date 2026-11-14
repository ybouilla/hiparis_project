import React from "react";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import AppRoutes from "./AppRoutes";

// react-router-dom v7 cannot be loaded by this project's Jest (the other tests mock it too), so a
// minimal stand-in router picks the <Route> whose path equals the current one (or "*").
// What matters here is the lazy loading with its spinner; the real router is exercised by the
// Playwright tests (e2e_tests/goto.spec.js).
jest.mock("react-router-dom", () => {
  const React = require("react");
  const Location = React.createContext("/");
  const Routes = ({ children }) => {
    const path = React.useContext(Location);
    const routes = React.Children.toArray(children);
    const match = routes.find((r) => r.props.path === path) || routes.find((r) => r.props.path === "*");
    return match.props.element;
  };
  return {
    MemoryRouter: ({ initialEntries, children }) => <Location.Provider value={initialEntries[0]}>{children}</Location.Provider>,
    Routes,
    Route: () => null,
  };
}, { virtual: true });

// the real pages are heavy and tested elsewhere
jest.mock("./App", () => ({ __esModule: true, default: () => <div>movie list page</div> }));
jest.mock("./NotFound", () => ({ __esModule: true, default: () => <div>not found page</div> }));
jest.mock("./MovieGraph", () => ({ __esModule: true, default: () => <div>statistics page</div> }));

const at = (path) => render(<MemoryRouter initialEntries={[path]}><AppRoutes /></MemoryRouter>);

test("the movie list is shown at /, without any spinner (it is not a lazy page)", () => {
  at("/");
  expect(screen.getByText("movie list page")).toBeInTheDocument();
  expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
});

test("the statistics page is loaded on demand: a spinner first, then the page", async () => {
  at("/statistics");
  expect(screen.getByRole("progressbar")).toBeInTheDocument();           // the chunk is being fetched
  expect(await screen.findByText("statistics page")).toBeInTheDocument();
  expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
});

test("an unknown address shows the not-found page", () => {
  at("/nothing-here");
  expect(screen.getByText("not found page")).toBeInTheDocument();
});
