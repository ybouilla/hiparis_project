import React, { useMemo, useState, useEffect, useRef, useCallback } from "react";
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
} from "@mui/material";
import MenuOpenIcon from "@mui/icons-material/MenuOpen";
import Tooltip from "@mui/material/Tooltip";
import MenuIcon from "@mui/icons-material/Menu";

import axios from 'axios';
import qs from 'qs';
import { Link, } from "react-router-dom";
//import moviesData from "./movies.json";
import MovieCard from "./MovieCard";
import FilterPanel from "./FilterPanel";
import SortPanel from "./SortPanel";


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
const WINDOW_SIZE = 10;
const min_dates = 1900;
export default function App() {
  const df = moviesData;

  // react states
  const [language, setLanguage] = useState("");
  const [allGenres, setAllGenres] = useState([]);
  const [search, setSearch] = useState("");
  // const [allGenres, setAllGenres] = useState([]);
  const [selectedGenres, setSelectedGenres] = useState([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState([]);
  //const [movies, setMovies] = useState([] );
  const [totalMovies, setTotalMovies] = useState(PAGE_SIZE);
  const [openSideBar, setOpenSideBar] = useState(true);
  const [stars, setStars] = useState(0);  // for rating
  const [yearRange, setYearRange] = useState([1900, 2026]);
  const [minDate, setMinDate] = useState(min_dates)
  const [filterPanel, setFilterPanel] = useState(true);
  const [sortBy, setSortBy] = React.useState("");
  const [sortingDirection, setSortingDirection] = React.useState("desc");
  const [isLoadingPage, setIsLoadingPage] = useState(false); // loadingGuard
  const [hasMore, setHasMore] = useState(true);  // stop guard
  const [debouncedSearch, setDebouncedSearch] = useState(search); // avoid spamming search


  // use ref definitions
  const topRef = useRef(null);
  const loadMoreRef = useRef(null);
  const isLoadingPageRef = useRef(false);
  const hasMoreRef = useRef(true);
  const lastLoadedPageRef = useRef(1);
  const controllerRef = useRef(null);
  const observerCooldownRef = useRef(false);
  const containerRef = useRef(null);

  // memoization
  const movies = useMemo(() =>
  pages.flatMap(p => p.movies),
[pages]);
  const genres = useMemo(() => {
    const set = new Set();
    console.log("movies =", movies);
    console.log("lang memo", language)
    console.log("is array?", Array.isArray(movies));
  
    if (!Array.isArray(movies) || movies.length === 0 ) return [];
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



     // Getting movies
  const collectMovies = async (pageNumber, signal) => {
      //e.preventDefault();
      const start = (pageNumber - 1) * PAGE_SIZE;
      try {
        
        const request = await axios.get('/allmovies',  {
          
          params: {"start": start,
                   "end": start + PAGE_SIZE,
                   "title": search,
                  "genre": selectedGenres,
                  "lang": language,
                  "score": stars*2,
                  "dates": yearRange,
                  "order_by": sortBy,
                  "order_desc": sortingDirection,
                },
          headers: {
            // No need to set 'Content-Type', axios will do it for us
          },
          signal,
           paramsSerializer: (params) =>
            qs.stringify(params, { arrayFormat: "repeat" })
        });
        console.log('got response', request)

        // setMovies(Array.isArray(request.data.movies)
        //           ? request.data.movies
        //           : Array.isArray(request.data)
        //           ? request.data
        //           : [])
        setTotalMovies(request.data.total_movies);
        setAllGenres(request.data.all_genres);
        setMinDate(request.data.min_date)
        return request.data.movies ?? [];
      } catch (error) {
        if (axios.isCancel(error)) return [];
        console.error('Fetching error:', error);
        return []
      } finally {
        
      }
  };

  const loadPage = useCallback( async (pageNumber, signal) => {
    
    setIsLoadingPage(true);
    isLoadingPageRef.current = true;
    try{
      const newMovies = await collectMovies(pageNumber);

    if (!newMovies || newMovies.length === 0) {
      setHasMore(false);
      return; // IMPORTANT: do NOT add page
    }
    setPages((prev) => {
      const exists = prev.some((p) => p.page === pageNumber);
      if (exists) return prev;

      const updated = [...prev, { page: pageNumber, movies: newMovies }];
      lastLoadedPageRef.current = pageNumber;
      // keep only window



      return updated;
    });
    }finally{
      setIsLoadingPage(false);
      isLoadingPageRef.current = false;
    }
}, [collectMovies]);

  const filtered = useMemo(() => {
    let data = [...movies];
    
    return data; 
  }, [movies, search, selectedGenres]);

  const totalPages = Math.max(1, Math.ceil(totalMovies / PAGE_SIZE));

  const start = (page - 1) * PAGE_SIZE;
  const pageMovies = filtered //.slice(start, start + PAGE_SIZE);



// trigger collectMovie
// scroll down


useEffect(() => {
  const observer = new IntersectionObserver(
    (entries) => {
      const entry = entries[0];

      if (!entry.isIntersecting) return;
      if (!hasMoreRef.current) return;
      if (isLoadingPageRef.current) return;
      if (observerCooldownRef.current) return;

      observerCooldownRef.current = true;
      isLoadingPageRef.current = true;

      const nextPage =
        pages.length > 0
          ? pages[pages.length - 1].page + 1
          : 1;

      loadPage(nextPage);

      setTimeout(() => {
        observerCooldownRef.current = false;
      }, 300);
    },
    {
      root: null,
      rootMargin: "200px",
      threshold: 0,
    }
  );

  const el = loadMoreRef.current;
  if (el) observer.observe(el);

  return () => observer.disconnect();
}, [pages, loadPage]);

// scroll up
useEffect(() => {
  const observer = new IntersectionObserver((entries) => {
    const entry = entries[0];

    if (!entry.isIntersecting) return;
    if (!hasMoreRef.current) return;
    if (isLoadingPageRef.current) return;
    if (observerCooldownRef.current) return;

    const firstPage = pages[0]?.page;

    if (!firstPage || firstPage <= 1) return;

    observerCooldownRef.current = true;
    isLoadingPageRef.current = true;

    loadPage(firstPage - 1);

    setTimeout(() => {
      observerCooldownRef.current = false;
    }, 300);
  });

  const el = topRef.current;
  if (el) observer.observe(el);

  return () => observer.disconnect();
}, [pages, loadPage]);

  useEffect(() => {
      const controller = new AbortController();
      controllerRef.current = controller;
      setPages([]);
      loadPage(1, controller.signal);
      setHasMore(true);
      lastLoadedPageRef.current = 1;
      return () => {
        controller.abort();
      };
    }, [debouncedSearch,search, selectedGenres, language, stars, yearRange, sortBy, sortingDirection]);
  
  useEffect(() => {
    hasMoreRef.current = hasMore;
  }, [hasMore]);

  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(search);
    }, 300);

    return () => clearTimeout(t);
  }, [search]);

  //UI display params
  const sidebarRowSx = {
    display: "flex",
    gap: 1,
    justifyContent: "center",
    px: 1, // IMPORTANT: match header padding
  };
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

      {/* Sidebar */}
      <Drawer
        variant="permanent"
        sx={{
          width: openSideBar ? 280 : 72,
          flexShrink: 0,
          "& .MuiDrawer-paper": {
            width: openSideBar ? 280 : 72,
            mt: 8,
            height: "calc(100vh - 64px)",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden", // keep this
            transition: "width 0.3s",
          },
        }}
      >
      
  <Box sx={{ p: 1, display: "flex",  flexDirection: "column", gap: .5}}>
    <IconButton
      onClick={() => setOpenSideBar((p) => !p)}
      size="small"
    >
      {openSideBar ? "COLLAPSE ": ""}
      {openSideBar ? <MenuOpenIcon /> : <MenuIcon />}
  </IconButton>
    <Box sx={sidebarRowSx}>
      <Button disabled={filterPanel} variant="outlined" onClick={() => setFilterPanel(true)}>
        Filters
      </Button>

      <Button disabled={filterPanel===false} variant="outlined" onClick={() => setFilterPanel(false)}>
        Sort
      </Button>
    </Box>
  </Box>
  <Box
    sx={{
        flex: 1,
        minHeight: 0,
        overflowY: "auto",
        overflowX: "hidden",
      }}>
  {filterPanel === true && (
      <FilterPanel 
        setSearch={setSearch}
        toggleGenre={toggleGenre}
        selectedGenres={selectedGenres}
        allGenres={allGenres}
        stars={stars}
        setStars={setStars}
        language={language}
        setLanguage={setLanguage}
        minDate={minDate}
        yearRange={yearRange}
        setYearRange={setYearRange}
      
      />
    )}
    {filterPanel === false && (
      <SortPanel
      sortBy={sortBy}
      setSortBy={setSortBy}
      direction={sortingDirection}
      setDirection={setSortingDirection}
      sidebarRowSx={sidebarRowSx}
      />
    )}
    </Box>
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
          {start + 1}:{Math.min(start + PAGE_SIZE, filtered.length)}
        </strong>
      </Typography>
    </Box>
  
  {/* Infinite scroll trigger */}
  <div ref={topRef} style={{ height: 40 }} />
   <Stack spacing={2} sx={{ mb: 3 }}>
      {(movies ?? []).map((movie, i) => (
        <MovieCard key={ i} movie={movie} />
      ))}
    </Stack>


  {hasMore && movies.length > 0 && (
    <div ref={loadMoreRef} style={{ height: 40 }} />
  )}

{page < totalPages && (
  <p style={{ textAlign: "center" }}>Loading more...</p>
)}

  </Box>
</Box>
    </Box>
    
  );
}