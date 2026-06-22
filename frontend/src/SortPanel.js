import React, { useState } from "react";
import { Box,
   Radio,
   RadioGroup,
   FormControlLabel,
   FormControl,
   FormLabel,
   FormGroup,
   Checkbox,
   Paper,
   Switch,
   Stack,
   ToggleButton,
   ToggleButtonGroup,
  Tooltip, } from "@mui/material";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";

import CheckBoxOutlineBlankIcon from "@mui/icons-material/CheckBoxOutlineBlank";
import CheckBoxIcon from "@mui/icons-material/CheckBox";


export default function SortPanel({sortBy,
   setSortBy, direction, setDirection, sidebarRowSx}){
  
  const handleChange = (currVal) => { 
    setSortBy((prev) => (prev === currVal ? "" : currVal));
   };
   
return (
   
<Paper
  elevation={3}
  sx={{
    p: 2,
    maxWidth: 400,
    mx: "auto",
    borderRadius: 2,
  }}
>
  <FormControl>
    <RadioGroup
      row
      //value={sortBy}
      //onChange={handleChange}
    >
      <Tooltip title="Sort with popularity">
      <FormControlLabel
        value="popularity"
        control={<Radio
          checked={sortBy === "popularity"}
          onClick={() => handleChange("popularity")}
        />
        }
        label="Sort by Popularity 🔥"
      />
      </Tooltip>
      <FormControlLabel
        value="vote_count"
        control={<Radio
          checked={sortBy === "vote_count"}
          onClick={() => handleChange("vote_count")}
        />}
        label="Sort by Vote Count ⭐"
      />
      <FormControlLabel
        value="vote_average"
        control={<Radio
          checked={sortBy === "vote_average"}
          onClick={() => handleChange("vote_average")}
        />}
        label="Sort by Vote Average ⭐"
      />
      <FormControlLabel
        value="release_date"
        control={<Radio
          checked={sortBy === "release_date"}
          onClick={() => handleChange("release_date")}
        />}
        label="Sort by release date 📅"
      />
    </RadioGroup>
  </FormControl>
  <Box sx={sidebarRowSx}>
  <ToggleButtonGroup
    value={direction}
    exclusive
    onChange={(event, value) => {
      if (value !== null) setDirection(value);
    }}
  >
      <Tooltip title=" sort by ascending order">
        <ToggleButton value="asc">
          asc
          <ArrowUpwardIcon />
        </ToggleButton>
        
      </Tooltip>
      <Tooltip title="sort by descending order">
        <ToggleButton value="desc">
          <ArrowDownwardIcon />
          desc
        </ToggleButton>
      </Tooltip>
    </ToggleButtonGroup>
    </Box>
</Paper>
  );
}