import {
  Inventory2 as ContainerIcon,
  Restaurant as BowlIcon,
  LocalDining as PlateIcon,
  Fastfood as BoxIcon,
  Star as PackageIcon,
  CropSquare as TupperwareIcon,
  WaterDrop as JarIcon,
  BrokenImage as VacuumBagIcon,
  Egg as RamekinIcon,
} from "@mui/icons-material";
import type { ReactElement } from "react";

// Custom cylinder cup icon for restaurant containers
const CylinderCupIcon = ({ fontSize = "small" }: { fontSize?: string }) => {
  const size = fontSize === "small" ? 20 : 24;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 120 160"
      style={{ display: "inline-block", verticalAlign: "middle" }}
    >
      <path
        d="M 10 40 L 10 130 Q 10 150 60 150 Q 110 150 110 130 L 110 40"
        fill="#e0e0e0"
        stroke="#888888"
        strokeWidth="2"
      />
      <ellipse
        cx="60"
        cy="130"
        rx="50"
        ry="20"
        fill="#d0d0d0"
        stroke="#888888"
        strokeWidth="2"
      />
      <path
        d="M 10 40 L 10 130 Q 10 150 60 150 Q 110 150 110 130 L 110 40"
        fill="#e0e0e0"
        stroke="none"
      />
      <line x1="10" y1="40" x2="10" y2="130" stroke="#888888" strokeWidth="2" />
      <line
        x1="110"
        y1="40"
        x2="110"
        y2="130"
        stroke="#888888"
        strokeWidth="2"
      />
      <path
        d="M 10 130 Q 10 150 60 150 Q 110 150 110 130"
        fill="none"
        stroke="#888888"
        strokeWidth="2"
      />
      <ellipse
        cx="60"
        cy="40"
        rx="50"
        ry="20"
        fill="#f5f5f5"
        stroke="#888888"
        strokeWidth="2"
      />
      <ellipse
        cx="60"
        cy="40"
        rx="40"
        ry="15"
        fill="#c0c0c0"
        stroke="#777777"
        strokeWidth="1.5"
      />
    </svg>
  );
};

/**
 * Container icon legend items for display
 */
export const CONTAINER_LEGEND_ITEMS = [
  { icon: <PackageIcon fontSize="small" />, label: "Original Packaging" },
  { icon: <CylinderCupIcon fontSize="small" />, label: "Restaurant Container" },
  { icon: <TupperwareIcon fontSize="small" />, label: "Tupperware" },
  { icon: <JarIcon fontSize="small" />, label: "Jar" },
  { icon: <VacuumBagIcon fontSize="small" />, label: "Vacuum Sealed Bag" },
  { icon: <RamekinIcon fontSize="small" />, label: "Ramekin" },
];

/**
 * Standard container type patterns and their associated icons
 * Order matters - more specific patterns should come first
 */
export const CONTAINER_ICON_PATTERNS: Array<{
  pattern: RegExp;
  icon: ReactElement;
  label: string;
}> = [
  {
    pattern: /original\s*packaging|package/i,
    icon: <PackageIcon fontSize="small" />,
    label: "Original Packaging",
  },
  {
    pattern: /restaurant|takeout|to-go|togo/i,
    icon: <CylinderCupIcon fontSize="small" />,
    label: "Restaurant Container",
  },
  {
    pattern: /tupperware|rectangular|square/i,
    icon: <TupperwareIcon fontSize="small" />,
    label: "Tupperware",
  },
  {
    pattern: /jar|mason/i,
    icon: <JarIcon fontSize="small" />,
    label: "Jar",
  },
  {
    pattern: /vacuum\s*seal|vacuum\s*bag|sealed\s*bag/i,
    icon: <VacuumBagIcon fontSize="small" />,
    label: "Vacuum Sealed Bag",
  },
  {
    pattern: /ramekin/i,
    icon: <RamekinIcon fontSize="small" />,
    label: "Ramekin",
  },
  {
    pattern: /bowl/i,
    icon: <BowlIcon fontSize="small" />,
    label: "Bowl",
  },
  {
    pattern: /plate/i,
    icon: <PlateIcon fontSize="small" />,
    label: "Plate",
  },
  {
    pattern: /box|container/i,
    icon: <BoxIcon fontSize="small" />,
    label: "Container",
  },
];

/**
 * Default icon for unknown container types
 */
export const DEFAULT_CONTAINER_ICON = {
  icon: <ContainerIcon fontSize="small" />,
  label: "Container",
};

/**
 * Get the appropriate icon for a container type name
 */
export function getContainerIcon(containerTypeName: string | undefined): {
  icon: ReactElement;
  label: string;
} {
  if (!containerTypeName) {
    return DEFAULT_CONTAINER_ICON;
  }

  // Try to match against known patterns
  for (const { pattern, icon } of CONTAINER_ICON_PATTERNS) {
    if (pattern.test(containerTypeName)) {
      return { icon, label: containerTypeName };
    }
  }

  // Fall back to default icon
  return { ...DEFAULT_CONTAINER_ICON, label: containerTypeName };
}
