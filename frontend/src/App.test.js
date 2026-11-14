import React from 'react';
import { screen } from '@testing-library/react';

import App from './App';
import { renderWithClient } from './testUtils';


jest.mock("react-router-dom", () => {
  const React = require('react');
  return {
    Link: React.forwardRef(({ children, to, ...rest }, ref) => (
      <a href={to} ref={ref} {...rest}>{children}</a>
    )),
  };
}, { virtual: true });

test('renders the movie explorer title', () => {
  renderWithClient(<App />);
  const titleElement = screen.getByText(/Movie Explorer/i);
  expect(titleElement).toBeInTheDocument();
});



