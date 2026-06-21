import React from "react";
import {
  Card,
  CardContent,
  CardMedia,
  Typography,
  Box,
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
            ⭐ {movie.Vote_Count} | ⭐ {movie.Vote_Average} | 🔥{" "}
            {Math.round(movie.Popularity)} | 📅{" "}
            {new Date(movie.Release_Date)?.toISOString().split("T")[0]} |{" "}
            Language : {movie.Original_Language}
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