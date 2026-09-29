import { ReleaseNoteDetailScreen } from '../features/release-notes/ReleaseNoteDetailScreen';
import { ReleaseNotesScreen } from '../features/release-notes/ReleaseNotesScreen';
import { ReleaseDetailScreen } from '../features/releases/ReleaseDetailScreen';
import { ReleasesScreen } from '../features/releases/ReleasesScreen';
import type { RootStack } from './root-stack';

/**
 * Releases and release notes on the provider's side.
 *
 * A function returning route elements, like `projectRoutes`, because a navigator only accepts
 * `Screen` elements (or fragments of them) as children.
 */
export function releaseRoutes(Stack: RootStack) {
  return (
    <>
      <Stack.Screen
        name="Releases"
        options={{ title: 'Releases' }}
        children={({ navigation }) => (
          <ReleasesScreen onOpen={(id) => navigation.navigate('ReleaseDetail', { id })} />
        )}
      />
      <Stack.Screen
        name="ReleaseDetail"
        options={{ title: 'Release' }}
        children={({ route, navigation }) => (
          <ReleaseDetailScreen
            releaseId={route.params.id}
            onOpenTask={(id) => navigation.navigate('TaskDetail', { id })}
            onOpenTicket={(id) => navigation.navigate('TicketDetail', { id })}
            onOpenChangeRequest={(id) => navigation.navigate('ChangeRequestDetail', { id })}
            onOpenProject={(id) => navigation.navigate('ProjectDetail', { id })}
            onOpenReleaseNote={(id) => navigation.navigate('ReleaseNoteDetail', { id })}
            onOpenAssignment={(id) => navigation.navigate('QaAssignment', { id })}
          />
        )}
      />
      <Stack.Screen
        name="ReleaseNotes"
        options={{ title: 'Release notes' }}
        children={({ navigation }) => (
          <ReleaseNotesScreen onOpen={(id) => navigation.navigate('ReleaseNoteDetail', { id })} />
        )}
      />
      <Stack.Screen
        name="ReleaseNoteDetail"
        options={{ title: 'Release note' }}
        children={({ route }) => <ReleaseNoteDetailScreen noteId={route.params.id} />}
      />
    </>
  );
}
