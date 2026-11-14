import React from "react";
import fs from "fs";
import path from "path";
import { render, screen, fireEvent } from "@testing-library/react";

import Flag from "./Flag";
import languages from "./languages.json";

test("shows the SVG of the country, in lower case, loaded lazily", () => {
  render(<Flag code="GB" style={{ width: 20, height: 14 }} />);
  const img = screen.getByTestId("flag");
  expect(img.getAttribute("src")).toMatch(/\/flags\/gb\.svg$/);
  expect(img).toHaveAttribute("loading", "lazy");
  expect(img).toHaveStyle({ width: "20px", height: "14px" });
  expect(img).toHaveAttribute("alt", "");              // decorative: the country name is written next to it
});

test.each(["No language", "", "G", "GBR", undefined, null])("no image for the code %p, but the box is kept", (code) => {
  render(<Flag code={code} style={{ width: 20, height: 14 }} />);
  expect(screen.queryByTestId("flag")).not.toBeInTheDocument();
  expect(screen.getByTestId("flag-placeholder")).toHaveStyle({ width: "20px", height: "14px" });
});

test("a flag file that cannot be loaded leaves an empty box instead of a broken image", () => {
  render(<Flag code="FR" style={{ width: 20, height: 14 }} />);
  fireEvent.error(screen.getByTestId("flag"));
  expect(screen.queryByTestId("flag")).not.toBeInTheDocument();
  expect(screen.getByTestId("flag-placeholder")).toHaveStyle({ width: "20px" });
});

test("every country of languages.json has its flag file in public/flags", () => {
  const missing = [...new Set(languages.map((l) => l.country.toLowerCase()))]
    .filter((code) => !fs.existsSync(path.join(__dirname, "..", "public", "flags", `${code}.svg`)));
  expect(missing).toEqual([]);
});
