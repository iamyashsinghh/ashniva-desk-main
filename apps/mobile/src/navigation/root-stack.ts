import type { createNativeStackNavigator } from '@react-navigation/native-stack';

import type { RootStackParamList } from './param-lists';

/** The signed-in stack navigator, as the route files receive it. */
export type RootStack = ReturnType<typeof createNativeStackNavigator<RootStackParamList>>;
