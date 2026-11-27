// Back to the tabs without rebuilding them, so every tab keeps its place.
// refreshFeed: the Desires feed reloads from the top to show what you just posted.
export function backToMain(navigation, { refreshFeed = false } = {}) {
  navigation.popTo('Main');
  if (refreshFeed) navigation.navigate('Main', { screen: 'Feed', params: { refresh: Date.now() } });
}
