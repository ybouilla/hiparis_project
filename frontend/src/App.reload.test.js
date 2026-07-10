import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import axios from 'axios';

import App from './App';

jest.mock('axios', () => ({
  get: jest.fn(),
  isCancel: jest.fn(() => false),
}));

jest.mock('react-router-dom', () => {
  const React = require('react');
  return {
    Link: React.forwardRef(({ children, to, ...rest }, ref) => (
      <a href={to} ref={ref} {...rest}>{children}</a>
    )),
  };
}, { virtual: true });

function mockResponse({ totalMovies = 3, allGenres = ['Action', 'Drama'], movies = [] } = {}) {
  return {
    data: {
      total_movies: totalMovies,
      all_genres: allGenres,
      min_date: 1900,
      movies,
    },
  };
}

beforeEach(() => {
  axios.get.mockReset();
});

test('refetches movies with updated params when a filter changes', async () => {
  axios.get.mockResolvedValue(mockResponse());

  render(<App />);

  await waitFor(() => expect(axios.get).toHaveBeenCalledTimes(1));
  expect(axios.get.mock.calls[0][1].params.genre).toEqual([]);

  const actionChip = await screen.findByText('Action');
  fireEvent.click(actionChip);

  await waitFor(() => expect(axios.get).toHaveBeenCalledTimes(2));
  expect(axios.get.mock.calls[1][1].params.genre).toEqual(['Action']);
});

test('aborts the in-flight request when a filter changes before it resolves', async () => {
  // Never resolves, so the first request is still pending when the filter changes.
  axios.get.mockImplementation(() => new Promise(() => {}));

  render(<App />);

  await waitFor(() => expect(axios.get).toHaveBeenCalledTimes(1));
  const firstSignal = axios.get.mock.calls[0][1].signal;
  expect(firstSignal).toBeInstanceOf(AbortSignal);
  expect(firstSignal.aborted).toBe(false);

  // Trigger a dependency change on the reload effect (selectedGenres).
  // allGenres is empty since the first (pending) request never resolved,
  // so drive the change via the search field instead, which is also a dependency.
  const searchInput = screen.getByLabelText(/search title/i);
  fireEvent.change(searchInput, { target: { value: 'batman' } });

  await waitFor(() => expect(axios.get).toHaveBeenCalledTimes(2));

  expect(firstSignal.aborted).toBe(true);
  const secondSignal = axios.get.mock.calls[1][1].signal;
  expect(secondSignal).not.toBe(firstSignal);
  expect(secondSignal.aborted).toBe(false);
});
