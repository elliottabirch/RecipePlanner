import { memo } from 'react';
import { Handle, Position, type NodeProps, type Node } from '@xyflow/react';
import { Box, Typography, Chip } from '@mui/material';
import { Egg as ProductIcon } from '@mui/icons-material';

export interface ProductNodeData extends Record<string, unknown> {
  label: string;
  productId: string;
  productType: 'raw' | 'transient' | 'stored';
  quantity?: number;
  unit?: string;
  mealDestination?: string;
}

export type ProductNodeType = Node<ProductNodeData, 'product'>;

const TYPE_COLORS = {
  raw: '#4caf50',
  transient: '#ff9800',
  stored: '#2196f3',
};

function ProductNode({ data, selected }: NodeProps<ProductNodeType>) {
  return (
    <Box
      sx={{
        backgroundColor: 'white',
        border: selected ? '2px solid #1976d2' : '1px solid #ccc',
        borderRadius: 2,
        padding: 1.5,
        minWidth: 150,
        boxShadow: selected ? 3 : 1,
      }}
    >
      <Handle type="target" position={Position.Top} />
      
      <Box display="flex" alignItems="center" gap={1} mb={0.5}>
        <ProductIcon sx={{ fontSize: 18, color: TYPE_COLORS[data.productType] }} />
        <Typography variant="subtitle2" fontWeight="bold">
          {data.label}
        </Typography>
      </Box>
      
      <Chip
        label={data.productType}
        size="small"
        sx={{
          backgroundColor: TYPE_COLORS[data.productType],
          color: 'white',
          fontSize: '0.7rem',
          height: 20,
          mb: 0.5,
        }}
      />
      
      {(data.quantity || data.unit) && (
        <Typography variant="caption" display="block" color="text.secondary">
          {data.quantity} {data.unit}
        </Typography>
      )}
      
      {data.mealDestination && (
        <Typography variant="caption" display="block" color="primary">
          → {data.mealDestination}
        </Typography>
      )}
      
      <Handle type="source" position={Position.Bottom} />
    </Box>
  );
}

export default memo(ProductNode);
