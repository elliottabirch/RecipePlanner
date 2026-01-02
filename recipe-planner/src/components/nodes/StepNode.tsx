import { memo } from 'react';
import { Handle, Position, type NodeProps, type Node } from '@xyflow/react';
import { Box, Typography, Chip } from '@mui/material';
import { PlayArrow as StepIcon } from '@mui/icons-material';

export interface StepNodeData extends Record<string, unknown> {
  label: string;
  stepType: 'prep' | 'assembly';
  timing?: 'batch' | 'just_in_time';
}

export type StepNodeType = Node<StepNodeData, 'step'>;


const STEP_TYPE_COLORS = {
  prep: '#9c27b0',
  assembly: '#f44336',
};

const TIMING_LABELS = {
  batch: 'Batch',
  just_in_time: 'Just-in-time',
};

function StepNode({ data, selected }: NodeProps<StepNodeType>) {
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
        <StepIcon sx={{ fontSize: 18, color: STEP_TYPE_COLORS[data.stepType] }} />
        <Typography variant="subtitle2" fontWeight="bold">
          {data.label}
        </Typography>
      </Box>
      
      <Box display="flex" gap={0.5} flexWrap="wrap">
        <Chip
          label={data.stepType}
          size="small"
          sx={{
            backgroundColor: STEP_TYPE_COLORS[data.stepType],
            color: 'white',
            fontSize: '0.7rem',
            height: 20,
          }}
        />
        
        {data.stepType === 'assembly' && data.timing && (
          <Chip
            label={TIMING_LABELS[data.timing]}
            size="small"
            variant="outlined"
            sx={{
              fontSize: '0.7rem',
              height: 20,
            }}
          />
        )}
      </Box>
      
      <Handle type="source" position={Position.Bottom} />
    </Box>
  );
}

export default memo(StepNode);
