import React, { useState, useEffect, useMemo } from "react";
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
  Label,
} from "recharts";

import {
  Box,
  AppBar,
  Toolbar,
  Typography,
  Drawer,
  TextField,
  Checkbox,
  Card, 
  CardContent,
  FormControlLabel,
  Button,
  Stack,
  Chip,
  Rating,
  Paper,
  Divider,
  Slider,
  IconButton, 
  ListItemButton,
  List,
  ListItem,
  ListItemText
} from "@mui/material";
import axios from 'axios';
import qs from 'qs';
import { Link, } from "react-router-dom";
import CustomTooltip from "./CustomTooltip";


const movies = [
  {
    "Release_Date": "2021-12-15",
    "Title": "Spider-Man: No Way Home",
    "Overview": "Peter Parker is unmasked and no longer able to separate his normal life from the high-stakes of being a super-hero. When he asks for help from Doctor Strange the stakes become even more dangerous, forcing him to discover what it truly means to be Spider-Man.",
    "Popularity": 5083.954,
    "Vote_Count": 8940,
    "Vote_Average": 8.3,
    "Original_Language": "en",
    "Genre": "Action, Adventure, Science Fiction",
    "Poster_Url": "https://image.tmdb.org/t/p/original/1g0dhYtq4irTY1GPXvft6k4YLjm.jpg"
  },
  {
    "Release_Date": "2022-03-01",
    "Title": "The Batman",
    "Overview": "In his second year of fighting crime, Batman uncovers corruption in Gotham City that connects to his own family while facing a serial killer known as the Riddler.",
    "Popularity": 3827.658,
    "Vote_Count": 1151,
    "Vote_Average": 8.1,
    "Original_Language": "en",
    "Genre": "Crime, Mystery, Thriller",
    "Poster_Url": "https://image.tmdb.org/t/p/original/74xTEgt7R36Fpooo50r9T25onhq.jpg"
  },
  {
    "Release_Date": "2022-02-25",
    "Title": "No Exit",
    "Overview": "Stranded at a rest stop in the mountains during a blizzard, a recovering addict discovers a kidnapped child hidden in a car belonging to one of the people inside the building which sets her on a terrifying struggle to identify who among them is the kidnapper.",
    "Popularity": 2618.087,
    "Vote_Count": 122,
    "Vote_Average": 6.3,
    "Original_Language": "en",
    "Genre": "Thriller",
    "Poster_Url": "https://image.tmdb.org/t/p/original/vDHsLnOWKlPGmWs0kGfuhNF4w5l.jpg"
  }
]

const drawerWidth = 220;
function MovieGraph() {
  const min_date = 1940;
   const [movies2, setMovies2] = useState([] );
   const [yearRange2, setYearRange2] = useState([1900, 2026]);
   const [totalMovies2, setTotalMovies2] = useState(500); // 
   const [minDate2, setMinDate2] = useState(min_date)
  // const data = movies2.map(m => ({
  //   x: new Date(m.Release_Date).getTime(),
  //   y: m.Popularity,
  //   title: m.Title,
  //   Poster_Url: m.Poster_Url
  // }));

//   function downsample(data, step = 10) {
//   return data.filter((_, i) => i % step === 0);
// }
  

   // Getting movies
  const collectMovies = async (e) => {
      //e.preventDefault();
      try {

        const request = await axios.get('/allmovies',  {
          
          params: {
                   "start": 0,
                   "end": 500,      
                  "dates": yearRange2,

                },
          headers: {
            // No need to set 'Content-Type', axios will do it for us
          },
           paramsSerializer: (params) =>
            qs.stringify(params, { arrayFormat: "repeat" })
        });
        console.log('got response', request)

        setMovies2(Array.isArray(request.data.movies)
                  ? request.data.movies
                  : Array.isArray(request.data)
                  ? request.data
                  : [])
        setTotalMovies2(request.data.total_movies);
        //setMinDate(request.data.min_date)
        
        setMinDate2(request.data.min_date)
      } catch (error) {
        console.error('Fetching error:', error);

      } 
  };
  const chartData = useMemo(() => {
    return movies2.map(m => ({
      x: new Date(m.Release_Date).getTime(),
      y: m.Popularity,
      title: m.Title,
      Poster_Url: m.Poster_Url
    }));
  }, [movies2]);
  
  // trigger collectMovie
    useEffect(() => {
  
        collectMovies();
  
      }, [ yearRange2]);

  return (
    <Box sx={{ display: "flex" }}>
    {/* Top bar */}
      <AppBar position="fixed">
        <Toolbar>
          <Typography variant="h6" sx={{ flexGrow: 1 }}>
            🎬 Movie Explorer
          </Typography>
          <Button color="inherit" component={Link} to="/">
            <strong>Movie</strong>
          </Button>
          <Button color="inherit" component={Link} to="/statistics">
            <strong>Movies Statistics</strong>
          </Button>
        </Toolbar>
      </AppBar>

    {/**side bar */}
    <Drawer
      variant="permanent"
      sx={{
        width: drawerWidth,
        flexShrink: 0,
        "& .MuiDrawer-paper": {
          width: drawerWidth,
          boxSizing: "border-box",
        },
      }}
    >
      
      <ListItem disablePadding>
        <Typography variant="h6" sx={{ flexGrow: 1 }}>
            🎬 Filters
          </Typography>
      </ListItem>
      <ListItem disablePadding>
        <ListItemButton>
          <ListItemText primary="🔥 Display popularity" />
        </ListItemButton>
      </ListItem>

      <ListItem disablePadding>
        <ListItemButton>
          <ListItemText primary="⭐ Display vote_count" />
        </ListItemButton>
      </ListItem>
      <ListItem disablePadding>
        <ListItemButton>
          <ListItemText primary="⭐ Display vote_average" />
        </ListItemButton>
      </ListItem>
      {/* Year range */}
      <Box sx={{ mt: 3,
        px: 3,        // horizontal padding
        width: "100%",
        boxSizing: "border-box",
      }}>
        
          <Typography gutterBottom><strong>Release Years</strong></Typography>
          <Slider
            value={yearRange2}
            min={minDate2}
            max={2025}
            step={1}
            valueLabelDisplay="auto"
            
            onChange={(_, value) => setYearRange2(value)}
          />
        
      </Box>
    </Drawer>
    <Card
      sx={{
        width: "100%",
        height: "calc(100vh - 120px)", 
        borderRadius: 3,
        display: "flex",
        flexDirection: "column",
      }}
    >
      <CardContent>
        <CardContent>
        <Typography variant="h6">
          🎬 Movie Popularity Over Time
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Relationship between release date and popularity score
        </Typography>
      </CardContent>
        <Typography variant="h6" sx={{ mb: 2 }}>
          🎯 Popularity vs Release Date
        </Typography>

        <div style={{ width: "100%", height: 450 }}>
          <ResponsiveContainer>
            <ScatterChart  margin={{ top: 20, right: 20, bottom: 60, left: 40 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />

              <XAxis
                dataKey="x"
                type="number"
                domain={['dataMin', 'dataMax']}
                tickFormatter={(v) => new Date(v).getFullYear()}
              >
                <Label
                  value="Release Year"
                  position="bottom"
                  offset={20}
                />
            </XAxis>

            <YAxis dataKey="y" type="number">
              <Label
                value="Popularity Score"
                angle={-90}
                position="insideLeft"
              />
            </YAxis>

              <Tooltip
                // contentStyle={{
                //   backgroundColor: "#0f172a",
                //   border: "1px solid #334155",
                // }}
                content={<CustomTooltip />} 
              />

              <Scatter data={chartData} fill="#38bdf8" />
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
   
    </Box>
  );
}

export default MovieGraph;