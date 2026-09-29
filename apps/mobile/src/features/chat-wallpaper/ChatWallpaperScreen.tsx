import { useState } from 'react';
import { ScrollView } from 'react-native';

import { ChipGroup } from '../../shared/components/chips';
import { ListRow } from '../../shared/components/data-display';
import { Banner } from '../../shared/components/feedback';
import { Glyph } from '../../shared/components/glyph';
import { SectionHeader } from '../../shared/components/layout';
import { AppText, Button, Card, Divider, Screen } from '../../shared/components/primitives';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { pickWallpaperImage } from './pick-wallpaper';
import { WallpaperPreview } from './WallpaperPreview';
import { WallpaperSwatches } from './WallpaperSwatches';
import {
  clearOverride,
  setWallpaper,
  useChatWallpaper,
  useHasWallpaperOverride,
  type ChatWallpaper,
} from './wallpaper-store';

type Scope = 'this' | 'all';
const SCOPES: readonly Scope[] = ['this', 'all'];
const SCOPE_LABELS: Record<Scope, string> = { this: 'Just this chat', all: 'All chats' };

/**
 * Choosing what is drawn behind your conversations: a picture of your own, a colour from the
 * theme, or nothing.
 *
 * Opened from a conversation it offers that chat alone or every chat; opened from the profile it
 * sets the wallpaper for all of them. Each choice applies at once and the preview shows it, so
 * there is no separate save to forget.
 */
export function ChatWallpaperScreen({
  conversationId,
  onDone,
}: {
  conversationId?: string;
  onDone?: () => void;
}) {
  const theme = useTheme();
  const [scope, setScope] = useState<Scope>(conversationId ? 'this' : 'all');
  const target = scope === 'this' ? conversationId : undefined;
  const wallpaper = useChatWallpaper(target);
  const hasOverride = useHasWallpaperOverride(conversationId);
  const [error, setError] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);

  const apply = async (value: ChatWallpaper) => {
    setError(null);
    try {
      await setWallpaper(value, target);
    } catch {
      setError('That picture could not be saved on this device. Try another one.');
    }
  };

  const chooseImage = async () => {
    setError(null);
    setPicking(true);
    try {
      const pick = await pickWallpaperImage();
      if (pick.kind === 'refused') {
        setError(pick.message);
      } else if (pick.kind === 'picked') {
        await apply({ kind: 'image', uri: pick.uri });
      }
    } catch {
      setError('Could not open your photos.');
    } finally {
      setPicking(false);
    }
  };

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{
          gap: theme.spacing.md,
          padding: theme.spacing.screen,
          paddingBottom: theme.spacing.xxl,
        }}
      >
        <WallpaperPreview wallpaper={wallpaper} />

        {conversationId ? (
          <>
            <ChipGroup
              label="Apply to"
              options={SCOPES}
              selected={scope}
              onSelect={setScope}
              labelFor={(value) => SCOPE_LABELS[value]}
            />
            {scope === 'this' && !hasOverride ? (
              <AppText size="sm" tone="muted">
                This chat uses the wallpaper for all chats until you choose one for it.
              </AppText>
            ) : null}
          </>
        ) : null}

        {error ? (
          <Banner tone="danger" role="alert">
            {error}
          </Banner>
        ) : null}

        <Card>
          <SectionHeader title="Picture" icon="image-outline" />
          <Button
            label="Choose from library"
            icon="images-outline"
            variant="secondary"
            loading={picking}
            onPress={() => void chooseImage()}
          />
        </Card>

        <Card>
          <SectionHeader title="Colour" icon="color-palette-outline" />
          <WallpaperSwatches
            selected={wallpaper.kind === 'color' ? wallpaper.token : null}
            onSelect={(token) => void apply({ kind: 'color', token })}
          />
        </Card>

        <Card style={{ gap: 0, paddingVertical: theme.spacing.xs }}>
          <ListRow
            icon="remove-circle-outline"
            iconTone="neutral"
            title="Default (no wallpaper)"
            onPress={() => void apply({ kind: 'none' })}
            accessibilityLabel="Default, no wallpaper"
            {...(wallpaper.kind === 'none'
              ? { trailing: <Glyph name="check" color={theme.colors.primary} size={16} /> }
              : {})}
          />
          {conversationId && scope === 'this' && hasOverride ? (
            <>
              <Divider inset={48} />
              <ListRow
                icon="albums-outline"
                title="Use the same as all chats"
                onPress={() => clearOverride(conversationId)}
              />
            </>
          ) : null}
        </Card>

        {onDone ? <Button label="Done" onPress={onDone} /> : null}
      </ScrollView>
    </Screen>
  );
}
