import SimpleRegistry from '../../components/SimpleRegistry';
import { collections } from '../../lib/api';

export default function Stores() {
  return (
    <SimpleRegistry
      title="Stores"
      collection={collections.stores}
      description="Manage your stores (e.g., Costco, Safeway, Trader Joe's)"
    />
  );
}