import React from "react";
import { render, screen } from "@testing-library/react";

import MovieCard from "./MovieCard";

const movie = {
  Title: "Spider-Man: Far From Home",
  Release_Date: "2019-06-28",
  Vote_Average: 7.5,
  Vote_Count: 12176,
  Popularity: 224.4,
  Original_Language: "en",
  Genre: "Action, Adventure, Science Fiction, Thriller",
  Overview: "Peter Parker and his friends go on a summer trip to Europe.",
  Poster_Url: "https://example.com/poster.jpg",
};

test("shows title, year, language name, rating badge and genre chips", () => {
  render(<MovieCard movie={movie} />);

  expect(screen.getByText("Spider-Man: Far From Home")).toBeInTheDocument();
  expect(screen.getByText(/2019 · English/)).toBeInTheDocument();
  expect(screen.getByText("7.5")).toBeInTheDocument();
  expect(screen.getByText("224")).toBeInTheDocument();

  // first three genres as chips, the rest summarised
  expect(screen.getByText("Action")).toBeInTheDocument();
  expect(screen.getByText("Science Fiction")).toBeInTheDocument();
  expect(screen.queryByText("Thriller")).not.toBeInTheDocument();
  expect(screen.getByText("+1")).toBeInTheDocument();
});

test("only the list view prints the overview", () => {
  const { rerender } = render(<MovieCard movie={movie} view="grid" />);
  expect(screen.queryByText(movie.Overview)).not.toBeInTheDocument();

  rerender(<MovieCard movie={movie} view="list" />);
  expect(screen.getByText(movie.Overview)).toBeInTheDocument();
});

test("does not crash when most fields are missing", () => {
  render(<MovieCard movie={{ Title: "A" }} />);

  expect(screen.getByTestId("feed-item")).toBeInTheDocument();
  expect(screen.getAllByText("A").length).toBeGreaterThan(0);
});
