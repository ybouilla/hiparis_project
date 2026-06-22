import {
  Box,
  AppBar,
  Toolbar,
  Typography,
  Drawer,
  TextField,
  Checkbox,
  FormControlLabel,
  Button,
  Stack,
  Chip,
  Rating,
  Paper,
  Divider,
  Slider,
  IconButton, 
  Tooltip
} from "@mui/material";
import MenuOpenIcon from "@mui/icons-material/MenuOpen";

import MenuIcon from "@mui/icons-material/Menu";
import LanguageSelector from "./LanguageSelector";

export default function FilterPanel({
    setSearch,
    toggleGenre,
    selectedGenres,
    allGenres,
    stars,
    setStars,
    language,
    setLanguage,
    minDate,
    yearRange,
    setYearRange
}){
    return (
<Box 
 
>
<Divider />


  <Box
     sx={{ px: 2, pb: 2 }}
  >
    {/* Search */}
    
    <TextField
      fullWidth
      label="Search title"
      onChange={(e) => setSearch(e.target.value)}
    />

    {/* Genres */}
    <Typography variant="h6" sx={{ mt: 2 }}>
      Genres
    </Typography>

    
    <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
      {Array.isArray(allGenres) &&
        allGenres.map((g) => {
          const selected = selectedGenres.includes(g);
          //robustifying
          return (
            <Tooltip
              key={g}
              title={selected ? "Remove genre " + g : "Add genre " + g}
              placement="top"
            >
              <Chip
                key={g}
                label={g}
                clickable
                color={selected ? "primary" : "default"}
                variant={selected ? "filled" : "outlined"}
                onClick={() => toggleGenre(g)}
              />
            </Tooltip>
          );
        })}
    </Box>

    {/* Language */}
    
    <Tooltip title="Filter by original language"
      placement="right"
    > 
      <Typography sx={{ mt: 2 }}>
        <strong>Original Languages</strong>
      </Typography>
      <LanguageSelector value={language} onChange={setLanguage} />
    </Tooltip>
    {/* Rating */}
    <Box sx={{ mt: 2 }}>
      <Tooltip title="Filter using stars (1 star = 2 score points)"
        placement="right"
      > 
      <Typography><strong>Movie rate: {stars} stars </strong></Typography>
      
      <Rating
        value={stars}
        precision={0.5}
        onChange={(_, s) => setStars(s)}
      />
      </Tooltip>
    </Box>

    {/* Year range */}
    <Box sx={{ mt: 2 }}>
      <Tooltip title="Year of release"
        placement="right"
      > 
        <Typography gutterBottom><strong>Release Years</strong></Typography>
        <Slider
          value={yearRange}
          min={minDate}
          max={new Date().getFullYear()}
          step={1}
          valueLabelDisplay="auto"
          disableSwap
          onChange={(_, value) => setYearRange(value)}
          sx={{
                "& .MuiSlider-valueLabel": {
                zIndex: 9999,
                },
                }}
        />
      </Tooltip>
    </Box>
  </Box>
    </Box>
);
}