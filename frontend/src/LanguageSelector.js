import React from "react";
import { FormControl, InputLabel, Select, MenuItem, Box } from "@mui/material";
import Flag from "react-world-flags";
import languages from "./languages.json";



const LANGUAGES = [{
    code: "",
    label: "No language",
    country: "",
  }, ...languages];  // update with a "no language" state (disable language from filtering)

export default function LanguageSelector({ value, onChange }) {
  return (
    <FormControl size="small" sx={{ minWidth: 160 }}>
      <InputLabel>Language</InputLabel>

      <Select
        value={value}
        label="Language"
        onChange={(e) => onChange(e.target.value)}
      >
        {LANGUAGES.map((lang) => (
          <MenuItem key={lang.code} value={lang.code}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              {lang.country && (
                <Flag code={lang.country} style={{ width: 20, height: 14 }} />
              )}
              <span>{lang.country}</span>
            </Box>
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  );
}