import { createContext, useContext } from 'react';

export interface Shell { paletteOpen: boolean; openPalette: () => void; closePalette: () => void }
export const ShellContext = createContext<Shell>({ paletteOpen: false, openPalette: () => {}, closePalette: () => {} });
export const useShell = () => useContext(ShellContext);
