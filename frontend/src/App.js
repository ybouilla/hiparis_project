import React, { useMemo, useState, useEffect, useRef, useCallback } from "react";
import {
  Box,
  AppBar,
  Toolbar,
  Typography,
  Drawer,
  Button,
  Stack,
  Chip,
  IconButton,
  InputBase,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  useTheme,
  useMediaQuery,
} from "@mui/material";
import MenuOpenIcon from "@mui/icons-material/MenuOpen";
import MenuIcon from "@mui/icons-material/Menu";
import SearchIcon from "@mui/icons-material/Search";
import CloseIcon from "@mui/icons-material/Close";
import ViewModuleIcon from "@mui/icons-material/ViewModule";
import ViewListIcon from "@mui/icons-material/ViewList";

import axios from 'axios';
import qs from 'qs';
import { Link, } from "react-router-dom";
//import moviesData from "./movies.json";
import MovieCard, { MovieCardSkeleton } from "./MovieCard";
import FilterPanel from "./FilterPanel";
import SortPanel from "./SortPanel";
import { handleIntersection } from "./utils/handleIntersection";
import { languageLabel } from "./utils/languageLabel";

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
const min_dates = 1900;
const DRAWER_WIDTH = 280;
const DEFAULT_YEAR_RANGE = [1900, 2026];
export default function App() {
  const df = moviesData;

  // react states
  const [language, setLanguage] = useState("");
  const [allGenres, setAllGenres] = useState([]);
  const [search, setSearch] = useState("");

  const [selectedGenres, setSelectedGenres] = useState([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState([]);
  const [totalMovies, setTotalMovies] = useState(PAGE_SIZE);
  const [openSideBar, setOpenSideBar] = useState(true);
  const [stars, setStars] = useState(0);  // for rating
  const [yearRange, setYearRange] = useState(DEFAULT_YEAR_RANGE);
  const [minDate, setMinDate] = useState(min_dates)
  const [view, setView] = useState("grid"); // "grid" | "list"
  const [sortBy, setSortBy] = React.useState("");
  const [sortingDirection, setSortingDirection] = React.useState("desc");
  const [isLoadingPage, setIsLoadingPage] = useState(false); // loadingGuard
  const [hasMore, setHasMore] = useState(true);  // stop guard
  const [debouncedSearch, setDebouncedSearch] = useState(search); // avoid spamming search


  // use ref definitions
  const topRef = useRef(null);  // scroller up sentinelle
  /*DOM anchor for the "scroll up" IntersectionObserver — 
  an empty sentinel <div> above the movie list; when it enters the viewport,
   triggers loading the previous page.*/
  const loadMoreRef = useRef(null);  // scroller down sentinelle
  const isLoadingPageRef = useRef(false); //Ref-mirror of isLoadingPage state ( sync flag)
  const hasMoreRef = useRef(true);  //Ref-mirror of hasMore state ( sync flag)
 // const lastLoadedPageRef = useRef(1);
  //const controllerRef = useRef(null);
  const observerCooldownRef = useRef(false);


  // memoization
  const movies = useMemo(() =>
  pages.flatMap(p => p.movies),
[pages]);
  // const genres = useMemo(() => {
  //   const set = new Set();
  //   console.log("movies =", movies);
  //   console.log("lang memo", language)
  //   console.log("is array?", Array.isArray(movies));
  
  //   if (!Array.isArray(movies) || movies.length === 0 ) return [];
  //   movies.forEach((m) => {
  //     m.Genre?.split(",").forEach((g) => set.add(g.trim()));
  //   });
  //   return [...set].sort();
  // }, [movies]);

  const toggleGenre = (genre) => {
    setPage(1);
    setSelectedGenres((prev) =>
      prev.includes(genre)
        ? prev.filter((g) => g !== genre)
        : [...prev, genre]
    );
  };

     // Getting movies (API GET REQUEST)
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

  /**
   * Fetch and store a movie page.
   * Prevents duplicate pages, updates loading state,
   * and disables further pagination when no results remain.
   */
  const loadPage = useCallback( async (pageNumber, signal) => {
    
    setIsLoadingPage(true);
    isLoadingPageRef.current = true;
    try{
      const newMovies = await collectMovies(pageNumber, signal);
    if (signal?.aborted) return; // superseded by a newer request: leave its state alone

    if (!newMovies || newMovies.length === 0) {
      setHasMore(false);
      return; // IMPORTANT: do NOT add page
    }
    setPages((prev) => {
      const exists = prev.some((p) => p.page === pageNumber);
      if (exists) return prev;

      const updated = [...prev, { page: pageNumber, movies: newMovies }];
      //lastLoadedPageRef.current = pageNumber;
      // keep only window



      return updated;
    });
    }finally{
      if (!signal?.aborted) {
        setIsLoadingPage(false);
        isLoadingPageRef.current = false;
      }
    }
}, [collectMovies]);

  

// scroll down method
/**
 * Infinite scroll (down).
 * Loads the next page when the bottom sentinel enters the viewport.
 * Includes guards to prevent duplicate or concurrent requests.
 */
useEffect(() => {
  const observer = new IntersectionObserver(
    (entries) => {
      const entry = entries[0];
      // safeguards
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
/**
 * Infinite scroll (up).
 * Loads the previous page when the top sentinel enters the viewport.
 * Prevents requests when already at the first page.
 */
useEffect(() => {
  const observer = new IntersectionObserver(([entry]) => {
  handleIntersection({
    entry,
    hasMore: hasMoreRef.current,
    isLoading: isLoadingPageRef.current,
    cooldown: observerCooldownRef.current,
    firstPage: pages[0]?.page,
    loadPage,
  });


    setTimeout(() => {
      observerCooldownRef.current = false;
    }, 300);
  });

  const el = topRef.current;
  if (el) observer.observe(el);

  return () => observer.disconnect();
}, [pages, loadPage]);

/**
 * Reload movies when filters or sorting options change.
 * Cancels any pending requests and resets pagination.
 */
  useEffect(() => {
      const controller = new AbortController();
      //controllerRef.current = controller;
      setPages([]);
      loadPage(1, controller.signal);
      setHasMore(true);
      //lastLoadedPageRef.current = 1;
      return () => {
        controller.abort();
      };
    }, [debouncedSearch,search, selectedGenres, language, stars, yearRange, sortBy, sortingDirection]);
  
/**
 * Keep hasMoreRef synchronized with the latest hasMore state
 * for access inside callbacks and observers.
 */
  useEffect(() => {
    hasMoreRef.current = hasMore;
  }, [hasMore]);

/**
 * Debounce search input to reduce API requests while typing.
 * Updates debouncedSearch 300ms after the last keystroke.
 * when doing searches from title movie
 */
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(search);
    }, 300);

    return () => clearTimeout(t);
  }, [search]);

  // respponsiveness
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));

  useEffect(() => {
    if (isMobile) setOpenSideBar(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // active filters, shown as removable chips above the results
  const yearFilterActive = yearRange[0] > minDate || yearRange[1] < DEFAULT_YEAR_RANGE[1];
  const activeFilters = [
    ...(search ? [{ key: "search", label: `“${search}”`, onDelete: () => setSearch("") }] : []),
    ...selectedGenres.map((g) => ({ key: `genre-${g}`, label: g, onDelete: () => toggleGenre(g) })),
    ...(language ? [{ key: "lang", label: languageLabel(language), onDelete: () => setLanguage("") }] : []),
    ...(stars > 0 ? [{ key: "stars", label: `Rating ≥ ${stars * 2}/10`, onDelete: () => setStars(0) }] : []),
    ...(yearFilterActive
      ? [{ key: "years", label: `${yearRange[0]}–${yearRange[1]}`, onDelete: () => setYearRange(DEFAULT_YEAR_RANGE) }]
      : []),
  ];

  const clearAllFilters = () => {
    setSearch("");
    setSelectedGenres([]);
    setLanguage("");
    setStars(0);
    setYearRange(DEFAULT_YEAR_RANGE);
  };

  const sidebarToggleLabel = openSideBar ? "Hide filters" : "Show filters";

  return (
    <Box sx={{ display: "flex" }}>

      {/* Top bar */}
      <AppBar position="fixed" sx={{ zIndex: (t) => t.zIndex.drawer + 1 }}>
        <Toolbar sx={{ gap: 1 }}>
          <Tooltip title={sidebarToggleLabel}>
            <IconButton
              color="inherit"
              edge="start"
              onClick={() => setOpenSideBar((p) => !p)}
              aria-label={sidebarToggleLabel}
            >
              {openSideBar ? <MenuOpenIcon /> : <MenuIcon />}
            </IconButton>
          </Tooltip>

          <Typography variant="h6" noWrap sx={{ display: { xs: "none", sm: "block" } }}>
            🎬 Movie Explorer
          </Typography>

          <Box
            sx={{
              flex: 1,
              maxWidth: 460,
              mx: "auto",
              display: "flex",
              alignItems: "center",
              gap: 1,
              px: 1.5,
              borderRadius: 2,
              bgcolor: "rgba(255,255,255,0.15)",
              "&:focus-within": { bgcolor: "rgba(255,255,255,0.25)" },
            }}
          >
            <SearchIcon fontSize="small" />
            <InputBase
              fullWidth
              placeholder="Search a title…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              inputProps={{ "aria-label": "Search title" }}
              sx={{ color: "inherit", py: 0.5 }}
            />
            {search && (
              <IconButton size="small" color="inherit" aria-label="Clear search" onClick={() => setSearch("")}>
                <CloseIcon fontSize="small" />
              </IconButton>
            )}
          </Box>

          <Box sx={{ display: { xs: "none", sm: "flex" }, gap: 0.5 }}>
            <Button color="inherit" component={Link} to="/" aria-current="page" sx={{ bgcolor: "rgba(255,255,255,0.18)" }}>
              <strong>Movie</strong>
            </Button>
            <Button color="inherit" component={Link} to="/statistics">
              <strong>Movies Statistics</strong>
            </Button>
          </Box>
        </Toolbar>
      </AppBar>

      {/* Sidebar: filters only. Slides away on desktop, overlays on mobile. */}
      <Drawer
        variant={isMobile ? "temporary" : "persistent"}
        open={openSideBar}
        onClose={() => setOpenSideBar(false)}
        sx={{
          width: isMobile ? "auto" : openSideBar ? DRAWER_WIDTH : 0,
          flexShrink: 0,
          transition: (t) => t.transitions.create("width"),
          "& .MuiDrawer-paper": { width: DRAWER_WIDTH, maxWidth: "85vw", boxSizing: "border-box" },
        }}
      >
        <Toolbar /> {/* spacer: keeps the content below the fixed AppBar */}

        <Box sx={{ px: 2, pt: 1.5, pb: 1, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <Typography variant="subtitle1" fontWeight={700}>
            Filters
          </Typography>
          <Button size="small" onClick={clearAllFilters} disabled={activeFilters.length === 0}>
            Clear all
          </Button>
        </Box>

        {isMobile && (
          <Box sx={{ px: 2, pb: 1, display: "flex", gap: 1, flexWrap: "wrap" }}>
            <Button size="small" variant="outlined" component={Link} to="/">
              Movie
            </Button>
            <Button size="small" variant="outlined" component={Link} to="/statistics">
              Movies Statistics
            </Button>
          </Box>
        )}

        <FilterPanel
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

        {isMobile && (
          <Box sx={{ p: 2, mt: "auto" }}>
            <Button fullWidth variant="contained" onClick={() => setOpenSideBar(false)}>
              {`Show ${totalMovies} movies`}
            </Button>
          </Box>
        )}
      </Drawer>

      {/* Main content */}
      <Box component="main" sx={{ flexGrow: 1, minWidth: 0, px: { xs: 2, sm: 3 }, pb: 6 }}>
        <Toolbar />
        <Box sx={{ maxWidth: 1400, mx: "auto", pt: 3 }}>

          {/* Results toolbar: count, sort, view mode */}
          <Box sx={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 1.5, mb: 1.5 }}>
            <Typography variant="h5" component="h1" fontWeight={700}>
              Movies
            </Typography>
            <Typography variant="body2" color="text.secondary">
              <strong>{totalMovies}</strong>
              {` ${totalMovies === 1 ? "movie" : "movies"} found`}
            </Typography>

            <Box sx={{ flex: 1 }} />

            <SortPanel
              sortBy={sortBy}
              setSortBy={setSortBy}
              direction={sortingDirection}
              setDirection={setSortingDirection}
            />

            <ToggleButtonGroup
              size="small"
              exclusive
              value={view}
              onChange={(_, v) => v && setView(v)}
              aria-label="View mode"
            >
              <ToggleButton value="grid" aria-label="Grid view">
                <ViewModuleIcon fontSize="small" />
              </ToggleButton>
              <ToggleButton value="list" aria-label="List view">
                <ViewListIcon fontSize="small" />
              </ToggleButton>
            </ToggleButtonGroup>
          </Box>

          {activeFilters.length > 0 && (
            <Stack direction="row" flexWrap="wrap" useFlexGap gap={1} sx={{ mb: 2 }}>
              {activeFilters.map((f) => (
                <Chip key={f.key} label={f.label} onDelete={f.onDelete} color="primary" variant="outlined" size="small" />
              ))}
            </Stack>
          )}

          {/* Infinite scroll trigger (up) */}
          <div ref={topRef} style={{ height: 40, marginBottom: -24 }} />

          <Box
            sx={{
              display: "grid",
              gap: 2,
              gridTemplateColumns:
                view === "list"
                  ? "1fr"
                  : { xs: "repeat(auto-fill, minmax(150px, 1fr))", sm: "repeat(auto-fill, minmax(180px, 1fr))" },
            }}
          >
            {(movies ?? []).map((movie, i) => (
              <MovieCard key={i} movie={movie} view={view} />
            ))}
            {isLoadingPage &&
              Array.from({ length: view === "list" ? 3 : 6 }, (_, i) => (
                <MovieCardSkeleton key={`skeleton-${i}`} view={view} />
              ))}
          </Box>

          {!isLoadingPage && movies.length === 0 && !hasMore && (
            <Box sx={{ textAlign: "center", py: 8, color: "text.secondary" }}>
              <Typography variant="h6">No movie matches these filters</Typography>
              <Button sx={{ mt: 1 }} onClick={clearAllFilters}>
                Clear all filters
              </Button>
            </Box>
          )}

          {/* Infinite scroll trigger (down) */}
          {hasMore && movies.length > 0 && (
            <div ref={loadMoreRef} data-testid="feed-loader" style={{ height: 40 }} />
          )}

          {!hasMore && movies.length > 0 && (
            <Typography variant="caption" color="text.secondary" display="block" textAlign="center" sx={{ mt: 2 }}>
              End of results
            </Typography>
          )}
        </Box>
      </Box>
    </Box>
  );
}
