import { PERMISSIONS } from '@ashniva/types';
import { useState } from 'react';

import { MetaLine } from '../../../shared/components/data-display';
import { Hero } from '../../../shared/components/layout';
import { Pill, PillRow } from '../../../shared/components/primitives';
import { useSession } from '../../auth/SessionProvider';
import {
  FeedbackBanner,
  NoAccess,
  resourceGate,
  SettingsScroll,
  type Feedback,
} from '../shared/SettingsLayout';
import { useProduct } from './api';
import { CallbacksSection } from './CallbacksSection';
import { CredentialsSection } from './CredentialsSection';
import { HowToCallSection } from './HowToCallSection';
import { IvrSection } from './IvrSection';
import { productPills } from './product-display';
import { ProductSettingsSection } from './ProductSettingsSection';
import { ProductSettingsSheet } from './ProductSettingsSheet';
import { SupportTiersSection } from './SupportTiersSection';

/**
 * One product: what its support does, how it authenticates, and how to call it.
 *
 * Three permissions, deliberately, as on the web: `product:manage` edits the product, its keys and
 * callbacks; `ivr:manage` decides who may hear a client's voice; `support-tier:manage` decides what
 * a tier is worth. Each section appears, or offers its actions, only to the holder of its own.
 */
export function ProductDetailScreen({ productId }: { productId: string }) {
  const { can } = useSession();
  const canRead = can(PERMISSIONS.PRODUCT_READ);
  const canManage = can(PERMISSIONS.PRODUCT_MANAGE);
  const canManageIvr = can(PERMISSIONS.IVR_MANAGE);
  const canManageTiers = can(PERMISSIONS.SUPPORT_TIER_MANAGE);
  const product = useProduct(productId, canRead);
  const [editing, setEditing] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const saved = (message: string) => setFeedback({ tone: 'success', message });

  if (!canRead) {
    return <NoAccess description="The product registry needs the product permission." />;
  }
  const gate = resourceGate(product, 'Loading the product');
  if (gate || !product.data) {
    return gate;
  }
  const data = product.data;

  return (
    <>
      <SettingsScroll refreshing={product.isRefetching} onRefresh={() => product.refetch()}>
        <Hero overline={data.code} title={data.name} icon="cube-outline">
          <PillRow>
            {productPills(data).map((pill) => (
              <Pill key={pill.label} label={pill.label} tone={pill.tone} />
            ))}
          </PillRow>
          <MetaLine icon="ticket-outline">
            {`${data.openTickets} open ticket${data.openTickets === 1 ? '' : 's'}`}
          </MetaLine>
        </Hero>
        <FeedbackBanner feedback={feedback} />
        <ProductSettingsSection
          product={data}
          {...(canManage ? { onEdit: () => setEditing(true) } : {})}
        />
        <CredentialsSection
          productId={data.id}
          credentials={data.credentials}
          canManage={canManage}
        />
        {canManage ? <CallbacksSection productId={data.id} /> : null}
        {canManageIvr ? <IvrSection productId={data.id} onSaved={saved} /> : null}
        <SupportTiersSection canManage={canManageTiers} onSaved={saved} />
        <HowToCallSection />
      </SettingsScroll>
      {editing ? (
        <ProductSettingsSheet
          product={data}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            saved('Settings saved.');
          }}
        />
      ) : null}
    </>
  );
}
