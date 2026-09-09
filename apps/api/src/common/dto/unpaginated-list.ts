import { Logger } from '@nestjs/common';
import { MAX_UNPAGINATED_ITEMS } from '@ashniva/types';

const logger = new Logger('UnpaginatedList');

/**
 * Marks a list that is returned whole rather than paged, and says so when the bound is reached.
 *
 * The repository behind such a list carries `take: MAX_UNPAGINATED_ITEMS`. A `take` on its own
 * turns an unbounded read into a bounded one, which is the availability fix — but it also turns a
 * complete answer into a silently truncated one, and a client reading a short list has no way to
 * tell the difference. That is the trap `take: 500` on the work-log list had already fallen into.
 *
 * So the bound is paired with this: hitting it is logged once per request, naming the endpoint, so
 * the assumption that the list is small shows up in the logs of the installation where it stopped
 * being true. The answer then is to paginate that endpoint, not to raise the number.
 */
export function boundedList<TItem>(endpoint: string, rows: TItem[]): TItem[] {
  if (rows.length >= MAX_UNPAGINATED_ITEMS) {
    logger.warn(
      `${endpoint} reached the ${MAX_UNPAGINATED_ITEMS}-row bound for lists that are returned ` +
        'whole; the response is truncated and this endpoint now needs real pagination.',
    );
  }
  return rows;
}
