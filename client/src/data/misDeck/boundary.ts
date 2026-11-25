/** First month the MIS builds live from reports (earlier months are frozen history). Its own file so pages that need
 * only this constant (Setup) do not download the 222 kB liveDeck chunk. liveDeck re-exports it. */
export const LIVE_BOUNDARY = '2026-04';
