import { Box, Typography } from "@mui/material";
import FilterChip from "./FilterChip";
import type { FilterState } from "./FilterChip";

export interface FilterOption {
  id: string;
  label: string;
  color?: string;
}

interface FilterGroupProps {
  title: string;
  options: FilterOption[];
  filterStates: Record<string, FilterState>;
  onFilterChange: (id: string, state: FilterState) => void;
}

export default function FilterGroup({
  title,
  options,
  filterStates,
  onFilterChange,
}: FilterGroupProps) {
  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        gap: 0.5,
      }}
    >
      <Typography
        variant="caption"
        sx={{
          fontWeight: 600,
          color: "text.secondary",
          textTransform: "uppercase",
          letterSpacing: "0.5px",
          fontSize: "0.7rem",
        }}
      >
        {title}
      </Typography>
      <Box
        sx={{
          display: "flex",
          flexWrap: "wrap",
          gap: 0.75,
        }}
      >
        {options.map((option) => (
          <FilterChip
            key={option.id}
            label={option.label}
            state={filterStates[option.id] || "unselected"}
            onStateChange={(newState) => onFilterChange(option.id, newState)}
            color={option.color}
          />
        ))}
      </Box>
    </Box>
  );
}
