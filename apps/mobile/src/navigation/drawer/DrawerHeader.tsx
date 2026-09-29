import { ROLE_LABELS, type SessionUser } from '@ashniva/types';
import { useNavigation, type NavigationProp } from '@react-navigation/native';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BrandSearchField } from '../../features/search';
import { Avatar } from '../../shared/components/Avatar';
import { Icon } from '../../shared/components/Icon';
import { AppText } from '../../shared/components/primitives';
import { useTheme } from '../../shared/theme/ThemeProvider';
import type { RootStackParamList } from '../param-lists';
// A cycle (drawer-context → SideDrawer → here), harmless because `useDrawer` is only called
// while rendering, long after every module in it has loaded.
import { useDrawer } from './drawer-context';

/**
 * Who is signed in, where, and as what — tapping it opens the profile — and the way into search.
 *
 * The profile and the search field are siblings rather than one pressable holding the other: a
 * button inside a button is a single element to a screen reader, and the inner one is lost.
 */
export function DrawerHeader({
  user,
  onOpenProfile,
}: {
  user: SessionUser;
  onOpenProfile: () => void;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const drawer = useDrawer();
  const ink = theme.colors.primaryText;
  const role = user.roleName || ROLE_LABELS[user.roleKey];

  const openSearch = () => {
    drawer.close();
    navigation.navigate('Search');
  };

  return (
    <View
      style={{
        backgroundColor: theme.colors.primary,
        gap: theme.spacing.md,
        paddingBottom: theme.spacing.lg,
        paddingHorizontal: theme.spacing.lg,
        paddingTop: insets.top + theme.spacing.lg,
      }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${user.name}, ${role}. Opens your profile`}
        onPress={onOpenProfile}
        style={({ pressed }) => ({ gap: theme.spacing.md, opacity: pressed ? 0.8 : 1 })}
      >
        <View style={{ alignItems: 'center', flexDirection: 'row', gap: theme.spacing.md }}>
          <Avatar name={user.name} size={52} />
          <View style={{ flex: 1 }}>
            <AppText variant="heading" numberOfLines={1} style={{ color: ink }}>
              {user.name}
            </AppText>
            <AppText size="sm" numberOfLines={1} style={{ color: ink, opacity: 0.85 }}>
              {role}
            </AppText>
          </View>
          <Icon name="chevron-forward" size={18} color={ink} />
        </View>
        <View style={{ alignItems: 'center', flexDirection: 'row', gap: theme.spacing.xs }}>
          <Icon name="business-outline" size={14} color={ink} style={{ opacity: 0.8 }} />
          <AppText size="xs" numberOfLines={1} style={{ color: ink, flex: 1, opacity: 0.8 }}>
            {user.organization.name}
          </AppText>
        </View>
      </Pressable>
      <BrandSearchField onPress={openSearch} placeholder="Search" />
    </View>
  );
}
