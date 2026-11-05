/**
 * Fetch every row for a query, paging past PostgREST's 1000-row cap.
 * Pass a factory that returns a FRESH query builder each call, so .range() can be reapplied.
 */
export async function fetchAll<T>(
  makeQuery: () => {
    range: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>;
  },
): Promise<T[]> {
  const pageSize = 1000;
  let from = 0;
  let all: T[] = [];
  for (;;) {
    const { data, error } = await makeQuery().range(from, from + pageSize - 1);
    if (error) throw error;
    if (!data || !data.length) break;
    all = all.concat(data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return all;
}
