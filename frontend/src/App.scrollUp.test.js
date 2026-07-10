import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import axios from 'axios';

import App from './App';
import { handleIntersection } from './utils/handleIntersection';

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

jest.mock('./utils/handleIntersection', () => ({
  handleIntersection: jest.fn(),
}));

function mockResponse({ totalMovies = 3, allGenres = [], movies = [{ Title: 'A' }] } = {}) {
  return {
    data: {
      total_movies: totalMovies,
      all_genres: allGenres,
      min_date: 1900,
      movies,
    },
  };
}

class MockIntersectionObserver {
  // class mocking Intersection Observer
  constructor(callback) {
    this.callback = callback;
    this.observedElements = [];
    MockIntersectionObserver.instances.push(this);
  }
  observe(el) {
    this.observedElements.push(el);
  }
  unobserve() {}
  disconnect() {}
}
MockIntersectionObserver.instances = [];

let originalIntersectionObserver;

beforeEach(() => {
  axios.get.mockReset();
  handleIntersection.mockReset();
  MockIntersectionObserver.instances = [];
  originalIntersectionObserver = global.IntersectionObserver;
  global.IntersectionObserver = MockIntersectionObserver;
});

afterEach(() => {
  global.IntersectionObserver = originalIntersectionObserver;
});

// The "scroll up" sentinel (topRef) is the first 40px-tall marker div in the
// document; the "scroll down" sentinel (loadMoreRef) renders later, after the
// movie list, once movies exist.
function getTopSentinelObserver(container) {
  const heightDivs = Array.from(container.querySelectorAll('div')).filter((d) =>
    (d.getAttribute('style') || '').includes('height: 40px')
  );  // retrieves from <App/> all <div/> and gets <div style={{ height: 40 }} ref={topRef} />
  const topDiv = heightDivs[0];
  const matches = MockIntersectionObserver.instances.filter((o) =>
    o.observedElements.includes(topDiv)
  );
  return matches[matches.length - 1]; // return last observer observed in the top sentinel
}

test('passes current ref state and the first loaded page to handleIntersection on intersection', async () => {
  axios.get.mockResolvedValue(mockResponse());

  const { container } = render(<App />);

  await waitFor(() => expect(screen.getByText('3')).toBeInTheDocument());

  const topObserver = getTopSentinelObserver(container);
  expect(topObserver).toBeDefined();

  act(() => {
    topObserver.callback([{ isIntersecting: true }]); // stimulate scrolling
  });

  expect(handleIntersection).toHaveBeenCalledTimes(1);
  const args = handleIntersection.mock.calls[0][0];
  expect(args.entry).toEqual({ isIntersecting: true });
  expect(args.hasMore).toBe(true);
  expect(args.isLoading).toBe(false);
  expect(args.cooldown).toBe(false);
  expect(args.firstPage).toBe(1);
  expect(typeof args.loadPage).toBe('function');
});

test('does not fetch an extra page when the top sentinel intersects at the first loaded page', async () => {
  const actual = jest.requireActual('./utils/handleIntersection');
  handleIntersection.mockImplementation(actual.handleIntersection);

  axios.get.mockResolvedValue(mockResponse());

  const { container } = render(<App />);

  await waitFor(() => expect(screen.getByText('3')).toBeInTheDocument());
  expect(axios.get).toHaveBeenCalledTimes(1);

  const topObserver = getTopSentinelObserver(container);

  act(() => {
    topObserver.callback([{ isIntersecting: true }]);
  });

  // firstPage is 1, so handleIntersection's guard (firstPage <= 1) should
  // block loadPage from firing, and no second request should go out.
  expect(axios.get).toHaveBeenCalledTimes(1);
});
