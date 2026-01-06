import { Box, Typography } from "@mui/material";
import {
  ReactFlow,
  Controls,
  Background,
  BackgroundVariant,
  type Node,
  type Edge,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { EmptyState } from "../EmptyState";

interface ProductFlowTabProps {
  flowNodes: Node[];
  flowEdges: Edge[];
}

export function ProductFlowTab({ flowNodes, flowEdges }: ProductFlowTabProps) {
  if (flowNodes.length === 0) {
    return (
      <Box
        display="flex"
        justifyContent="center"
        alignItems="center"
        flexGrow={1}
      >
        <EmptyState message="No product flow data. Make sure your recipes have prep or batch assembly steps." />
      </Box>
    );
  }

  return (
    <>
      <Typography variant="h6" gutterBottom>
        Product Flow Graph
      </Typography>
      <Typography variant="body2" color="text.secondary" gutterBottom>
        Shows how products flow through processing steps. Products with the same
        ID are consolidated with aggregated quantities and meal counts. Steps
        with the same input/output signature are combined.
      </Typography>

      <Box
        sx={{
          flexGrow: 1,
          border: "1px solid #e0e0e0",
          borderRadius: 1,
          minHeight: 0,
        }}
      >
        <ReactFlow
          nodes={flowNodes}
          edges={flowEdges}
          fitView
          attributionPosition="bottom-right"
        >
          <Controls />
          <Background variant={BackgroundVariant.Dots} gap={12} size={1} />
        </ReactFlow>
      </Box>

      {/* Legend */}
      <Box mt={2} display="flex" gap={3} flexWrap="wrap">
        <Box display="flex" alignItems="center" gap={1}>
          <Box
            sx={{
              width: 16,
              height: 16,
              backgroundColor: "#e8f5e9",
              border: "2px solid #4caf50",
              borderRadius: "4px",
            }}
          />
          <Typography variant="caption">Raw Products</Typography>
        </Box>
        <Box display="flex" alignItems="center" gap={1}>
          <Box
            sx={{
              width: 16,
              height: 16,
              backgroundColor: "#fff3e0",
              border: "2px solid #ff9800",
              borderRadius: "4px",
            }}
          />
          <Typography variant="caption">Transient Products</Typography>
        </Box>
        <Box display="flex" alignItems="center" gap={1}>
          <Box
            sx={{
              width: 16,
              height: 16,
              backgroundColor: "#e3f2fd",
              border: "2px solid #2196f3",
              borderRadius: "4px",
            }}
          />
          <Typography variant="caption">Stored Products</Typography>
        </Box>
        <Box display="flex" alignItems="center" gap={1}>
          <Box
            sx={{
              width: 16,
              height: 16,
              backgroundColor: "#f3e5f5",
              border: "2px solid #9c27b0",
              borderRadius: "4px",
            }}
          />
          <Typography variant="caption">Prep Steps</Typography>
        </Box>
        <Box display="flex" alignItems="center" gap={1}>
          <Box
            sx={{
              width: 16,
              height: 16,
              backgroundColor: "#ffebee",
              border: "2px solid #f44336",
              borderRadius: "4px",
            }}
          />
          <Typography variant="caption">Assembly Steps</Typography>
        </Box>
      </Box>
    </>
  );
}
