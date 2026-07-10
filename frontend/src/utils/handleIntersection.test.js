
import { handleIntersection } from "./handleIntersection";

describe("handleIntersection", () => {
  test("loads the previous page", () => {
    const loadPage = jest.fn();

    handleIntersection({
      entry: { isIntersecting: true },
      hasMore: true,
      isLoading: false,
      cooldown: false,
      firstPage: 5,
      loadPage,
    });

    expect(loadPage).toHaveBeenCalledWith(4);
  });

  test("does nothing if not intersecting", () => {
    const loadPage = jest.fn();

    handleIntersection({
      entry: { isIntersecting: false },
      hasMore: true,
      isLoading: false,
      cooldown: false,
      firstPage: 5,
      loadPage,
    });

    expect(loadPage).not.toHaveBeenCalled();
  });
});