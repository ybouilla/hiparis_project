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
import MenuIcon from "@mui/icons-material/Menu";
import axios from 'axios';
import qs from 'qs';
import { Link, } from "react-router-dom";
import CustomTooltip from "./CustomTooltip";
import MovieScatterChart from "./MovieScatterChart";
//import { isRenderableText } from "recharts/types/component/Text";

// for testing
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

// constants
const miniWidth = 72;
const drawerWidth = 220;

function MovieGraph() {

  const min_date = 1940;
   const [movies2, setMovies2] = useState([] );
   const [yearRange2, setYearRange2] = useState([1900, 2026]);
   const [totalMovies2, setTotalMovies2] = useState(500); // nb of points displayed for graph
   const [minDate2, setMinDate2] = useState(min_date)
   const [open, setOpen] = useState(true); //collapse side bar
   const [points, setPoints] = useState(
    {
      Popularity: true,
      Vote_Count: false,
      Vote_Average: false
    }
  )
  const isReqNormalized = () => Object.values(points).filter(Boolean).length > 1;
  const [maxVal, setMaxVal] = useState({
      Popularity: 1.,
      Vote_Count: 1.,
      Vote_Average: 1.})

  // for collapsing/uncollapsing side bar
  const toggleDrawer = () => setOpen((prev) => !prev);
  // for filters buttons
  const togglePointsChart = (key) => {
  setPoints((prev) => ({
    ...prev,
    [key]: !prev[key],
  }));
};

// builder method for chart data: normalize values using min-max normalization,
// if normalization is required
const BuildChartData = (movies2, isReqNormalized, maxVal, label) => {
  //const maxVal = Math.max(...movies.map(m => m[label]));

  return movies2.map(m => ({
    x: new Date(m.Release_Date).getTime(),
    y: isReqNormalized() ? m[label] / maxVal[label] : m[label],
    title: m.Title,
    Poster_Url: m.Poster_Url,
  }));
};

const dislayYAxis = (points, isReqNormalized)=> {
  
  let res = Object.entries(points)
  .filter(([k, v]) => v )
  .map(([k]) => k)
  .join("+");
  res = res  + (isReqNormalized()?" (Normalized)":"");
  return res;
}
 

   // Getting movies from API
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
        setMaxVal(request.data.max_val)

      } catch (error) {
        console.error('Fetching error:', error);

      } 
  };

  // data to be displayed

  const chartDataPop = useMemo(() => {
    return BuildChartData(movies2, isReqNormalized, maxVal, "Popularity")
  }, [movies2, isReqNormalized, maxVal]);

  const chartDataVoteCount = useMemo(() => {
    
    return BuildChartData(movies2, isReqNormalized, maxVal, "Vote_Count")
  }, [movies2, isReqNormalized, maxVal]);
  
  const chartDataVoteAvg = useMemo(() => {
    return BuildChartData(movies2, isReqNormalized, maxVal, "Vote_Average")
  }, [movies2, isReqNormalized, maxVal]);
  
  // trigger collectMovie
    useEffect(() => {
  
        collectMovies();
  
      }, [ yearRange2]);

  return (
    <Box sx={{ display: "flex" }}>

      <AppBar
        position="fixed"
        sx={{
          zIndex: (theme) => theme.zIndex.drawer + 1, // ensures it's above drawer
        }}
      >
        <Toolbar>

          <IconButton color="inherit" onClick={toggleDrawer}>
            <MenuIcon /> 
          </IconButton>

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

      {/*  Side Drawer */}
      <Drawer
        variant="permanent"
        sx={{
          width: open ? drawerWidth : miniWidth,
          flexShrink: 0,
          whiteSpace: "nowrap",
          "& .MuiDrawer-paper": {
            width: open ? drawerWidth : miniWidth,
            overflowX: "hidden",
            transition: (theme) =>
              theme.transitions.create("width", {
                easing: theme.transitions.easing.sharp,
                duration: theme.transitions.duration.standard,
              }),
            boxSizing: "border-box",
          },
        }}
      >

        <Toolbar />

        {/* Drawer content */}
        <Box sx={{ p: 2 }}>
          <Typography variant="h6" gutterBottom>
            🎬 Filters
          </Typography>
          <ListItem disablePadding>
        <ListItemButton sx ={{ "&.Mui-selected": {
                backgroundColor: "#0664a2",
              }}}
          selected={points.Popularity === true}
          onClick={() => {togglePointsChart("Popularity")}}
          >
          <ListItemText primary="🔥 Display popularity" />
        </ListItemButton>
      </ListItem>

      <ListItem disablePadding>
        <ListItemButton
        sx ={{ "&.Mui-selected": {
                backgroundColor: "#0664a2",
              }}}
          selected={points.Vote_Count === true}
          onClick={() => {togglePointsChart("Vote_Count")}}>
          <ListItemText primary="⭐ Display vote_count" />
        </ListItemButton>
      </ListItem>
      <ListItem disablePadding>
        <ListItemButton
        sx ={{ "&.Mui-selected": {
                backgroundColor: "#0664a2",
              }}}
        selected={points.Vote_Average === true}
        onClick={() => {togglePointsChart("Vote_Average")}}>
          <ListItemText primary="⭐ Display vote_average" />
        </ListItemButton>
      </ListItem>
      {/* Year range */}
      
        
      <Box sx={{ mt: 3,
        px: 3,        // horizontal padding
        width: "100%",
        boxSizing: "border-box",
      }}>
          <Box>
          <Typography gutterBottom><strong>Release Years</strong></Typography>
          <Typography variant="caption" color="text.secondary">
            Filter movies by release year<br/>
            range
          </Typography>
          </Box>
          <Slider
            value={yearRange2}
            min={minDate2}
            max={2025}
            step={1}
            valueLabelDisplay="auto"
            
            onChange={(_, value) => setYearRange2(value)}
          />
       
      </Box>

          
          
        </Box>
      </Drawer>

      <Box
        component="main"
        sx={{
          flexGrow: 1,
          p: 3,
        }}
      >

        <Toolbar />
        <Card
          sx={{
            borderRadius: 3,
            height: "calc(100vh - 100px)",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <CardContent>
            <Typography variant="h6">
              🎬 Movie Popularity Over Time
            </Typography>

            <div style={{ width: "100%", height: 450 }}>

        <div style={{ width: "100%", height: 450 }}>
          <ResponsiveContainer width="100%" height={400}>
            <ScatterChart  margin={{ top: 20, right: 20, bottom: 60, left: 40 }}
            key={`${points.Popularity}-${points.Vote_Count}-${points.Vote_Average}`}
            >
              {/**scatterchart key arrg is here to remove any cache, so chart is dynamic */}
            {points.Popularity && <MovieScatterChart chartData={chartDataPop}
            color={"#e9310c"} yLabel={dislayYAxis(points, isReqNormalized)}/> }

            {points.Vote_Count && <MovieScatterChart chartData={chartDataVoteCount}
            color={"#cdd70f"} yLabel={dislayYAxis(points, isReqNormalized)}/>}

            {points.Vote_Average && <MovieScatterChart chartData={chartDataVoteAvg}
            color={"#0f37d7"} yLabel={dislayYAxis(points, isReqNormalized)}/>}
            </ScatterChart>
          </ResponsiveContainer>
        </div>
            </div>
          </CardContent>
        </Card>
      </Box>
    </Box>
  );

}

export default MovieGraph;