import { AiSummariesScreen, AiSummaryDetailScreen, AiUsageScreen } from '../features/ai-summaries';
import { AdvancedReportsScreen, ReportsScreen } from '../features/reports';
import type { RootStack } from './root-stack';

/**
 * Daily and advanced reports, and AI progress summaries.
 *
 * A function returning route elements, like `projectRoutes`, because a navigator only accepts
 * `Screen` elements (or fragments of them) as children.
 */
export function insightsRoutes(Stack: RootStack) {
  return (
    <>
      <Stack.Screen
        name="Reports"
        options={{ title: 'Daily reports' }}
        children={({ navigation }) => (
          <ReportsScreen onOpenTask={(id) => navigation.navigate('TaskDetail', { id })} />
        )}
      />
      <Stack.Screen
        name="AdvancedReports"
        options={{ title: 'Reports' }}
        component={AdvancedReportsScreen}
      />
      <Stack.Screen
        name="AiSummaries"
        options={{ title: 'Progress summaries' }}
        children={({ navigation }) => (
          <AiSummariesScreen
            onOpen={(id) => navigation.navigate('AiSummaryDetail', { id })}
            onOpenUsage={() => navigation.navigate('AiUsage')}
          />
        )}
      />
      <Stack.Screen
        name="AiSummaryDetail"
        options={{ title: 'Progress summary' }}
        children={({ route }) => <AiSummaryDetailScreen summaryId={route.params.id} />}
      />
      <Stack.Screen name="AiUsage" options={{ title: 'AI usage' }} component={AiUsageScreen} />
    </>
  );
}
