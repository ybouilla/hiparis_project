import axios from "axios";
import qs from "qs";

// the server expects repeated keys: genre=Action&genre=Drama, dates=1990&dates=2000
const serializeParams = (params) => qs.stringify(params, { arrayFormat: "repeat" });

/**
 * GET `url` with `params`, through the React Query cache of `queryClient`; resolves to the
 * answer's body (response.data).
 *
 *  - the same url + params asked again while the answer is fresh: no request at all;
 *  - the same request asked while it is still in flight: one single request, shared;
 *  - `signal` (an AbortSignal) cancels the request, as with plain axios. A cancelled or failed
 *    request is never cached: the error is thrown to the caller.
 *
 * The cache key is the url and the params, compared by value (the order of the keys of `params`
 * does not matter, the order of the items of an array does).
 */
export function cachedGet(queryClient, url, params, signal) {
  return queryClient.fetchQuery({
    queryKey: [url, params],
    queryFn: async () => {
      const response = await axios.get(url, { params, paramsSerializer: serializeParams, signal });
      return response.data;
    },
  });
}
