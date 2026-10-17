import { createContext, useContext } from 'react';

/**
 * Opens a handbook target (an article / collection href such as
 * "/handbook/month-end/snapmint-settlements#c16-m3-snapmint") inside the
 * handbook's reader modal, without changing the page URL. Null outside the
 * handbook page, where callers fall back to normal navigation.
 */
export const HandbookOpenContext = createContext<((href: string) => void) | null>(null);

export const useHandbookOpen = () => useContext(HandbookOpenContext);
