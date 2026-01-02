import SimpleRegistry from '../../components/SimpleRegistry';
import { collections } from '../../lib/api';

export default function ContainerTypes() {
  return (
    <SimpleRegistry
      title="Container Types"
      collection={collections.containerTypes}
      description="Manage container types (e.g., 1qt rectangular, divided container, tupperware)"
    />
  );
}