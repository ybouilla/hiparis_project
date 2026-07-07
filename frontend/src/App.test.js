import React from 'react';
import { render, screen } from '@testing-library/react';

import App from './App';


jest.mock("react-router-dom", () => {
  const React = require('react');
  return {
    Link: React.forwardRef(({ children, to, ...rest }, ref) => (
      <a href={to} ref={ref} {...rest}>{children}</a>
    )),
  };
}, { virtual: true });

test('renders the movie explorer title', () => {
  render(<App />);
  const titleElement = screen.getByText(/Movie Explorer/i);
  expect(titleElement).toBeInTheDocument();
});



