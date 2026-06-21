import React, { useMemo, useState, useEffect } from "react";
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
} from "@mui/material";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import axios from 'axios';
import qs from 'qs';
//import moviesData from "./movies.json";
import MovieCard from "./MovieCard";
import LanguageSelector from "./LanguageSelector";

const moviesData = [
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
const PAGE_SIZE = 20;

export default function App() {
  const df = moviesData;

  // react states
  const [language, setLanguage] = useState("");
  const [allGenres, setAllGenres] = useState([]);
  const [search, setSearch] = useState("");
  // const [allGenres, setAllGenres] = useState([]);
  const [selectedGenres, setSelectedGenres] = useState([]);
  const [page, setPage] = useState(1);
  const [movies, setMovies] = useState([] ); //{"message": "ok", "movies":""});
  const [totalMovies, setTotalMovies] = useState(PAGE_SIZE);
  const [openSideBar, setOpenSideBar] = useState(true);
 
  const genres = useMemo(() => {
    const set = new Set();
    console.log("movies =", movies);
    console.log("lang memo", language)
    console.log("is array?", Array.isArray(movies));
    if (!Array.isArray(movies)) return [];
    movies.forEach((m) => {
      m.Genre?.split(",").forEach((g) => set.add(g.trim()));
    });
    return [...set].sort();
  }, [movies]);

  const toggleGenre = (genre) => {
    setPage(1);
    setSelectedGenres((prev) =>
      prev.includes(genre)
        ? prev.filter((g) => g !== genre)
        : [...prev, genre]
    );
  };
  // searching for movies
  const searchMovies = async (e) => {
      //e.preventDefault();
      
      try {
        
        const request = await axios.get('/movies',  {
          
          params: {"title": search.toLowerCase(), "start": start, "end": Math.min(start + PAGE_SIZE, totalMovies)},
          headers: {
            // No need to set 'Content-Type', axios will do it for us
          },
        });
        console.log('got response', request)
        setMovies(request.data.movies)
      } catch (error) {
        console.error('Fetching error:', error);
        //setUploadMessage('Error uploading file');
      } finally {
        // setUploading(false);
        // setDateValue(null)
      }
  };

  const filtered = useMemo(() => {
    let data = [...movies];

    // if (search) {
    //   searchMovies()
      // data = data.filter((m) =>
      //   m.Title.toLowerCase().includes(search.toLowerCase())
      // );
    // }

    // if (selectedGenres.length) {
    //   data = data.filter((m) =>
    //     selectedGenres.some((g) => m.Genre?.includes(g))
    //   );
    // }
    console.log(movies[0]);
    console.log(
  "search:",
  search,
  "first title:",
  movies[0]?.Title
);
    
    return data; //.sort((a, b) => b.Popularity - a.Popularity);
  }, [movies, search, selectedGenres]);

  const totalPages = Math.max(1, Math.ceil(totalMovies / PAGE_SIZE));

  const start = (page - 1) * PAGE_SIZE;
  const pageMovies = filtered //.slice(start, start + PAGE_SIZE);

  const goPrev = () => setPage((p) => { return Math.max(1, p - 1);
  });
  const goNext = () => setPage((p) => Math.min(totalPages, p + 1)); 


   // Getting movies
  const collectMovies = async (e) => {
      //e.preventDefault();
      
      try {
        console.log("debug lang", language)
        const request = await axios.get('/allmovies',  {
          
          params: {"start": start,
                   "end": Math.min(start + PAGE_SIZE, totalMovies),
                   "title": search,
                  "genre": selectedGenres,
                  "lang": language
                },
          headers: {
            // No need to set 'Content-Type', axios will do it for us
          },
           paramsSerializer: (params) =>
            qs.stringify(params, { arrayFormat: "repeat" })
        });
        console.log('got response', request)

        setMovies(request.data.movies)
        setTotalMovies(request.data.total_movies);
        setAllGenres(request.data.all_genres);

      } catch (error) {
        console.error('Fetching error:', error);

      } finally {

      }
  };
  

  // trigger collectMovie
  useEffect(() => {
       

      collectMovies();
      console.log("page changed", page);
  console.log("start", (page - 1) * PAGE_SIZE);
    }, [page, search, selectedGenres, language]);

  // trigger search for movies
//   useEffect(() => {
//   if (!search) return;

//   const timer = setTimeout(() => {
//     searchMovies();
//   }, 300);

//   return () => clearTimeout(timer);
// }, [search]);
  return (
    <Box sx={{ display: "flex" }}>
      {/* Top bar */}
      <AppBar position="fixed">
        <Toolbar>
          <Typography variant="h6">🎬 Movie Explorer</Typography>
        </Toolbar>
      </AppBar>

      {/* Sidebar */}
      <Drawer
          variant="permanent"
          sx={{
            width: openSideBar ? 280 : 72,
            flexShrink: 0,
            transition: "width 0.3s",
            "& .MuiDrawer-paper": {
              width: openSideBar ? 280 : 72,
              p: openSideBar ? 2 : 1,
              mt: 8,
              overflowX: "hidden",
              transition: "width 0.3s",
            },
          }}
        >
        <Button onClick={() => setOpenSideBar((prev) => !prev)}>
          {openSideBar ? "Collapse": "Display"}
        </Button>
        <TextField
          label="Search title"
          variant="outlined"
          sx={{
          "& legend": { width: 0 }
          
          }}
          InputLabelProps={{
              shrink: true,
            }}
          onChange={(e) => setSearch(e.target.value)}
        />

        <Typography variant="h6" sx={{ mt: 2 }}>
          Genres
        </Typography>


        <Box
          sx={{
            display: "flex",
            flexWrap: "wrap",
            gap: 1,
            maxHeight: "70vh",
            overflowY: "auto",
          }}
        >
          {allGenres.map((g) => {
            const selected = selectedGenres.includes(g);

            return (
              <Chip
                key={g}
                label={g}
                clickable
                color={selected ? "primary" : "default"}
                variant={selected ? "filled" : "outlined"}
                onClick={() => toggleGenre(g)}
                sx={{
                  borderRadius: "16px",
                  fontWeight: 500,
                }}
              />
            );
          })}
        </Box>
        <Typography variant="h6" sx={{ mt: 2 }}>
          Original Languages
        </Typography>
        <LanguageSelector
          value={language}
          onChange={setLanguage}
        />
      </Drawer>

      {/* Main content */}
      
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          mt: 8,
          px: { xs: "56px", sm: "64px" },
          display: "flex",
          justifyContent: "center",
        }}

        >
  <Box sx={{ width: "100%", maxWidth: 900 }}>
    
    {/* Header */}
    <Box sx={{ mb: 3 }}>
      <Typography variant="h6" fontWeight={600}>
        Movie results
      </Typography>

      <Typography variant="body2" color="text.secondary">
        <strong>{totalMovies}</strong> movies found · showing{" "}
        <strong>
          {start + 1}–{Math.min(start + PAGE_SIZE, filtered.length)}
        </strong>
      </Typography>
    </Box>

    {/* Pagination (head of page) */}
    <Box
      sx={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        gap: 2,
        py: 2,
      }}
    >
      <Button onClick={goPrev} disabled={page === 1} variant="outlined">
        ⬅️ Previous
      </Button>

      <Typography sx={{ minWidth: 120, textAlign: "center" }}>
        Page {page} / {totalPages}
      </Typography>

      <Button onClick={goNext} disabled={page === totalPages} variant="outlined">
        Next ➡️
      </Button>
    </Box>
    {/* Movies */}
    <Stack spacing={2} sx={{ mb: 3 }}>
      {pageMovies.map((movie, i) => (
        <MovieCard key={i} movie={movie} />
      ))}
    </Stack>

    {/* Pagination foot of page */}
    <Box
      sx={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        gap: 2,
        py: 2,
      }}
    >
      <Button onClick={goPrev} disabled={page === 1} variant="outlined">
        ⬅️ Previous
      </Button>

      <Typography sx={{ minWidth: 120, textAlign: "center" }}>
        Page {page} / {totalPages}
      </Typography>

      <Button onClick={goNext} disabled={page === totalPages} variant="outlined">
        Next ➡️
      </Button>
    </Box>

  </Box>
</Box>
    </Box>
  );
}