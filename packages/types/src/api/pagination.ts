/** Cursor pagination used by every list endpoint (`?cursor=&limit=`). */
export interface PaginatedResponse<TItem> {
  items: TItem[];
  nextCursor: string | null;
  total?: number;
}

export interface PaginationQuery {
  cursor?: string;
  limit?: number;
}

export const DEFAULT_PAGE_SIZE = 25;
export const MAX_PAGE_SIZE = 100;

/**
 * The ceiling on a list endpoint that returns a bare array rather than a page.
 *
 * A handful of lists are small by nature — the people in one organization, a client's own
 * contracts — and are returned whole because paginating them would cost every caller a loop for
 * nothing. "Small by nature" is an assumption about the data, though, and an assumption with no
 * `take` behind it is an unbounded query: one large customer and the endpoint reads and serialises
 * the lot.
 *
 * So these endpoints keep their array shape and take this bound. It is a backstop, not a page
 * size: reaching it means the assumption has stopped holding for somebody, which the API logs as
 * a warning so it is noticed before it is an incident. The fix at that point is to paginate that
 * endpoint properly, not to raise this number.
 */
export const MAX_UNPAGINATED_ITEMS = 500;
