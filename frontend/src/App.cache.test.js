import React from 'react';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import axios from 'axios';

import App from './App';
import { renderWithClient } from './testUtils';

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

// 3 movies without filter, 7 when a genre is selected: the total tells which answer is displayed
function answerFor(config) {
  const total = config.params.genre.length > 0 ? 7 : 3;
  return {
    data: { total_movies: total, all_genres: ['Action', 'Drama'], min_date: 1900, movies: [{ Title: `Movie ${total}` }] },
  };
}

beforeEach(() => {
  axios.get.mockReset();
  axios.get.mockImplementation((url, config) => Promise.resolve(answerFor(config)));
});

test('going back to filters already used is answered from the cache, without a request', async () => {
  renderWithClient(<App />);
  expect(await screen.findByText('3')).toBeInTheDocument();       // page 1, no filter
  expect(axios.get).toHaveBeenCalledTimes(1);

  fireEvent.click(await screen.findByText('Action'));                           // select a genre
  expect(await screen.findByText('7')).toBeInTheDocument();
  expect(axios.get).toHaveBeenCalledTimes(2);
  expect(axios.get.mock.calls[1][1].params.genre).toEqual(['Action']);

  fireEvent.click(screen.getAllByText('Action')[0]);                            // and unselect it again
  expect(await screen.findByText('3')).toBeInTheDocument();       // the first answer is back...
  expect(axios.get).toHaveBeenCalledTimes(2);                                   // ...from the cache: no 3rd request
});

test('a new filter combination is still requested', async () => {
  renderWithClient(<App />);
  expect(await screen.findByText('3')).toBeInTheDocument();

  fireEvent.change(screen.getByLabelText(/search title/i), { target: { value: 'batman' } });
  await waitFor(() => expect(axios.get).toHaveBeenCalledTimes(2));
  expect(axios.get.mock.calls[1][1].params.title).toBe('batman');
});
