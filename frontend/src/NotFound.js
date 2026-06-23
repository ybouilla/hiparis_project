
import React from "react";
import { Link } from "react-router-dom";
import "./NotFound.css";

export default function NotFound() {
  return (
    <div className="not-found-container">
      <div className="not-found-content">
        <h1 className="error-code">404</h1>

        <h2 className="error-title">Page Not Found</h2>

        <p className="error-message">
          Sorry, the page you're looking for doesn't exist or has been moved.
        </p>

        <div className="button-group">
          <Link to="/" className="home-button">
            Go Home
          </Link>

          <button
            className="back-button"
            onClick={() => window.history.back()}
          >
            Go Back
          </button>
        </div>
      </div>
    </div>
  );
}


