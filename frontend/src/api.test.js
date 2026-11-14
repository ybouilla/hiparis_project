import axios from "axios";

import { cachedGet } from "./api";
import { createQueryClient } from "./queryClient";

jest.mock("axios", () => ({
  get: jest.fn(),
  isCancel: jest.fn(() => false),
}));

let client;
beforeEach(() => {
  axios.get.mockReset();
  client = createQueryClient({ gcTime: Infinity });
});
afterEach(() => jest.restoreAllMocks());

test("the same request is sent once, then answered from the cache", async () => {
  axios.get.mockResolvedValue({ data: { movies: [1, 2] } });

  const first = await cachedGet(client, "/allmovies", { start: 0, end: 20 });
  const second = await cachedGet(client, "/allmovies", { start: 0, end: 20 });

  expect(first).toEqual({ movies: [1, 2] });          // the body, not the whole axios response
  expect(second).toBe(first);
  expect(axios.get).toHaveBeenCalledTimes(1);
});

test("another url or other params are other cache entries", async () => {
  axios.get.mockResolvedValue({ data: {} });

  await cachedGet(client, "/allmovies", { start: 0 });
  await cachedGet(client, "/allmovies", { start: 20 });
  await cachedGet(client, "/statistics", { start: 0 });

  expect(axios.get).toHaveBeenCalledTimes(3);
});

test("the order of the keys of params does not matter", async () => {
  axios.get.mockResolvedValue({ data: {} });

  await cachedGet(client, "/allmovies", { start: 0, lang: "en" });
  await cachedGet(client, "/allmovies", { lang: "en", start: 0 });

  expect(axios.get).toHaveBeenCalledTimes(1);
});

test("two identical requests in flight share one single request", async () => {
  let resolve;
  axios.get.mockReturnValue(new Promise((r) => { resolve = r; }));

  const a = cachedGet(client, "/statistics", { dates: [1990, 2000] });
  const b = cachedGet(client, "/statistics", { dates: [1990, 2000] });
  resolve({ data: { ok: true } });

  expect(await a).toEqual({ ok: true });
  expect(await b).toEqual({ ok: true });
  expect(axios.get).toHaveBeenCalledTimes(1);
});

test("params, signal and the repeated-keys serializer are given to axios", async () => {
  axios.get.mockResolvedValue({ data: {} });
  const { signal } = new AbortController();

  await cachedGet(client, "/allmovies", { genre: ["Action", "Drama"], dates: [1990, 2000] }, signal);

  const [url, config] = axios.get.mock.calls[0];
  expect(url).toBe("/allmovies");
  expect(config.signal).toBe(signal);
  expect(config.params).toEqual({ genre: ["Action", "Drama"], dates: [1990, 2000] });
  expect(config.paramsSerializer(config.params)).toBe("genre=Action&genre=Drama&dates=1990&dates=2000");
});

test("a failed request is thrown and not cached: asking again tries again", async () => {
  axios.get.mockRejectedValueOnce(new Error("network down")).mockResolvedValueOnce({ data: { ok: 1 } });

  await expect(cachedGet(client, "/allmovies", { start: 0 })).rejects.toThrow("network down");
  expect(await cachedGet(client, "/allmovies", { start: 0 })).toEqual({ ok: 1 });
  expect(axios.get).toHaveBeenCalledTimes(2);
});

test("a cancelled request is not cached", async () => {
  axios.get.mockImplementationOnce(
    (url, { signal }) =>
      new Promise((_, reject) => signal.addEventListener("abort", () => reject(new Error("canceled"))))
  );
  axios.get.mockResolvedValueOnce({ data: { page: 1 } });

  const controller = new AbortController();
  const cancelled = cachedGet(client, "/allmovies", { start: 0 }, controller.signal);
  controller.abort();
  await expect(cancelled).rejects.toThrow("canceled");

  expect(await cachedGet(client, "/allmovies", { start: 0 })).toEqual({ page: 1 });
  expect(axios.get).toHaveBeenCalledTimes(2);
});

test("an answer is fresh for 5 minutes, then asked again", async () => {
  axios.get.mockResolvedValue({ data: {} });
  const start = Date.now();

  await cachedGet(client, "/allmovies", { start: 0 });
  jest.spyOn(Date, "now").mockReturnValue(start + 4 * 60 * 1000);
  await cachedGet(client, "/allmovies", { start: 0 });
  expect(axios.get).toHaveBeenCalledTimes(1);               // 4 minutes later: still fresh

  Date.now.mockReturnValue(start + 5 * 60 * 1000 + 1000);
  await cachedGet(client, "/allmovies", { start: 0 });
  expect(axios.get).toHaveBeenCalledTimes(2);               // 5 minutes and 1 s later: asked again
});
