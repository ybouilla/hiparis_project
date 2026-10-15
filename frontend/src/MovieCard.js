import React, { useState } from "react";
import { Card, CardContent, Chip, Box, Skeleton, Stack, Tooltip, Typography } from "@mui/material";
import StarIcon from "@mui/icons-material/Star";
import LocalFireDepartmentIcon from "@mui/icons-material/LocalFireDepartment";
import { languageLabel } from "./utils/languageLabel";

const MAX_GENRES = 3;
const compact = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });

const isNumber = (v) => typeof v === "number" && !Number.isNaN(v);
const ratingColor = (r) => (r >= 7.5 ? "success.main" : r >= 6 ? "warning.main" : "error.main");

const parseGenres = (genre) =>
  typeof genre === "string" ? genre.split(",").map((g) => g.trim()).filter(Boolean) : [];

/**
 * The dataset links TMDB "original" posters (several MB each). TMDB serves the same
 * image at smaller widths by swapping the size segment of the path.
 */
const tmdbSize = (url, size) => url.replace("/t/p/original/", `/t/p/${size}/`);

/** Stable gradient per title, used while / instead of the poster image. */
function posterGradient(title = "") {
  let hue = 0;
  for (const c of title) hue = (hue * 31 + c.charCodeAt(0)) % 360;
  return `linear-gradient(160deg, hsl(${hue} 55% 38%), hsl(${(hue + 50) % 360} 60% 28%))`;
}

function Poster({ movie, width }) {
  const [failed, setFailed] = useState(false);
  const title = movie?.Title ?? "";
  const url = movie?.Poster_Url;
  const rating = movie?.Vote_Average;

  return (
    <Box
      sx={{
        position: "relative",
        aspectRatio: "2 / 3",
        width,
        flex: "none",
        background: posterGradient(title),
        color: "#fff",
        display: "grid",
        placeItems: "center",
        textAlign: "center",
        p: 1.5,
        fontWeight: 700,
        overflow: "hidden",
      }}
    >
      {url && !failed ? (
        <Box
          component="img"
          src={tmdbSize(url, "w342")}
          srcSet={`${tmdbSize(url, "w342")} 1x, ${tmdbSize(url, "w500")} 2x`}
          alt={title}
          loading="lazy"
          onError={() => setFailed(true)}
          sx={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
        />
      ) : (
        <span aria-hidden="true">{title}</span>
      )}

      {isNumber(rating) && (
        <Tooltip title="Average rating (out of 10)" arrow>
          <Box
            sx={{
              position: "absolute",
              top: 8,
              left: 8,
              display: "flex",
              alignItems: "center",
              gap: 0.5,
              px: 1,
              py: 0.25,
              borderRadius: 2,
              bgcolor: "rgba(15,18,24,0.82)",
              fontSize: 13,
            }}
          >
            <StarIcon sx={{ fontSize: 15, color: ratingColor(rating) }} />
            {rating.toFixed(1)}
          </Box>
        </Tooltip>
      )}
    </Box>
  );
}

/**
 * One movie. `view` is "grid" (poster on top, overview in a tooltip)
 * or "list" (poster on the left, overview clamped to 3 lines).
 */
export default function MovieCard({ movie, view = "grid" }) {
  const isList = view === "list";

  const date = movie?.Release_Date ? new Date(movie.Release_Date) : null;
  const validDate = date && !Number.isNaN(date.getTime()) ? date : null;
  const year = validDate ? validDate.getUTCFullYear() : null;
  const fullDate = validDate ? validDate.toISOString().split("T")[0] : "";

  const meta = [
    year,
    movie?.Original_Language ? languageLabel(movie.Original_Language) : null,
    isNumber(movie?.Vote_Count) ? `${compact.format(movie.Vote_Count)} votes` : null,
  ].filter(Boolean);

  const genres = parseGenres(movie?.Genre);
  const popularity = movie?.Popularity;

  return (
    <Card
      data-testid="feed-item"
      variant="outlined"
      sx={{
        display: "flex",
        flexDirection: isList ? "row" : "column",
        borderRadius: 3,
        overflow: "hidden",
        transition: "transform .15s, box-shadow .15s",
        "&:hover": { transform: "translateY(-3px)", boxShadow: 4 },
        "@media (prefers-reduced-motion: reduce)": { transition: "none", "&:hover": { transform: "none" } },
      }}
    >
      <Tooltip
        title={!isList ? movie?.Overview ?? "" : ""}
        enterDelay={500}
        placement="top"
        arrow
      >
        <Box sx={{ display: "flex", flex: "none" }}>
          <Poster movie={movie} width={isList ? 120 : "100%"} />
        </Box>
      </Tooltip>

      <CardContent
        sx={{
          display: "flex",
          flexDirection: "column",
          gap: 0.75,
          flex: 1,
          minWidth: 0,
          p: isList ? 2 : 1.5,
          "&:last-child": { pb: isList ? 2 : 1.5 },
        }}
      >
        <Typography
          variant="subtitle1"
          fontWeight={700}
          sx={{
            lineHeight: 1.25,
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
        >
          {movie?.Title ?? ""}
        </Typography>

        {meta.length > 0 && (
          <Tooltip title={fullDate ? `Released ${fullDate}` : ""} arrow>
            <Typography variant="caption" color="text.secondary">
              {meta.join(" · ")}
            </Typography>
          </Tooltip>
        )}

        {genres.length > 0 && (
          <Stack direction="row" flexWrap="wrap" useFlexGap gap={0.5}>
            {genres.slice(0, MAX_GENRES).map((g) => (
              <Chip key={g} label={g} size="small" variant="outlined" sx={{ height: 22, fontSize: 12 }} />
            ))}
            {genres.length > MAX_GENRES && (
              <Chip
                label={`+${genres.length - MAX_GENRES}`}
                size="small"
                variant="outlined"
                sx={{ height: 22, fontSize: 12 }}
              />
            )}
          </Stack>
        )}

        {isList && movie?.Overview && (
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{
              display: "-webkit-box",
              WebkitLineClamp: 3,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
          >
            {movie.Overview}
          </Typography>
        )}

        {isNumber(popularity) && (
          <Tooltip title="Popularity score" arrow>
            <Box
              sx={{ display: "flex", alignItems: "center", gap: 0.5, mt: "auto", color: "text.secondary" }}
            >
              <LocalFireDepartmentIcon sx={{ fontSize: 16 }} color="warning" />
              <Typography variant="caption">{Math.round(popularity)}</Typography>
            </Box>
          </Tooltip>
        )}
      </CardContent>
    </Card>
  );
}

/** Placeholder with the same footprint as MovieCard, shown while a page loads. */
export function MovieCardSkeleton({ view = "grid" }) {
  const isList = view === "list";
  return (
    <Card
      variant="outlined"
      aria-hidden="true"
      sx={{ display: "flex", flexDirection: isList ? "row" : "column", borderRadius: 3, overflow: "hidden" }}
    >
      <Skeleton
        variant="rectangular"
        sx={{ aspectRatio: "2 / 3", width: isList ? 120 : "100%", height: "auto", flex: "none" }}
      />
      <CardContent sx={{ flex: 1 }}>
        <Skeleton width="80%" />
        <Skeleton width="55%" />
        <Skeleton width="65%" />
      </CardContent>
    </Card>
  );
}
