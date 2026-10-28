/** The active video id, in a context so only the affected videos re-render on scroll. */
import { createContext, useContext } from 'react';

export const ActiveVideoContext = createContext(null);

export const useActiveVideo = () => useContext(ActiveVideoContext);
