type PageResult<T> = {
  data: T[] | null;
  error: Error | null;
};

export async function fetchAllPages<T>(
  fetchPage: (from: number, to: number) => Promise<PageResult<T>>,
  pageSize = 1000,
) {
  const items: T[] = [];

  for (let from = 0; ; from += pageSize) {
    const to = from + pageSize - 1;
    const { data, error } = await fetchPage(from, to);

    if (error) throw error;
    if (!data?.length) break;

    items.push(...data);

    if (data.length < pageSize) {
      break;
    }
  }

  return items;
}