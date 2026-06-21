import React from "react";
import {
  Card,
  CardContent,
  CardMedia,
  Typography,
  Box,
  Tooltip
} from "@mui/material";

export default function MovieCard({ movie }) {
  return (
    <Card sx={{ display: "flex" }}>
      <CardMedia
        component="img"
        sx={{ width: 140 }}
        image={movie.Poster_Url}
        alt={movie.Title}
      />

      <Box sx={{ display: "flex", flexDirection: "column" }}>
        <CardContent>
          <Typography variant="h6">{movie.Title}</Typography>

          <Typography variant="body2" color="text.secondary">
            <Tooltip title="Total votes" arrow>
              <span>⭐ {movie.Vote_Count}</span>
            </Tooltip>

            {" | "}

            <Tooltip title="Average rating (out of 10)" arrow>
              <span>⭐ {movie.Vote_Average}/10</span>
            </Tooltip>

            {" | "}

            <Tooltip title="Popularity score" arrow>
              <span>🔥 {Math.round(movie.Popularity)}</span>
            </Tooltip>

            {" | "}

            <Tooltip title="Release date" arrow>
              <span>
                📅 {new Date(movie.Release_Date).toISOString().split("T")[0]}
              </span>
            </Tooltip>

            {" | "}

            <Tooltip title="Original language" arrow>
              <span>Language: {movie.Original_Language}</span>
            </Tooltip>
          </Typography>


          <Typography variant="caption" display="block" sx={{ mt: 1 }}>
            {movie.Genre}
          </Typography>

          <Typography variant="body2" sx={{ mt: 1 }}>
            {movie.Overview}
          </Typography>
        </CardContent>
      </Box>
    </Card>
  );
}