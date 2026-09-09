import { Button, EmptyState } from '@ashniva/ui';
import { Link } from 'react-router';

export function NotFoundPage() {
  return (
    <EmptyState
      title="Page not found"
      description="The link may be out of date or you may not have access to this page."
      action={
        <Button variant="primary">
          <Link to="/" style={{ color: 'inherit', textDecoration: 'none' }}>
            Go to home
          </Link>
        </Button>
      }
    />
  );
}
