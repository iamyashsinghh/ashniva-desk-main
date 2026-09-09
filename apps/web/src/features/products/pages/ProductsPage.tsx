import { PERMISSIONS, type ProductSummary } from '@ashniva/types';
import { Badge, Button, EmptyState, PageHeader, Table } from '@ashniva/ui';
import { useState } from 'react';
import { useNavigate } from 'react-router';

import { QueryState } from '../../../shared/components/QueryState';
import { usePermission } from '../../auth/session-context';
import { useProductsQuery } from '../api';
import { NewProductModal } from '../components/NewProductModal';

import '../../dashboard/dashboard.css';
import '../products.css';

/**
 * Admin → Products: every application allowed to raise tickets without a human login.
 *
 * The three switches are on the list rather than only on the detail page because they are what
 * somebody comes here to check: whether a product is live, whether it is accepting support, and
 * whether its tickets are being routed. Having to open four products to find the one that is off
 * would make the screen useless in the moment it matters.
 */
export function ProductsPage() {
  const canRead = usePermission(PERMISSIONS.PRODUCT_READ);
  const canManage = usePermission(PERMISSIONS.PRODUCT_MANAGE);
  const products = useProductsQuery(canRead);
  const [creating, setCreating] = useState(false);
  const navigate = useNavigate();

  if (!canRead) {
    return (
      <div className="dashboard">
        <PageHeader title="Products" />
        <EmptyState
          title="Not available"
          description="The product registry needs the product permission."
        />
      </div>
    );
  }

  return (
    <div className="dashboard">
      <PageHeader
        title="Products"
        subtitle="Applications that raise support tickets into Desk without a human login."
        actions={
          canManage ? (
            <Button variant="primary" onClick={() => setCreating(true)}>
              Register a product
            </Button>
          ) : undefined
        }
      />
      <QueryState
        isLoading={products.isLoading}
        isError={products.isError}
        error={products.error}
        onRetry={() => void products.refetch()}
      >
        <Table<ProductSummary>
          aria-label="Registered products"
          rowKey={(row) => row.id}
          rows={products.data ?? []}
          onRowClick={(row) => navigate(`/admin/products/${row.id}`)}
          empty={
            <EmptyState
              title="No products yet"
              description="Register one to give an application its own support credentials."
            />
          }
          columns={[
            {
              key: 'name',
              header: 'Product',
              render: (row) => (
                <span className="product-cell">
                  <strong>{row.name}</strong>
                  <code className="product-cell__code">{row.code}</code>
                </span>
              ),
            },
            {
              key: 'project',
              header: 'Support project',
              hideOnMobile: true,
              render: (row) =>
                row.project ? (
                  row.project.code
                ) : (
                  // Worth flagging: without a project the ingress refuses every request.
                  <Badge tone="warning">Not linked</Badge>
                ),
            },
            {
              key: 'state',
              header: 'State',
              render: (row) => (
                <span className="product-badges">
                  {row.isActive ? null : <Badge tone="neutral">Inactive</Badge>}
                  {row.supportEnabled ? (
                    <Badge tone="success">Support on</Badge>
                  ) : (
                    <Badge tone="warning">Support off</Badge>
                  )}
                  {row.autoRouteEnabled ? null : <Badge tone="neutral">Manual routing</Badge>}
                  {row.ivrEnabled ? <Badge tone="info">IVR</Badge> : null}
                </span>
              ),
            },
            {
              key: 'credentials',
              header: 'Keys',
              hideOnMobile: true,
              render: (row) =>
                row.activeCredentials === 0 ? (
                  <Badge tone="warning">None</Badge>
                ) : (
                  `${row.activeCredentials} active`
                ),
            },
            {
              key: 'tickets',
              header: 'Open tickets',
              align: 'right',
              render: (row) => row.openTickets,
            },
          ]}
        />
      </QueryState>

      {creating ? <NewProductModal onClose={() => setCreating(false)} /> : null}
    </div>
  );
}
