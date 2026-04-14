/**
 * VideoFeedContext.js
 * Holds the currently-active video ID for the calm feed.
 *
 * Using a context (rather than passing activeVideoId as a prop down
 * through renderItem) prevents the FlatList's renderItem from changing
 * reference on every scroll tick. Only VideoPlayer subscribes to this
 * context, so only the two cards that just became active/inactive
 * re-render when the user scrolls past a video.
 */
import { createContext, useContext } from 'react';

export const ActiveVideoContext = createContext(null);

export const useActiveVideo = () => useContext(ActiveVideoContext);
