import { PERMISSIONS } from '@ashniva/types';
import { Card, PageHeader } from '@ashniva/ui';
import { Link, useParams } from 'react-router';

import { QueryState } from '../../../shared/components/QueryState';
import { usePermission } from '../../auth/session-context';
import { IvrPolicyCard } from '../../calls/components/IvrPolicyCard';
import { IvrReadinessCard } from '../../calls/components/IvrReadinessCard';
import { useProductMutations, useProductQuery } from '../api';
import { CallbacksCard } from '../components/CallbacksCard';
import { CredentialsCard } from '../components/CredentialsCard';
import { ProductSettingsCard } from '../components/ProductSettingsCard';
import { SupportTiersCard } from '../components/SupportTiersCard';

import '../../dashboard/dashboard.css';
import '../products.css';

/** One product: what its support does, how it authenticates, and how to call it. */
export function ProductDetailPage() {
  const { id } = useParams<{ id: string }>();
  const canManage = usePermission(PERMISSIONS.PRODUCT_MANAGE);
  // A different permission from the one that edits the product: who may hear a client's voice is
  // not the same decision as who may rename a product or issue it a credential.
  const canManageIvr = usePermission(PERMISSIONS.IVR_MANAGE);
  // A third, again on purpose: deciding what a tier is worth is a commercial act, not the same
  // job as registering a product or issuing it a credential.
  const canManageTiers = usePermission(PERMISSIONS.SUPPORT_TIER_MANAGE);
  const product = useProductQuery(id);
  const mutations = useProductMutations(id);

  return (
    <div className="dashboard">
      <PageHeader
        title={product.data?.name ?? 'Product'}
        subtitle={<Link to="/admin/products">Back to products</Link>}
      />
      <QueryState
        isLoading={product.isLoading}
        isError={product.isError}
        error={product.error}
        onRetry={() => void product.refetch()}
      >
        {product.data ? (
          <div className="dashboard__grid dashboard__grid--equal">
            <ProductSettingsCard
              product={product.data}
              canManage={canManage}
              onSave={(input) => mutations.update.mutateAsync({ id: id ?? '', input })}
            />
            <IvrPolicyCard productId={product.data.id} canManage={canManageIvr} />
            <IvrReadinessCard canManage={canManageIvr} />
            <CallbacksCard productId={product.data.id} canManage={canManage} />
            <SupportTiersCard canManage={canManageTiers} />
            <CredentialsCard
              credentials={product.data.credentials}
              canManage={canManage}
              onIssue={(label) => mutations.issueCredential.mutateAsync(label)}
              onRotate={(credentialId) => mutations.rotateCredential.mutateAsync(credentialId)}
              onRevoke={(credentialId) => mutations.revokeCredential.mutateAsync(credentialId)}
            />
            <Card title="How to call it">
              <p className="muted">
                Every route below authenticates with the credential above, not with an employee
                token. The same contract serves an embedded support popup, a backend integration and
                a mobile support screen — one door, one set of rules.
              </p>
              <pre className="secret-once">{`POST /api/v1/support/tickets
Authorization: Bearer ask_<keyId>.<secret>
Idempotency-Key: <your own unique id>

{
  "title": "Template sync is failing",
  "description": "Templates stopped syncing after the update.",
  "module": "API",
  "externalUserId": "your-user-id",
  "requesterEmail": "person@example.com",
  "externalReference": "YOUR-CASE-123"
}`}</pre>
              <p className="muted">
                Retrying with the same <code>Idempotency-Key</code> returns the same ticket rather
                than raising another. <code>GET /api/v1/support/tickets/:id</code> reads back the
                status and public replies — never internal notes or who is working on it.
              </p>
              <p className="muted">
                For an <strong>embedded widget</strong>, keep that credential on your server and
                exchange it for a browser token instead — the <code>ask_</code> secret must never
                reach page JavaScript.
              </p>
              <pre className="secret-once">{`POST /api/v1/support/widget-sessions
Authorization: Bearer ask_<keyId>.<secret>

{ "externalUserId": "your-user-id", "origin": "https://app.example.com" }`}</pre>
              <p className="muted">
                The <code>askp_</code> token that comes back is bound to this product, that one
                person and that one origin, and expires in minutes. Register the origin above first.
                See <code>packages/support-sdk</code> for the SDK and the callback signature recipe.
              </p>
            </Card>
          </div>
        ) : null}
      </QueryState>
    </div>
  );
}
