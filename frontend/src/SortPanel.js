import React from "react";
import { Box, IconButton, MenuItem, Select, Tooltip } from "@mui/material";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";

const OPTIONS = [
  ["", "Sort: default order"],
  ["popularity", "Sort: popularity"],
  ["vote_average", "Sort: rating"],
  ["vote_count", "Sort: number of votes"],
  ["release_date", "Sort: release date"],
];

/** Compact sort control for the results toolbar: field dropdown + direction toggle. */
export default function SortPanel({ sortBy, setSortBy, direction, setDirection }) {
  const desc = direction === "desc";
  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
      <Select
        size="small"
        value={sortBy}
        displayEmpty
        onChange={(e) => setSortBy(e.target.value)}
        inputProps={{ "aria-label": "Sort by" }}
        sx={{ minWidth: 190 }}
      >
        {OPTIONS.map(([value, label]) => (
          <MenuItem key={value} value={value}>
            {label}
          </MenuItem>
        ))}
      </Select>

      <Tooltip title={desc ? "Descending (click for ascending)" : "Ascending (click for descending)"}>
        {/* span: a disabled button can't hold a tooltip */}
        <span>
          <IconButton
            onClick={() => setDirection(desc ? "asc" : "desc")}
            disabled={!sortBy}
            aria-label={desc ? "Sort descending" : "Sort ascending"}
          >
            {desc ? <ArrowDownwardIcon /> : <ArrowUpwardIcon />}
          </IconButton>
        </span>
      </Tooltip>
    </Box>
  );
}
