import SimpleRegistry from '../../components/SimpleRegistry';
import { collections } from '../../lib/api';

export default function Sections() {
  return (
    <SimpleRegistry
      title="Sections"
      collection={collections.sections}
      description="Manage store sections (e.g., Produce, Dairy, Meat, Frozen)"
    />
  );
}