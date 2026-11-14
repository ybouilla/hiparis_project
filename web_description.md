### Inside the page

```mermaid
flowchart TD
    filters["Filters: search, genres, language,<br/>minimum rating, years, sort"] --> debounce["the search text is debounced 300 ms"]
    debounce --> reload["reload: abort the pending request,<br/>empty the list"]
    reload --> page1["GET /allmovies, page 1 (20 movies)"]
    page1 --> cards["cards in grid or list view,<br/>skeletons while loading"]
    page1 -->|"no result"| empty["empty state with Clear all filters"]
    cards -->|"bottom sentinel enters the viewport"| next["GET /allmovies, next page"]
    next --> cards
    next -->|"no more results"| finish["End of results"]
    cards -->|"top sentinel enters the viewport"| prev["load the previous page"]
    prev --> cards
```

| Route | Purpose | Parameters |
|---|---|---|
| `GET /` | the React app (`frontend/build`) | |
| `GET /allmovies` | a page of movies, plus total, genre list and maxima | `start`, `end`, `title`, `genre` (repeatable), `lang`, `score`, `dates` (twice), `order_by`, `order_desc` |
| `GET /statistics` | quartiles and counts by language and genre for the charts page | `dates` (twice) |

Both API routes answer `201` with JSON. The `/statistics` page of the app draws its charts from that answer.