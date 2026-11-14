import React from "react";
import { render } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { createQueryClient } from "./queryClient";

/**
 * render() with its own React Query cache, so that no test sees the answers cached by another.
 * gcTime: Infinity = no garbage-collection timer left running when the test ends.
 */
export function renderWithClient(ui) {
  const queryClient = createQueryClient({ gcTime: Infinity });
  const result = render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
  return { queryClient, ...result };
}
