import { Chip } from "@mui/material";
import { Check as CheckIcon, Close as CloseIcon } from "@mui/icons-material";

export type FilterState = "unselected" | "include" | "exclude";

interface FilterChipProps {
  label: string;
  state: FilterState;
  onStateChange: (newState: FilterState) => void;
  color?: string;
}

export default function FilterChip({
  label,
  state,
  onStateChange,
  color = "#2196f3",
}: FilterChipProps) {
  const handleClick = () => {
    // Cycle through states: unselected -> include -> exclude -> unselected
    if (state === "unselected") {
      onStateChange("include");
    } else if (state === "include") {
      onStateChange("exclude");
    } else {
      onStateChange("unselected");
    }
  };

  const getChipStyles = () => {
    switch (state) {
      case "include":
        return {
          backgroundColor: color,
          color: "white",
          borderColor: color,
          "&:hover": {
            backgroundColor: color,
            filter: "brightness(0.9)",
          },
        };
      case "exclude":
        return {
          backgroundColor: "transparent",
          color: color,
          borderColor: color,
          border: `2px solid ${color}`,
          "&:hover": {
            backgroundColor: "rgba(0, 0, 0, 0.04)",
          },
        };
      default:
        return {
          backgroundColor: "transparent",
          color: "text.secondary",
          borderColor: "divider",
          "&:hover": {
            backgroundColor: "rgba(0, 0, 0, 0.04)",
            borderColor: "text.secondary",
          },
        };
    }
  };

  const getIcon = () => {
    if (state === "include") {
      return <CheckIcon sx={{ fontSize: 16 }} />;
    } else if (state === "exclude") {
      return <CloseIcon sx={{ fontSize: 16 }} />;
    }
    return undefined;
  };

  return (
    <Chip
      label={label}
      onClick={handleClick}
      icon={getIcon()}
      variant={state === "unselected" ? "outlined" : "filled"}
      sx={{
        ...getChipStyles(),
        cursor: "pointer",
        transition: "all 0.2s ease-in-out",
      }}
    />
  );
}
