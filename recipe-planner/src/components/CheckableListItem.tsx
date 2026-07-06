import { ListItem, ListItemIcon, ListItemText, Checkbox } from "@mui/material";

interface CheckableListItemProps {
  itemKey: string;
  checked: boolean;
  onToggle: (key: string) => void;
  primary: React.ReactNode;
  secondary?: React.ReactNode;
  disablePadding?: boolean;
}

export function CheckableListItem({
  itemKey,
  checked,
  onToggle,
  primary,
  secondary,
  disablePadding = false,
}: CheckableListItemProps) {
  return (
    <ListItem disablePadding={disablePadding} sx={{ mb: 1 }}>
      <ListItemIcon
        sx={{
          minWidth: 48,
          minHeight: 48,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Checkbox
          edge="start"
          checked={checked}
          onChange={() => onToggle(itemKey)}
          size="medium"
          sx={{ p: 1.5 }}
        />
      </ListItemIcon>
      <ListItemText
        primary={
          <span
            style={{
              textDecoration: checked ? "line-through" : "none",
            }}
          >
            {primary}
          </span>
        }
        secondary={secondary}
      />
    </ListItem>
  );
}
