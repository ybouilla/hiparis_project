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
  BarChart,
  Legend,
  Bar,
  Customized
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
  ListItemText, 

} from "@mui/material";
import MenuIcon from "@mui/icons-material/Menu";
import axios from 'axios';
import qs from 'qs';
import { Link, } from "react-router-dom";
import CustomTooltip from "./CustomTooltip";
import MovieScatterChart from "./MovieScatterChart";
import { ResponsiveBoxPlot } from "@nivo/boxplot";
import BoxPlot from "./BoxPlot";
import BoxplotEcharts from "./BoxplotEcharts";
import languages from "./languages.json";
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

const test_stats = {
  "message": "ok",
  "stats_countries": {
    "ar": 2,
    "bn": 1,
    "ca": 1,
    "cn": 109,
    "cs": 4,
    "da": 28,
    "de": 82,
    "el": 5,
    "en": 7569,
    "es": 339,
    "et": 1,
    "eu": 1,
    "fa": 3,
    "fi": 5,
    "fr": 292,
    "he": 2,
    "hi": 26,
    "hu": 3,
    "id": 15,
    "is": 2,
    "it": 123,
    "ja": 645,
    "ko": 170,
    "la": 1,
    "lv": 1,
    "ml": 1,
    "ms": 1,
    "nb": 1,
    "nl": 21,
    "no": 26,
    "pl": 17,
    "pt": 37,
    "ro": 2,
    "ru": 83,
    "sr": 5,
    "sv": 23,
    "ta": 2,
    "te": 6,
    "th": 17,
    "tl": 8,
    "tr": 15,
    "uk": 2,
    "zh": 129
  },
  "stats_genre": {
    "Action": 99,
    "Adventure": 9,
    "Animation": 33,
    "Comedy": 403,
    "Crime": 12,
    "Documentary": 139,
    "Drama": 466,
    "Family": 6,
    "Fantasy": 2,
    "History": 2,
    "Horror": 238,
    "Music": 6,
    "Mystery": 1,
    "Romance": 32,
    "Science Fiction": 25,
    "TV Movie": 0,
    "Thriller": 105,
    "War": 4,
    "Western": 32
  },
  "stats_pop": {
    "max": 5083,
    "min": 13,
    "q1": 16.12825,
    "q2": 21.195,
    "q3": 35.179249999999996
  },
  "stats_vote_avg": {
    "max": 10,
    "min": 0,
    "q1": 5.9,
    "q2": 6.5,
    "q3": 7.1
  },
  "stats_vote_count": {
    "max": 31077,
    "min": 0,
    "q1": 146.0,
    "q2": 444.0,
    "q3": 1376.0
  }
}
// constants
const miniWidth = 72;
const drawerWidth = 220;
const exBoxplotStats = {'min': 0,
    'q1': 1,
    'q2': 2,
    'q3': 3,
    'max': 4
}

function MovieGraph() {

  const min_date = 1940;
   const [movies2, setMovies2] = useState([] );
   const [yearRange2, setYearRange2] = useState([1900, 2026]);
   const [totalMovies2, setTotalMovies2] = useState(500); // nb of points displayed for graph
   const [stats, setStats] = useState({
    'Popularity': exBoxplotStats,
    'Vote_Count': exBoxplotStats,
    'Vote_Average': exBoxplotStats
   })

   const [statsGenreLang, setStatsGenreLang] = useState({"Genre": [], "Language": []}) 
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
  const [axes, setAxes] = useState(null);

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
        const [moviesResponse, statsResponse] = await Promise.all([
        await axios.get('/allmovies',  {
          
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
        }),
        
        axios.get("/statistics", {
          params: {
                       
                  "dates": yearRange2,

                },
          headers: {
            // No need to set 'Content-Type', axios will do it for us
          },
           paramsSerializer: (params) =>
            qs.stringify(params, { arrayFormat: "repeat" })
    
        }),
         ]);
        console.log('got response', moviesResponse)

        setMovies2(Array.isArray(moviesResponse.data.movies)
                  ? moviesResponse.data.movies
                  : Array.isArray(moviesResponse.data)
                  ? moviesResponse.data
                  : [])
        setTotalMovies2(moviesResponse.data.total_movies);
        //setMinDate(request.data.min_date)
        
        setMinDate2(moviesResponse.data.min_date)
        setMaxVal(moviesResponse.data.max_val)

        // stats
        setStats({"Popularity": statsResponse.data.stats_pop,
          "Vote_Count": statsResponse.data.stats_vote_count,
          "Vote_Average": statsResponse.data.stats_vote_avg}
        )
          const genreData = Object.entries(statsResponse.data.stats_genre).map(([genre, count]) => ({
        genre,
        count,
      }));

      const LanguageData= Object.entries(statsResponse.data.stats_countries).map(([country, count]) => ({
            country,
            count,
          })).filter((item) => item.count>5);

        setStatsGenreLang({"Genre": genreData,
          "Language": LanguageData
        });

        
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
  

  const genreData = Object.entries(test_stats.stats_genre).map(([genre, count]) => ({
        genre,
        count,
      }));

  const LanguageData= Object.entries(test_stats.stats_countries).map(([country, count]) => ({
        country,
        count,
      })).filter((item) => item.count>5);
console.log("genredata2", genreData)
  const FlagTick = ({ x, y, payload }) => {
        const code = payload.value.toLowerCase();
        const code2 = Object.fromEntries(languages.map(lang => [lang.code, lang.country]));
        const code3 = (code2[code] ?? code).toLowerCase();

        return (
          <g transform={`translate(${x},${y})`}>
            <image
              href={`https://flagcdn.com/w40/${code3}.png`}
              x={-10}
              y={-10}
              width={20}
              height={15}
            />
            <text y={15} textAnchor="middle" fontSize={10}>
              {payload.value}
            </text>
          </g>
        );
      };

  // trigger collectMovie
    useEffect(() => {
  
        collectMovies();
  
      }, [ yearRange2]);

  return (
    <Box sx={{ display: "flex", overflow: "hidden", height: "100vh",}}>

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
          overflow: "hidden",
          height: "100vh",   
          display: "flex",
          flexDirection: "column",
        }}
      >

        <Toolbar />
        <Card
          sx={{
            borderRadius: 3,
            flex: 1,
            display: "flex",
            flexDirection: "column",
            overflow:"hidden",
            minHeight:0
          }}
        >
          <CardContent sx={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
            <Typography variant="h6">
              <strong>🎬 Movie Popularity Over Time </strong>
            </Typography>



        <Box style={{  display: "flex", flexDirection: "column", gap: 4 }}>
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
          <Box sx={{ height: 400, width: "100%" }}>
            <Typography variant="h6">
              <strong>📦 Distribution Summary</strong>
            </Typography>

            {/* <ResponsiveBoxPlot
                  data={boxData}
                  margin={{ top: 20, right: 30, bottom: 50, left: 60 }}
                  minValue={1000}
                  maxValue="auto"
                  padding={0.3}
                  enableGridX
                  axisBottom={{
                    tickRotation: -45,
                  }}
                /> */}
              {/* <BoxPlot data={chartDataPop} stats={test_stats.stats_pop}/> */}
              <Box
                sx={{
                  display: "grid",
                  gap: 3,
                  width: "100%",
                  overflow: "hidden" ,

                gridTemplateColumns: {
                  xs: "1fr",
                  sm: "1fr",
                  md: "repeat(3, 1fr)",
                },
                }}
              >
                <Box sx={{  minHeight: 350 }}>
                  <BoxplotEcharts title={"Popularity"} stats={stats.Popularity} isLog={true}/>
                </Box>
                <Box sx={{  minHeight: 350 }}>
                  <BoxplotEcharts title={"Vote Count"} stats={stats.Vote_Count}
                  isLog={true}/>
                </Box>
                <Box sx={{  minHeight: 350 }}>
                  <BoxplotEcharts title={"Vote Average"} stats={stats.Vote_Average}
                  isLog={false}/>
                </Box>
              </Box>

              <Box
                sx={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 4,
                  width: "100%",
                }}
              >
              <Box sx={{ height: 450, width: "100%" }}>
                  <Typography variant="h6">
                    <strong>📦 Number of movies per genre</strong>
                  </Typography>

                  <ResponsiveContainer width="100%" height={400}>
                        <BarChart data={statsGenreLang.Genre?? []}
                        margin={{
                          
                              bottom: 60,
                             
                            }}
                        >
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="genre" 
                          angle={-45}
                          textAnchor="end"
                          interval={0} />
                          <YAxis >
                           <Label
                                value="Counts "
                                position="middle"
                                dx={-20}
                                angle={-90}
                              />
                            </YAxis>
                          <Tooltip />
                          <Bar dataKey="count" fill="#1976d2" />
                        </BarChart>
                      </ResponsiveContainer>
                
              </Box>

                  <Typography variant="h6">
                    <strong>📦 Number of movies per Original Languages</strong>
                  </Typography>
                <Box sx={{
                    display: "flex",
                    gap: 2,
                    width: "100%",
                  }}>
                  <ResponsiveContainer width="100%" height={400}>
                        <BarChart data={statsGenreLang.Language ?? []}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="country" 
                          tick={<FlagTick />}
                          angle={-45}
                          textAnchor="end"
                          interval={0} />
                          <YAxis scale="log"
                           domain={[1, 'auto']} >
                           <Label
                                value="Counts (logscale)"
                                position="middle"
                                dx={-20}
                                angle={-90}
                              />
                            </YAxis>
                          <Tooltip />
                          <Legend />
                          <Bar dataKey="count" fill="#1976d2" />
                        </BarChart>
                  </ResponsiveContainer>
                </Box>
            </Box>
          </Box>

        </Box>


          </CardContent>
        </Card>
      </Box>
    </Box>
  );

}

export default MovieGraph;