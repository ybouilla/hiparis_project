import { Box, Chip, Rating, Slider, Tooltip, Typography } from "@mui/material";
import LanguageSelector from "./LanguageSelector";

function Section({ title, hint, children }) {
  return (
    <Box sx={{ py: 1.75, borderTop: 1, borderColor: "divider" }}>
      <Tooltip title={hint ?? ""} placement="right">
        <Typography variant="overline" color="text.secondary" sx={{ display: "block", lineHeight: 1.6, mb: 0.75 }}>
          {title}
        </Typography>
      </Tooltip>
      {children}
    </Box>
  );
}

/** Filters only (the search field lives in the top bar, sorting in the results toolbar). */
export default function FilterPanel({
  toggleGenre,
  selectedGenres,
  allGenres,
  stars,
  setStars,
  language,
  setLanguage,
  minDate,
  yearRange,
  setYearRange,
}) {
  return (
    <Box sx={{ px: 2, pb: 2 }}>
      <Section title="Genres" hint="Displays movies with at least one of the following">
        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.75 }}>
          {Array.isArray(allGenres) &&
            allGenres.map((g) => {
              const selected = selectedGenres.includes(g);
              return (
                <Tooltip key={g} title={selected ? "Remove genre " + g : "Add genre " + g} placement="top">
                  <Chip
                    label={g}
                    size="small"
                    clickable
                    color={selected ? "primary" : "default"}
                    variant={selected ? "filled" : "outlined"}
                    onClick={() => toggleGenre(g)}
                  />
                </Tooltip>
              );
            })}
        </Box>
      </Section>

      <Section title="Original language" hint="Filter by original language">
        <Box sx={{ "& .MuiFormControl-root": { width: "100%" } }}>
          <LanguageSelector value={language} onChange={setLanguage} />
        </Box>
      </Section>

      <Section title="Minimum rating" hint="1 star = 2 score points">
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <Rating value={stars} precision={0.5} onChange={(_, s) => setStars(s ?? 0)} />
          <Typography variant="body2" color="text.secondary">
            {stars > 0 ? `≥ ${stars * 2} / 10` : "Any"}
          </Typography>
        </Box>
      </Section>

      <Section title="Release years" hint="Year of release">
        <Slider
          value={yearRange}
          min={minDate}
          max={new Date().getFullYear()}
          step={1}
          valueLabelDisplay="auto"
          disableSwap
          onChange={(_, value) => setYearRange(value)}
          sx={{ "& .MuiSlider-valueLabel": { zIndex: 9999 } }}
        />
        <Typography variant="caption" color="text.secondary">
          {yearRange[0]} – {yearRange[1]}
        </Typography>
      </Section>
    </Box>
  );
}
