import { openSearchTarget, SearchScreen } from '../features/search';
import type { RootStack } from './root-stack';

/**
 * Searching everything the caller may read.
 *
 * A function returning route elements, like `projectRoutes`, because a navigator only accepts
 * `Screen` elements (or fragments of them) as children.
 */
export function searchRoutes(Stack: RootStack) {
  return (
    <Stack.Screen
      name="Search"
      // The screen draws its own bar: the search field is the header.
      options={{ title: 'Search', headerShown: false, animation: 'fade_from_bottom' }}
      children={({ route, navigation }) => (
        <SearchScreen
          initialQuery={route.params?.query ?? ''}
          onBack={() => navigation.goBack()}
          onOpen={(target) => openSearchTarget(navigation, target)}
        />
      )}
    />
  );
}
