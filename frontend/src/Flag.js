import React, { useState } from "react";

/**
 * The flag of a country: <Flag code="GB" style={{ width: 20, height: 14 }} />.
 *
 * The images are static files (public/flags/gb.svg) that the browser downloads only when a flag is
 * displayed (loading="lazy"). An unknown code, or a missing file, leaves an empty box of the same
 * size, so the layout does not move.
 */
export default function Flag({ code, style }) {
  const [failed, setFailed] = useState(false);
  const file = typeof code === "string" && /^[A-Za-z]{2}$/.test(code) ? code.toLowerCase() : null;

  if (!file || failed) {
    return <span aria-hidden="true" data-testid="flag-placeholder" style={{ display: "inline-block", ...style }} />;
  }
  return (
    <img
      src={`${process.env.PUBLIC_URL}/flags/${file}.svg`}
      alt=""
      data-testid="flag"
      loading="lazy"
      style={style}
      onError={() => setFailed(true)}
    />
  );
}
